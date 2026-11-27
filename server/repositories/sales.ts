import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { User } from "../../shared/contracts";
import { z } from "zod";
import {
  SALES_STATUSES,
  idSchema,
  type SalesInput,
  type SalesItem,
  type SalesItemInput,
  type SalesOrder,
  type SalesHistory,
  type SalesStatus,
} from "../../shared/business";
import { rows, type Db } from "../database/pool";
import { fresh } from "../middleware/http";
import { audit, changed } from "../services/audit";
import {
  businessAudit,
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
import { getActiveCustomer } from "./customers";
import { getDesignSnapshots } from "./designs";

export const salesQuery = z
  .object({
    ...pageFields,
    customerId: idSchema.optional(),
    status: z.enum(SALES_STATUSES).optional(),
    priority: z.enum(["NORMAL", "URGENT"]).optional(),
    sort: z
      .enum(["code", "createdAt", "expectedDeliveryDate"])
      .default("createdAt"),
  })
  .strict();
const selectOrder = `SELECT o.*, DATE_FORMAT(o.expected_delivery_date, '%Y-%m-%d') AS delivery_date,
  (SELECT COUNT(*) FROM sales_order_items i WHERE i.order_id=o.id AND i.deleted_at IS NULL) AS total_items`;
function salesDto(r: RowDataPacket): SalesOrder {
  return {
    id: r.id,
    code: r.code,
    customerId: r.customer_id,
    saleId: r.sale_id,
    saleName: r.sale_name,
    customerSnapshot: {
      name: r.customer_name,
      phone: r.customer_phone,
      address: r.customer_address,
    },
    status: r.status,
    priority: r.priority,
    expectedDeliveryDate: r.delivery_date,
    customerNote: r.customer_note,
    internalNote: r.internal_note,
    totalItems: Number(r.total_items),
    version: r.version,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    confirmedAt: optionalIso(r.confirmed_at),
    cancelledAt: optionalIso(r.cancelled_at),
  };
}
export function listSales(pool: Pool, q: z.output<typeof salesQuery>) {
  const where: string[] = [];
  const args: string[] = [];
  for (const [column, value] of [
    ["customer_id", q.customerId],
    ["status", q.status],
    ["priority", q.priority],
  ]) {
    if (value) {
      where.push(`o.${column}=?`);
      args.push(value);
    }
  }
  if (q.search) {
    where.push(`(o.code LIKE ? ESCAPE '!' OR o.customer_name LIKE ? ESCAPE '!' OR EXISTS (
      SELECT 1 FROM sales_order_items i WHERE i.order_id=o.id AND i.deleted_at IS NULL AND i.product_name LIKE ? ESCAPE '!'))`);
    args.push(...Array<string>(3).fill(searchPattern(q.search)));
  }
  const sort = {
    code: "o.code",
    createdAt: "o.created_at",
    expectedDeliveryDate: "o.expected_delivery_date",
  }[q.sort];
  return businessPage(
    pool,
    q,
    {
      select: selectOrder,
      from: "FROM sales_orders o",
      where,
      args,
      order: `${sort} ${q.direction},o.id ${q.direction}`,
    },
    (_db, data) => data.map(salesDto),
  );
}
export async function getSalesOrder(db: Db, id: string) {
  const [row] = await rows(
    db,
    `${selectOrder} FROM sales_orders o WHERE id=?`,
    [id],
  );
  if (!row) throw missing();
  return salesDto(row);
}
const itemColumns = [
  ["productName", "product_name"],
  ["quantity", "quantity"],
  ["bagWidth", "bag_width"],
  ["bagLength", "bag_length"],
  ["bagGusset", "bag_gusset"],
  ["paperPreference", "paper_preference"],
  ["gsmPreference", "gsm_preference"],
  ["colorPreference", "color_preference"],
  ["technicalRequirements", "technical_requirements"],
  ["designRequirements", "design_requirements"],
  ["productionRequirements", "production_requirements"],
  ["finishingRequirements", "finishing_requirements"],
  ["note", "note"],
  ["requiresProduction", "requires_production"],
  ["requiresFinishing", "requires_finishing"],
  ["isUrgent", "is_urgent"],
  ["designVersionId", "design_version_id"],
] as const;
const decimal = (v: string | null) => (v === null ? null : Number(v));
export async function salesDetail(db: PoolConnection, id: string) {
  const order = await getSalesOrder(db, id);
  const data = await rows(
    db,
    "SELECT * FROM sales_order_items WHERE order_id=? AND deleted_at IS NULL ORDER BY position,id",
    [id],
  );
  const snapshots = await getDesignSnapshots(
    db,
    data.flatMap((r) =>
      r.design_version_id ? [r.design_version_id as string] : [],
    ),
  );
  const items: SalesItem[] = data.map((r) => ({
    ...(Object.fromEntries(
      itemColumns.map(([key, column]) => [key, r[column]]),
    ) as Omit<SalesItemInput, "id">),
    bagWidth: decimal(r.bag_width),
    bagLength: decimal(r.bag_length),
    bagGusset: decimal(r.bag_gusset),
    requiresProduction: Boolean(r.requires_production),
    requiresFinishing: Boolean(r.requires_finishing),
    isUrgent: Boolean(r.is_urgent),
    id: r.id,
    status: r.status,
    quantityUnit: r.quantity_unit,
    designSnapshot: snapshots.get(r.design_version_id) ?? null,
  }));
  const history: SalesHistory[] = (
    await rows(
      db,
      "SELECT * FROM sales_order_status_history WHERE order_id=? ORDER BY version DESC LIMIT 100",
      [id],
    )
  ).map((r) => ({
    version: r.version,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actorName: r.actor_name,
    reason: r.reason,
    createdAt: iso(r.created_at),
  }));
  const activity = await businessAudit(db, id, [
    "SALES_ORDER_CREATED",
    "SALES_ORDER_UPDATED",
    "SALES_ORDER_CONFIRMED",
    "SALES_ORDER_CANCELLED",
    "SALES_ORDER_FORCE_REOPENED",
  ]);
  const [dispatch] = await rows(
    db,
    "SELECT id FROM warehouse_dispatches WHERE order_id=? LIMIT 1",
    [id],
  );
  return { order, items, history, activity, hasDispatchHistory: !!dispatch };
}
async function history(
  db: PoolConnection,
  id: string,
  version: number,
  from: SalesStatus | null,
  to: SalesStatus,
  actor: User,
  reason = "",
) {
  await db.execute(
    `INSERT INTO sales_order_status_history(order_id,version,from_status,to_status,actor_id,actor_name,reason)
    VALUES(?,?,?,?,?,?,?)`,
    [id, version, from, to, actor.id, actor.name, reason],
  );
}
async function saveItems(
  db: PoolConnection,
  orderId: string,
  items: SalesItemInput[],
) {
  const existing = new Set(
    (
      await rows(
        db,
        "SELECT id FROM sales_order_items WHERE order_id=? AND deleted_at IS NULL",
        [orderId],
      )
    ).map((r) => r.id),
  );
  const snapshots = await getDesignSnapshots(
    db,
    items.flatMap((item) =>
      item.designVersionId ? [item.designVersionId] : [],
    ),
  );
  for (const [index, item] of items.entries()) {
    if (item.designVersionId && !snapshots.has(item.designVersionId))
      throw conflict(
        "DESIGN_VERSION_MISSING",
        "Không tìm thấy phiên bản mẫu đã chọn.",
      );
    const values = itemColumns.map(([key]) => item[key]);
    if (existing.delete(item.id)) {
      await db.execute(
        `UPDATE sales_order_items SET position=?,${itemColumns.map(([, column]) => column + "=?").join(",")},updated_at=CURRENT_TIMESTAMP(3) WHERE order_id=? AND id=?`,
        [index, ...values, orderId, item.id],
      );
    } else {
      await db.execute(
        `INSERT INTO sales_order_items(id,order_id,position,${itemColumns.map(([, column]) => column).join(",")})
          VALUES(${Array.from({ length: itemColumns.length + 3 }, () => "?").join(",")})`,
        [item.id, orderId, index, ...values],
      );
    }
  }
  if (existing.size)
    await db.execute(
      `UPDATE sales_order_items SET deleted_at=CURRENT_TIMESTAMP(3),updated_at=CURRENT_TIMESTAMP(3) WHERE order_id=? AND id IN (${[...existing].map(() => "?").join(",")})`,
      [orderId, ...existing],
    );
}
export async function saveSales(
  db: PoolConnection,
  id: string,
  input: SalesInput,
  actor: User,
  expected?: number,
) {
  const [current] = await rows(db, "SELECT * FROM sales_orders WHERE id=?", [
    id,
  ]);
  const hash = fingerprint(input);
  if (expected === undefined && current) {
    if (current.request_hash !== hash || current.sale_id !== actor.id)
      throw conflict("REQUEST_CONFLICT", "Mã yêu cầu đã được sử dụng.");
    return salesDetail(db, id);
  }
  if (expected !== undefined) {
    if (!current) throw missing();
    fresh(current.version, expected);
    if (current.status !== "DRAFT")
      throw conflict("INVALID_STATUS", "Chỉ có thể sửa đơn nháp.");
  }
  const {
    customerId,
    priority,
    expectedDeliveryDate,
    customerNote,
    internalNote,
  } = input;
  const customer =
    current?.customer_id === customerId
      ? {
          name: current.customer_name,
          phone: current.customer_phone,
          address: current.customer_address,
        }
      : await getActiveCustomer(db, customerId);
  const fields = [
    customerId,
    customer.name,
    customer.phone,
    customer.address,
    priority,
    expectedDeliveryDate,
    customerNote,
    internalNote,
  ];
  if (current) {
    await db.execute(
      `UPDATE sales_orders SET customer_id=?,customer_name=?,customer_phone=?,customer_address=?,priority=?,
      expected_delivery_date=?,customer_note=?,internal_note=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?`,
      [...fields, id],
    );
  } else {
    const code = await businessCode(db, "sales_orders");
    await db.execute(
      `INSERT INTO sales_orders(customer_id,customer_name,customer_phone,customer_address,priority,
      expected_delivery_date,customer_note,internal_note,id,code,sale_id,sale_name,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [...fields, id, code, actor.id, actor.name, hash],
    );
    await history(db, id, 1, null, "DRAFT", actor);
  }
  await saveItems(db, id, input.items);
  await audit(
    db,
    actor.id,
    current ? "SALES_ORDER_UPDATED" : "SALES_ORDER_CREATED",
    id,
    { itemCount: input.items.length },
  );
  await changed(db, "sales_orders", id, (current?.version ?? 0) + 1);
  return salesDetail(db, id);
}

export async function transitionSales(
  db: PoolConnection,
  id: string,
  expected: number,
  action: "confirm" | "cancel" | "force-reopen",
  actor: User,
  reason = "",
) {
  const current = await getSalesOrder(db, id);
  const [previous] = await rows(
    db,
    "SELECT to_status FROM sales_order_status_history WHERE order_id=? AND version=?",
    [id, expected + 1],
  );
  if (
    current.version === expected + 1 &&
    previous?.to_status === current.status &&
    ((action === "confirm" &&
      ["DESIGNING", "CONFIRMED"].includes(current.status)) ||
      (action === "cancel" && current.status === "CANCELLED"))
  )
    return salesDetail(db, id);
  fresh(current.version, expected);
  const items = await rows(
    db,
    "SELECT status,requires_production FROM sales_order_items WHERE order_id=? AND deleted_at IS NULL",
    [id],
  );
  let target: SalesStatus;
  if (action === "confirm") {
    if (current.status !== "DRAFT" || !items.length)
      throw conflict(
        "INVALID_STATUS",
        "Chỉ xác nhận đơn nháp có ít nhất một sản phẩm.",
      );
    await getActiveCustomer(db, current.customerId);
    target = items.some((item) => item.requires_production)
      ? "DESIGNING"
      : "CONFIRMED";
    await db.execute(
      `UPDATE sales_order_items SET status=IF(requires_production,'WAITING_DESIGN','CONFIRMED'),updated_at=CURRENT_TIMESTAMP(3)
      WHERE order_id=? AND deleted_at IS NULL AND status='NEW'`,
      [id],
    );
    await db.execute(
      "UPDATE sales_orders SET confirmed_at=CURRENT_TIMESTAMP(3),confirmed_by=? WHERE id=?",
      [actor.id, id],
    );
  } else if (action === "cancel") {
    const [production] = await rows(
      db,
      `SELECT COUNT(*) n FROM production_allocations a JOIN sales_order_items i ON i.id=a.sales_item_id WHERE i.order_id=? AND a.state='ACTIVE'`,
      [id],
    );
    if (Number(production.n) > 0)
      throw conflict(
        "ACTIVE_PRODUCTION",
        "Cần xử lý các lệnh sản xuất trước khi hủy đơn bán hàng.",
      );
    if (
      [
        "CANCELLED",
        "COMPLETED",
        "DELIVERED",
        "SHIPPING",
        "READY_TO_SHIP",
      ].includes(current.status) ||
      items.some((item) =>
        [
          "IN_PRODUCTION",
          "PRODUCTION_COMPLETED",
          "READY_FOR_FINISHING",
          "FINISHING",
          "WAREHOUSE_READY",
        ].includes(item.status),
      )
    )
      throw conflict(
        "INVALID_STATUS",
        "Không thể hủy đơn ở trạng thái hiện tại.",
      );
    target = "CANCELLED";
    await db.execute(
      "UPDATE sales_order_items SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP(3) WHERE order_id=? AND deleted_at IS NULL",
      [id],
    );
    await db.execute(
      "UPDATE sales_orders SET cancelled_at=CURRENT_TIMESTAMP(3) WHERE id=?",
      [id],
    );
  } else {
    const [dispatch] = await rows(
      db,
      "SELECT id FROM warehouse_dispatches WHERE order_id=? LIMIT 1",
      [id],
    );
    if (dispatch)
      throw conflict(
        "DISPATCH_HISTORY",
        "Đơn có lịch sử xuất kho. Xử lý trên luồng kho vận.",
      );
    if (!["DELIVERED", "COMPLETED"].includes(current.status))
      throw conflict(
        "INVALID_STATUS",
        "Chỉ đơn đã giao hoặc đã hoàn thành mới có thể mở lại.",
      );
    target = "IN_PRODUCTION";
  }
  await db.execute(
    "UPDATE sales_orders SET status=?,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
    [target, id],
  );
  await history(
    db,
    id,
    current.version + 1,
    current.status,
    target,
    actor,
    reason,
  );
  const auditAction = {
    confirm: "SALES_ORDER_CONFIRMED",
    cancel: "SALES_ORDER_CANCELLED",
    "force-reopen": "SALES_ORDER_FORCE_REOPENED",
  }[action];
  await audit(db, actor.id, auditAction, id, {
    from: current.status,
    to: target,
  });
  await changed(db, "sales_orders", id, current.version + 1);
  return salesDetail(db, id);
}
