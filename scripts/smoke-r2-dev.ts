import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { digest, r2Store } from "../server/storage/objects";
// Explicit dev-only probe. Never reads or deletes pre-existing object keys.
if (
  process.env.ALLOW_R2_DEV_SMOKE !== "1" ||
  process.env.R2_ENVIRONMENT !== "development" ||
  (process.env.NODE_ENV ?? "development") !== "development"
)
  throw new Error(
    "Dev R2 smoke requires explicit ALLOW_R2_DEV_SMOKE=1 and development environment.",
  );
const store = r2Store();
assert(store?.backupEnabled, "Separate dev primary/backup buckets required");
const key = "smoke/" + randomUUID();
const bytes = await sharp({
  create: { width: 8, height: 8, channels: 3, background: "#2563eb" },
})
  .png()
  .toBuffer();
try {
  await store.put(key, bytes, "image/png");
  assert.equal(digest((await store.get(key))!), digest(bytes));
  await store.put(key, bytes, "image/png");
  const different = await sharp(bytes).negate().png().toBuffer();
  await assert.rejects(() => store.put(key, different, "image/png"));
  await store.put(key, bytes, "image/png", true);
  assert.equal(digest((await store.get(key, true))!), digest(bytes));
  await store.delete(key);
  assert.equal(await store.get(key), null);
  await store.put(key, (await store.get(key, true))!, "image/png");
  assert.equal(digest((await store.get(key))!), digest(bytes));
  console.log(
    "PASS dev R2 primary/backup checksum, conditional immutable put, missing-only restore.",
  );
} finally {
  await store.delete(key);
  await store.delete(key, true);
}
