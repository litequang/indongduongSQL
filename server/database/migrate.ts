import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "mysql2/promise";
import { assertDatabase, rows } from "./pool";
export const migrationDirectory = path.resolve("server/migrations");
// Migration files deliberately contain only standalone SQL statements; no routines or DELIMITER.
export function statements(source: string): string[] {
  if (/\bDELIMITER\b/i.test(source))
    throw new Error("DELIMITER is not supported.");
  return source
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
export async function migrationFiles(directory = migrationDirectory) {
  return (await readdir(directory))
    .filter((x) => /^\d{3}_[a-z_]+\.sql$/.test(x))
    .sort();
}
export async function migrate(
  pool: Pool,
  expectedName: string,
  directory = migrationDirectory,
): Promise<string[]> {
  await assertDatabase(pool, expectedName);
  const db = await pool.getConnection();
  const applied: string[] = [];
  let locked = false;
  const lockName = `idd:migrate:${createHash("sha256").update(expectedName).digest("hex").slice(0, 32)}`;
  try {
    const [lock] = await rows(db, "SELECT GET_LOCK(?, 60) AS acquired", [
      lockName,
    ]);
    if (Number(lock.acquired) !== 1) throw new Error("Migration lock timeout.");
    locked = true;
    await db.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(160) PRIMARY KEY, checksum CHAR(64) NOT NULL, status VARCHAR(12) NOT NULL, completed_statements INT NOT NULL DEFAULT 0, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), applied_at DATETIME(3) NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    for (const name of await migrationFiles(directory)) {
      const source = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256")
        .update(source.replace(/\r\n/g, "\n"))
        .digest("hex");
      const [prior] = await rows(
        db,
        "SELECT * FROM schema_migrations WHERE name=?",
        [name],
      );
      if (prior) {
        if (prior.checksum !== checksum)
          throw new Error(`Migration checksum mismatch: ${name}`);
        if (prior.status !== "applied")
          throw new Error(
            `Incomplete migration ${name}; inspect partial DDL and completed_statements before explicit repair.`,
          );
        continue;
      }
      await db.execute(
        "INSERT INTO schema_migrations(name,checksum,status) VALUES(?,?,'running')",
        [name, checksum],
      );
      let count = 0;
      try {
        for (const sql of statements(source)) {
          await db.query(sql);
          await db.execute(
            "UPDATE schema_migrations SET completed_statements=? WHERE name=?",
            [++count, name],
          );
        }
        await db.execute(
          "UPDATE schema_migrations SET status='applied',applied_at=UTC_TIMESTAMP(3) WHERE name=?",
          [name],
        );
        applied.push(name);
      } catch (error) {
        await db.execute(
          "UPDATE schema_migrations SET status='failed' WHERE name=?",
          [name],
        );
        throw error;
      }
    }
    return applied;
  } finally {
    try {
      if (locked) await db.execute("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      db.release();
    }
  }
}
export async function isReady(pool: Pool) {
  const files = await migrationFiles();
  const actual = await rows(
    pool,
    "SELECT name,checksum,status FROM schema_migrations ORDER BY name",
  );
  if (actual.some((row) => row.status !== "applied")) return false;
  if (actual.length !== files.length) return false;
  for (let i = 0; i < files.length; i++) {
    const source = await readFile(
      path.join(migrationDirectory, files[i]),
      "utf8",
    );
    if (
      actual[i].name !== files[i] ||
      actual[i].checksum !==
        createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex")
    )
      return false;
  }
  return true;
}
