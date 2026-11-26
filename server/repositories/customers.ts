import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import {
  customerFields,
  type Customer,
  type CustomerInput,
  normalizePhone,
} from "../../shared/business";
import { rows, type Db } from "../database/pool";
import { fresh } from "../middleware/http";
import { audit, changed } from "../services/audit";
import {
  businessCode,
  businessPage,
  conflict,
  fingerprint,
  iso,
  missing,
  optionalIso,
  pageFields,
  searchPattern,
} from "./business";

export const customerQuery = z
  .object({
    ...pageFields,
    sort: z.enum(["name", "code", "createdAt"]).default("name"),
    province: z.string().trim().max(100).optional(),
    active: z.enum(["active", "deleted", "all"]).default("active"),
  })
  .strict();

const columns = [
  ["name", "name"],
  ["phone", "phone"],
  ["contactName", "contact_name"],
  ["email", "email"],
  ["address", "address"],
  ["province", "province"],
  ["district", "district"],
  ["ward", "ward"],
  ["zalo", "zalo"],
  ["facebook", "facebook"],
  ["note", "note"],
  ["externalSource", "external_source"],
  ["externalId", "external_id"],
] as const;

export function customerDto(r: RowDataPacket): Customer {
  return {
    ...(Object.fromEntries(
      columns.map(([key, column]) => [key, r[column]]),
    ) as CustomerInput),
    id: r.id,
    code: r.code,
    phoneNormalized: r.phone_normalized ?? "",
    source: r.source,
    importJobId: r.import_job_id,
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    deletedAt: optionalIso(r.deleted_at),
  };
}
export async function getCustomer(db: Db, id: string) {
  const [row] = await rows(db, "SELECT * FROM customers WHERE id=?", [id]);
  if (!row) throw missing();
  return customerDto(row);
}
export async function getActiveCustomer(db: Db, id: string) {
  const customer = await getCustomer(db, id);
  if (customer.deletedAt) throw missing();
  return customer;
}
export function listCustomers(pool: Pool, q: z.output<typeof customerQuery>) {
  const sort = { name: "c.name", code: "c.code", createdAt: "c.created_at" }[
    q.sort
  ];
  const where: string[] = [];
  const args: string[] = [];
  if (q.active !== "all")
    where.push(
      q.active === "active"
        ? "c.deleted_at IS NULL"
        : "c.deleted_at IS NOT NULL",
    );
  if (q.province) {
    where.push("c.province=?");
    args.push(q.province);
  }
  if (q.search) {
    const conditions = ["c.name", "c.code", "c.phone", "c.external_id"].map(
      (column) => column + " LIKE ? ESCAPE '!'",
    );
    const pattern = searchPattern(q.search);
    args.push(pattern, pattern, pattern, pattern);
    const phone = normalizePhone(q.search);
    if (/^\+?\d{1,15}$/.test(phone)) {
      conditions.push("c.active_phone LIKE ? ESCAPE '!'");
      args.push(searchPattern(phone));
    }
    where.push("(" + conditions.join(" OR ") + ")");
  }
  return businessPage(
    pool,
    q,
    {
      select: "SELECT c.*",
      from: "FROM customers c",
      where,
      args,
      order: `${sort} ${q.direction},c.id ${q.direction}`,
    },
    (_db, list) => list.map(customerDto),
  );
}
export async function customerMatches(db: Db, input: CustomerInput) {
  const phone = normalizePhone(input.phone) || null;
  return (
    await rows(
      db,
      `SELECT * FROM customers WHERE active_phone=? UNION DISTINCT
     SELECT * FROM customers WHERE external_source=? AND active_external_id=?`,
      [phone, input.externalSource, input.externalId || null],
    )
  ).map(customerDto);
}
export async function createCustomer(
  db: PoolConnection,
  input: CustomerInput,
  actor: string,
  origin: { source: string; jobId?: string; id?: string },
) {
  const id = origin.id ?? randomUUID();
  const hash = fingerprint(input);
  if (origin.id) {
    const [existing] = await rows(db, "SELECT * FROM customers WHERE id=?", [
      id,
    ]);
    if (existing) {
      const [action] = await rows(
        db,
        "SELECT actor_id FROM audit_logs WHERE entity_id=? AND action='CUSTOMER_CREATED' ORDER BY id LIMIT 1",
        [id],
      );
      if (
        existing.request_hash !== hash ||
        action?.actor_id !== actor ||
        existing.deleted_at
      )
        throw conflict("REQUEST_CONFLICT", "Mã yêu cầu đã được sử dụng.");
      return customerDto(existing);
    }
  }
  if ((await customerMatches(db, input)).length)
    throw conflict(
      "CUSTOMER_DUPLICATE",
      "Số điện thoại hoặc mã ngoài đã có trong danh sách khách hàng.",
    );
  const code = await businessCode(db, "customers");
  await db.execute(
    `INSERT INTO customers(id,code,${columns.map(([, c]) => c).join(",")},phone_normalized,source,import_job_id,request_hash)
      VALUES(${Array.from({ length: columns.length + 6 }, () => "?").join(",")})`,
    [
      id,
      code,
      ...columns.map(([key]) => input[key]),
      normalizePhone(input.phone) || null,
      origin.source,
      origin.jobId ?? null,
      hash,
    ],
  );
  await audit(
    db,
    actor,
    "CUSTOMER_CREATED",
    id,
    origin.jobId ? { importJobId: origin.jobId } : {},
  );
  await changed(db, "customers", id, 1);
  return getCustomer(db, id);
}
export async function updateCustomer(
  db: PoolConnection,
  id: string,
  expected: number,
  patch: Record<string, unknown>,
  actor: string,
  jobId?: string,
) {
  const current = await getActiveCustomer(db, id);
  fresh(current.version, expected);
  const input = customerFields.parse({
    ...Object.fromEntries(columns.map(([key]) => [key, current[key]])),
    ...patch,
  });
  if ((await customerMatches(db, input)).some((row) => row.id !== id))
    throw conflict(
      "CUSTOMER_DUPLICATE",
      "Số điện thoại hoặc mã ngoài đã có trong danh sách khách hàng.",
    );
  await db.execute(
    `UPDATE customers SET ${columns.map(([, c]) => c + "=?").join(",")},phone_normalized=?,
      version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?`,
    [
      ...columns.map(([key]) => input[key]),
      normalizePhone(input.phone) || null,
      id,
    ],
  );
  await audit(
    db,
    actor,
    "CUSTOMER_UPDATED",
    id,
    jobId ? { importJobId: jobId } : {},
  );
  await changed(db, "customers", id, current.version + 1);
  return getCustomer(db, id);
}
export async function deleteCustomer(
  db: PoolConnection,
  id: string,
  expected: number,
  actor: string,
) {
  const current = await getCustomer(db, id);
  fresh(current.version, expected);
  if (current.deletedAt)
    throw conflict("CUSTOMER_DELETED", "Khách hàng đã ngừng hoạt động.");
  await db.execute(
    `UPDATE customers SET version=version+1,deleted_at=CURRENT_TIMESTAMP(3),updated_at=CURRENT_TIMESTAMP(3) WHERE id=?`,
    [id],
  );
  await audit(db, actor, "CUSTOMER_DELETED", id);
  await changed(db, "customers", id, current.version + 1, true);
}
