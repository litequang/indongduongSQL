import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import {
  customerFields,
  idSchema,
  IMPORT_BATCH,
  IMPORT_MAX_ROWS,
  normalizePhone,
  versionSchema,
  type CustomerInput,
  type ImportItem,
  type ImportJob,
} from "../../shared/business";
import { rows, type Db } from "../database/pool";
import { ApiError } from "../errors";
import { fresh } from "../middleware/http";
import { audit } from "../services/audit";
import {
  businessPage,
  conflict,
  fingerprint,
  iso,
  missing,
  optionalIso,
  pageFields,
} from "./business";
import { createCustomer, customerMatches, updateCustomer } from "./customers";

export const createJobSchema = z
  .object({
    id: idSchema,
    fileName: z.string().trim().min(1).max(180),
    source: z.enum(["CSV_IMPORT", "EXCEL_IMPORT"]),
    totalRows: z.number().int().min(1).max(IMPORT_MAX_ROWS),
  })
  .strict()
  .refine(
    (input) =>
      input.fileName
        .toLowerCase()
        .endsWith(input.source === "CSV_IMPORT" ? ".csv" : ".xlsx"),
    "Cần tệp CSV hoặc XLSX.",
  );
export const stageSchema = z
  .object({
    offset: z
      .number()
      .int()
      .min(0)
      .max(IMPORT_MAX_ROWS - 1),
    items: z
      .array(
        z
          .object({
            rowNumber: z.number().int().min(2).max(1_048_576),
            values: z
              .object(
                Object.fromEntries(
                  Object.keys(customerFields.shape).map((key) => [
                    key,
                    z.string().max(1600).optional(),
                  ]),
                ),
              )
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(IMPORT_BATCH),
  })
  .strict();
export const startSchema = z
  .object({ version: versionSchema, policy: z.enum(["SKIP", "UPDATE"]) })
  .strict();

const jobSelect = `SELECT j.*,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id) AS staged,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.classification='VALID') AS valid,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.classification='INVALID') AS invalid,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.classification='DUPLICATE') AS duplicate_count,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.status='CREATED') AS created_count,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.status='UPDATED') AS updated_count,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.status='SKIPPED') AS skipped_count,
  (SELECT COUNT(*) FROM customer_import_items i WHERE i.job_id=j.id AND i.status='FAILED') AS failed_count`;
function jobDto(row: RowDataPacket): ImportJob {
  return {
    id: row.id,
    fileName: row.file_name,
    source: row.source,
    totalRows: row.total_rows,
    status: row.status,
    policy: row.policy,
    version: row.version,
    createdAt: iso(row.created_at),
    completedAt: optionalIso(row.completed_at),
    staged: Number(row.staged),
    valid: Number(row.valid),
    invalid: Number(row.invalid),
    duplicate: Number(row.duplicate_count),
    created: Number(row.created_count),
    updated: Number(row.updated_count),
    skipped: Number(row.skipped_count),
    failed: Number(row.failed_count),
  };
}
export async function getJob(db: Db, id: string, actor: string) {
  const [row] = await rows(
    db,
    `${jobSelect} FROM customer_import_jobs j WHERE j.id=? AND j.actor_id=?`,
    [id, actor],
  );
  if (!row) throw missing();
  return jobDto(row);
}
export const importPageSchema = z
  .object({ page: pageFields.page, pageSize: pageFields.pageSize })
  .strict();
export function listJobs(
  pool: Pool,
  actor: string,
  q: z.output<typeof importPageSchema>,
) {
  return businessPage(
    pool,
    q,
    {
      select: jobSelect,
      from: "FROM customer_import_jobs j",
      where: ["j.actor_id=?"],
      args: [actor],
      order: "j.created_at DESC,j.id DESC",
    },
    (_db, data) => data.map(jobDto),
  );
}
function candidate(row: RowDataPacket): CustomerInput | null {
  if (!row.candidate) return null;
  return typeof row.candidate === "string"
    ? JSON.parse(row.candidate)
    : row.candidate;
}
export function listImportItems(
  pool: Pool,
  id: string,
  actor: string,
  q: z.output<typeof importPageSchema>,
) {
  return businessPage<ImportItem>(
    pool,
    q,
    {
      select: "SELECT i.*,c.name AS matched_name",
      from: `FROM customer_import_items i JOIN customer_import_jobs j ON j.id=i.job_id
      LEFT JOIN customers c ON c.id=i.matched_id`,
      where: ["i.job_id=?", "j.actor_id=?"],
      args: [id, actor],
      order: "i.position ASC",
    },
    (_db, data) =>
      data.map((r) => {
        const input = candidate(r);
        return {
          rowNumber: r.source_row,
          name: input?.name ?? "",
          phone: r.phone_key ?? "",
          matchedName: r.matched_name,
          classification: r.classification,
          status: r.status,
          message: r.message,
        };
      }),
  );
}
export async function createJob(
  db: PoolConnection,
  input: z.output<typeof createJobSchema>,
  actor: string,
) {
  const [existing] = await rows(
    db,
    "SELECT actor_id,file_name,source,total_rows FROM customer_import_jobs WHERE id=?",
    [input.id],
  );
  if (existing) {
    if (
      existing.actor_id !== actor ||
      existing.file_name !== input.fileName ||
      existing.source !== input.source ||
      existing.total_rows !== input.totalRows
    )
      throw conflict("REQUEST_CONFLICT", "Mã yêu cầu đã được sử dụng.");
  } else {
    await db.execute(
      "INSERT INTO customer_import_jobs(id,actor_id,file_name,source,total_rows) VALUES(?,?,?,?,?)",
      [input.id, actor, input.fileName, input.source, input.totalRows],
    );
    await audit(db, actor, "CUSTOMER_IMPORT_STARTED", input.id, {
      rows: input.totalRows,
    });
  }
  return getJob(db, input.id, actor);
}
export async function stageJob(
  db: PoolConnection,
  id: string,
  input: z.output<typeof stageSchema>,
  actor: string,
) {
  const job = await getJob(db, id, actor);
  if (input.offset < job.staged) {
    const stored = await rows(
      db,
      `SELECT input_hash FROM customer_import_items WHERE job_id=? AND position>=? AND position<? ORDER BY position`,
      [id, input.offset, input.offset + input.items.length],
    );
    if (
      stored.length === input.items.length &&
      stored.every((row, i) => row.input_hash === fingerprint(input.items[i]))
    )
      return job;
    throw conflict("REQUEST_CONFLICT", "Nội dung lô xem trước đã thay đổi.");
  }
  if (
    job.status !== "STAGING" ||
    input.offset !== job.staged ||
    input.offset + input.items.length > job.totalRows
  )
    throw conflict("IMPORT_BATCH_ORDER", "Lô dữ liệu không khớp tiến độ nhập.");
  const [previous] = await rows(
    db,
    "SELECT source_row FROM customer_import_items WHERE job_id=? ORDER BY position DESC LIMIT 1",
    [id],
  );
  let last = previous?.source_row ?? 1;
  for (const [index, item] of input.items.entries()) {
    if (item.rowNumber <= last)
      throw conflict(
        "IMPORT_BATCH_ORDER",
        "Số dòng phải theo đúng thứ tự tệp.",
      );
    last = item.rowNumber;
    const parsed = customerFields.safeParse(item.values);
    const data = parsed.success ? parsed.data : null;
    const phone = data ? normalizePhone(data.phone) || null : null;
    const externalId = data?.externalId || null;
    let classification: ImportItem["classification"] = "VALID";
    let message = "";
    let match: Awaited<ReturnType<typeof customerMatches>>[number] | undefined;
    if (!data) {
      classification = "INVALID";
      if (!parsed.success)
        message = parsed.error.issues
          .map((issue) => issue.path.join(".") + " " + issue.message)
          .join("; ")
          .slice(0, 490);
    } else {
      const [previousIdentity] = await rows(
        db,
        `SELECT position FROM customer_import_items WHERE job_id=? AND
        (phone_key=? OR (external_source=? AND external_id=?)) LIMIT 1`,
        [id, phone, data.externalSource, externalId],
      );
      const matches = await customerMatches(db, data);
      if (previousIdentity || matches.length) {
        classification = "DUPLICATE";
        if (previousIdentity) message = "Trùng với dòng trước trong tệp.";
        else if (matches.length > 1)
          message = "Điện thoại và mã ngoài thuộc hai khách hàng khác nhau.";
        else {
          message = "Trùng với khách hàng hiện có.";
          [match] = matches;
        }
      }
    }
    await db.execute(
      `INSERT INTO customer_import_items(job_id,position,source_row,input_hash,candidate,phone_key,
      external_source,external_id,classification,message,matched_id,matched_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.offset + index,
        item.rowNumber,
        fingerprint(item),
        data ? JSON.stringify(data) : null,
        phone,
        data?.externalSource ?? null,
        externalId,
        classification,
        message,
        match?.id ?? null,
        match?.version ?? null,
      ],
    );
  }
  const status =
    input.offset + input.items.length === job.totalRows ? "REVIEW" : "STAGING";
  await db.execute(
    "UPDATE customer_import_jobs SET status=?,version=version+1 WHERE id=?",
    [status, id],
  );
  return getJob(db, id, actor);
}
export async function startJob(
  db: PoolConnection,
  id: string,
  input: z.output<typeof startSchema>,
  actor: string,
) {
  const job = await getJob(db, id, actor);
  if (
    ["PROCESSING", "COMPLETED"].includes(job.status) &&
    job.policy === input.policy
  )
    return job;
  fresh(job.version, input.version);
  if (job.status !== "REVIEW")
    throw conflict(
      "IMPORT_NOT_READY",
      "Cần kiểm tra tất cả các dòng trước khi xác nhận.",
    );
  await db.execute(
    "UPDATE customer_import_jobs SET status='PROCESSING',policy=?,version=version+1 WHERE id=?",
    [input.policy, id],
  );
  await audit(db, actor, "CUSTOMER_IMPORT_CONFIRMED", id, {
    policy: input.policy,
  });
  return getJob(db, id, actor);
}

export async function processJob(
  db: PoolConnection,
  id: string,
  actor: string,
) {
  const job = await getJob(db, id, actor);
  if (job.status === "COMPLETED") return job;
  if (job.status !== "PROCESSING")
    throw conflict("IMPORT_NOT_READY", "Cần xác nhận nhập khách hàng trước.");
  const batch = await rows(
    db,
    `SELECT * FROM customer_import_items WHERE job_id=? AND status='PENDING' ORDER BY position LIMIT ?`,
    [id, IMPORT_BATCH],
  );
  for (const item of batch) {
    let status: ImportItem["status"] = "SKIPPED";
    let customerId: string | null = null;
    let message: string = item.message;
    const data = candidate(item);
    if (
      data &&
      (item.classification === "VALID" ||
        (job.policy === "UPDATE" && item.matched_id))
    ) {
      await db.query("SAVEPOINT import_item");
      try {
        if (item.classification === "VALID") {
          const customer = await createCustomer(db, data, actor, {
            source: job.source,
            jobId: id,
          });
          customerId = customer.id;
          status = "CREATED";
        } else {
          // Empty mapped spreadsheet cells preserve the existing customer fields.
          const changes = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== ""),
          );
          const customer = await updateCustomer(
            db,
            item.matched_id,
            item.matched_version,
            changes,
            actor,
            id,
          );
          customerId = customer.id;
          status = "UPDATED";
        }
        message = "";
      } catch (error) {
        if (!(error instanceof ApiError && [404, 409].includes(error.status)))
          throw error;
        await db.query("ROLLBACK TO SAVEPOINT import_item");
        status = "FAILED";
        message = error.message;
      }
      await db.query("RELEASE SAVEPOINT import_item");
    }
    await db.execute(
      "UPDATE customer_import_items SET status=?,customer_id=?,message=? WHERE job_id=? AND position=?",
      [status, customerId, message, id, item.position],
    );
  }
  const [pending] = await rows(
    db,
    "SELECT 1 FROM customer_import_items WHERE job_id=? AND status='PENDING' LIMIT 1",
    [id],
  );
  await db.execute(
    `UPDATE customer_import_jobs SET status=?,completed_at=IF(?,CURRENT_TIMESTAMP(3),NULL),version=version+1 WHERE id=?`,
    [pending ? "PROCESSING" : "COMPLETED", !pending, id],
  );
  const result = await getJob(db, id, actor);
  if (!pending)
    await audit(db, actor, "CUSTOMER_IMPORT_COMPLETED", id, {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    });
  return result;
}
export async function cancelJob(
  db: PoolConnection,
  id: string,
  expected: number,
  actor: string,
) {
  const job = await getJob(db, id, actor);
  if (job.status === "CANCELLED") return job;
  fresh(job.version, expected);
  if (!["STAGING", "REVIEW"].includes(job.status))
    throw conflict("IMPORT_ALREADY_CONFIRMED", "Đợt nhập đã được xác nhận.");
  await db.execute(
    "UPDATE customer_import_jobs SET status='CANCELLED',version=version+1,completed_at=CURRENT_TIMESTAMP(3) WHERE id=?",
    [id],
  );
  await db.execute(
    "UPDATE customer_import_items SET status='SKIPPED' WHERE job_id=? AND status='PENDING'",
    [id],
  );
  await audit(db, actor, "CUSTOMER_IMPORT_CANCELLED", id);
  return getJob(db, id, actor);
}
