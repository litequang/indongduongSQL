import { loadConfig } from "../config";
import { createPool } from "./pool";
import { migrate } from "./migrate";
const config = loadConfig();
const pool = createPool(config);
try {
  const applied = await migrate(pool, config.DB_NAME);
  console.log(
    applied.length
      ? `Applied: ${applied.join(", ")}`
      : "Schema already up to date.",
  );
} catch {
  console.error(
    "Migration failed. Inspect schema_migrations and partial DDL; no automatic repair or destructive reset was performed.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
