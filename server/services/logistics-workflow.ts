import { randomUUID } from "node:crypto";
import type {
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
} from "mysql2/promise";
import type { User } from "../../shared/contracts";
import {
  SHIPMENT_ACTIONS,
  type FulfillmentInput,
  type ShipmentAction,
} from "../../shared/fulfillment";
import { rows } from "../database/pool";
import { fresh } from "../middleware/http";
import { businessCode, conflict, missing } from "../repositories/business";
import { dispatchLines } from "../repositories/fulfillment";
import { orderProgress, reconcileOrder } from "./sales-progress";

export type LogisticsInput = Extract<
  FulfillmentInput,
  {
    action:
      | "dispatch"
      | "reverse-dispatch"
      | "create-shipment"
      | "inspect-return"
      | ShipmentAction;
  }
>;
type DispatchInput = Extract<LogisticsInput, { action: "dispatch" }>;

async function movement(
  db: PoolConnection,
  line: { id: string; goodId: string; quantity: number },
  kind: string,
  delta: number,
  actor: User,
  shipmentId: string | null = null,
) {
  await db.execute(
    `INSERT INTO inventory_movements(good_id,dispatch_item_id,shipment_id,kind,quantity,available_delta,actor_id,actor_name)
    VALUES(?,?,?,?,?,?,?,?)`,
    [
      line.goodId,
      line.id,
      shipmentId,
      kind,
      line.quantity,
      delta,
      actor.id,
      actor.name,
    ],
  );
}

async function dispatch(
  db: PoolConnection,
  orderId: string,
  input: DispatchInput,
  actor: User,
) {
  const order = await orderProgress(db, orderId);
  fresh(order.version, input.version);
  if (!order.canDispatch)
    throw conflict(
      "ORDER_NOT_READY",
      "Chỉ xuất nguyên đơn khi mọi sản phẩm còn hiệu lực đã đủ tồn.",
    );
  const [snapshot] = await rows(
    db,
    "SELECT customer_phone FROM sales_orders WHERE id=?",
    [orderId],
  );
  const id = randomUUID();
  const code = await businessCode(db, "warehouse_dispatches");
  await db.execute(
    `INSERT INTO warehouse_dispatches(id,code,order_id,method,customer_name,customer_phone,address,note,actor_id,actor_name)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      code,
      orderId,
      input.method,
      order.customerName,
      snapshot.customer_phone,
      input.address,
      input.note,
      actor.id,
      actor.name,
    ],
  );
  for (const item of order.products) {
    const goods = await rows(
      db,
      `SELECT id,remaining_quantity FROM finished_goods WHERE sales_item_id=? AND remaining_quantity>0
      ORDER BY created_at,id FOR UPDATE`,
      [item.id],
    );
    let remaining = item.ordered;
    for (const good of goods) {
      if (!remaining) break;
      const quantity = Math.min(remaining, good.remaining_quantity);
      const line = { id: randomUUID(), goodId: good.id, quantity };
      const [updated] = await db.execute<ResultSetHeader>(
        `UPDATE finished_goods SET remaining_quantity=remaining_quantity-?,
        dispatched_quantity=dispatched_quantity+?,version=version+1 WHERE id=? AND remaining_quantity>=?`,
        [quantity, quantity, good.id, quantity],
      );
      if (updated.affectedRows !== 1)
        throw conflict("INSUFFICIENT_STOCK", "Tồn khả dụng không đủ.");
      await db.execute(
        `INSERT INTO warehouse_dispatch_items(id,dispatch_id,good_id,sales_item_id,product_name,quantity)
        VALUES(?,?,?,?,?,?)`,
        [line.id, id, line.goodId, item.id, item.name, quantity],
      );
      await movement(db, line, "DISPATCHED", -quantity, actor);
      remaining -= quantity;
    }
    if (remaining)
      throw conflict("INSUFFICIENT_STOCK", "Tồn khả dụng không đủ.");
  }
  await reconcileOrder(db, orderId, actor, "Xuất kho nguyên đơn");
  return { id, version: 1 };
}

async function sourceDispatch(db: PoolConnection, id: string, version: number) {
  const [d] = await rows(
    db,
    "SELECT * FROM warehouse_dispatches WHERE id=? FOR UPDATE",
    [id],
  );
  if (!d) throw missing();
  fresh(d.version, version);
  if (d.status !== "DISPATCHED")
    throw conflict("INVALID_STATUS", "Phiếu xuất đã kết thúc.");
  const [shipment] = await rows(
    db,
    "SELECT id FROM shipments WHERE dispatch_id=? AND active_slot=1",
    [id],
  );
  if (shipment)
    throw conflict(
      "ACTIVE_SHIPMENT",
      "Phiếu xuất đã có vận đơn. Xử lý trên vận đơn hiện tại.",
    );
  return d;
}

async function shipmentEvent(
  db: PoolConnection,
  id: string,
  version: number,
  action: string,
  status: string,
  note: string,
  actor: User,
) {
  await db.execute(
    `INSERT INTO shipment_history(shipment_id,version,action,status,note,actor_id,actor_name)
    VALUES(?,?,?,?,?,?,?)`,
    [id, version, action, status, note, actor.id, actor.name],
  );
}

async function inspectReturn(
  db: PoolConnection,
  s: RowDataPacket,
  input: Extract<LogisticsInput, { action: "inspect-return" }>,
  actor: User,
) {
  if (s.status !== "RETURNED" || s.dispatch_status !== "DISPATCHED")
    throw conflict(
      "INVALID_STATUS",
      "Chỉ kiểm tra lô đã nhận hoàn và còn hiệu lực.",
    );
  const [prior] = await rows(
    db,
    "SELECT 1 FROM shipment_returns WHERE shipment_id=? LIMIT 1",
    [s.id],
  );
  if (prior) throw conflict("RETURN_INSPECTED", "Hàng hoàn đã được kiểm tra.");
  const lines = await dispatchLines(db, s.dispatch_id);
  const results = new Map(
    input.lines.map((line) => [line.lineId, line.disposition]),
  );
  if (
    !lines.length ||
    input.lines.length !== lines.length ||
    results.size !== lines.length ||
    lines.some((line) => !results.has(line.id))
  )
    throw conflict(
      "RETURN_LINES_MISMATCH",
      "Cần kết quả kiểm tra cho từng dòng trong phiếu xuất.",
    );
  for (const l of lines) {
    const disposition = results.get(l.id)!;
    const delta = disposition === "RESTOCKED" ? l.quantity : 0;
    await db.execute(
      `INSERT INTO shipment_returns(shipment_id,dispatch_item_id,quantity,disposition,note,actor_id,actor_name)
      VALUES(?,?,?,?,?,?,?)`,
      [s.id, l.id, l.quantity, disposition, input.note, actor.id, actor.name],
    );
    await db.execute(
      `UPDATE finished_goods SET remaining_quantity=remaining_quantity+?,returned_quantity=returned_quantity+?,
      restocked_quantity=restocked_quantity+?,version=version+1 WHERE id=?`,
      [delta, l.quantity, delta, l.good_id],
    );
    await movement(
      db,
      { id: l.id, goodId: l.good_id, quantity: l.quantity },
      disposition,
      delta,
      actor,
      s.id,
    );
  }
  if ([...results.values()].every((value) => value === "RESTOCKED")) {
    await db.execute(
      "UPDATE warehouse_dispatches SET status='RESTOCKED',version=version+1 WHERE id=?",
      [s.dispatch_id],
    );
  }
}

export async function actLogistics(
  db: PoolConnection,
  id: string,
  input: LogisticsInput,
  actor: User,
) {
  if (input.action === "dispatch") return dispatch(db, id, input, actor);
  if (
    input.action === "reverse-dispatch" ||
    input.action === "create-shipment"
  ) {
    const d = await sourceDispatch(db, id, input.version);
    if (input.action === "reverse-dispatch") {
      for (const l of await dispatchLines(db, id)) {
        await db.execute(
          "UPDATE finished_goods SET remaining_quantity=remaining_quantity+?,version=version+1 WHERE id=?",
          [l.quantity, l.good_id],
        );
        await movement(
          db,
          { id: l.id, goodId: l.good_id, quantity: l.quantity },
          "REVERSED",
          l.quantity,
          actor,
        );
      }
      await db.execute(
        "UPDATE warehouse_dispatches SET status='REVERSED',version=version+1 WHERE id=?",
        [id],
      );
      await reconcileOrder(
        db,
        d.order_id,
        actor,
        "Đảo phiếu xuất trước khi bàn giao",
      );
      return { id, version: d.version + 1 };
    }
    const shipmentId = randomUUID();
    const code = await businessCode(db, "shipments");
    await db.execute(
      `INSERT INTO shipments(id,code,dispatch_id,receiver_name,receiver_phone,address,carrier,tracking_code,note,packages,weight_grams,cod_amount,actor_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        shipmentId,
        code,
        id,
        input.receiverName,
        input.receiverPhone,
        input.address,
        input.carrier,
        input.trackingCode,
        input.note,
        input.packages,
        input.weightGrams,
        input.codAmount,
        actor.id,
      ],
    );
    await db.execute(
      "UPDATE warehouse_dispatches SET version=version+1 WHERE id=?",
      [id],
    );
    await shipmentEvent(
      db,
      shipmentId,
      1,
      input.action,
      "READY",
      input.note,
      actor,
    );
    await reconcileOrder(db, d.order_id, actor, "Tạo vận đơn từ phiếu xuất");
    return { id: shipmentId, version: 1 };
  }

  const [s] = await rows(
    db,
    `SELECT s.*,d.order_id,d.status AS dispatch_status FROM shipments s
    JOIN warehouse_dispatches d ON d.id=s.dispatch_id WHERE s.id=? FOR UPDATE`,
    [id],
  );
  if (!s) throw missing();
  fresh(s.version, input.version);
  let status = s.status as string;
  if (input.action === "inspect-return") {
    await inspectReturn(db, s, input, actor);
  } else {
    const transition = SHIPMENT_ACTIONS[input.action];
    if (
      s.dispatch_status !== "DISPATCHED" ||
      !(transition.from as readonly string[]).includes(status)
    )
      throw conflict(
        "INVALID_SHIPMENT_TRANSITION",
        "Vận đơn không ở trạng thái phù hợp với thao tác này.",
      );
    status = transition.target;
  }
  const version = s.version + 1;
  await db.execute("UPDATE shipments SET status=?,version=? WHERE id=?", [
    status,
    version,
    id,
  ]);
  await shipmentEvent(db, id, version, input.action, status, input.note, actor);
  await reconcileOrder(
    db,
    s.order_id,
    actor,
    "Cập nhật vận chuyển và hàng hoàn",
  );
  return { id, version };
}
