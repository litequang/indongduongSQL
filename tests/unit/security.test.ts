import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  equalSecret,
} from "../../server/auth/password";
import { canManageTarget, ROLES, ADMIN_ROLES } from "../../shared/contracts";
import { loadConfig } from "../../server/config";
import { readR2Config } from "../../server/storage/config";
test("scrypt salts differ; valid password verifies; wrong password and malformed hash fail", async () => {
  const password = randomBytes(20).toString("hex");
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
  assert.equal(equalSecret("a", "a"), true);
  assert.equal(equalSecret("a", "b"), false);
});
test("management authority is exhaustive across eight roles and targets", () => {
  for (const actor of ROLES)
    for (const target of ROLES)
      assert.equal(
        canManageTarget(actor, target),
        actor === "DEVELOPER" ||
          (actor === "ADMIN" && ADMIN_ROLES.includes(target)),
      );
});
test("config rejects wrong DB allowlist, weak setup secret and insecure production", () => {
  const base = {
    APP_ORIGIN: "http://localhost:4100",
    DB_HOST: "127.0.0.1",
    DB_NAME: "indongduong_sql_dev",
    DB_EXPECTED_NAME: "indongduong_sql_dev",
    DB_USER: "indongduong_sql_dev",
    DB_PASSWORD: randomBytes(20).toString("hex"),
  };
  assert.throws(() => loadConfig({ ...base, DB_EXPECTED_NAME: "other" }));
  assert.throws(() => loadConfig({ ...base, SETUP_SECRET: "short" }));
  assert.throws(() => loadConfig({ ...base, NODE_ENV: "production" }));
  const c = loadConfig({
    ...base,
    NODE_ENV: "production",
    APP_ORIGIN: "https://workshop.example",
  });
  assert.equal(c.secureCookies, true);
  assert.equal(c.cookieName, "__Host-idd_session");
});
test("R2 config is optional, backend only and rejects partial or foreign endpoints", () => {
  assert.equal(readR2Config({}), null);
  assert.throws(() => readR2Config({ R2_BUCKET: "new-bucket" }));
  assert.throws(() =>
    readR2Config({ R2_ENDPOINT: "https://attacker.example" }),
  );
});
