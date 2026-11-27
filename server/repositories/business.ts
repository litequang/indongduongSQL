import { createHash } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { AuditEntry, Page } from "../../shared/contracts";
import { ApiError } from "../errors";
import { rows, transaction } from "../database/pool";
import type { Pool } from "mysql2/promise";
import { z } from "zod";

export const iso = (date: Date | string) => new Date(date).toISOString();
export const optionalIso = (date: Date | string | null) =>
  date ? iso(date) : null;

export const missing = () =>
  new ApiError(404, "NOT_FOUND", "Không tìm thấy bản ghi.");
export const conflict = (code: string, message: string) =>
  new ApiError(409, code, message);

export function fingerprint(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export async function businessCode(
  db: PoolConnection,
  entity:
    | "customers"
    | "sales_orders"
    | "production_orders"
    | "warehouse_dispatches"
    | "shipments",
) {
  await db.execute(
    "UPDATE business_counters SET value=value+1 WHERE entity=?",
    [entity],
  );
  const [row] = await rows(
    db,
    "SELECT value FROM business_counters WHERE entity=?",
    [entity],
  );
  const prefixes = {
    customers: "KH-",
    sales_orders: "SO-",
    production_orders: "LIN-",
    warehouse_dispatches: "PX-",
    shipments: "GH-",
  };
  return prefixes[entity] + String(row.value).padStart(6, "0");
}
export const pageFields = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  direction: z.enum(["asc", "desc"]).default("desc"),
};
export function searchPattern(value: string) {
  return "%" + value.replace(/[!%_]/g, "!$&") + "%";
}
export function businessPage<T>(
  pool: Pool,
  query: Pick<z.output<z.ZodObject<typeof pageFields>>, "page" | "pageSize">,
  sql: {
    select: string;
    from: string;
    where: string[];
    args: (string | number)[];
    order: string;
  },
  map: (db: PoolConnection, list: RowDataPacket[]) => Promise<T[]> | T[],
): Promise<Page<T>> {
  return transaction(pool, async (db) => {
    const where = sql.where.length ? " WHERE " + sql.where.join(" AND ") : "";
    const [count] = await rows(
      db,
      "SELECT COUNT(*) AS n " + sql.from + where,
      sql.args,
    );
    const list = await rows(
      db,
      sql.select +
        " " +
        sql.from +
        where +
        " ORDER BY " +
        sql.order +
        " LIMIT ? OFFSET ?",
      [...sql.args, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return {
      items: await map(db, list),
      total: Number(count.n),
      page: query.page,
      pageSize: query.pageSize,
    };
  });
}
export async function businessAudit(
  db: PoolConnection,
  id: string,
  actions: string[],
): Promise<AuditEntry[]> {
  const data = await rows(
    db,
    `SELECT a.id,u.name AS actor_name,a.action,a.entity_id,a.created_at
      FROM audit_logs a JOIN users u ON u.id=a.actor_id
      WHERE a.entity_id=? AND a.action IN (${actions.map(() => "?").join(",")}) ORDER BY a.id DESC LIMIT 50`,
    [id, ...actions],
  );
  return data.map((r) => ({
    id: String(r.id),
    actorName: r.actor_name,
    action: r.action,
    entityId: r.entity_id,
    createdAt: iso(r.created_at),
  }));
}
