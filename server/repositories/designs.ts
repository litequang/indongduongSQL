import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import {
  idSchema,
  type DesignInput,
  type DesignVersion,
  type SavedDesign,
} from "../../shared/business";
import { rows, type Db } from "../database/pool";
import { fresh } from "../middleware/http";
import { audit, changed } from "../services/audit";
import {
  businessPage,
  conflict,
  fingerprint,
  iso,
  missing,
  optionalIso,
  pageFields,
  searchPattern,
} from "./business";
import { getActiveCustomer } from "./customers";
import { validateImageLink } from "../storage/registry";

export const designQuery = z
  .object({
    ...pageFields,
    customerId: idSchema.optional(),
    paperType: z.string().trim().max(100).optional(),
    sort: z.enum(["productName", "updatedAt"]).default("updatedAt"),
  })
  .strict();
const selectCurrent = `SELECT v.*,d.version AS design_record_version,d.created_by AS design_creator,d.created_at AS design_created,
  d.updated_at,d.print_count,d.last_printed_at,d.last_printer_id`;
const fromCurrent =
  "FROM saved_designs d JOIN design_versions v ON v.design_id=d.id AND v.version=d.version";

async function versionsWithTags(
  db: Db,
  data: RowDataPacket[],
): Promise<DesignVersion[]> {
  if (!data.length) return [];
  const tags = new Map<string, string[]>();
  for (const r of await rows(
    db,
    `SELECT version_id,tag FROM design_version_tags WHERE version_id IN (${data.map(() => "?").join(",")}) ORDER BY tag`,
    data.map((r) => r.id),
  )) {
    const list = tags.get(r.version_id) ?? [];
    list.push(r.tag);
    tags.set(r.version_id, list);
  }
  return data.map((r) => ({
    id: r.id,
    designId: r.design_id,
    version: r.version,
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
    customerId: r.customer_id,
    customerName: r.customer_name,
    productName: r.product_name,
    bagSize: r.bag_size,
    paperType: r.paper_type,
    paperGsm: r.paper_gsm,
    color: r.color,
    plateReference: r.plate_reference,
    note: r.note,
    tags: tags.get(r.id) ?? [],
    image: r.image_registry_id ? { registryId: r.image_registry_id } : null,
    imageRegistryId: r.image_registry_id,
  }));
}
async function designsWithTags(
  db: Db,
  data: RowDataPacket[],
): Promise<SavedDesign[]> {
  const versions = await versionsWithTags(db, data);
  return data.map((r, i) => ({
    id: r.design_id,
    version: r.design_record_version,
    createdBy: r.design_creator,
    createdAt: iso(r.design_created),
    updatedAt: iso(r.updated_at),
    printCount: r.print_count,
    lastPrintedAt: optionalIso(r.last_printed_at),
    lastPrinterId: r.last_printer_id,
    current: versions[i],
  }));
}
export function listDesigns(pool: Pool, q: z.output<typeof designQuery>) {
  const where: string[] = [];
  const args: string[] = [];
  if (q.customerId) {
    where.push("d.customer_id=?");
    args.push(q.customerId);
  }
  if (q.paperType) {
    where.push("v.paper_type=?");
    args.push(q.paperType);
  }
  if (q.search) {
    where.push(`(v.product_name LIKE ? ESCAPE '!' OR v.customer_name LIKE ? ESCAPE '!' OR v.plate_reference LIKE ? ESCAPE '!'
      OR v.paper_type LIKE ? ESCAPE '!' OR EXISTS(SELECT 1 FROM design_version_tags t WHERE t.version_id=v.id AND t.tag LIKE ? ESCAPE '!'))`);
    args.push(...Array<string>(5).fill(searchPattern(q.search)));
  }
  const sort = q.sort === "productName" ? "v.product_name" : "d.updated_at";
  return businessPage(
    pool,
    q,
    {
      select: selectCurrent,
      from: fromCurrent,
      where,
      args,
      order: `${sort} ${q.direction},d.id ${q.direction}`,
    },
    designsWithTags,
  );
}
export async function getDesign(db: Db, id: string) {
  const [design] = await designsWithTags(
    db,
    await rows(db, `${selectCurrent} ${fromCurrent} WHERE d.id=?`, [id]),
  );
  if (!design) throw missing();
  return design;
}
export function listDesignVersions(
  pool: Pool,
  id: string,
  q: z.output<z.ZodObject<typeof pageFields>>,
) {
  return businessPage(
    pool,
    q,
    {
      select: "SELECT v.*",
      from: "FROM design_versions v",
      where: ["v.design_id=?"],
      args: [id],
      order: "v.version DESC",
    },
    versionsWithTags,
  );
}
export async function getDesignSnapshots(db: Db, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, DesignVersion>();
  const data = await rows(
    db,
    `SELECT * FROM design_versions WHERE id IN (${unique.map(() => "?").join(",")})`,
    unique,
  );
  return new Map(
    (await versionsWithTags(db, data)).map((version) => [version.id, version]),
  );
}
export async function saveDesign(
  db: PoolConnection,
  id: string,
  input: DesignInput,
  actor: string,
  expected?: number,
) {
  const [current] = await rows(db, "SELECT * FROM saved_designs WHERE id=?", [
    id,
  ]);
  const hash = fingerprint(input);
  if (expected === undefined && current) {
    if (current.request_hash !== hash || current.created_by !== actor)
      throw conflict("REQUEST_CONFLICT", "Mã yêu cầu đã được sử dụng.");
    return getDesign(db, id);
  }
  if (expected !== undefined) {
    if (!current) throw missing();
    fresh(current.version, expected);
  }
  const customerName = input.customerId
    ? current?.customer_id === input.customerId
      ? (await getDesign(db, id)).current.customerName
      : (await getActiveCustomer(db, input.customerId)).name
    : input.customerName;
  const version = (current?.version ?? 0) + 1;
  await validateImageLink(db, input.imageRegistryId, "DESIGN", id, actor);
  if (current)
    await db.execute(
      "UPDATE saved_designs SET customer_id=?,version=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
      [input.customerId, version, id],
    );
  else
    await db.execute(
      "INSERT INTO saved_designs(id,created_by,customer_id,request_hash) VALUES(?,?,?,?)",
      [id, actor, input.customerId, hash],
    );
  const versionId = randomUUID();
  await db.execute(
    `INSERT INTO design_versions(id,design_id,version,created_by,customer_id,customer_name,product_name,bag_size,
    paper_type,paper_gsm,color,plate_reference,note,image_registry_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      versionId,
      id,
      version,
      actor,
      input.customerId,
      customerName,
      input.productName,
      input.bagSize,
      input.paperType,
      input.paperGsm,
      input.color,
      input.plateReference,
      input.note,
      input.imageRegistryId ?? null,
    ],
  );
  // Deduplicate case/accent equivalents using the same collation as the indexed tags.
  for (const tag of input.tags)
    await db.execute(
      "INSERT INTO design_version_tags(version_id,tag) VALUES(?,?) ON DUPLICATE KEY UPDATE tag=tag",
      [versionId, tag],
    );
  await audit(
    db,
    actor,
    current ? "DESIGN_VERSION_ADDED" : "DESIGN_CREATED",
    id,
    { version },
  );
  await changed(db, "saved_designs", id, version);
  return getDesign(db, id);
}
