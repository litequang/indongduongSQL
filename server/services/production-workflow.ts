import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Role, User } from "../../shared/contracts";
import {
  canComposeProduction,
  canReviseProduction,
  isManagement,
  ISSUE_POLICIES,
  technicalFields,
  productionFields,
  type ProductionActionInput,
} from "../../shared/production";
import { rows } from "../database/pool";
import { allowed, fresh } from "../middleware/http";
import { changed, audit } from "./audit";
import { reconcileOrder } from "./sales-progress";
import {
  businessCode,
  conflict,
  fingerprint,
  missing,
} from "../repositories/business";
import {
  productionRow,
  productionDetail,
  productionEvent,
  plateEvent,
  revisionEvent,
  validatePrinter,
  validateProductionInput,
} from "../repositories/production";

const preprint = ["WAITING_ACCEPTANCE", "ACCEPTED", "WAITING_PRINT"];
function statusAllowed(row: RowDataPacket, statuses: string[]) {
  if (!statuses.includes(row.status))
    throw conflict(
      "INVALID_STATUS",
      "Thao tác không hợp lệ ở trạng thái hiện tại.",
    );
}
function assigned(row: RowDataPacket, actor: User) {
  allowed(actor.role === "PRINTER" && row.printer_id === actor.id);
}
function recipientAuthority(actor: User, roles: Role[], users: string[]) {
  const rank: Partial<Record<Role, number>> = {
    MANAGER: 1,
    ADMIN: 2,
    DEVELOPER: 3,
  };
  return (
    users.includes(actor.id) ||
    roles.includes(actor.role) ||
    roles.some(
      (r) => rank[r] !== undefined && (rank[actor.role] ?? 0) >= rank[r]!,
    )
  );
}
async function recipients(
  db: PoolConnection,
  issueId: string,
  users: string[],
  roles: Role[],
) {
  if (!users.length && !roles.length)
    throw conflict("RECIPIENT_REQUIRED", "Chọn người hoặc vai trò xử lý.");
  for (const id of new Set(users)) {
    const [u] = await rows(
      db,
      "SELECT id FROM users WHERE id=? AND active=1 AND deleted_at IS NULL",
      [id],
    );
    if (!u)
      throw conflict("RECIPIENT_INVALID", "Người nhận không còn hoạt động.");
  }
  await db.execute("DELETE FROM production_issue_users WHERE issue_id=?", [
    issueId,
  ]);
  await db.execute("DELETE FROM production_issue_roles WHERE issue_id=?", [
    issueId,
  ]);
  for (const id of new Set(users))
    await db.execute(
      "INSERT INTO production_issue_users(issue_id,user_id) VALUES(?,?)",
      [issueId, id],
    );
  for (const role of new Set(roles))
    await db.execute(
      "INSERT INTO production_issue_roles(issue_id,role_code) VALUES(?,?)",
      [issueId, role],
    );
}
async function issueRecipients(db: PoolConnection, id: string) {
  const users = await rows(
    db,
    "SELECT user_id FROM production_issue_users WHERE issue_id=?",
    [id],
  );
  const roles = await rows(
    db,
    "SELECT role_code FROM production_issue_roles WHERE issue_id=?",
    [id],
  );
  return {
    users: users.map((u) => u.user_id as string),
    roles: roles.map((r) => r.role_code as Role),
  };
}
async function reconcileSales(db: PoolConnection, id: string, actor: User) {
  const orders = await rows(
    db,
    `SELECT DISTINCT s.order_id FROM production_allocations a
    JOIN production_items i ON i.id=a.production_item_id JOIN sales_order_items s ON s.id=a.sales_item_id
    WHERE i.order_id=? ORDER BY s.order_id`,
    [id],
  );
  for (const order of orders)
    await reconcileOrder(
      db,
      order.order_id,
      actor,
      "Cập nhật từ lệnh sản xuất",
    );
}
async function reserve(db: PoolConnection, id: string) {
  const allocations = await rows(
    db,
    `SELECT a.*,s.quantity AS ordered_quantity,s.status AS sales_status,s.requires_production,s.deleted_at,o.status AS sales_order_status,s.order_id
    FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id JOIN sales_order_items s ON s.id=a.sales_item_id JOIN sales_orders o ON o.id=s.order_id WHERE i.order_id=? AND a.state='PROPOSED' ORDER BY s.order_id,s.id,a.id`,
    [id],
  );
  const demand = new Map<string, number>();
  for (const a of allocations) {
    await rows(db, "SELECT id FROM sales_orders WHERE id=? FOR UPDATE", [
      a.order_id,
    ]);
    await rows(db, "SELECT id FROM sales_order_items WHERE id=? FOR UPDATE", [
      a.sales_item_id,
    ]);
    if (
      a.deleted_at ||
      !a.requires_production ||
      a.sales_status === "CANCELLED" ||
      ["DRAFT", "CANCELLED", "COMPLETED", "DELIVERED", "SHIPPING"].includes(
        a.sales_order_status,
      )
    )
      throw conflict(
        "SALES_ITEM_INVALID",
        "Sản phẩm nguồn không còn được phép phát lệnh.",
      );
    const [dispatched] = await rows(
      db,
      "SELECT id FROM warehouse_dispatches WHERE order_id=? AND active_slot=1",
      [a.order_id],
    );
    if (dispatched) throw conflict("DISPATCHED_ORDER", "Đơn đã xuất kho.");
    if (a.kind === "OUTPUT")
      demand.set(
        a.sales_item_id,
        (demand.get(a.sales_item_id) ?? 0) + a.quantity,
      );
    if (a.kind === "REPRINT") {
      const [source] = await rows(
        db,
        `SELECT a.*,i.order_id,o.status FROM production_allocations a JOIN production_items i ON i.id=a.production_item_id JOIN production_orders o ON o.id=i.order_id WHERE a.id=?`,
        [a.source_allocation_id],
      );
      const [order] = await rows(
        db,
        "SELECT source_order_id FROM production_orders WHERE id=?",
        [id],
      );
      if (
        !source ||
        source.order_id !== order.source_order_id ||
        source.sales_item_id !== a.sales_item_id ||
        source.kind !== "OUTPUT" ||
        source.state !== "ACTIVE" ||
        source.status !== "PRINTED"
      )
        throw conflict(
          "REPRINT_SOURCE_INVALID",
          "In lại cần phân bổ sản phẩm gốc đã in xong.",
        );
      const [used] = await rows(
        db,
        "SELECT COALESCE(SUM(quantity),0) n FROM production_allocations WHERE source_allocation_id=? AND state='ACTIVE'",
        [source.id],
      );
      const proposed = allocations
        .filter((v) => v.source_allocation_id === source.id)
        .reduce((n, v) => n + v.quantity, 0);
      if (Number(used.n) + proposed > source.quantity)
        throw conflict("REPRINT_EXCEEDED", "Số lượng in lại vượt phân bổ gốc.");
    }
  }
  for (const [itemId, requested] of demand) {
    const [existing] = await rows(
      db,
      "SELECT COALESCE(SUM(quantity),0) n FROM production_allocations WHERE sales_item_id=? AND state='ACTIVE' AND kind='OUTPUT'",
      [itemId],
    );
    const quantity = allocations.find(
      (a) => a.sales_item_id === itemId,
    )!.ordered_quantity;
    if (Number(existing.n) + requested > quantity)
      throw conflict(
        "ALLOCATION_EXCEEDED",
        "Số lượng phân bổ vượt số lượng sản phẩm còn lại.",
      );
  }
  await db.execute(
    "UPDATE production_allocations a JOIN production_items i ON i.id=a.production_item_id SET a.state='ACTIVE' WHERE i.order_id=? AND a.state='PROPOSED'",
    [id],
  );
}
async function completeHandoffs(
  db: PoolConnection,
  id: string,
  replacement: boolean,
) {
  const [printedOrder] = await rows(
    db,
    "SELECT printer_id,printed_at FROM production_orders WHERE id=?",
    [id],
  );
  const items = await rows(
    db,
    "SELECT * FROM production_items WHERE order_id=? ORDER BY id",
    [id],
  );
  const designs = new Set<string>();
  for (const item of items) {
    const allocations = await rows(
      db,
      "SELECT a.*,s.requires_finishing,s.design_version_id FROM production_allocations a JOIN sales_order_items s ON s.id=a.sales_item_id WHERE a.production_item_id=? AND a.state='ACTIVE' AND a.kind<>'TRACE'",
      [item.id],
    );
    if (allocations.length)
      for (const a of allocations) {
        const [existing] = await rows(
          db,
          "SELECT id FROM production_finishing_handoffs WHERE allocation_id=?",
          [a.id],
        );
        if (existing) {
          if (a.design_version_id) designs.add(a.design_version_id);
          continue;
        }
        const [received] = await rows(
          db,
          `SELECT 1 FROM production_finishing_handoffs h
          JOIN finishing_tasks t ON t.id=h.id WHERE h.production_item_id=? AND h.allocation_id IS NULL AND h.superseded_at IS NULL`,
          [item.id],
        );
        if (received)
          throw conflict(
            "HANDOFF_ALREADY_RECEIVED",
            "Sản lượng độc lập đã được tiếp nhận. Không thể thay nguồn bàn giao.",
          );
        await db.execute(
          "UPDATE production_finishing_handoffs SET superseded_at=COALESCE(superseded_at,CURRENT_TIMESTAMP(3)) WHERE production_item_id=? AND allocation_id IS NULL",
          [item.id],
        );
        await db.execute(
          "INSERT INTO production_finishing_handoffs(id,order_id,production_item_id,allocation_id,quantity,requires_finishing,replacement) VALUES(?,?,?,?,?,?,?)",
          [
            randomUUID(),
            id,
            item.id,
            a.id,
            a.quantity,
            !!a.requires_finishing,
            a.kind === "REPRINT",
          ],
        );
        if (a.design_version_id) designs.add(a.design_version_id);
      }
    else if (!item.quantity) {
      /* Trace-only links have no numeric handoff. */
    } else if (
      !(
        await rows(
          db,
          "SELECT id FROM production_allocations WHERE production_item_id=?",
          [item.id],
        )
      ).length &&
      !(
        await rows(
          db,
          "SELECT id FROM production_finishing_handoffs WHERE production_item_id=? AND allocation_id IS NULL",
          [item.id],
        )
      ).length
    )
      await db.execute(
        "INSERT INTO production_finishing_handoffs(id,order_id,production_item_id,allocation_id,quantity,requires_finishing,replacement) VALUES(?,?,?,NULL,?,?,?)",
        [
          randomUUID(),
          id,
          item.id,
          item.quantity,
          !!item.requires_finishing,
          replacement,
        ],
      );
    if (item.design_version_id) designs.add(item.design_version_id);
  }
  const updatedDesigns = new Set<string>();
  for (const versionId of designs) {
    const [v] = await rows(
      db,
      "SELECT design_id FROM design_versions WHERE id=?",
      [versionId],
    );
    if (updatedDesigns.has(v.design_id)) continue;
    updatedDesigns.add(v.design_id);
    const [printedBefore] = await rows(
      db,
      "SELECT order_id FROM production_design_prints WHERE order_id=? AND design_id=?",
      [id, v.design_id],
    );
    if (printedBefore) continue;
    await db.execute(
      "INSERT INTO production_design_prints(order_id,design_id) VALUES(?,?)",
      [id, v.design_id],
    );
    await db.execute(
      "UPDATE saved_designs SET print_count=print_count+1,last_printer_id=IF(last_printed_at IS NULL OR last_printed_at<=?, ?,last_printer_id),last_printed_at=GREATEST(COALESCE(last_printed_at,?),?) WHERE id=?",
      [
        printedOrder.printed_at,
        printedOrder.printer_id,
        printedOrder.printed_at,
        printedOrder.printed_at,
        v.design_id,
      ],
    );
    const [d] = await rows(db, "SELECT version FROM saved_designs WHERE id=?", [
      v.design_id,
    ]);
    await changed(db, "saved_designs", v.design_id, d.version);
  }
}
export async function actProduction(
  db: PoolConnection,
  id: string,
  input: ProductionActionInput,
  actor: User,
) {
  const r = await productionRow(db, id, actor);
  const hash = fingerprint(input);
  const [receipt] = await rows(
    db,
    "SELECT * FROM production_action_receipts WHERE request_id=?",
    [input.requestId],
  );
  if (receipt) {
    if (
      receipt.order_id !== id ||
      receipt.actor_id !== actor.id ||
      receipt.request_hash !== hash
    )
      throw conflict(
        "REQUEST_CONFLICT",
        "Mã thao tác đã dùng cho yêu cầu khác.",
      );
    return productionDetail(db, id, actor);
  }
  fresh(r.version, input.version);
  let target = r.status;
  let note = "";
  let plateChanged = false;
  let salesChanged = false;
  let plateType = r.plate_type;
  let plateStatus = r.plate_status;
  switch (input.action) {
    case "link-products": {
      allowed(canComposeProduction(actor.role));
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED"]);
      const detail = await productionDetail(db, id, actor);
      if (
        new Set(input.items.map((i) => i.productionItemId)).size !==
        input.items.length
      )
        throw conflict("DUPLICATE_ITEM", "Dòng sản phẩm bị trùng.");
      const candidate = productionFields.parse(
        Object.fromEntries(
          Object.keys(productionFields.shape).map((key) => [
            key,
            detail.order[key as keyof typeof detail.order],
          ]),
        ),
      );
      for (const link of input.items) {
        const item = candidate.items.find(
          (i) => i.id === link.productionItemId,
        );
        if (!item)
          throw conflict("ITEM_NOT_FOUND", "Sản phẩm không thuộc lệnh này.");
        for (const allocation of link.allocations) {
          const [sales] = await rows(
            db,
            "SELECT * FROM sales_order_items WHERE id=? AND deleted_at IS NULL",
            [allocation.salesItemId],
          );
          if (!sales) throw missing();
          if (
            item.designVersionId &&
            sales.design_version_id &&
            item.designVersionId !== sales.design_version_id
          )
            throw conflict(
              "DESIGN_MISMATCH",
              "Phiên bản mẫu không khớp sản phẩm nguồn.",
            );
          item.designVersionId ??= sales.design_version_id;
          item.allocations.push(allocation);
        }
      }
      validateProductionInput(candidate);
      for (const link of input.items) {
        const item = candidate.items.find(
          (i) => i.id === link.productionItemId,
        )!;
        await db.execute(
          "UPDATE production_items SET design_version_id=? WHERE id=? AND order_id=?",
          [item.designVersionId, item.id, id],
        );
        for (const a of link.allocations)
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
      await reserve(db, id);
      if (r.status === "PRINTED")
        await completeHandoffs(db, id, r.run_kind === "REPRINT");
      salesChanged = true;
      note = "Liên kết sản phẩm vào lệnh chính thức";
      break;
    }
    case "dispatch": {
      allowed(canComposeProduction(actor.role) && r.created_by === actor.id);
      statusAllowed(r, ["DRAFT"]);
      await validatePrinter(db, r.printer_id);
      if (!r.instruction_raw || r.total_sheets <= 0)
        throw conflict(
          "TECHNICAL_REQUIRED",
          "Cần hướng dẫn gốc và số tờ in lớn hơn 0.",
        );
      await reserve(db, id);
      const code = await businessCode(db, "production_orders");
      await db.execute(
        "UPDATE production_orders SET code=?,status='WAITING_ACCEPTANCE' WHERE id=?",
        [code, id],
      );
      target = "WAITING_ACCEPTANCE";
      await revisionEvent(
        db,
        id,
        1,
        actor,
        technicalFields.parse({
          instructionRaw: r.instruction_raw,
          paperType: r.paper_type,
          paperGsm: r.paper_gsm,
          paperWidth: r.paper_width,
          paperHeight: r.paper_height,
          color: r.color,
          totalSheets: r.total_sheets,
          machine: r.machine,
        }),
        "Phát lệnh",
      );
      plateChanged = true;
      salesChanged = true;
      break;
    }
    case "accept":
      assigned(r, actor);
      statusAllowed(r, ["WAITING_ACCEPTANCE"]);
      target = "ACCEPTED";
      await db.execute(
        "UPDATE production_orders SET accepted_at=CURRENT_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      break;
    case "wait-print":
      assigned(r, actor);
      statusAllowed(r, ["ACCEPTED"]);
      target = "WAITING_PRINT";
      break;
    case "acknowledge":
      assigned(r, actor);
      statusAllowed(r, preprint);
      if (input.revision !== r.revision)
        throw conflict("REVISION_CHANGED", "Cần xác nhận revision mới nhất.");
      await db.execute(
        "UPDATE production_orders SET acknowledged_revision=? WHERE id=?",
        [r.revision, id],
      );
      note = `Xác nhận revision ${r.revision}`;
      break;
    case "start":
      assigned(r, actor);
      statusAllowed(r, ["ACCEPTED", "WAITING_PRINT"]);
      if (r.acknowledged_revision !== r.revision)
        throw conflict(
          "REVISION_ACK_REQUIRED",
          "Chưa xác nhận hướng dẫn kỹ thuật mới nhất.",
        );
      if (r.cancellation_pending)
        throw conflict(
          "CANCELLATION_PENDING",
          "Cần phản hồi yêu cầu hủy trước khi bắt đầu in.",
        );
      target = "PRINTING";
      await db.execute(
        "UPDATE production_orders SET started_at=CURRENT_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      break;
    case "complete":
      assigned(r, actor);
      statusAllowed(r, ["PRINTING"]);
      if (input.spoilageSheets > input.actualPrintedSheets)
        throw conflict(
          "SHEETS_INVALID",
          "Số tờ hỏng không được vượt số tờ thực in.",
        );
      target = "PRINTED";
      note = input.note;
      await db.execute(
        "UPDATE production_orders SET printed_at=CURRENT_TIMESTAMP(3),actual_printed_sheets=?,spoilage_sheets=?,printed_note=? WHERE id=?",
        [input.actualPrintedSheets, input.spoilageSheets, note, id],
      );
      await completeHandoffs(db, id, r.run_kind === "REPRINT");
      salesChanged = true;
      break;
    case "revise": {
      allowed(canReviseProduction(actor.role));
      statusAllowed(r, preprint);
      await validatePrinter(db, input.printerId);
      if (!input.technical.instructionRaw || input.technical.totalSheets <= 0)
        throw conflict("TECHNICAL_REQUIRED", "Cần hướng dẫn và số tờ hợp lệ.");
      const old = technicalFields.parse({
        instructionRaw: r.instruction_raw,
        paperType: r.paper_type,
        paperGsm: r.paper_gsm,
        paperWidth: r.paper_width,
        paperHeight: r.paper_height,
        color: r.color,
        totalSheets: r.total_sheets,
        machine: r.machine,
      });
      const changedTechnical =
        fingerprint(old) !== fingerprint(input.technical);
      if (changedTechnical) {
        const t = input.technical;
        const [images] = await rows(
          db,
          "SELECT COUNT(*) n,COALESCE(SUM(sheet_count),0) sheets FROM production_print_images WHERE order_id=?",
          [id],
        );
        if (Number(images.n) > 0 && Number(images.sheets) !== t.totalSheets)
          throw conflict(
            "SHEET_MISMATCH",
            "Revision phải giữ tổng số tờ bình bài; thay bình bài cần lệnh mới.",
          );
        await db.execute(
          "UPDATE production_orders SET instruction_raw=?,paper_type=?,paper_gsm=?,paper_width=?,paper_height=?,color=?,total_sheets=?,machine=?,revision=revision+1 WHERE id=?",
          [
            t.instructionRaw,
            t.paperType,
            t.paperGsm,
            t.paperWidth,
            t.paperHeight,
            t.color,
            t.totalSheets,
            t.machine,
            id,
          ],
        );
        await revisionEvent(db, id, r.revision + 1, actor, t, input.reason);
      }
      if (input.printerId !== r.printer_id) {
        await audit(db, actor.id, "PRODUCTION_PRINTER_UNASSIGNED", id, {
          formerPrinterId: r.printer_id,
        });
        target = "WAITING_ACCEPTANCE";
        await db.execute(
          "UPDATE production_orders SET printer_id=?,acknowledged_revision=0,accepted_at=NULL WHERE id=?",
          [input.printerId, id],
        );
      }
      note = input.reason;
      break;
    }
    case "urgent":
      allowed(canComposeProduction(actor.role));
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED"]);
      await db.execute(
        "UPDATE production_orders SET is_urgent=?,urgent_reason=? WHERE id=?",
        [input.isUrgent, input.reason, id],
      );
      note = input.reason;
      break;
    case "plate-send":
      allowed(canReviseProduction(actor.role));
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED"]);
      if (plateStatus !== "NOT_SENT")
        throw conflict("PLATE_STATUS", "Chỉ gửi kẽm chưa gửi.");
      plateStatus = "SENT";
      note = input.note;
      plateChanged = true;
      break;
    case "plate-receive":
      allowed(
        canReviseProduction(actor.role) ||
          (actor.role === "PRINTER" && r.printer_id === actor.id),
      );
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED"]);
      if (plateStatus !== "SENT")
        throw conflict("PLATE_STATUS", "Kẽm phải được gửi trước khi nhận.");
      plateStatus = "RECEIVED";
      plateChanged = true;
      break;
    case "plate-report": {
      allowed(
        isManagement(actor.role) ||
          (actor.role === "PRINTER" && r.printer_id === actor.id),
      );
      statusAllowed(r, preprint);
      const type =
        plateStatus === "NOT_SENT" ? "PLATE_NOT_SENT" : "PLATE_DAMAGED";
      if (plateStatus === "NOT_REQUIRED")
        throw conflict("PLATE_STATUS", "Lệnh không yêu cầu kẽm.");
      const [existing] = await rows(
        db,
        "SELECT id FROM production_issues WHERE order_id=? AND issue_type=? AND status='OPEN'",
        [id, type],
      );
      if (!existing) {
        const issue = randomUUID();
        await db.execute(
          "INSERT INTO production_issues(id,order_id,issue_type,message,urgent,reported_by,reporter_name) VALUES(?,?,?,?,1,?,?)",
          [issue, id, type, input.reason, actor.id, actor.name],
        );
        await recipients(
          db,
          issue,
          [],
          ["DESIGNER", "MANAGER", "ADMIN", "DEVELOPER"],
        );
      }
      if (type === "PLATE_DAMAGED") plateStatus = "PLATE_DAMAGED";
      note = input.reason;
      plateChanged = true;
      break;
    }
    case "plate-reissue": {
      allowed(canReviseProduction(actor.role));
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED"]);
      const [issue] = await rows(
        db,
        "SELECT id FROM production_issues WHERE order_id=? AND issue_type IN ('PLATE_DAMAGED','PLATE_NOT_SENT') AND status='OPEN'",
        [id],
      );
      if (plateStatus !== "PLATE_DAMAGED" || !issue)
        throw conflict(
          "PLATE_STATUS",
          "Chỉ ra lại kẽm hỏng có báo cáo đang mở.",
        );
      plateType = "NEW";
      plateStatus = "SENT";
      note = input.note;
      plateChanged = true;
      break;
    }
    case "issue-report": {
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED"]);
      const policy = ISSUE_POLICIES[input.type];
      allowed(policy.reporters.includes(actor.role));
      const issue = randomUUID();
      const roles =
        input.recipientRoles.length || input.recipientUserIds.length
          ? input.recipientRoles
          : [...policy.recipients];
      const users = input.recipientUserIds.length
        ? input.recipientUserIds
        : input.type === "PLATE" && !input.recipientRoles.length
          ? [r.created_by]
          : [];
      await db.execute(
        "INSERT INTO production_issues(id,order_id,issue_type,message,urgent,reported_by,reporter_name) VALUES(?,?,?,?,?,?,?)",
        [
          issue,
          id,
          input.type,
          input.message,
          input.urgent,
          actor.id,
          actor.name,
        ],
      );
      await recipients(db, issue, users, roles);
      note = input.message;
      break;
    }
    case "issue-assign":
    case "issue-resolve":
    case "issue-cancel": {
      allowed(actor.role !== "WAREHOUSE");
      const [issue] = await rows(
        db,
        "SELECT * FROM production_issues WHERE id=? AND order_id=?",
        [input.issueId, id],
      );
      if (!issue) throw missing();
      if (issue.status !== "OPEN")
        throw conflict("ISSUE_CLOSED", "Báo cáo đã đóng.");
      const rec = await issueRecipients(db, issue.id);
      if (input.action === "issue-cancel") {
        allowed(issue.reported_by === actor.id);
        await db.execute(
          "UPDATE production_issues SET status='CANCELLED',cancelled_by=?,cancelled_at=CURRENT_TIMESTAMP(3) WHERE id=?",
          [actor.id, issue.id],
        );
      } else if (input.action === "issue-assign") {
        allowed(
          issue.reported_by === actor.id ||
            recipientAuthority(actor, rec.roles, rec.users),
        );
        await recipients(
          db,
          issue.id,
          input.recipientUserIds,
          input.recipientRoles,
        );
      } else {
        allowed(recipientAuthority(actor, rec.roles, rec.users));
        await db.execute(
          "UPDATE production_issues SET status='RESOLVED',resolved_by=?,resolved_at=CURRENT_TIMESTAMP(3) WHERE id=?",
          [actor.id, issue.id],
        );
      }
      note = issue.message;
      break;
    }
    case "cancel-request": {
      allowed(canComposeProduction(actor.role));
      statusAllowed(r, preprint);
      if (r.cancellation_pending)
        throw conflict("CANCELLATION_PENDING", "Đã có yêu cầu hủy đang chờ.");
      await db.execute(
        "INSERT INTO production_cancellation_requests(id,order_id,reason,requested_by,requester_name) VALUES(?,?,?,?,?)",
        [randomUUID(), id, input.reason, actor.id, actor.name],
      );
      note = input.reason;
      break;
    }
    case "cancel-respond": {
      assigned(r, actor);
      statusAllowed(r, preprint);
      const [c] = await rows(
        db,
        "SELECT * FROM production_cancellation_requests WHERE id=? AND order_id=? AND status='PENDING'",
        [input.cancellationId, id],
      );
      if (!c)
        throw conflict("NO_CANCELLATION", "Không có yêu cầu hủy đang chờ.");
      await db.execute(
        "UPDATE production_cancellation_requests SET status=?,responded_by=?,responder_name=?,response_reason=?,responded_at=CURRENT_TIMESTAMP(3) WHERE id=?",
        [
          input.accept ? "ACCEPTED" : "REJECTED",
          actor.id,
          actor.name,
          input.reason,
          c.id,
        ],
      );
      if (input.accept) {
        target = "CANCELLED";
        await db.execute(
          "UPDATE production_allocations a JOIN production_items i ON i.id=a.production_item_id SET a.state='RELEASED',a.released_at=CURRENT_TIMESTAMP(3) WHERE i.order_id=? AND a.state='ACTIVE'",
          [id],
        );
        salesChanged = true;
      }
      note = input.reason;
      break;
    }
    case "comment":
      allowed(
        canComposeProduction(actor.role) ||
          (actor.role === "PRINTER" && r.printer_id === actor.id),
      );
      statusAllowed(r, [...preprint, "PRINTING", "PRINTED", "CANCELLED"]);
      await db.execute(
        "INSERT INTO production_comments(id,order_id,content,actor_id,actor_name) VALUES(?,?,?,?,?)",
        [randomUUID(), id, input.content, actor.id, actor.name],
      );
      note = input.content;
      break;
  }
  if (plateChanged) {
    await db.execute(
      "UPDATE production_orders SET plate_type=?,plate_status=?,plate_note=? WHERE id=?",
      [plateType, plateStatus, note || r.plate_note, id],
    );
    await plateEvent(
      db,
      id,
      r.version + 1,
      actor,
      plateType,
      plateStatus,
      note || r.plate_note,
    );
  }
  await db.execute(
    "UPDATE production_orders SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
    [target, id],
  );
  if (salesChanged) await reconcileSales(db, id, actor);
  if (
    input.action === "complete" ||
    (input.action === "link-products" && target === "PRINTED")
  )
    await changed(db, "fulfillment", "workspace", 0);
  await productionEvent(
    db,
    id,
    r.version + 1,
    actor,
    "PRODUCTION_" + input.action.toUpperCase().replaceAll("-", "_"),
    r.status,
    target,
    note,
  );
  await db.execute(
    "INSERT INTO production_action_receipts(request_id,order_id,actor_id,action,request_hash,result_version) VALUES(?,?,?,?,?,?)",
    [input.requestId, id, actor.id, input.action, hash, r.version + 1],
  );
  return productionDetail(db, id, actor);
}
