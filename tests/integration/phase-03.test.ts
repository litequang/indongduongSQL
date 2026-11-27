import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  mkdtemp,
  readFile,
  writeFile,
  unlink,
  mkdir,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { test } from "node:test";
import sharp from "sharp";
import { createApp } from "../../server/app";
import { digest, type ObjectStore } from "../../server/storage/objects";
import { rows } from "../../server/database/pool";
import { prepareTestDatabase } from "../test-environment";
import { Client } from "./http-client";

test("Phase 03 real MariaDB/HTTP with isolated filesystem object transport (not live R2)", async (t) => {
  const { pool, config } = await prepareTestDatabase();
  const root = await mkdtemp(path.join(os.tmpdir(), "idd-images-"));
  const file = (key: string, backup = false) =>
    path.join(root, backup ? "backup" : "primary", key);
  const store: ObjectStore = {
    backupEnabled: true,
    async get(key, backup = false) {
      try {
        return await readFile(file(key, backup));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async put(key, bytes, _mime, backup = false) {
      const f = file(key, backup);
      await mkdir(path.dirname(f), { recursive: true });
      try {
        await writeFile(f, bytes, { flag: "wx" });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        assert.equal(digest((await this.get(key, backup))!), digest(bytes));
      }
    },
    async delete(key) {
      await unlink(file(key)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
  };
  let server = (await createApp(pool, config, store)).listen(0, "127.0.0.1");
  await once(server, "listening");
  const a = server.address();
  assert(a && typeof a !== "string");
  config.APP_ORIGIN = "http://127.0.0.1:" + a.port;
  const dev = new Client(config.APP_ORIGIN);
  const password = randomBytes(24).toString("base64url");
  t.after(async () => {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });
  async function must(
    c: Client,
    url: string,
    method = "GET",
    body?: unknown,
    status = 200,
  ) {
    const r = await c.request(url, method, body);
    assert.equal(r.status, status, JSON.stringify(r.data));
    return r.data;
  }
  await must(
    dev,
    "/setup/bootstrap",
    "POST",
    {
      username: "images_dev",
      name: "Kỹ thuật ảnh thử",
      password,
      setupSecret: config.SETUP_SECRET,
      companyName: "Xưởng thử ảnh",
    },
    201,
  );
  await must(dev, "/auth/login", "POST", { username: "images_dev", password });
  async function staff(role: string, suffix = "") {
    const username = "images_" + role.toLowerCase() + suffix;
    const r = await must(
      dev,
      "/users",
      "POST",
      { username, name: username, role, password },
      201,
    );
    const c = new Client(dev.base);
    await must(c, "/auth/login", "POST", { username, password });
    return { client: c, id: r.user.id };
  }
  const designer = await staff("DESIGNER");
  const printer = await staff("PRINTER");
  const other = await staff("PRINTER", "2");
  const finisher = await staff("FINISHER");
  const target = randomUUID(),
    image = randomUUID();
  const png = await sharp({
    create: { width: 20, height: 15, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  async function binary(
    c: Client,
    id: string,
    bytes: Buffer,
    headers: Record<string, string> = {},
  ) {
    return fetch(dev.base + "/api/images/" + id + "/content", {
      method: "PUT",
      headers: {
        Cookie: c.cookie,
        Origin: dev.base,
        "X-CSRF-Token": c.csrf,
        "Content-Type": "image/png",
        ...headers,
      },
      body: new Uint8Array(bytes),
    });
  }
  await t.test(
    "ticket ownership, CSRF before bytes, real decoding, retry and immutable content",
    async () => {
      assert.equal(
        (await binary(new Client(dev.base), image, png)).status,
        401,
      );
      await must(
        printer.client,
        "/images",
        "POST",
        { id: randomUUID(), targetId: target, targetType: "DESIGN" },
        403,
      );
      await must(
        designer.client,
        "/images",
        "POST",
        { id: image, targetId: target, targetType: "DESIGN" },
        201,
      );
      assert.equal(
        (
          await binary(designer.client, image, png, {
            "X-CSRF-Token": "invalid",
          })
        ).status,
        403,
      );
      assert.equal((await binary(other.client, image, png)).status, 404);
      assert.equal(
        (await binary(designer.client, image, Buffer.from("<svg/>"))).status,
        422,
      );
      assert.equal(
        (
          await binary(
            designer.client,
            image,
            Buffer.alloc(5 * 1024 * 1024 + 1),
          )
        ).status,
        413,
      );
      assert.equal((await binary(designer.client, image, png)).status, 200);
      assert.equal((await binary(designer.client, image, png)).status, 200);
      const different = await sharp(png).negate().png().toBuffer();
      assert.equal(
        (await binary(designer.client, image, different)).status,
        409,
      );
      const [r] = await rows(pool, "SELECT * FROM image_registry WHERE id=?", [
        image,
      ]);
      assert.equal(r.status, "ACTIVE");
      assert.equal(r.sha256, digest((await store.get(r.object_key))!));
    },
  );
  await t.test(
    "expired tickets cannot activate, and orphan cleanup preserves referenced versions",
    async () => {
      const expired = randomUUID();
      await must(
        designer.client,
        "/images",
        "POST",
        { id: expired, targetId: target, targetType: "DESIGN" },
        201,
      );
      await pool.execute(
        "UPDATE image_registry SET expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE),created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY) WHERE id=?",
        [expired],
      );
      assert.equal((await binary(designer.client, expired, png)).status, 410);
      await must(designer.client, "/storage/cleanup", "POST", {}, 403);
      assert.equal(
        (await must(dev, "/storage/cleanup", "POST", {})).cleaned,
        1,
      );
      assert.equal(
        (await must(dev, "/storage/cleanup", "POST", {})).cleaned,
        0,
      );
    },
  );
  await t.test(
    "unlinked private image, target binding and immutable design version references",
    async () => {
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + image + "/content", {
            headers: { Cookie: other.client.cookie },
          })
        ).status,
        404,
      );
      await must(
        designer.client,
        "/saved-designs",
        "POST",
        { id: randomUUID(), productName: "Sai đích", imageRegistryId: image },
        409,
      );
      const d = await must(
        designer.client,
        "/saved-designs",
        "POST",
        { id: target, productName: "Mẫu ảnh thử", imageRegistryId: image },
        201,
      );
      assert.equal(d.design.current.image.registryId, image);
      const response = await fetch(
        dev.base + "/api/images/" + image + "/content",
        { headers: { Cookie: printer.client.cookie } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.headers.get("content-type"), "image/png");
      await must(designer.client, "/images/" + image, "DELETE", {}, 409);
      await must(designer.client, "/saved-designs/" + target, "PATCH", {
        version: 1,
        productName: "Phiên bản sau",
        imageRegistryId: null,
      });
      const versions = await must(
        designer.client,
        "/saved-designs/" + target + "/versions",
      );
      assert.equal(
        versions.items.find((v: { version: number }) => v.version === 1).image
          .registryId,
        image,
      );
    },
  );
  async function job(mode: string) {
    const id = randomUUID();
    await must(dev, "/storage/jobs", "POST", { id, mode }, 201);
    return id;
  }
  async function run(id: string, retryFailed = false) {
    return must(dev, "/storage/jobs/" + id + "/run", "POST", { retryFailed });
  }
  await t.test(
    "bounded durable backup, checksum verification, missing-only restore and no overwrite on corrupt objects",
    async () => {
      assert.deepEqual(await must(dev, "/storage/coverage"), {
        total: 1,
        backedUp: 0,
      });
      await must(
        designer.client,
        "/storage/jobs",
        "POST",
        { id: randomUUID(), mode: "BACKUP" },
        403,
      );
      const backup = await job("BACKUP");
      assert.equal((await run(backup)).ok, true);
      assert.deepEqual(await must(dev, "/storage/coverage"), {
        total: 1,
        backedUp: 1,
      });
      const jobDetail = await must(dev, "/storage/jobs/" + backup);
      assert.equal(jobDetail.items[0].status, "OK");
      assert.equal(jobDetail.items[0].imageId, image);
      assert.equal((await run(backup)).done, true);
      assert.equal((await run(await job("VERIFY"))).ok, true);
      const [r] = await rows(pool, "SELECT * FROM image_registry WHERE id=?", [
        image,
      ]);
      const original = (await store.get(r.object_key))!;
      await store.delete(r.object_key);
      assert.equal((await run(await job("RESTORE"))).ok, true);
      assert.equal(digest((await store.get(r.object_key))!), r.sha256);
      await writeFile(file(r.object_key), Buffer.from("corrupt"));
      const restore = await job("RESTORE");
      assert.equal((await run(restore)).ok, false);
      assert.equal((await store.get(r.object_key))!.toString(), "corrupt");
      await store.delete(r.object_key);
      assert.equal((await run(restore, true)).ok, true);
      await writeFile(
        file("verified/" + image + "/" + r.sha256, true),
        Buffer.from("bad backup"),
      );
      await store.delete(r.object_key);
      assert.equal((await run(await job("RESTORE"))).ok, false);
      assert.equal(await store.get(r.object_key), null);
      await writeFile(
        file("verified/" + image + "/" + r.sha256, true),
        original,
      );
      await store.put(r.object_key, original, r.mime_type);
    },
  );
  let production = "";
  let attachment = "";
  await t.test(
    "production images obey owner drafts, assigned printer and immutable official order",
    async () => {
      production = randomUUID();
      attachment = randomUUID();
      await must(
        designer.client,
        "/images",
        "POST",
        { id: attachment, targetType: "PRODUCTION", targetId: production },
        201,
      );
      assert.equal(
        (await binary(designer.client, attachment, png)).status,
        200,
      );
      await must(
        designer.client,
        "/production-orders",
        "POST",
        {
          id: production,
          title: "Lệnh ảnh thử",
          instructionRaw: "In ảnh thử 10 tờ",
          printerId: printer.id,
          totalSheets: 10,
          printImages: [
            {
              id: randomUUID(),
              label: "Bình thử",
              sheetCount: 10,
              imageRegistryId: attachment,
            },
          ],
        },
        201,
      );
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + attachment + "/content", {
            headers: { Cookie: printer.client.cookie },
          })
        ).status,
        403,
      );
      await must(
        designer.client,
        "/production-orders/" + production + "/dispatch",
        "POST",
        { version: 1, requestId: randomUUID() },
      );
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + attachment + "/content", {
            headers: { Cookie: printer.client.cookie },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + attachment + "/content", {
            headers: { Cookie: other.client.cookie },
          })
        ).status,
        403,
      );
      assert.equal(
        (await binary(designer.client, attachment, png)).status,
        403,
      );
      await must(
        designer.client,
        "/production-orders/" + production + "/revise",
        "POST",
        {
          version: 2,
          requestId: randomUUID(),
          printerId: other.id,
          reason: "Đổi máy thử",
          technical: { instructionRaw: "In ảnh thử 10 tờ", totalSheets: 10 },
        },
      );
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + attachment + "/content", {
            headers: { Cookie: printer.client.cookie },
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "recipient notifications, former printer filtering, private read state and scoped change feed",
    async () => {
      const mine = await must(other.client, "/notifications");
      assert(
        mine.items.some((n: { entityId: string }) => n.entityId === production),
      );
      const former = await must(printer.client, "/notifications");
      assert(
        !former.items.some(
          (n: { entityId: string }) => n.entityId === production,
        ),
      );
      const unrelated = await must(finisher.client, "/notifications");
      assert(
        !unrelated.items.some(
          (n: { entityId: string }) => n.entityId === production,
        ),
      );
      const id = mine.items[0].id;
      await must(printer.client, "/notifications/" + id + "/read", "POST", {});
      assert.equal(
        (await must(other.client, "/notifications")).items[0].read,
        false,
      );
      await must(other.client, "/notifications/" + id + "/read", "POST", {});
      assert.equal(
        (await must(other.client, "/notifications")).items[0].read,
        true,
      );
      const changes = await must(printer.client, "/changes");
      assert(
        !changes.changes.some(
          (c: { entity: string; entityId: string }) =>
            c.entity === "notifications" && c.entityId === other.id,
        ),
      );
    },
  );
  await t.test(
    "process recreation preserves image metadata, bytes, jobs and read state",
    async () => {
      const before = await must(dev, "/storage/jobs");
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      server = (await createApp(pool, config, store)).listen(
        a.port,
        "127.0.0.1",
      );
      await once(server, "listening");
      assert.deepEqual(await must(dev, "/storage/jobs"), before);
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + image + "/content", {
            headers: { Cookie: dev.cookie },
          })
        ).status,
        200,
      );
      assert.equal(
        (await must(other.client, "/notifications")).items[0].read,
        true,
      );
    },
  );
  await t.test(
    "unconfigured storage authenticates before refusal and cannot tombstone data or fall back to local bytes",
    async () => {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      server = (await createApp(pool, config, null)).listen(
        a.port,
        "127.0.0.1",
      );
      await once(server, "listening");
      await must(
        new Client(dev.base),
        "/images",
        "POST",
        { id: randomUUID(), targetId: target, targetType: "DESIGN" },
        401,
      );
      await must(
        designer.client,
        "/images",
        "POST",
        { id: randomUUID(), targetId: target, targetType: "DESIGN" },
        503,
      );
      await must(designer.client, "/images/" + image, "DELETE", {}, 503);
      assert.deepEqual(await must(dev, "/storage/status"), {
        enabled: false,
        backupEnabled: false,
      });
      const [r] = await rows(
        pool,
        "SELECT status FROM image_registry WHERE id=?",
        [image],
      );
      assert.equal(r.status, "ACTIVE");
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + image + "/content", {
            headers: { Cookie: dev.cookie },
          })
        ).status,
        503,
      );
    },
  );
});
