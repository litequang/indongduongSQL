import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from "mysql2/promise";
import type { Config } from "../config";
export type Db = Pool | PoolConnection;
export function createPool(c: Config): Pool {
  const pool = mysql.createPool({
    host: c.DB_HOST,
    port: c.DB_PORT,
    database: c.DB_NAME,
    user: c.DB_USER,
    password: c.DB_PASSWORD,
    connectionLimit: c.DB_POOL_LIMIT,
    queueLimit: c.DB_POOL_QUEUE_LIMIT,
    waitForConnections: true,
    connectTimeout: 10000,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    decimalNumbers: false,
  });
  pool.pool.on("connection", (connection) => {
    connection.query(
      "SET time_zone = '+00:00', SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    );
  });
  return pool;
}
export async function rows<T extends RowDataPacket = RowDataPacket>(
  db: Db,
  sql: string,
  values: any[] = [],
): Promise<T[]> {
  const [result] = await db.execute<T[]>(sql, values);
  return result;
}
export async function transaction<T>(
  pool: Pool,
  run: (db: PoolConnection) => Promise<T>,
): Promise<T> {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const value = await run(db);
    await db.commit();
    return value;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
// Lock first and hold until commit: allocated change sequences reflect commit order.
export async function lockState(db: PoolConnection) {
  return (
    await rows(db, "SELECT * FROM system_state WHERE id=1 FOR UPDATE")
  )[0];
}
export async function assertDatabase(pool: Pool, expected: string) {
  const [r] = await rows(
    pool,
    "SELECT DATABASE() AS name, VERSION() AS version",
  );
  if (r.name !== expected) throw new Error("Unexpected database.");
  return String(r.version);
}
