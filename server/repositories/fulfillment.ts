import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { Role, User } from "../../shared/contracts";
import {
  type DispatchDetail,
  type DispatchEntry,
  type DispatchLine,
  type EventEntry,
  type FinishingDetail,
  type FinishingEntry,
  type IssueEntry,
  type ShipmentDetail,
  type ShipmentEntry,
  type StockDetail,
  type StockEntry,
} from "../../shared/fulfillment";
import { idSchema } from "../../shared/business";
import { rows, type Db } from "../database/pool";
import { allowed } from "../middleware/http";
import {
  businessPage,
  iso,
  missing,
  pageFields,
  searchPattern,
} from "./business";

export const fulfillmentQuery = z
  .object({
    ...pageFields,
    status: z
      .string()
      .regex(/^[A-Z_]+$/)
      .max(30)
      .optional(),
    orderId: idSchema.optional(),
    stage: z.enum(["FINISHING", "WAREHOUSE"]).optional(),
  })
  .strict();
type Query = z.output<typeof fulfillmentQuery>;

const sourceFrom = `FROM production_finishing_handoffs h
  JOIN production_items pi ON pi.id=h.production_item_id
  JOIN production_orders p ON p.id=h.order_id
  LEFT JOIN finishing_tasks t ON t.id=h.id
  LEFT JOIN production_allocations a ON a.id=h.allocation_id
  LEFT JOIN production_allocations original ON original.id=a.source_allocation_id
  LEFT JOIN production_items original_item ON original_item.id=original.production_item_id
  LEFT JOIN production_orders original_run ON original_run.id=original_item.order_id
  LEFT JOIN sales_order_items si ON si.id=a.sales_item_id
  LEFT JOIN sales_orders so ON so.id=si.order_id
  LEFT JOIN finished_goods_acceptances fga ON fga.id=h.id
  LEFT JOIN users finisher ON finisher.id=COALESCE(t.claimed_by,t.assigned_to)`;
const sourceSelect = `SELECT h.*,h.id AS handoff_id,a.kind AS allocation_kind,a.state AS allocation_state,
  a.quantity AS allocation_quantity,a.sales_item_id,a.source_allocation_id,si.status AS item_status,
  si.deleted_at AS item_deleted,si.quantity AS ordered,so.id AS sales_id,so.status AS sales_status,
  so.code AS sales_code,so.customer_name,COALESCE(si.product_name,pi.product_name) AS product_name,
  p.code AS production_code,p.status AS production_status,p.finishing_note,p.is_urgent AS production_urgent,
  original_run.code AS source_production_code,si.finishing_requirements,si.is_urgent AS item_urgent,
  COALESCE(t.status,'PENDING_RECEIPT') AS task_status,COALESCE(t.version,0) AS task_version,
  t.claimed_by,t.assigned_to,t.cancellation_pending,t.urgent,finisher.name AS finisher_name,
  fga.accepted_quantity,fga.rejected_quantity,fga.short_quantity,fga.actor_name AS acceptance_actor,
  fga.note AS acceptance_note,fga.created_at AS accepted_at`;
const eligible = `h.superseded_at IS NULL AND h.quantity>0 AND p.status='PRINTED'
  AND (h.allocation_id IS NULL OR (a.state='ACTIVE' AND a.kind<>'TRACE'
    AND a.quantity=h.quantity AND si.deleted_at IS NULL AND si.status<>'CANCELLED'
    AND so.status NOT IN ('DRAFT','CANCELLED')))`;

export function canSeeTask(row: RowDataPacket, actor: User) {
  return (
    actor.role !== "FINISHER" ||
    row.task_status === "PENDING_RECEIPT" ||
    (row.claimed_by ?? row.assigned_to) === actor.id ||
    (row.task_status === "READY" && !row.assigned_to && !row.claimed_by)
  );
}

export async function handoff(db: Db, id: string) {
  const [row] = await rows(
    db,
    sourceSelect + " " + sourceFrom + " WHERE h.id=?",
    [id],
  );
  if (!row) throw missing();
  row.task_version = Number(row.task_version);
  return row;
}

export function validHandoff(row: RowDataPacket) {
  return (
    !row.superseded_at &&
    row.quantity > 0 &&
    row.production_status === "PRINTED" &&
    (!row.allocation_id ||
      (row.allocation_state === "ACTIVE" &&
        row.allocation_kind !== "TRACE" &&
        row.allocation_quantity === row.quantity &&
        !row.item_deleted &&
        row.item_status !== "CANCELLED" &&
        !["DRAFT", "CANCELLED"].includes(row.sales_status)))
  );
}

function taskDto(r: RowDataPacket): FinishingEntry {
  return {
    id: r.handoff_id,
    productName: r.product_name,
    customerName: r.customer_name ?? "Lệnh độc lập",
    salesCode: r.sales_code,
    productionCode: r.production_code,
    productionId: r.order_id,
    quantity: r.quantity,
    requiresFinishing: !!r.requires_finishing,
    instructions: r.finishing_requirements ?? "",
    productionNote: r.finishing_note,
    replacement: !!r.replacement,
    sourceProductionCode: r.source_production_code,
    status: r.task_status,
    version: Number(r.task_version),
    claimedBy: r.claimed_by,
    assignedTo: r.assigned_to,
    finisherName: r.finisher_name,
    urgent: !!(r.urgent ?? (r.production_urgent || r.item_urgent)),
    cancellationPending: !!r.cancellation_pending,
    accepted: r.accepted_quantity,
    rejected: r.rejected_quantity,
    short: r.short_quantity,
    createdAt: iso(r.created_at),
  };
}

function sourceFilters(q: Query, actor: User) {
  const where = [eligible];
  const args: string[] = [];
  if (actor.role === "FINISHER") {
    where.push(
      "(t.id IS NULL OR COALESCE(t.claimed_by,t.assigned_to)=? OR (t.status='READY' AND t.claimed_by IS NULL AND t.assigned_to IS NULL))",
    );
    args.push(actor.id);
  }
  if (q.orderId) {
    where.push("so.id=?");
    args.push(q.orderId);
  }
  if (q.search) {
    where.push(
      "(pi.product_name LIKE ? ESCAPE '!' OR si.product_name LIKE ? ESCAPE '!' OR so.customer_name LIKE ? ESCAPE '!' OR so.code LIKE ? ESCAPE '!' OR p.code LIKE ? ESCAPE '!')",
    );
    args.push(...Array<string>(5).fill(searchPattern(q.search)));
  }
  return { where, args };
}

export function listFinishing(pool: Pool, q: Query, actor: User) {
  const { where, args } = sourceFilters(q, actor);
  if (q.status) {
    where.push("COALESCE(t.status,'PENDING_RECEIPT')=?");
    args.push(q.status);
  }
  return businessPage(
    pool,
    q,
    {
      select: sourceSelect,
      from: sourceFrom,
      where,
      args,
      order: `COALESCE(t.urgent,p.is_urgent OR si.is_urgent,0) DESC,h.created_at ${q.direction},h.id`,
    },
    (_db, list) => list.map(taskDto),
  );
}

const stockFrom = sourceFrom + " JOIN finished_goods g ON g.id=h.id";
const stockSelect =
  sourceSelect +
  ",g.remaining_quantity,g.dispatched_quantity,g.returned_quantity,g.restocked_quantity";
function stockDto(r: RowDataPacket): StockEntry {
  return {
    ...taskDto(r),
    remaining: r.remaining_quantity,
    dispatched: Number(r.dispatched_quantity),
    returned: Number(r.returned_quantity),
    restocked: Number(r.restocked_quantity),
  };
}

export function listStock(pool: Pool, q: Query, actor: User) {
  const { where, args } = sourceFilters(q, actor);
  if (q.status) {
    where.push("IF(g.remaining_quantity>0,'AVAILABLE','DEPLETED')=?");
    args.push(q.status);
  }
  return businessPage(
    pool,
    q,
    {
      select: stockSelect,
      from: stockFrom,
      where,
      args,
      order: `g.created_at ${q.direction},g.id`,
    },
    (_db, list) => list.map(stockDto),
  );
}

function eventDto(r: RowDataPacket): EventEntry {
  return {
    action: r.action,
    status: r.status,
    actorName: r.actor_name,
    note: r.note,
    createdAt: iso(r.created_at),
  };
}

export function issueAuthority(r: RowDataPacket, actor: User) {
  const roles: Role[] =
    typeof r.recipient_roles === "string"
      ? JSON.parse(r.recipient_roles)
      : r.recipient_roles;
  const users: string[] =
    typeof r.recipient_users === "string"
      ? JSON.parse(r.recipient_users)
      : r.recipient_users;
  const management: Role[] = ["MANAGER", "ADMIN", "DEVELOPER"];
  const rank = management.indexOf(actor.role);
  return {
    canResolve:
      users.includes(actor.id) ||
      roles.includes(actor.role) ||
      roles.some(
        (role) => management.includes(role) && management.indexOf(role) <= rank,
      ),
    canCancel: r.reported_by === actor.id,
  };
}

function issueDto(r: RowDataPacket, actor: User): IssueEntry {
  return {
    id: r.id,
    stage: r.stage,
    issueType: r.issue_type,
    status: r.status,
    message: r.message,
    reporterName: r.reporter_name,
    urgent: !!r.urgent,
    createdAt: iso(r.created_at),
    version: r.version,
    ...issueAuthority(r, actor),
  };
}

export function listIssues(pool: Pool, q: Query, actor: User) {
  const management: Role[] = ["MANAGER", "ADMIN", "DEVELOPER"];
  const recipients = [
    actor.role,
    ...management.slice(0, Math.max(0, management.indexOf(actor.role))),
  ];
  const where = [
    `(w.reported_by=? OR JSON_CONTAINS(w.recipient_users,JSON_QUOTE(?)) OR ${recipients.map(() => "JSON_CONTAINS(w.recipient_roles,JSON_QUOTE(?))").join(" OR ")})`,
  ];
  const args: string[] = [actor.id, actor.id, ...recipients];
  if (q.stage) {
    where.push("w.stage=?");
    args.push(q.stage);
  }
  if (q.status) {
    where.push("w.status=?");
    args.push(q.status);
  }
  return businessPage(
    pool,
    q,
    {
      select: "SELECT w.*",
      from: "FROM workflow_issues w",
      where,
      args,
      order: "w.urgent DESC,w.created_at DESC,w.id",
    },
    (_db, list) => list.map((r) => issueDto(r, actor)),
  );
}

async function taskHistory(db: Db, r: RowDataPacket, actor: User) {
  const history = await rows(
    db,
    "SELECT * FROM finishing_task_history WHERE task_id=? ORDER BY version DESC LIMIT 100",
    [r.handoff_id],
  );
  const issues = await rows(
    db,
    "SELECT * FROM workflow_issues WHERE handoff_id=? ORDER BY created_at DESC LIMIT 100",
    [r.handoff_id],
  );
  return {
    history: history.map(eventDto),
    issues: issues
      .map((i) => issueDto(i, actor))
      .filter((i) => i.canCancel || i.canResolve),
    acceptance: r.accepted_at
      ? {
          actorName: r.acceptance_actor,
          note: r.acceptance_note,
          createdAt: iso(r.accepted_at),
        }
      : null,
  };
}

export async function finishingDetail(
  db: Db,
  id: string,
  actor: User,
): Promise<FinishingDetail> {
  const r = await handoff(db, id);
  allowed(canSeeTask(r, actor));
  if (!validHandoff(r)) throw missing();
  return { entry: taskDto(r), ...(await taskHistory(db, r, actor)) };
}

export async function stockDetail(
  db: Db,
  id: string,
  actor: User,
): Promise<StockDetail> {
  const [r] = await rows(db, stockSelect + " " + stockFrom + " WHERE h.id=?", [
    id,
  ]);
  if (!r) throw missing();
  allowed(canSeeTask(r, actor));
  const movements = await rows(
    db,
    `SELECT m.*,d.code AS dispatch_code,s.code AS shipment_code
    FROM inventory_movements m LEFT JOIN warehouse_dispatch_items l ON l.id=m.dispatch_item_id
    LEFT JOIN warehouse_dispatches d ON d.id=l.dispatch_id LEFT JOIN shipments s ON s.id=m.shipment_id
    WHERE m.good_id=? ORDER BY m.id DESC LIMIT 100`,
    [id],
  );
  return {
    entry: stockDto(r),
    ...(await taskHistory(db, r, actor)),
    movements: movements.map((m) => ({
      id: String(m.id),
      kind: m.kind,
      quantity: m.quantity,
      delta: m.available_delta,
      actorName: m.actor_name,
      createdAt: iso(m.created_at),
      dispatchCode: m.dispatch_code,
      shipmentCode: m.shipment_code,
    })),
  };
}

const dispatchFrom =
  "FROM warehouse_dispatches d JOIN sales_orders o ON o.id=d.order_id LEFT JOIN shipments s ON s.dispatch_id=d.id AND s.active_slot=1";
const dispatchSelect = "SELECT d.*,o.code AS sales_code,s.id AS shipment_id";
const shipmentFrom =
  "FROM shipments s JOIN warehouse_dispatches d ON d.id=s.dispatch_id JOIN sales_orders o ON o.id=d.order_id";
const shipmentSelect =
  "SELECT s.*,d.code AS dispatch_code,o.code AS sales_code,d.method";

function dispatchDto(r: RowDataPacket): DispatchEntry {
  return {
    id: r.id,
    code: r.code,
    salesCode: r.sales_code,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    address: r.address,
    shipmentId: r.shipment_id,
    actorName: r.actor_name,
    status: r.status,
    method: r.method,
    note: r.note,
    version: r.version,
    createdAt: iso(r.created_at),
  };
}
function shipmentDto(r: RowDataPacket): ShipmentEntry {
  return {
    id: r.id,
    code: r.code,
    dispatchId: r.dispatch_id,
    dispatchCode: r.dispatch_code,
    salesCode: r.sales_code,
    receiverName: r.receiver_name,
    receiverPhone: r.receiver_phone,
    address: r.address,
    status: r.status,
    method: r.method,
    carrier: r.carrier,
    trackingCode: r.tracking_code,
    packages: r.packages,
    weightGrams: r.weight_grams,
    codAmount: r.cod_amount,
    note: r.note,
    version: r.version,
    createdAt: iso(r.created_at),
  };
}
export function listDispatches(pool: Pool, q: Query) {
  const where: string[] = [];
  const args: string[] = [];
  if (q.status === "AWAITING_SHIPMENT")
    where.push("d.active_slot=1 AND s.id IS NULL");
  else if (q.status) {
    where.push("d.status=?");
    args.push(q.status);
  }
  if (q.search) {
    where.push(
      "(d.code LIKE ? ESCAPE '!' OR o.code LIKE ? ESCAPE '!' OR d.customer_name LIKE ? ESCAPE '!')",
    );
    args.push(...Array<string>(3).fill(searchPattern(q.search)));
  }
  return businessPage(
    pool,
    q,
    {
      select: dispatchSelect,
      from: dispatchFrom,
      where,
      args,
      order: `d.created_at ${q.direction},d.id`,
    },
    (_db, list) => list.map(dispatchDto),
  );
}
export function listShipments(pool: Pool, q: Query) {
  const where: string[] = [];
  const args: string[] = [];
  if (q.status) {
    where.push("s.status=?");
    args.push(q.status);
  }
  if (q.search) {
    where.push(
      "(s.code LIKE ? ESCAPE '!' OR o.code LIKE ? ESCAPE '!' OR s.tracking_code LIKE ? ESCAPE '!' OR s.receiver_name LIKE ? ESCAPE '!')",
    );
    args.push(...Array<string>(4).fill(searchPattern(q.search)));
  }
  return businessPage(
    pool,
    q,
    {
      select: shipmentSelect,
      from: shipmentFrom,
      where,
      args,
      order: `s.created_at ${q.direction},s.id`,
    },
    (_db, list) => list.map(shipmentDto),
  );
}
export async function dispatchLines(db: Db, id: string) {
  return rows(
    db,
    `SELECT l.*,p.code AS production_code FROM warehouse_dispatch_items l
    JOIN production_finishing_handoffs h ON h.id=l.good_id JOIN production_orders p ON p.id=h.order_id
    WHERE l.dispatch_id=? ORDER BY l.sales_item_id,l.id`,
    [id],
  );
}
function linesDto(lines: RowDataPacket[]): DispatchLine[] {
  return lines.map((l) => ({
    id: l.id,
    productName: l.product_name,
    quantity: l.quantity,
    productionCode: l.production_code,
  }));
}
export async function dispatchDetail(
  db: PoolConnection,
  id: string,
): Promise<DispatchDetail> {
  const [r] = await rows(
    db,
    dispatchSelect + " " + dispatchFrom + " WHERE d.id=?",
    [id],
  );
  if (!r) throw missing();
  const history = await rows(
    db,
    `SELECT a.action,u.name AS actor_name,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(a.details,'$.note')),'') AS note,a.created_at
    FROM audit_logs a JOIN users u ON u.id=a.actor_id
    WHERE a.entity_id=? AND a.action IN ('FULFILLMENT_DISPATCH','FULFILLMENT_REVERSE_DISPATCH') ORDER BY a.id DESC`,
    [id],
  );
  return {
    entry: dispatchDto(r),
    lines: linesDto(await dispatchLines(db, id)),
    history: history.map((event) =>
      eventDto({
        ...event,
        action:
          event.action === "FULFILLMENT_DISPATCH"
            ? "dispatch"
            : "reverse-dispatch",
        status: r.status,
      }),
    ),
  };
}
export async function shipmentDetail(
  db: PoolConnection,
  id: string,
): Promise<ShipmentDetail> {
  const [r] = await rows(
    db,
    shipmentSelect + " " + shipmentFrom + " WHERE s.id=?",
    [id],
  );
  if (!r) throw missing();
  const history = await rows(
    db,
    "SELECT * FROM shipment_history WHERE shipment_id=? ORDER BY version DESC LIMIT 100",
    [id],
  );
  const returns = await rows(
    db,
    "SELECT * FROM shipment_returns WHERE shipment_id=? ORDER BY dispatch_item_id",
    [id],
  );
  return {
    entry: shipmentDto(r),
    history: history.map(eventDto),
    lines: linesDto(await dispatchLines(db, r.dispatch_id)),
    returns: returns.map((i) => ({
      lineId: i.dispatch_item_id,
      quantity: i.quantity,
      disposition: i.disposition,
      actorName: i.actor_name,
      note: i.note,
      createdAt: iso(i.created_at),
    })),
  };
}
