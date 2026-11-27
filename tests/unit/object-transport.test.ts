import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { S3Client } from "@aws-sdk/client-s3";
import { digest, s3ObjectStore } from "../../server/storage/objects";
test("AWS SDK real local HTTP transport: signatures, immutable conditional PUT, backup isolation, 404 and provider failure", async (t) => {
  const objects = new Map<string, Buffer>();
  let writes = 0;
  const server = createServer(async (req, res) => {
    assert.match(req.headers.authorization ?? "", /^AWS4-HMAC-SHA256 /);
    const key = new URL(req.url!, "http://localhost").pathname;
    const fail = (status: number, code: string) => {
      res.writeHead(status, { "Content-Type": "application/xml" });
      res.end("<Error><Code>" + code + "</Code></Error>");
    };
    if (key.includes("unavailable")) {
      fail(503, "ServiceUnavailable");
      return;
    }
    if (req.method === "PUT") {
      assert.equal(req.headers["if-none-match"], "*");
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(Buffer.from(c));
      if (objects.has(key)) {
        fail(412, "PreconditionFailed");
        return;
      }
      const bytes = Buffer.concat(chunks);
      assert.equal(req.headers["x-amz-meta-sha256"], digest(bytes));
      objects.set(key, bytes);
      writes++;
      res.end();
    } else if (req.method === "GET") {
      const bytes = objects.get(key);
      if (!bytes) {
        fail(404, "NoSuchKey");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": bytes.length,
      });
      res.end(bytes);
    } else if (req.method === "DELETE") {
      objects.delete(key);
      res.statusCode = 204;
      res.end();
    } else {
      fail(400, "BadRequest");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const a = server.address();
  assert(a && typeof a !== "string");
  const client = new S3Client({
    endpoint: "http://127.0.0.1:" + a.port,
    forcePathStyle: true,
    region: "auto",
    credentials: {
      accessKeyId: "synthetic-test-only",
      secretAccessKey: "synthetic-local-transport-secret",
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  t.after(async () => {
    client.destroy();
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  });
  const store = s3ObjectStore(client, "isolated-primary", "isolated-backup");
  const bytes = Buffer.from("synthetic-normalized-image-bytes");
  await store.put("images/test", bytes, "image/png");
  await store.put("images/test", bytes, "image/png");
  assert.equal(writes, 1);
  await assert.rejects(
    () => store.put("images/test", Buffer.from("different"), "image/png"),
    /nội dung khác/,
  );
  await store.put("verified/test", bytes, "image/png", true);
  assert.equal(
    digest((await store.get("verified/test", true))!),
    digest(bytes),
  );
  assert.equal(await store.get("verified/test"), null);
  await store.delete("images/test");
  assert.equal(await store.get("images/test"), null);
  await assert.rejects(() => store.get("unavailable"));
  await store.delete("verified/test", true);
  assert.equal(objects.size, 0);
});
