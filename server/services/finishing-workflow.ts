import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { canEditSales } from "../../shared/business";
import { canComposeProduction } from "../../shared/production";
import type { User } from "../../shared/contracts";
import type { FulfillmentInput } from "../../shared/fulfillment";
import { rows } from "../database/pool";
import { allowed, fresh } from "../middleware/http";
import { conflict, missing } from "../repositories/business";
import {
  canSeeTask,
  handoff,
  issueAuthority,
  validHandoff,
} from "../repositories/fulfillment";
import { reconcileOrder } from "./sales-progress";

export type TaskInput = Extract<
  FulfillmentInput,
  {
    action:
      | "receive"
      | "assign"
      | "claim"
      | "start"
      | "complete"
      | "confirm-no-work"
      | "add-note"
      | "urgent"
      | "request-cancel"
      | "respond-cancel"
      | "accept";
  }
>;
export type IssueInput = Extract<
  FulfillmentInput,
  { action: "report-issue" | "resolve-issue" | "cancel-issue" }
>;

export function taskRole(input: TaskInput, actor: User) {
  if (input.action === "accept")
    return actor.role === "FINISHER" || canEditSales(actor.role);
  if (input.action === "add-note")
    return actor.role === "FINISHER" || canComposeProduction(actor.role);
  if (["assign", "urgent", "request-cancel"].includes(input.action))
    return canComposeProduction(actor.role);
  return actor.role === "FINISHER";
}

async function taskEvent(
  db: PoolConnection,
  id: string,
  version: number,
  action: string,
  status: string,
  note: string,
  actor: User,
) {
  await db.execute(
    `INSERT INTO finishing_task_history(task_id,version,action,status,note,actor_id,actor_name)
    VALUES(?,?,?,?,?,?,?)`,
    [id, version, action, status, note, actor.id, actor.name],
  );
}

function requireStatus(r: RowDataPacket, ...statuses: string[]) {
  if (!statuses.includes(r.task_status))
    throw conflict("INVALID_STATUS", "Công việc không ở trạng thái phù hợp.");
}

export async function actTask(
  db: PoolConnection,
  id: string,
  input: TaskInput,
  actor: User,
) {
  const r = await handoff(db, id);
  allowed(canSeeTask(r, actor));
  if (!validHandoff(r))
    throw conflict(
      "HANDOFF_INELIGIBLE",
      "Bàn giao đã bị thay thế hoặc không có sản lượng hợp lệ.",
    );

  if (input.action === "receive") {
    requireStatus(r, "PENDING_RECEIPT");
    await db.execute("INSERT INTO finishing_tasks(id,urgent) VALUES(?,?)", [
      id,
      !!(r.production_urgent || r.item_urgent),
    ]);
    await taskEvent(db, id, 1, input.action, "READY", "", actor);
    if (r.sales_id)
      await reconcileOrder(db, r.sales_id, actor, "Tiếp nhận sản lượng in");
    return { id, version: 1 };
  }
  if (!r.task_version)
    throw conflict("RECEIPT_REQUIRED", "Cần tiếp nhận bàn giao trước.");
  fresh(r.task_version, input.version);
  let status = r.task_status;
  let assigned = r.assigned_to;
  let claimed = r.claimed_by;
  let pending = !!r.cancellation_pending;
  let urgent = !!r.urgent;
  const note = "note" in input ? input.note : "";
  switch (input.action) {
    case "assign": {
      requireStatus(r, "READY");
      if (!r.requires_finishing)
        throw conflict(
          "NO_FINISHING",
          "Sản phẩm chỉ cần xác nhận không gia công.",
        );
      if (input.finisherId) {
        const [user] = await rows(
          db,
          "SELECT id FROM users WHERE id=? AND role_code='FINISHER' AND active=1 AND deleted_at IS NULL",
          [input.finisherId],
        );
        if (!user)
          throw conflict(
            "INVALID_FINISHER",
            "Nhân viên gia công không còn hoạt động.",
          );
      }
      assigned = input.finisherId;
      break;
    }
    case "claim":
      requireStatus(r, "READY");
      if (!r.requires_finishing)
        throw conflict("NO_FINISHING", "Dùng xác nhận không cần gia công.");
      claimed = actor.id;
      status = "CLAIMED";
      break;
    case "start":
    case "complete":
      allowed(r.claimed_by === actor.id);
      requireStatus(r, "CLAIMED", "IN_PROGRESS");
      if (pending)
        throw conflict("CANCEL_PENDING", "Cần phản hồi yêu cầu hủy trước.");
      if (input.action === "start") requireStatus(r, "CLAIMED");
      status = input.action === "start" ? "IN_PROGRESS" : "COMPLETED";
      break;
    case "confirm-no-work":
      requireStatus(r, "READY");
      if (r.requires_finishing)
        throw conflict("FINISHING_REQUIRED", "Đây là công việc cần gia công.");
      claimed = actor.id;
      status = "COMPLETED";
      break;
    case "add-note":
      if (actor.role === "FINISHER")
        allowed(r.claimed_by === actor.id || r.assigned_to === actor.id);
      break;
    case "urgent":
      requireStatus(r, "READY", "CLAIMED", "IN_PROGRESS");
      urgent = input.urgent;
      break;
    case "request-cancel":
      if (!r.requires_finishing)
        throw conflict(
          "NO_FINISHING",
          "Sản phẩm cần xác nhận không gia công trước khi nghiệm thu.",
        );
      requireStatus(r, "READY", "CLAIMED", "IN_PROGRESS");
      if (pending)
        throw conflict("CANCEL_PENDING", "Công việc đang chờ phản hồi hủy.");
      if (claimed) pending = true;
      else status = "CANCELLED";
      break;
    case "respond-cancel":
      requireStatus(r, "CLAIMED", "IN_PROGRESS");
      allowed(claimed === actor.id);
      if (!pending)
        throw conflict(
          "NO_CANCEL_REQUEST",
          "Công việc không có yêu cầu hủy đang chờ.",
        );
      pending = false;
      if (input.accept) status = "CANCELLED";
      break;
    case "accept":
      if (actor.role === "FINISHER")
        allowed((claimed ?? assigned) === actor.id);
      requireStatus(r, "COMPLETED", "CANCELLED");
      await acceptOutput(db, r, input, actor);
      break;
  }
  const version = r.task_version + 1;
  await db.execute(
    `UPDATE finishing_tasks SET status=?,assigned_to=?,claimed_by=?,cancellation_pending=?,urgent=?,version=?
    WHERE id=?`,
    [status, assigned, claimed, pending, urgent, version, id],
  );
  await taskEvent(db, id, version, input.action, status, note, actor);
  if (r.sales_id)
    await reconcileOrder(
      db,
      r.sales_id,
      actor,
      "Cập nhật gia công và nghiệm thu",
    );
  return { id, version };
}

async function acceptOutput(
  db: PoolConnection,
  r: RowDataPacket,
  input: Extract<TaskInput, { action: "accept" }>,
  actor: User,
) {
  if (r.accepted_at)
    throw conflict("ALREADY_INSPECTED", "Bàn giao đã được nghiệm thu.");
  if (r.replacement || r.allocation_kind === "REPRINT")
    throw conflict(
      "REPLACEMENT_POLICY_PENDING",
      "Chờ xác nhận cách xử lý sản lượng gốc và sản lượng in lại.",
    );
  if (input.accepted + input.rejected + input.short !== r.quantity)
    throw conflict(
      "QUANTITY_MISMATCH",
      "Tổng số đạt, không đạt và thiếu hụt phải bằng số lượng bàn giao.",
    );
  if ((input.rejected || input.short) && !input.note)
    throw conflict("REASON_REQUIRED", "Ghi rõ lý do thiếu hụt hoặc không đạt.");
  if (r.sales_item_id) {
    const [total] = await rows(
      db,
      `SELECT COALESCE(SUM(a.accepted_quantity),0) AS n FROM finished_goods_acceptances a
      JOIN production_finishing_handoffs h ON h.id=a.id JOIN production_allocations pa ON pa.id=h.allocation_id
      WHERE pa.sales_item_id=?`,
      [r.sales_item_id],
    );
    if (Number(total.n) + input.accepted > r.ordered)
      throw conflict("ACCEPTANCE_EXCEEDED", "Sản lượng đạt vượt số lượng đặt.");
  }
  await db.execute(
    `INSERT INTO finished_goods_acceptances(id,accepted_quantity,rejected_quantity,short_quantity,actor_id,actor_name,note)
    VALUES(?,?,?,?,?,?,?)`,
    [
      r.handoff_id,
      input.accepted,
      input.rejected,
      input.short,
      actor.id,
      actor.name,
      input.note,
    ],
  );
  if (input.accepted) {
    await db.execute(
      "INSERT INTO finished_goods(id,sales_item_id,remaining_quantity) VALUES(?,?,?)",
      [r.handoff_id, r.sales_item_id, input.accepted],
    );
    await db.execute(
      `INSERT INTO inventory_movements(good_id,kind,quantity,available_delta,actor_id,actor_name)
      VALUES(?,'ACCEPTED',?,?,?,?)`,
      [r.handoff_id, input.accepted, input.accepted, actor.id, actor.name],
    );
  }
}

export async function actIssue(
  db: PoolConnection,
  id: string,
  input: IssueInput,
  actor: User,
) {
  if (input.action === "report-issue") {
    const r = await handoff(db, id);
    if (input.stage === "FINISHING") {
      allowed(
        canComposeProduction(actor.role) ||
          (actor.role === "FINISHER" &&
            (r.claimed_by === actor.id ||
              r.assigned_to === actor.id ||
              (canSeeTask(r, actor) && r.task_status === "READY"))),
      );
      if (!r.task_version || !validHandoff(r)) throw missing();
    } else {
      allowed(actor.role === "WAREHOUSE" || canEditSales(actor.role));
      const [good] = await rows(
        db,
        "SELECT id FROM finished_goods WHERE id=?",
        [id],
      );
      if (!good) throw missing();
    }
    const users = [...new Set(input.recipientUserIds)];
    let roles = [...new Set(input.recipientRoles)];
    if (!users.length && !roles.length) roles = ["SALE", "DESIGNER", "MANAGER"];
    for (const userId of users) {
      const [user] = await rows(
        db,
        "SELECT id FROM users WHERE id=? AND active=1 AND deleted_at IS NULL",
        [userId],
      );
      if (!user)
        throw conflict("RECIPIENT_INVALID", "Người nhận không còn hoạt động.");
    }
    const issueId = randomUUID();
    await db.execute(
      `INSERT INTO workflow_issues(id,handoff_id,stage,issue_type,message,urgent,reported_by,reporter_name,recipient_roles,recipient_users)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [
        issueId,
        id,
        input.stage,
        input.issueType,
        input.note,
        input.urgent,
        actor.id,
        actor.name,
        JSON.stringify(roles),
        JSON.stringify(users),
      ],
    );
    return { id: issueId, version: 1 };
  }
  const [issue] = await rows(db, "SELECT * FROM workflow_issues WHERE id=?", [
    id,
  ]);
  if (!issue) throw missing();
  const authority = issueAuthority(issue, actor);
  allowed(
    input.action === "resolve-issue"
      ? authority.canResolve
      : authority.canCancel,
  );
  fresh(issue.version, input.version);
  if (issue.status !== "OPEN")
    throw conflict("INVALID_STATUS", "Sự cố đã được đóng.");
  const status = input.action === "resolve-issue" ? "RESOLVED" : "CANCELLED";
  await db.execute(
    `UPDATE workflow_issues SET status=?,closed_by=?,closed_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE id=?`,
    [status, actor.id, id],
  );
  return { id, version: issue.version + 1 };
}
