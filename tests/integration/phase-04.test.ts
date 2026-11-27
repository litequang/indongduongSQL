import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import { request as httpRequest } from "node:http";
import { prepareTestDatabase } from "../test-environment";
import { objectFixture } from "../object-fixture";
import { createApp } from "../../server/app";
import { rows } from "../../server/database/pool";
import { Client } from "./http-client";
import type { AccessPolicy } from "../../shared/access";
test("Phase 04 real MariaDB reports, policy and private avatars", async (t) => {
  const { pool, config } = await prepareTestDatabase();
  const objects = await objectFixture();
  const server = (await createApp(pool, config, objects.store)).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  config.APP_ORIGIN = "http://127.0.0.1:" + address.port;
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await pool.end();
    await objects.cleanup();
  });
  const dev = new Client(config.APP_ORIGIN),
    password = randomBytes(24).toString("base64url");
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
      username: "parity_dev",
      name: "Kỹ thuật thử",
      password,
      setupSecret: config.SETUP_SECRET,
      companyName: "Xưởng parity",
    },
    201,
  );
  await must(dev, "/auth/login", "POST", { username: "parity_dev", password });
  const devId = (await must(dev, "/auth/me")).user.id;
  const staff: Record<string, { id: string; client: Client }> = {};
  for (const role of [
    "ADMIN",
    "MANAGER",
    "DESIGNER",
    "SALE",
    "PRINTER",
    "FINISHER",
    "WAREHOUSE",
  ]) {
    const r = await must(
      dev,
      "/users",
      "POST",
      {
        username: "parity_" + role.toLowerCase(),
        name: role === "PRINTER" ? '=HYPERLINK("unsafe")' : role,
        role,
        password,
      },
      201,
    );
    const client = new Client(dev.base);
    await must(client, "/auth/login", "POST", {
      username: r.user.username,
      password,
    });
    staff[role] = { id: r.user.id, client };
  }
  async function policy() {
    return (await must(dev, "/access")).policy as AccessPolicy;
  }
  async function save(p: AccessPolicy, status = 200) {
    return must(dev, "/access", "PUT", p, status);
  }
  const query = "?from=2026-11-01&to=2026-11-30";
  const order = randomUUID();
  await must(
    dev,
    "/production-orders",
    "POST",
    {
      id: order,
      title: "=SUM(1,2)",
      instructionRaw: "100 tờ",
      totalSheets: 100,
      printerId: staff.PRINTER.id,
      paperType: "BB",
      plateType: "NONE",
      items: [
        { id: randomUUID(), productName: "Túi", quantity: 17 },
        { id: randomUUID(), productName: "Hộp", quantity: 9 },
      ],
      printImages: [
        { id: randomUUID(), label: "A", sheetCount: 60 },
        { id: randomUUID(), label: "B", sheetCount: 40 },
      ],
    },
    201,
  );
  await pool.execute(
    "UPDATE production_orders SET status='PRINTED',code='LIN-PARITY',actual_printed_sheets=0,spoilage_sheets=3,created_at='2026-10-31 17:00:00.000' WHERE id=?",
    [order],
  );
  const unfinished = randomUUID();
  await must(
    dev,
    "/production-orders",
    "POST",
    {
      id: unfinished,
      title: "Chưa in",
      instructionRaw: "200 tờ",
      totalSheets: 200,
    },
    201,
  );
  await pool.execute(
    "UPDATE production_orders SET status='WAITING_ACCEPTANCE',code='LIN-PENDING',created_at='2026-11-30 16:59:59.999' WHERE id=?",
    [unfinished],
  );
  await t.test(
    "bounded date filters, UTC+7 boundaries, no item/image fanout and actual zero preserved",
    async () => {
      const r = await must(dev, "/reports/production" + query);
      assert.equal(r.total, 2);
      assert.equal(r.totals.planned, 300);
      assert.equal(r.totals.actual, 0);
      assert.equal(r.totals.spoilage, 3);
      assert.equal(r.totals.completed, 1);
      assert.equal(r.daily[0].day, "2026-11-01");
      assert.equal(r.daily[1].day, "2026-11-30");
      assert.equal(
        r.items.find((i: { id: string }) => i.id === order).actual,
        0,
      );
      assert.equal(
        r.items.find((i: { id: string }) => i.id === unfinished).actual,
        null,
      );
      assert.equal(
        (
          await must(
            dev,
            "/reports/production" + query + "&printerId=" + staff.PRINTER.id,
          )
        ).total,
        1,
      );
      assert.equal(
        (await must(dev, "/reports/production" + query + "&paper=BB")).total,
        1,
      );
      await must(
        dev,
        "/reports/production?from=2026-02-30&to=2026-03-02",
        "GET",
        undefined,
        400,
      );
      await must(
        dev,
        "/reports/production?from=2025-01-01&to=2026-11-30",
        "GET",
        undefined,
        400,
      );
      for (const role of ["ADMIN", "MANAGER", "DESIGNER", "SALE"])
        await must(staff[role].client, "/reports/production" + query);
      for (const role of ["PRINTER", "FINISHER", "WAREHOUSE"])
        await must(
          staff[role].client,
          "/reports/production" + query,
          "GET",
          undefined,
          403,
        );
    },
  );
  await t.test(
    "CSV protects untrusted formula strings, auth and no-store; export limit rejects overflow",
    async () => {
      const response = await fetch(
        dev.base + "/api/reports/production.csv" + query,
        { headers: { Cookie: dev.cookie } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      const text = await response.text();
      assert(text.includes('"\'=SUM(1,2)"'));
      assert(text.includes("\"'=HYPERLINK("));
      assert.equal(
        (await fetch(dev.base + "/api/reports/production.csv" + query)).status,
        401,
      );
      // Synthetic rows only: no source/user/customer data copied.
      await pool.query(
        `INSERT INTO production_orders(id,code,created_by,title,instruction_raw,paper_type,paper_gsm,paper_width,paper_height,color,total_sheets,machine,note,finishing_note,reference,is_urgent,urgent_reason,run_kind,run_reason,plate_type,plate_status,plate_note,status,request_hash,created_at) SELECT UUID(),CONCAT('LIMIT-',seq),?,'limit','','','','','','',1,'','','','',0,'','NORMAL','','NONE','NOT_REQUIRED','','WAITING_ACCEPTANCE',REPEAT('0',64),'2026-11-10' FROM seq_1_to_2000`,
        [devId],
      );
      const limit = await fetch(
        dev.base + "/api/reports/production.csv" + query,
        { headers: { Cookie: dev.cookie } },
      );
      assert.equal(limit.status, 422);
      await pool.execute(
        "DELETE FROM production_orders WHERE code LIKE 'LIMIT-%'",
      );
    },
  );
  await t.test(
    "Developer-only, strict policy, core/dependency validation, stale version and ceilings",
    async () => {
      const p = await policy();
      await must(staff.ADMIN.client, "/access", "PUT", p, 403);
      assert.equal(
        (await must(staff.ADMIN.client, "/access")).policy,
        undefined,
      );
      await save({ ...p, features: { ...p.features, production: false } }, 400);
      await save({ ...p, features: { ...p.features, customer: false } }, 400);
      await save(
        { ...p, roleOverrides: { PRINTER: { canViewReports: true } } },
        400,
      );
      await save(
        {
          ...p,
          userOverrides: {
            [staff.PRINTER.id]: {
              canStartPrinting: true,
              canDispatchOrder: true,
            },
          },
        },
        400,
      );
      await save(p);
      await save(p, 409);
    },
  );
  await t.test(
    "user override precedence, permission revocation, direct API and urgent draft cannot bypass",
    async () => {
      const urgent = randomUUID();
      await must(
        staff.DESIGNER.client,
        "/production-orders",
        "POST",
        {
          id: urgent,
          title: "Existing urgent",
          totalSheets: 1,
          isUrgent: true,
        },
        201,
      );
      let p = await policy();
      p.roleOverrides.DESIGNER = {
        canCreateProductionOrder: false,
        canViewReports: false,
      };
      p.userOverrides[staff.DESIGNER.id] = { canCreateProductionOrder: true };
      await save(p);
      await must(staff.DESIGNER.client, "/auth/me", "GET", undefined, 401);
      await must(staff.DESIGNER.client, "/auth/login", "POST", {
        username: "parity_designer",
        password,
      });
      await must(
        staff.DESIGNER.client,
        "/production-orders",
        "POST",
        { id: randomUUID(), title: "Override", totalSheets: 1 },
        201,
      );
      await must(
        staff.DESIGNER.client,
        "/reports/production" + query,
        "GET",
        undefined,
        403,
      );
      p = await policy();
      p.userOverrides[staff.DESIGNER.id] = {
        canCreateProductionOrder: false,
        canToggleUrgent: false,
      };
      await save(p);
      await must(staff.DESIGNER.client, "/auth/login", "POST", {
        username: "parity_designer",
        password,
      });
      await must(
        staff.DESIGNER.client,
        "/production-orders",
        "POST",
        { id: randomUUID(), title: "Denied", totalSheets: 1 },
        403,
      );
      await must(
        staff.DESIGNER.client,
        "/PrOdUcTiOn-OrDeRs/",
        "POST",
        { id: randomUUID(), title: "Case cannot bypass", totalSheets: 1 },
        403,
      );
      p = await policy();
      p.userOverrides[staff.DESIGNER.id] = {
        canCreateProductionOrder: true,
        canToggleUrgent: false,
      };
      await save(p);
      await must(staff.DESIGNER.client, "/auth/login", "POST", {
        username: "parity_designer",
        password,
      });
      await must(
        staff.DESIGNER.client,
        "/production-orders",
        "POST",
        {
          id: randomUUID(),
          title: "Urgent denied",
          totalSheets: 1,
          isUrgent: true,
        },
        403,
      );
      await must(
        staff.DESIGNER.client,
        "/production-orders/" + urgent,
        "PATCH",
        {
          version: 1,
          title: "Cannot implicitly remove urgent",
          totalSheets: 1,
        },
        403,
      );
      p = await policy();
      p.roleOverrides = {};
      p.userOverrides = {};
      await save(p);
    },
  );
  await t.test(
    "restricted staff/settings authority cannot use direct API; self profile stays available",
    async () => {
      const p = await policy();
      p.roleOverrides.ADMIN = {
        canManageUsers: false,
        canManageWorkshopSettings: false,
      };
      await save(p);
      const admin = staff.ADMIN.client;
      await must(admin, "/auth/me", "GET", undefined, 401);
      await must(admin, "/auth/login", "POST", {
        username: "parity_admin",
        password,
      });
      await must(
        admin,
        "/users",
        "POST",
        { username: "blocked_staff", name: "Blocked", role: "SALE", password },
        403,
      );
      const settings = (await must(admin, "/settings")).settings;
      await must(admin, "/settings", "PATCH", settings, 403);
      await must(admin, "/SeTtInGs/", "PATCH", settings, 403);
      const me = (await must(admin, "/auth/me")).user;
      await must(admin, "/users/" + me.id, "PATCH", {
        version: me.version,
        name: "Admin self",
      });
      const target = (await must(dev, "/users?role=SALE")).items[0];
      await must(
        admin,
        "/users/" + target.id,
        "PATCH",
        { version: target.version, name: "Denied edit" },
        403,
      );
      const reset = await policy();
      reset.roleOverrides = {};
      await save(reset);
    },
  );
  await t.test(
    "disabled modules preserve history but reject writes, including staged design images",
    async () => {
      const customer = randomUUID();
      await must(
        dev,
        "/customers",
        "POST",
        { id: customer, name: "Lịch sử" },
        201,
      );
      let p = await policy();
      p.features = {
        ...p.features,
        customer: false,
        salesOrder: false,
        warehouseDispatch: false,
        shipping: false,
        sampleLibrary: false,
        comments: false,
      };
      await save(p);
      await must(dev, "/customers/" + customer);
      await must(
        dev,
        "/customers",
        "POST",
        { id: randomUUID(), name: "Blocked" },
        409,
      );
      await must(
        dev,
        "/CuStOmErS/",
        "POST",
        { id: randomUUID(), name: "Case cannot bypass" },
        409,
      );
      const payload = JSON.stringify({
        id: randomUUID(),
        name: "Absolute target cannot bypass",
      });
      const absolute = await new Promise<number>((resolve, reject) => {
        const url = new URL(dev.base);
        const request = httpRequest(
          {
            hostname: url.hostname,
            port: url.port,
            path: dev.base + "/api/customers",
            method: "POST",
            headers: {
              Cookie: dev.cookie,
              Origin: dev.base,
              "X-CSRF-Token": dev.csrf,
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode!));
          },
        );
        request.on("error", reject);
        request.end(payload);
      });
      assert.equal(absolute, 409);
      await must(
        dev,
        "/saved-designs",
        "POST",
        { id: randomUUID(), productName: "Blocked" },
        409,
      );
      await must(
        dev,
        "/images",
        "POST",
        { id: randomUUID(), targetType: "DESIGN", targetId: randomUUID() },
        409,
      );
      p = await policy();
      for (const k of Object.keys(p.features))
        p.features[k as keyof typeof p.features] = true;
      await save(p);
    },
  );
  await t.test(
    "private avatar owner, exact target, verified bytes, reference protection and unlink cleanup",
    async () => {
      await must(staff.SALE.client, "/auth/login", "POST", {
        username: "parity_sale",
        password,
      });
      const avatar = randomUUID(),
        orphan = randomUUID();
      const sale = staff.SALE;
      await must(
        sale.client,
        "/images",
        "POST",
        { id: randomUUID(), targetType: "AVATAR", targetId: devId },
        403,
      );
      for (const id of [avatar, orphan]) {
        await must(
          sale.client,
          "/images",
          "POST",
          { id, targetType: "AVATAR", targetId: sale.id },
          201,
        );
        const bytes = await sharp({
          create: { width: 10, height: 10, channels: 3, background: "#456789" },
        })
          .png()
          .toBuffer();
        const r = await fetch(dev.base + "/api/images/" + id + "/content", {
          method: "PUT",
          headers: {
            Cookie: sale.client.cookie,
            Origin: dev.base,
            "X-CSRF-Token": sale.client.csrf,
            "Content-Type": "image/png",
          },
          body: new Uint8Array(bytes),
        });
        assert.equal(r.status, 200);
      }
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + avatar + "/content", {
            headers: { Cookie: dev.cookie },
          })
        ).status,
        404,
      );
      let u = (await must(sale.client, "/auth/me")).user;
      await must(sale.client, "/users/" + sale.id, "PATCH", {
        version: u.version,
        avatarRegistryId: avatar,
      });
      const read = await fetch(
        dev.base + "/api/images/" + avatar + "/content",
        { headers: { Cookie: dev.cookie } },
      );
      assert.equal(read.status, 200);
      assert.match(read.headers.get("cache-control")!, /no-store/);
      await must(sale.client, "/images/" + avatar, "DELETE", {}, 409);
      await pool.execute(
        "UPDATE image_registry SET created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 DAY) WHERE id IN (?,?)",
        [avatar, orphan],
      );
      await must(dev, "/storage/cleanup", "POST", {});
      const [kept] = await rows(
        pool,
        "SELECT status FROM image_registry WHERE id=?",
        [avatar],
      );
      assert.equal(kept.status, "ACTIVE");
      const [removed] = await rows(
        pool,
        "SELECT status FROM image_registry WHERE id=?",
        [orphan],
      );
      assert.equal(removed.status, "DELETED");
      u = (await must(sale.client, "/auth/me")).user;
      await must(sale.client, "/users/" + sale.id, "PATCH", {
        version: u.version,
        avatarRegistryId: null,
      });
      await must(dev, "/storage/cleanup", "POST", {});
      assert.equal(
        (
          await fetch(dev.base + "/api/images/" + avatar + "/content", {
            headers: { Cookie: dev.cookie },
          })
        ).status,
        404,
      );
    },
  );
});
