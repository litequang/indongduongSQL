import "dotenv/config";
import { loadConfig } from "../server/config";
import { createPool, assertDatabase, rows } from "../server/database/pool";
import { migrate } from "../server/database/migrate";
export function testConfig(origin = "http://127.0.0.1") {
  if (process.env.ALLOW_TEST_DATABASE !== "1")
    throw new Error(
      "Set ALLOW_TEST_DATABASE=1 to authorize resetting dedicated synthetic test data.",
    );
  const name = process.env.TEST_DB_NAME ?? "";
  if (!/^indongduong_sql_test(?:_[a-z0-9]+)?$/.test(name))
    throw new Error("A separate indongduong_sql_test database is required.");
  if (
    name === process.env.DB_NAME ||
    process.env.TEST_DB_USER === process.env.DB_USER
  )
    throw new Error(
      "Test DB and account must differ from the application development/production DB.",
    );
  return loadConfig({
    ...process.env,
    NODE_ENV: "test",
    APP_ORIGIN: origin,
    DB_NAME: name,
    DB_EXPECTED_NAME: name,
    DB_USER: process.env.TEST_DB_USER,
    DB_PASSWORD: process.env.TEST_DB_PASSWORD,
    SETUP_SECRET:
      process.env.TEST_SETUP_SECRET ||
      "test-bootstrap-secret-not-used-in-production-000000",
  });
}
export async function prepareTestDatabase() {
  const config = testConfig();
  const pool = createPool(config);
  await assertDatabase(pool, config.DB_NAME);
  await migrate(pool, config.DB_NAME);
  await resetTestData(pool, config.DB_NAME);
  return { config, pool };
}
export async function resetTestData(
  pool: ReturnType<typeof createPool>,
  name: string,
) {
  if (
    process.env.ALLOW_TEST_DATABASE !== "1" ||
    !/^indongduong_sql_test(?:_[a-z0-9]+)?$/.test(name)
  )
    throw new Error("Unsafe test reset rejected.");
  await assertDatabase(pool, name);
  const [state] = await rows(
    pool,
    "SELECT initialized_at FROM system_state WHERE id=1",
  );
  if (!state) throw new Error("Missing test schema.");
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Self references are cleared only inside this guarded synthetic-test reset.
    await db.query(
      "UPDATE production_allocations SET source_allocation_id=NULL,kind='OUTPUT',quantity=GREATEST(quantity,1) WHERE source_allocation_id IS NOT NULL",
    );
    await db.query(
      "UPDATE production_orders SET source_order_id=NULL,run_kind='NORMAL' WHERE source_order_id IS NOT NULL",
    );
    for (const table of [
      "fulfillment_receipts",
      "workflow_issues",
      "inventory_movements",
      "shipment_returns",
      "shipment_history",
      "shipments",
      "warehouse_dispatch_items",
      "warehouse_dispatches",
      "finished_goods",
      "finished_goods_acceptances",
      "finishing_task_history",
      "finishing_tasks",
      "production_finishing_handoffs",
      "production_design_prints",
      "production_action_receipts",
      "production_comments",
      "production_cancellation_requests",
      "production_issue_roles",
      "production_issue_users",
      "production_issues",
      "production_plates",
      "production_status_history",
      "production_revisions",
      "production_print_images",
      "production_allocations",
      "production_items",
      "production_tags",
      "production_orders",
      "sales_order_status_history",
      "sales_order_items",
      "sales_orders",
      "design_version_tags",
      "design_versions",
      "saved_designs",
      "customer_import_items",
      "customers",
      "customer_import_jobs",
      "sessions",
      "audit_logs",
      "change_events",
      "setting_options",
      "settings",
      "auth_rate_limits",
      "users",
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "UPDATE system_state SET initialized_at=NULL,change_sequence=0 WHERE id=1",
    );
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
