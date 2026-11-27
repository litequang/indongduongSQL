import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { User } from "../../shared/contracts";
import type { SalesStatus } from "../../shared/business";
import type { OrderProgress, ProductProgress } from "../../shared/fulfillment";
import { rows, type Db } from "../database/pool";
import { businessPage, missing, searchPattern } from "../repositories/business";
import { audit, changed } from "./audit";

async function products(db: Db, id: string): Promise<ProductProgress[]> {
  const data = await rows(
    db,
    `SELECT i.*,
    COALESCE(a.allocated,0) AS allocated, COALESCE(a.pending,0) AS pending,
    COALESCE(f.printed,0) AS printed, COALESCE(f.checked,0) AS checked,
    COALESCE(f.accepted,0) AS accepted, COALESCE(f.rejected,0) AS rejected,
    COALESCE(f.short,0) AS short, COALESCE(f.available,0) AS available,
    COALESCE(f.replacement,0) AS replacement, COALESCE(f.in_finishing,0) AS in_finishing,
    COALESCE(d.dispatched,0) AS dispatched
    FROM sales_order_items i
    LEFT JOIN (
      SELECT pa.sales_item_id,SUM(IF(pa.kind='OUTPUT',pa.quantity,0)) AS allocated,
        SUM(pa.kind='OUTPUT' AND p.status<>'PRINTED') AS pending
      FROM production_allocations pa JOIN sales_order_items si ON si.id=pa.sales_item_id
      JOIN production_items pi ON pi.id=pa.production_item_id JOIN production_orders p ON p.id=pi.order_id
      WHERE si.order_id=? AND pa.state='ACTIVE' GROUP BY pa.sales_item_id
    ) a ON a.sales_item_id=i.id
    LEFT JOIN (
      SELECT pa.sales_item_id,
        SUM(IF(pa.kind='OUTPUT',h.quantity,0)) AS printed,
        SUM(IF(pa.kind='OUTPUT' AND t.status IN ('COMPLETED','CANCELLED'),h.quantity,0)) AS checked,
        SUM(COALESCE(fga.accepted_quantity,0)) AS accepted, SUM(COALESCE(fga.rejected_quantity,0)) AS rejected,
        SUM(COALESCE(fga.short_quantity,0)) AS short, SUM(COALESCE(g.remaining_quantity,0)) AS available,
        SUM(IF(pa.kind='REPRINT',h.quantity,0)) AS replacement,
        SUM(pa.kind='OUTPUT' AND t.status IN ('CLAIMED','IN_PROGRESS')) AS in_finishing
      FROM production_finishing_handoffs h JOIN production_allocations pa ON pa.id=h.allocation_id
      JOIN sales_order_items si ON si.id=pa.sales_item_id
      LEFT JOIN finishing_tasks t ON t.id=h.id LEFT JOIN finished_goods_acceptances fga ON fga.id=h.id
      LEFT JOIN finished_goods g ON g.id=h.id
      WHERE si.order_id=? AND pa.state='ACTIVE' AND h.quantity>0 AND h.superseded_at IS NULL
      GROUP BY pa.sales_item_id
    ) f ON f.sales_item_id=i.id
    LEFT JOIN (
      SELECT l.sales_item_id,SUM(l.quantity) AS dispatched
      FROM warehouse_dispatches d JOIN warehouse_dispatch_items l ON l.dispatch_id=d.id
      WHERE d.order_id=? AND d.active_slot=1 GROUP BY l.sales_item_id
    ) d ON d.sales_item_id=i.id
    WHERE i.order_id=? AND i.deleted_at IS NULL AND i.status<>'CANCELLED' ORDER BY i.position,i.id`,
    [id, id, id, id],
  );
  return data.map((r) => {
    const ordered = r.quantity as number;
    const allocated = Number(r.allocated);
    const printed = Number(r.printed);
    const checkedFinishing = Number(r.checked);
    const accepted = Number(r.accepted);
    const available = Number(r.available);
    const replacementPending = Number(r.replacement);
    const requiresProduction = !!r.requires_production;
    const designReady =
      r.design_queue_status === "READY_FOR_PRODUCTION" || allocated > 0;
    let status = r.status as string;
    let reason: string | null = null;
    if (status !== "NEW") {
      if (!requiresProduction) {
        reason = r.requires_finishing
          ? "Chờ xác nhận nguồn bán thành phẩm để gia công."
          : "Chờ xác nhận nguồn hàng nhập thẳng kho.";
      } else if (Number(r.pending) > 0) {
        status = "IN_PRODUCTION";
        reason = "Còn lệnh in chưa hoàn tất.";
      } else if (allocated < ordered || printed < ordered) {
        status =
          allocated > 0 || designReady
            ? "READY_FOR_PRODUCTION"
            : r.design_queue_status === "DESIGNING"
              ? "DESIGNING"
              : "WAITING_DESIGN";
        reason = designReady
          ? "Chưa bàn giao đủ số lượng in."
          : "Chưa hoàn thành thiết kế.";
      } else if (checkedFinishing < ordered) {
        status = Number(r.in_finishing) ? "FINISHING" : "READY_FOR_FINISHING";
        reason = "Còn sản lượng chưa qua checkpoint gia công.";
      } else if (accepted < ordered) {
        status = "PRODUCTION_COMPLETED";
        reason = replacementPending
          ? "Sản lượng in lại đang chờ chính sách nghiệm thu."
          : "Chưa nghiệm thu đủ số lượng đặt.";
      } else {
        status = "WAREHOUSE_READY";
        if (available < ordered) reason = "Tồn khả dụng chưa đủ số lượng đặt.";
      }
    }
    return {
      id: r.id,
      name: r.product_name,
      status,
      ordered,
      allocated,
      printed,
      checkedFinishing,
      accepted,
      rejected: Number(r.rejected),
      short: Number(r.short),
      available,
      dispatched: Number(r.dispatched),
      requiresProduction,
      requiresFinishing: !!r.requires_finishing,
      replacementPending,
      designReady,
      reason,
    };
  });
}

export async function orderProgress(
  db: Db,
  id: string,
  current?: RowDataPacket,
): Promise<OrderProgress> {
  const order =
    current ??
    (await rows(db, "SELECT * FROM sales_orders WHERE id=?", [id]))[0];
  if (!order) throw missing();
  const [dispatch] = await rows(
    db,
    `SELECT d.status,s.status AS shipment FROM warehouse_dispatches d
    LEFT JOIN shipments s ON s.dispatch_id=d.id AND s.active_slot=1 WHERE d.order_id=? AND d.active_slot=1`,
    [id],
  );
  const items = await products(db, id);
  return {
    id,
    code: order.code,
    customerName: order.customer_name,
    customerAddress: order.customer_address,
    status: order.status,
    version: order.version,
    dispatchStatus: dispatch?.status ?? null,
    shipmentStatus: dispatch?.shipment ?? null,
    products: items,
    canDispatch:
      !dispatch &&
      !["DRAFT", "CANCELLED", "DELIVERED", "COMPLETED"].includes(
        order.status,
      ) &&
      items.length > 0 &&
      items.every(
        (i) => i.status === "WAREHOUSE_READY" && i.available >= i.ordered,
      ),
  };
}

export function listOrderProgress(
  pool: Pool,
  q: { page: number; pageSize: number; status?: string; search: string },
) {
  const where = ["status NOT IN ('DRAFT','CANCELLED','COMPLETED','DELIVERED')"];
  const args: string[] = [];
  if (q.status) {
    where.push("status=?");
    args.push(q.status);
    if (q.status === "READY_TO_SHIP")
      where.push(
        "NOT EXISTS (SELECT 1 FROM warehouse_dispatches d WHERE d.order_id=sales_orders.id AND d.active_slot=1)",
      );
  }
  if (q.search) {
    where.push("(code LIKE ? ESCAPE '!' OR customer_name LIKE ? ESCAPE '!')");
    args.push(searchPattern(q.search), searchPattern(q.search));
  }
  return businessPage(
    pool,
    q,
    {
      select: "SELECT *",
      from: "FROM sales_orders",
      where,
      args,
      order: "status='READY_TO_SHIP' DESC,created_at DESC,id",
    },
    async (db, list) => {
      const result = [];
      for (const order of list)
        result.push(await orderProgress(db, order.id, order));
      return result;
    },
  );
}

export async function reconcileOrder(
  db: PoolConnection,
  id: string,
  actor: User,
  reason: string,
) {
  const progress = await orderProgress(db, id);
  if (["DRAFT", "CANCELLED"].includes(progress.status)) return;
  for (const item of progress.products)
    await db.execute(
      "UPDATE sales_order_items SET status=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=? AND status<>?",
      [item.status, item.id, item.status],
    );

  const items = progress.products;
  let status: SalesStatus = "CONFIRMED";
  if (progress.shipmentStatus === "DELIVERED") status = "COMPLETED";
  else if (progress.shipmentStatus) status = "SHIPPING";
  else if (progress.dispatchStatus || progress.canDispatch)
    status = "READY_TO_SHIP";
  else if (items.some((i) => i.status === "IN_PRODUCTION"))
    status = "IN_PRODUCTION";
  else if (
    items.some((i) =>
      ["WAITING_DESIGN", "DESIGNING", "READY_FOR_PRODUCTION"].includes(
        i.status,
      ),
    )
  )
    status = "DESIGNING";
  else if (
    items.some((i) => ["READY_FOR_FINISHING", "FINISHING"].includes(i.status))
  )
    status = "FULFILLING";
  else if (
    items.length &&
    items.every((i) =>
      ["PRODUCTION_COMPLETED", "WAREHOUSE_READY"].includes(i.status),
    )
  )
    status = "PRODUCTION_COMPLETED";

  const version = progress.version + 1;
  await db.execute(
    "UPDATE sales_orders SET status=?,version=?,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",
    [status, version, id],
  );
  if (status !== progress.status) {
    await db.execute(
      `INSERT INTO sales_order_status_history(order_id,version,from_status,to_status,actor_id,actor_name,reason)
      VALUES(?,?,?,?,?,?,?)`,
      [id, version, progress.status, status, actor.id, actor.name, reason],
    );
    await audit(db, actor.id, "SALES_ORDER_STATUS_DERIVED", id, {
      from: progress.status,
      to: status,
      reason,
    });
  }
  await changed(db, "sales_orders", id, version);
}
