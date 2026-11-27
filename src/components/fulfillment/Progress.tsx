import { Check, Circle, Clock3 } from "lucide-react";
import type {
  OrderProgress,
  ProductProgress,
} from "../../../shared/fulfillment";
import { BusinessDetail, localNumber } from "../business/common";

export function ProgressPanel({
  order,
  loading,
  error,
}: {
  order?: OrderProgress;
  loading: boolean;
  error: Error | null;
}) {
  return (
    <section className="business-subsection">
      <h3>Tiến độ xử lý đơn</h3>
      <BusinessDetail loading={loading} error={error}>
        {order && <OrderStepper order={order} />}
      </BusinessDetail>
    </section>
  );
}

function OrderStepper({ order }: { order: OrderProgress }) {
  const active = order.products;
  const full = (predicate: (item: ProductProgress) => boolean) =>
    active.length > 0 && active.every(predicate);
  const shipped = order.dispatchStatus === "DISPATCHED";
  const delivered = order.shipmentStatus === "DELIVERED";
  const steps = [
    ["Đơn bán", !["DRAFT", "CANCELLED"].includes(order.status)],
    ["Thiết kế", full((p) => !p.requiresProduction || p.designReady)],
    ["In", full((p) => !p.requiresProduction || p.printed >= p.ordered)],
    ["Gia công", full((p) => p.checkedFinishing >= p.ordered)],
    ["Kho", full((p) => p.accepted >= p.ordered)],
    ["Xuất hàng", shipped],
    ["Giao hàng", delivered],
  ] as const;
  const current = steps.findIndex(([, done]) => !done);
  return (
    <ol className="fulfillment-stepper" aria-label="Các mốc của đơn hàng">
      {steps.map(([label, done], index) => {
        const Icon = done ? Check : current === index ? Clock3 : Circle;
        return (
          <li
            key={label}
            className={done ? "done" : current === index ? "current" : ""}
            aria-current={current === index ? "step" : undefined}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
            <span className="sr-only">{done ? "đã xong" : "đang chờ"}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ProductChecklist({
  order,
  confirm = false,
}: {
  order: OrderProgress;
  confirm?: boolean;
}) {
  return (
    <ul className="fulfillment-entries">
      {order.products.map((item) => {
        const ready =
          item.available >= item.ordered && item.status === "WAREHOUSE_READY";
        return (
          <li key={item.id}>
            <div className="business-inline">
              {confirm ? (
                <label className="fulfillment-check">
                  <input type="checkbox" required name={"checked-" + item.id} />{" "}
                  {item.name} · {localNumber(item.ordered)} túi
                </label>
              ) : (
                <strong>{item.name}</strong>
              )}
              {!confirm &&
                (item.dispatched ? (
                  <span className="status-badge positive">
                    Đã xuất {localNumber(item.dispatched)} túi
                  </span>
                ) : ready ? (
                  <span className="status-badge positive">Đủ hàng</span>
                ) : null)}
            </div>
            <ProductMetrics item={item} />
          </li>
        );
      })}
    </ul>
  );
}

export function ProductMetrics({ item }: { item: ProductProgress }) {
  return (
    <>
      {" "}
      <p>
        Đặt {localNumber(item.ordered)} · Phân bổ {localNumber(item.allocated)}{" "}
        · In bàn giao {localNumber(item.printed)} · Đạt{" "}
        {localNumber(item.accepted)} · Còn {localNumber(item.available)}
      </p>
      {(item.rejected > 0 || item.short > 0) && (
        <p>
          Không đạt {localNumber(item.rejected)} · Thiếu{" "}
          {localNumber(item.short)}
        </p>
      )}
      {item.replacementPending > 0 && (
        <p>In lại chờ chính sách {localNumber(item.replacementPending)}</p>
      )}
      {item.reason && !item.dispatched && <p>{item.reason}</p>}
    </>
  );
}
