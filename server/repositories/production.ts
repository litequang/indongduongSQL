import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { User } from "../../shared/contracts";
import {
  PRODUCTION_STATUSES,
  PLATE_STATUSES,
  technicalFields,
  type ProductionInput,
  type ProductionOrder,
  type ProductionDetail,
  type DesignerItem,
} from "../../shared/production";
import { idSchema } from "../../shared/business";
import { rows, type Db } from "../database/pool";
import { allowed, fresh } from "../middleware/http";
import { audit, changed } from "../services/audit";
import {
  businessPage,
  pageFields,
  searchPattern,
  iso,
  optionalIso,
  conflict,
  missing,
  fingerprint,
} from "./business";

export const productionQuery = z
  .object({
    ...pageFields,
    status: z.enum(PRODUCTION_STATUSES).optional(),
    plateStatus: z.enum(PLATE_STATUSES).optional(),
    machine: z.string().max(100).optional(),
    printerId: idSchema.optional(),
    sort: z.enum(["createdAt", "code", "updatedAt"]).default("createdAt"),
  })
  .strict();
const select = `SELECT o.*,u.name AS creator_name,COALESCE(p.name,'') AS printer_name,
 EXISTS(SELECT 1 FROM production_cancellation_requests c WHERE c.order_id=o.id AND c.status='PENDING') AS cancellation_pending
 FROM production_orders o JOIN users u ON u.id=o.created_by LEFT JOIN users p ON p.id=o.printer_id`;
export function visibleProduction(row: RowDataPacket, actor: User) {
  if (row.status === "DRAFT") allowed(row.created_by === actor.id);
  else if (actor.role === "PRINTER") allowed(row.printer_id === actor.id);
}
export async function productionRow(db: Db, id: string, actor: User) {
  const [r] = await rows(db, select + " WHERE o.id=?", [id]);
  if (!r) throw missing();
  visibleProduction(r, actor);
  return r;
}
async function dto(db: Db, r: RowDataPacket): Promise<ProductionOrder> {
  const items = await rows(
    db,
    "SELECT * FROM production_items WHERE order_id=? ORDER BY position,id",
    [r.id],
  );
  const allocations = await rows(
    db,
    "SELECT a.* FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id WHERE i.order_id=? ORDER BY a.id",
    [r.id],
  );
  const images = await rows(
    db,
    "SELECT * FROM production_print_images WHERE order_id=? ORDER BY position,id",
    [r.id],
  );
  const tags = await rows(
    db,
    "SELECT tag FROM production_tags WHERE order_id=? ORDER BY tag",
    [r.id],
  );
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    createdBy: r.created_by,
    creatorName: r.creator_name,
    printerId: r.printer_id,
    printerName: r.printer_name,
    instructionRaw: r.instruction_raw,
    paperType: r.paper_type,
    paperGsm: r.paper_gsm,
    paperWidth: r.paper_width,
    paperHeight: r.paper_height,
    color: r.color,
    totalSheets: r.total_sheets,
    machine: r.machine,
    note: r.note,
    finishingNote: r.finishing_note,
    reference: r.reference,
    tags: tags.map((t) => t.tag),
    isUrgent: !!r.is_urgent,
    urgentReason: r.urgent_reason,
    runKind: r.run_kind,
    sourceOrderId: r.source_order_id,
    runReason: r.run_reason,
    plateType: r.plate_type,
    plateStatus: r.plate_status,
    plateNote: r.plate_note,
    status: r.status,
    version: r.version,
    revision: r.revision,
    acknowledgedRevision: r.acknowledged_revision,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    acceptedAt: optionalIso(r.accepted_at),
    startedAt: optionalIso(r.started_at),
    printedAt: optionalIso(r.printed_at),
    actualPrintedSheets: r.actual_printed_sheets,
    spoilageSheets: r.spoilage_sheets,
    printedNote: r.printed_note,
    cancellationPending: !!r.cancellation_pending,
    items: items.map((i) => ({
      id: i.id,
      productName: i.product_name,
      quantity: i.quantity,
      requiresFinishing: !!i.requires_finishing,
      note: i.note,
      designVersionId: i.design_version_id,
      allocations: allocations
        .filter((a) => a.production_item_id === i.id)
        .map((a) => ({
          id: a.id,
          salesItemId: a.sales_item_id,
          quantity: a.quantity,
          kind: a.kind,
          sourceAllocationId: a.source_allocation_id,
        })),
    })),
    printImages: images.map((i) => ({
      id: i.id,
      label: i.label,
      note: i.note,
      sheetCount: i.sheet_count,
    })),
  };
}
export function listProduction(
  pool: Pool,
  q: z.output<typeof productionQuery>,
  actor: User,
) {
  const where = ["(o.status<>'DRAFT' OR o.created_by=?)"];
  const args: (string | number)[] = [actor.id];
  if (actor.role === "PRINTER") {
    where.push("o.status<>'DRAFT' AND o.printer_id=?");
    args.push(actor.id);
  }
  for (const [column, value] of [
    ["status", q.status],
    ["plate_status", q.plateStatus],
    ["machine", q.machine],
    ["printer_id", q.printerId],
  ])
    if (value) {
      where.push(`o.${column}=?`);
      args.push(value);
    }
  if (q.search) {
    where.push(
      "(o.code LIKE ? ESCAPE '!' OR o.title LIKE ? ESCAPE '!' OR o.instruction_raw LIKE ? ESCAPE '!' OR o.reference LIKE ? ESCAPE '!')",
    );
    args.push(...Array<string>(4).fill(searchPattern(q.search)));
  }
  return businessPage(
    pool,
    q,
    {
      select: select.slice(0, select.indexOf(" FROM production_orders")),
      from: "FROM production_orders o JOIN users u ON u.id=o.created_by LEFT JOIN users p ON p.id=o.printer_id",
      where,
      args,
      order:
        {
          createdAt: "o.created_at",
          updatedAt: "o.updated_at",
          code: "o.code",
        }[q.sort] + ` ${q.direction},o.id ${q.direction}`,
    },
    async (db, list) => {
      const output: ProductionOrder[] = [];
      for (const r of list) output.push(await dto(db, r));
      return output;
    },
  );
}
export async function productionDetail(
  db: Db,
  id: string,
  actor: User,
): Promise<ProductionDetail> {
  const order = await dto(db, await productionRow(db, id, actor));
  const allocations = await rows(
    db,
    `SELECT a.*,s.order_id,s.product_name,o.code,o.customer_name FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id JOIN sales_order_items s ON s.id=a.sales_item_id JOIN sales_orders o ON o.id=s.order_id WHERE i.order_id=? ORDER BY a.id`,
    [id],
  );
  const history = await rows(
    db,
    "SELECT * FROM production_status_history WHERE order_id=? ORDER BY version DESC LIMIT 100",
    [id],
  );
  const revisions = await rows(
    db,
    "SELECT * FROM production_revisions WHERE order_id=? ORDER BY revision DESC LIMIT 50",
    [id],
  );
  const issues = await rows(
    db,
    "SELECT * FROM production_issues WHERE order_id=? ORDER BY created_at DESC,id LIMIT 100",
    [id],
  );
  const issueUsers = await rows(
    db,
    "SELECT r.* FROM production_issue_users r JOIN production_issues i ON i.id=r.issue_id WHERE i.order_id=?",
    [id],
  );
  const issueRoles = await rows(
    db,
    "SELECT r.* FROM production_issue_roles r JOIN production_issues i ON i.id=r.issue_id WHERE i.order_id=?",
    [id],
  );
  const cancellations = await rows(
    db,
    "SELECT * FROM production_cancellation_requests WHERE order_id=? ORDER BY created_at DESC,id LIMIT 50",
    [id],
  );
  const comments = await rows(
    db,
    "SELECT * FROM production_comments WHERE order_id=? ORDER BY created_at DESC,id LIMIT 100",
    [id],
  );
  const plates = await rows(
    db,
    "SELECT * FROM production_plates WHERE order_id=? ORDER BY version DESC LIMIT 100",
    [id],
  );
  const handoffs = await rows(
    db,
    `SELECT h.*,t.status AS task_status, a.id IS NOT NULL AS inspected FROM production_finishing_handoffs h
      LEFT JOIN finishing_tasks t ON t.id=h.id LEFT JOIN finished_goods_acceptances a ON a.id=h.id
      WHERE h.order_id=? ORDER BY h.id`,
    [id],
  );
  return {
    order,
    allocations: allocations.map((a) => ({
      id: a.id,
      salesItemId: a.sales_item_id,
      quantity: a.quantity,
      kind: a.kind,
      sourceAllocationId: a.source_allocation_id,
      state: a.state,
      salesOrderId: a.order_id,
      salesCode: a.code,
      customerName: a.customer_name,
      productName: a.product_name,
    })),
    history: history.map((h) => ({
      id: String(h.id),
      action: h.action,
      actorName: h.actor_name,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      note: h.note,
      createdAt: iso(h.created_at),
    })),
    revisions: revisions.map((r) => ({
      revision: r.revision,
      instructionRaw: r.instruction_raw,
      technical:
        typeof r.technical_snapshot === "string"
          ? JSON.parse(r.technical_snapshot)
          : r.technical_snapshot,
      actorName: r.actor_name,
      createdAt: iso(r.created_at),
    })),
    issues: issues.map((i) => ({
      id: i.id,
      type: i.issue_type,
      message: i.message,
      status: i.status,
      reportedBy: i.reported_by,
      reporterName: i.reporter_name,
      recipientUserIds: issueUsers
        .filter((r) => r.issue_id === i.id)
        .map((r) => r.user_id),
      recipientRoles: issueRoles
        .filter((r) => r.issue_id === i.id)
        .map((r) => r.role_code),
      urgent: !!i.urgent,
      isBlocking: false,
      createdAt: iso(i.created_at),
    })),
    cancellations: cancellations.map((c) => ({
      id: c.id,
      status: c.status,
      reason: c.reason,
      responseReason: c.response_reason,
      requesterName: c.requester_name,
      responderName: c.responder_name,
      createdAt: iso(c.created_at),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      actorName: c.actor_name,
      createdAt: iso(c.created_at),
    })),
    plates: plates.map((p) => ({
      id: p.id,
      status: p.plate_status,
      type: p.plate_type,
      note: p.note,
      actorName: p.actor_name,
      createdAt: iso(p.created_at),
    })),
    handoffs: handoffs.map((h) => ({
      id: h.id,
      allocationId: h.allocation_id,
      productionItemId: h.production_item_id,
      quantity: h.quantity,
      requiresFinishing: !!h.requires_finishing,
      status: h.status,
      replacement: !!h.replacement,
      superseded: !!h.superseded_at,
      taskStatus: h.task_status,
      inspected: !!h.inspected,
    })),
  };
}
export async function productionEvent(
  db: PoolConnection,
  id: string,
  version: number,
  actor: User,
  action: string,
  from: string | null,
  to: string,
  note = "",
) {
  await db.execute(
    "INSERT INTO production_status_history(order_id,version,action,from_status,to_status,actor_id,actor_name,note) VALUES(?,?,?,?,?,?,?,?)",
    [id, version, action, from, to, actor.id, actor.name, note],
  );
  await audit(db, actor.id, action, id, { from, to, note });
  await changed(db, "production_orders", id, version);
}
export async function plateEvent(
  db: PoolConnection,
  id: string,
  version: number,
  actor: User,
  type: string,
  status: string,
  note: string,
) {
  await db.execute(
    "INSERT INTO production_plates(id,order_id,version,plate_type,plate_status,note,actor_id,actor_name) VALUES(?,?,?,?,?,?,?,?)",
    [randomUUID(), id, version, type, status, note, actor.id, actor.name],
  );
}
export async function revisionEvent(
  db: PoolConnection,
  id: string,
  revision: number,
  actor: User,
  input: z.output<typeof technicalFields>,
  reason: string,
) {
  await db.execute(
    "INSERT INTO production_revisions(order_id,revision,instruction_raw,technical_snapshot,actor_id,actor_name,reason) VALUES(?,?,?,?,?,?,?)",
    [
      id,
      revision,
      input.instructionRaw,
      JSON.stringify(input),
      actor.id,
      actor.name,
      reason,
    ],
  );
}
export async function validatePrinter(db: Db, id: string | null) {
  if (!id) throw conflict("PRINTER_REQUIRED", "Chọn thợ in đang hoạt động.");
  const [p] = await rows(
    db,
    "SELECT id FROM users WHERE id=? AND role_code='PRINTER' AND active=1 AND deleted_at IS NULL",
    [id],
  );
  if (!p) throw conflict("PRINTER_INVALID", "Thợ in không còn hoạt động.");
}
export function validateProductionInput(input: ProductionInput) {
  for (const list of [
    input.items,
    input.printImages,
    input.items.flatMap((i) => i.allocations),
  ])
    if (new Set(list.map((i) => i.id)).size !== list.length)
      throw conflict("DUPLICATE_ITEM", "Mã dòng không được trùng.");
  if (
    input.runKind === "NORMAL"
      ? input.sourceOrderId !== null
      : !input.sourceOrderId || !input.runReason
  )
    throw conflict(
      "SOURCE_REQUIRED",
      "In lại/bổ sung phải có lệnh gốc và lý do.",
    );
  if (
    input.printImages.length &&
    input.printImages.reduce((n, i) => n + i.sheetCount, 0) !==
      input.totalSheets
  )
    throw conflict(
      "SHEET_MISMATCH",
      "Tổng số tờ bình bài phải bằng tổng tờ in.",
    );
  for (const item of input.items) {
    const numeric = item.allocations.filter((a) => a.kind !== "TRACE");
    if (
      numeric.length &&
      numeric.reduce((n, a) => n + a.quantity, 0) !== item.quantity
    )
      throw conflict(
        "ALLOCATION_MISMATCH",
        "Số lượng sản phẩm phải bằng tổng phân bổ sản phẩm.",
      );
    if (
      new Set(item.allocations.map((a) => a.salesItemId + ":" + a.kind))
        .size !== item.allocations.length
    )
      throw conflict("DUPLICATE_ALLOCATION", "Liên kết sản phẩm bị trùng.");
    for (const a of item.allocations) {
      if (
        a.kind === "REPRINT"
          ? input.runKind !== "REPRINT" || !a.sourceAllocationId
          : a.sourceAllocationId !== null ||
            (input.runKind === "REPRINT" && a.kind === "OUTPUT")
      )
        throw conflict(
          "INVALID_ALLOCATION",
          "Phân bổ in lại cần liên kết phân bổ gốc; không được cộng vào sản lượng đơn hàng.",
        );
    }
  }
}
export async function saveProduction(
  db: PoolConnection,
  id: string,
  input: ProductionInput,
  actor: User,
  expected?: number,
) {
  validateProductionInput(input);
  const [current] = await rows(
    db,
    "SELECT * FROM production_orders WHERE id=?",
    [id],
  );
  const hash = fingerprint(input);
  if (current) {
    allowed(current.created_by === actor.id);
    if (expected === undefined) {
      if (current.request_hash !== hash)
        throw conflict(
          "REQUEST_CONFLICT",
          "Mã nháp đã dùng cho nội dung khác.",
        );
      return productionDetail(db, id, actor);
    }
    fresh(current.version, expected);
    if (current.status !== "DRAFT")
      throw conflict(
        "INVALID_STATUS",
        "Chỉ sửa lệnh nháp; lệnh chính thức cần tạo revision.",
      );
  } else if (expected !== undefined) throw missing();
  if (input.printerId) await validatePrinter(db, input.printerId);
  if (input.sourceOrderId) {
    const source = await productionRow(db, input.sourceOrderId, actor);
    if (
      source.id === id ||
      source.status === "DRAFT" ||
      source.status === "CANCELLED"
    )
      throw conflict(
        "INVALID_SOURCE",
        "Lệnh gốc phải là lệnh chính thức hợp lệ.",
      );
  }
  const fields = [
    input.printerId,
    input.title,
    input.instructionRaw,
    input.paperType,
    input.paperGsm,
    input.paperWidth,
    input.paperHeight,
    input.color,
    input.totalSheets,
    input.machine,
    input.note,
    input.finishingNote,
    input.reference,
    input.isUrgent,
    input.urgentReason,
    input.runKind,
    input.sourceOrderId,
    input.runReason,
    input.plateType,
    input.plateType === "NONE"
      ? "NOT_REQUIRED"
      : input.plateType === "OLD"
        ? "OLD_PLATE"
        : "NOT_SENT",
    input.plateNote,
  ];
  const columns =
    "printer_id,title,instruction_raw,paper_type,paper_gsm,paper_width,paper_height,color,total_sheets,machine,note,finishing_note,reference,is_urgent,urgent_reason,run_kind,source_order_id,run_reason,plate_type,plate_status,plate_note".split(
      ",",
    );
  if (current)
    await db.execute(
      `UPDATE production_orders SET ${columns.map((c) => c + "=?").join(",")},version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?`,
      [...fields, id],
    );
  else
    await db.execute(
      `INSERT INTO production_orders(${columns.join(",")},id,created_by,request_hash) VALUES(${[...fields, id, actor.id, hash].map(() => "?").join(",")})`,
      [...fields, id, actor.id, hash],
    );
  // Proposed draft links are replaceable. Official ACTIVE/RELEASED links are never deleted.
  await db.execute(
    "DELETE a FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id WHERE i.order_id=? AND a.state='PROPOSED'",
    [id],
  );
  await db.execute("DELETE FROM production_items WHERE order_id=?", [id]);
  await db.execute("DELETE FROM production_print_images WHERE order_id=?", [
    id,
  ]);
  await db.execute("DELETE FROM production_tags WHERE order_id=?", [id]);
  for (const [position, item] of input.items.entries()) {
    if (item.designVersionId) {
      const [d] = await rows(db, "SELECT id FROM design_versions WHERE id=?", [
        item.designVersionId,
      ]);
      if (!d) throw conflict("DESIGN_MISSING", "Phiên bản mẫu không tồn tại.");
    }
    await db.execute(
      "INSERT INTO production_items(id,order_id,position,product_name,quantity,requires_finishing,note,design_version_id) VALUES(?,?,?,?,?,?,?,?)",
      [
        item.id,
        id,
        position,
        item.productName,
        item.quantity,
        item.requiresFinishing,
        item.note,
        item.designVersionId,
      ],
    );
    for (const a of item.allocations) {
      const [s] = await rows(
        db,
        "SELECT i.*,o.status AS order_status FROM sales_order_items i JOIN sales_orders o ON o.id=i.order_id WHERE i.id=?",
        [a.salesItemId],
      );
      if (
        !s ||
        s.deleted_at ||
        !s.requires_production ||
        ["DRAFT", "CANCELLED", "COMPLETED", "DELIVERED"].includes(
          s.order_status,
        ) ||
        s.status === "CANCELLED"
      )
        throw conflict(
          "SALES_ITEM_INVALID",
          "Sản phẩm nguồn chưa xác nhận hoặc không thuộc luồng in.",
        );
      if (item.designVersionId !== s.design_version_id && s.design_version_id)
        throw conflict(
          "DESIGN_MISMATCH",
          "Giữ đúng phiên bản mẫu đã chốt của sản phẩm nguồn.",
        );
      if (a.sourceAllocationId) {
        const [source] = await rows(
          db,
          `SELECT a.sales_item_id,a.kind,a.state,i.order_id,o.status FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id JOIN production_orders o ON o.id=i.order_id WHERE a.id=?`,
          [a.sourceAllocationId],
        );
        if (
          !source ||
          source.sales_item_id !== a.salesItemId ||
          source.order_id !== input.sourceOrderId ||
          source.kind !== "OUTPUT" ||
          source.state !== "ACTIVE" ||
          source.status !== "PRINTED"
        )
          throw conflict(
            "REPRINT_SOURCE_INVALID",
            "In lại cần phân bổ sản phẩm gốc đã in xong.",
          );
      }
      await db.execute(
        "INSERT INTO production_allocations(id,production_item_id,sales_item_id,quantity,kind,source_allocation_id,created_by) VALUES(?,?,?,?,?,?,?)",
        [
          a.id,
          item.id,
          a.salesItemId,
          a.quantity,
          a.kind,
          a.sourceAllocationId,
          actor.id,
        ],
      );
    }
  }
  for (const [position, i] of input.printImages.entries())
    await db.execute(
      "INSERT INTO production_print_images(id,order_id,position,label,note,sheet_count) VALUES(?,?,?,?,?,?)",
      [i.id, id, position, i.label, i.note, i.sheetCount],
    );
  for (const tag of new Set(input.tags))
    await db.execute("INSERT INTO production_tags(order_id,tag) VALUES(?,?)", [
      id,
      tag,
    ]);
  await productionEvent(
    db,
    id,
    (current?.version ?? 0) + 1,
    actor,
    current ? "PRODUCTION_DRAFT_UPDATED" : "PRODUCTION_DRAFT_CREATED",
    current ? "DRAFT" : null,
    "DRAFT",
  );
  return productionDetail(db, id, actor);
}

export const designerQuery = z
  .object({
    ...pageFields,
    status: z
      .enum([
        "WAITING_DESIGN",
        "NEEDS_INFO",
        "DESIGNING",
        "READY_FOR_PRODUCTION",
      ])
      .optional(),
    priority: z.enum(["NORMAL", "URGENT"]).optional(),
  })
  .strict();
export function listDesignerQueue(
  pool: Pool,
  q: z.output<typeof designerQuery>,
) {
  const where = [
    "i.deleted_at IS NULL",
    "i.requires_production=1",
    "i.status IN ('WAITING_DESIGN','DESIGNING','READY_FOR_PRODUCTION','IN_PRODUCTION')",
    "o.status NOT IN ('DRAFT','CANCELLED','COMPLETED','DELIVERED')",
  ];
  const args: string[] = [];
  if (q.status) {
    where.push("i.design_queue_status=?");
    args.push(q.status);
  }
  if (q.priority) {
    where.push(
      "(i.is_urgent=1 OR o.priority='URGENT')=" +
        (q.priority === "URGENT" ? "1" : "0"),
    );
  }
  if (q.search) {
    where.push(
      "(i.product_name LIKE ? ESCAPE '!' OR o.code LIKE ? ESCAPE '!' OR o.customer_name LIKE ? ESCAPE '!')",
    );
    args.push(...Array<string>(3).fill(searchPattern(q.search)));
  }
  return businessPage(
    pool,
    q,
    {
      select: `SELECT i.*,o.code,o.customer_name,o.priority,v.product_name AS design_name,v.version AS design_version`,
      from: "FROM sales_order_items i JOIN sales_orders o ON o.id=i.order_id LEFT JOIN design_versions v ON v.id=i.design_version_id",
      where,
      args,
      order: "i.is_urgent DESC,o.priority DESC,o.created_at ASC,i.id ASC",
    },
    async (db, list) => {
      const output: DesignerItem[] = [];
      for (const i of list) {
        const [sum] = await rows(
          db,
          "SELECT COALESCE(SUM(quantity),0) n FROM production_allocations WHERE sales_item_id=? AND state='ACTIVE' AND kind='OUTPUT'",
          [i.id],
        );
        const allocated = Number(sum.n);
        output.push({
          id: i.id,
          orderId: i.order_id,
          salesCode: i.code,
          customerName: i.customer_name,
          productName: i.product_name,
          quantity: i.quantity,
          allocatedQuantity: allocated,
          remainingQuantity: Math.max(0, i.quantity - allocated),
          status: i.status,
          queueStatus: i.design_queue_status,
          version: i.design_queue_version,
          instructionRaw: i.design_instruction,
          note: i.design_note,
          isUrgent: !!i.is_urgent || i.priority === "URGENT",
          designVersionId: i.design_version_id,
          designName: i.design_name ?? "",
          designVersion: i.design_version ?? null,
          paperType: i.paper_preference,
          paperGsm: i.gsm_preference,
          color: i.color_preference,
        });
      }
      return output;
    },
  );
}
export async function updateDesignerItem(
  db: PoolConnection,
  id: string,
  input: {
    version: number;
    status: string;
    instructionRaw: string;
    note: string;
    isUrgent: boolean;
  },
  actor: User,
) {
  const [i] = await rows(
    db,
    "SELECT i.*,o.status AS order_status FROM sales_order_items i JOIN sales_orders o ON o.id=i.order_id WHERE i.id=? AND i.deleted_at IS NULL",
    [id],
  );
  if (!i) throw missing();
  fresh(i.design_queue_version, input.version);
  if (
    !i.requires_production ||
    !["WAITING_DESIGN", "DESIGNING", "READY_FOR_PRODUCTION"].includes(
      i.status,
    ) ||
    ["DRAFT", "CANCELLED"].includes(i.order_status)
  )
    throw conflict("INVALID_STATUS", "Sản phẩm đã phát lệnh hoặc chưa chốt.");
  if (input.status === "READY_FOR_PRODUCTION" && !input.instructionRaw)
    throw conflict(
      "TECHNICAL_REQUIRED",
      "Cần hướng dẫn kỹ thuật trước khi sẵn sàng sản xuất.",
    );
  await db.execute(
    "UPDATE sales_order_items SET design_queue_status=?,design_queue_version=design_queue_version+1,design_instruction=?,design_note=?,is_urgent=?,status=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
    [
      input.status,
      input.instructionRaw,
      input.note,
      input.isUrgent,
      input.status === "NEEDS_INFO" ? "WAITING_DESIGN" : input.status,
      id,
    ],
  );
  await audit(db, actor.id, "DESIGN_QUEUE_UPDATED", id, {
    status: input.status,
  });
  await db.execute(
    "UPDATE sales_orders SET version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
    [i.order_id],
  );
  const [o] = await rows(db, "SELECT version FROM sales_orders WHERE id=?", [
    i.order_id,
  ]);
  await changed(db, "sales_orders", i.order_id, o.version);
}
