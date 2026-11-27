import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { testConfig } from "../tests/test-environment";
import { createPool, assertDatabase, rows } from "../server/database/pool";
import { hashPassword } from "../server/auth/password";

// Real Node-process restart, compiled startup, real guarded MariaDB. No mock data store.
const reservation = createServer();
await new Promise<void>((resolve) =>
  reservation.listen(0, "127.0.0.1", resolve),
);
const address = reservation.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve) => reservation.close(() => resolve()));
const config = testConfig(`http://127.0.0.1:${port}`);
const pool = createPool(config);
await assertDatabase(pool, config.DB_NAME);
const [state] = await rows(
  pool,
  "SELECT initialized_at FROM system_state WHERE id=1",
);
assert(
  state.initialized_at,
  "Run test:integration before the compiled restart smoke.",
);
const [sale] = await rows(
  pool,
  `SELECT o.id,o.code,o.customer_id,i.design_version_id
  FROM sales_orders o JOIN sales_order_items i ON i.order_id=o.id
  WHERE i.design_version_id IS NOT NULL ORDER BY o.id LIMIT 1`,
);
assert(
  sale,
  "Run the complete integration suite to create a persisted sales and design probe.",
);
const [production] = await rows(
  pool,
  "SELECT id FROM production_orders WHERE status='PRINTED' ORDER BY id LIMIT 1",
);
assert(production, "Run Phase 02B integration before the restart smoke.");
const [fulfillment] = await rows(
  pool,
  `SELECT s.id AS shipment_id,d.id AS dispatch_id,
  d.order_id,l.good_id FROM shipments s
  JOIN warehouse_dispatches d ON d.id=s.dispatch_id
  JOIN warehouse_dispatch_items l ON l.dispatch_id=d.id
  WHERE s.status='DELIVERED' ORDER BY d.created_at,l.id LIMIT 1`,
);
assert(fulfillment, "Run Phase 02C integration before the restart smoke.");
const id = randomUUID();
const username = `restart_${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
await pool.execute(
  "INSERT INTO users(id,username,name,role_code,password_hash) VALUES(?,?,?,'MANAGER',?)",
  [
    id,
    username,
    "Synthetic process restart probe",
    await hashPassword(password),
  ],
);
let child: ChildProcess | undefined;
const origin = config.APP_ORIGIN;
async function start() {
  child = spawn(process.execPath, ["app.cjs"], {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      HOST: "127.0.0.1",
      APP_ORIGIN: origin,
      DB_NAME: config.DB_NAME,
      DB_EXPECTED_NAME: config.DB_NAME,
      DB_USER: config.DB_USER,
      DB_PASSWORD: config.DB_PASSWORD,
      SETUP_SECRET: config.SETUP_SECRET,
    },
  });
  let startupLog = "";
  child.stdout?.on("data", (data) => {
    startupLog = (startupLog + String(data)).slice(-1000);
  });
  child.stderr?.on("data", (data) => {
    startupLog = (startupLog + String(data)).slice(-1000);
  });
  let lastStatus = "";
  const started = Date.now();
  while (Date.now() - started < 15000) {
    if (child.exitCode !== null)
      throw new Error("Compiled server exited before readiness.");
    try {
      const response = await fetch(origin + "/api/ready");
      if (response.status === 200) return;
      lastStatus = "HTTP " + response.status;
    } catch (error) {
      lastStatus = String(error);
      /* Wait for this private child to start. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Compiled startup timed out at " +
      origin +
      " (" +
      lastStatus +
      "): " +
      startupLog,
  );
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  }
  child = undefined;
}
try {
  await start();
  const login = await fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const profile = (await login.json()).user;
  const beforeProduction = await fetch(
    origin + "/api/production-orders/" + production.id,
    { headers: { Cookie: cookie } },
  );
  assert.equal(beforeProduction.status, 200);
  const productionSnapshot = await beforeProduction.json();
  const fulfillmentPaths = [
    "/sales-orders/" + fulfillment.order_id + "/progress",
    "/finished-goods/" + fulfillment.good_id,
    "/warehouse-dispatches/" + fulfillment.dispatch_id,
    "/shipments/" + fulfillment.shipment_id,
  ];
  async function fulfillmentSnapshot() {
    return Promise.all(
      fulfillmentPaths.map(async (path) => {
        const response = await fetch(origin + "/api" + path, {
          headers: { Cookie: cookie },
        });
        assert.equal(response.status, 200, path);
        return response.json();
      }),
    );
  }
  const fulfillmentBefore = await fulfillmentSnapshot();
  await stop();
  await start();
  const me = await fetch(origin + "/api/auth/me", {
    headers: { Cookie: cookie },
  });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.id, profile.id);
  const directory = await fetch(origin + "/api/users?search=" + username, {
    headers: { Cookie: cookie },
  });
  assert.equal(directory.status, 200);
  assert.equal((await directory.json()).items[0].id, id);
  const order = await fetch(origin + "/api/sales-orders/" + sale.id, {
    headers: { Cookie: cookie },
  });
  assert.equal(order.status, 200);
  const detail = await order.json();
  assert.equal(detail.order.code, sale.code);
  assert(
    detail.items.some(
      (item: { designSnapshot: { id: string } | null }) =>
        item.designSnapshot?.id === sale.design_version_id,
    ),
  );
  const customer = await fetch(origin + "/api/customers/" + sale.customer_id, {
    headers: { Cookie: cookie },
  });
  assert.equal(customer.status, 200);
  assert.equal((await customer.json()).customer.id, sale.customer_id);
  const afterProduction = await fetch(
    origin + "/api/production-orders/" + production.id,
    { headers: { Cookie: cookie } },
  );
  assert.equal(afterProduction.status, 200);
  assert.deepEqual(await afterProduction.json(), productionSnapshot);
  assert.deepEqual(await fulfillmentSnapshot(), fulfillmentBefore);
  assert.equal((await fetch(origin + "/server.cjs")).status, 404);
  assert.equal((await fetch(origin + "/build/server.cjs")).status, 404);
  console.log(
    "PASS compiled Node process restart: session, customer, sales/design and production, accepted stock/movements, whole-order dispatch and shipment snapshots survive. Backend artifacts stay private.",
  );
} finally {
  await stop();
  await pool.execute("DELETE FROM sessions WHERE user_id=?", [id]);
  await pool.execute("DELETE FROM audit_logs WHERE actor_id=?", [id]);
  await pool.execute("DELETE FROM users WHERE id=?", [id]);
  await pool.end();
}
