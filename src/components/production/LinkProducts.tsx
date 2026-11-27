import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Page } from "../../../shared/contracts";
import type {
  ProductionDetail,
  DesignerItem,
} from "../../../shared/production";
import { api } from "../../services/api";
import { endpoint, SearchBox, useSearch } from "../business/common";
import { FormField, Message } from "../common";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function LinkProducts({
  detail,
  disabled,
  submit,
}: {
  detail: ProductionDetail;
  disabled: boolean;
  submit: (fields: Record<string, unknown>) => void;
}) {
  const { search, setSearch, debounced } = useSearch();
  const [target, setTarget] = useState(detail.order.items[0]?.id ?? "");
  const [links, setLinks] = useState<
    { salesItemId: string; quantity: number; kind: "OUTPUT" | "TRACE" }[]
  >([{ salesItemId: "", quantity: 0, kind: "OUTPUT" }]);
  const products = useQuery({
    queryKey: ["designer_queue", "late-link", debounced],
    queryFn: () =>
      api<Page<DesignerItem>>(
        endpoint("designer-queue", { search: debounced, pageSize: 100 }),
      ),
  });
  const selected = detail.order.items.find((i) => i.id === target);
  const update = (index: number, value: Partial<(typeof links)[number]>) =>
    setLinks((s) => s.map((v, n) => (index === n ? { ...v, ...value } : v)));
  return (
    <details>
      <summary>Liên kết sản phẩm bán hàng</summary>
      <form
        className="form-stack production-inner"
        onSubmit={(e) => {
          e.preventDefault();
          submit({
            items: [
              {
                productionItemId: target,
                allocations: links.map((l) => ({
                  ...l,
                  id: crypto.randomUUID(),
                  sourceAllocationId: null,
                })),
              },
            ],
          });
        }}
      >
        <p className="production-hint">
          Liên kết trước hoặc sau in. Phân bổ sản lượng cần đúng tổng số túi của
          sản phẩm; liên kết truy xuất dùng số lượng 0.
        </p>
        <FormField id="link-production-item" label="Sản phẩm trong lệnh">
          <select
            id="link-production-item"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {detail.order.items.map((i) => (
              <option value={i.id} key={i.id}>
                {i.productName} · {i.quantity} túi
              </option>
            ))}
          </select>
        </FormField>
        <SearchBox
          label="Tìm nguồn sản phẩm bán hàng"
          value={search}
          onChange={setSearch}
        />
        {links.map((l, index) => (
          <fieldset className="production-item form-stack" key={index}>
            <legend>Nguồn {index + 1}</legend>
            <FormField id={"link-sales-" + index} label="Sản phẩm nguồn">
              <select
                id={"link-sales-" + index}
                required
                value={l.salesItemId}
                onChange={(e) => {
                  const s = products.data?.items.find(
                    (i) => i.id === e.target.value,
                  );
                  update(index, {
                    salesItemId: e.target.value,
                    quantity:
                      l.kind === "TRACE"
                        ? 0
                        : Math.min(
                            selected?.quantity ?? 0,
                            s?.remainingQuantity ?? 0,
                          ),
                  });
                }}
              >
                <option value="">Chọn sản phẩm</option>
                {l.salesItemId &&
                  !products.data?.items.some((i) => i.id === l.salesItemId) && (
                    <option value={l.salesItemId}>Sản phẩm đã chọn</option>
                  )}
                {products.data?.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.salesCode} · {i.productName} · {i.remainingQuantity} túi
                    còn lại
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id={"link-kind-" + index} label="Ý nghĩa liên kết">
              <select
                id={"link-kind-" + index}
                value={l.kind}
                onChange={(e) =>
                  update(index, {
                    kind: e.target.value as "OUTPUT" | "TRACE",
                    quantity: 0,
                  })
                }
              >
                <option value="OUTPUT">Phân bổ sản lượng</option>
                <option value="TRACE">Chỉ truy xuất</option>
              </select>
            </FormField>
            <FormField id={"link-quantity-" + index} label="Túi phân bổ">
              <Input
                id={"link-quantity-" + index}
                type="number"
                min={l.kind === "TRACE" ? 0 : 1}
                max={1000000000}
                required
                disabled={l.kind === "TRACE"}
                value={l.quantity}
                onChange={(e) =>
                  update(index, { quantity: Number(e.target.value) })
                }
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              disabled={links.length === 1}
              onClick={() => setLinks((s) => s.filter((_, n) => n !== index))}
            >
              Bỏ nguồn
            </Button>
          </fieldset>
        ))}
        {products.error && <Message>{products.error.message}</Message>}
        <Button
          type="button"
          variant="outline"
          disabled={links.length >= 30}
          onClick={() =>
            setLinks((s) => [
              ...s,
              { salesItemId: "", quantity: 0, kind: "OUTPUT" },
            ])
          }
        >
          Thêm nguồn
        </Button>
        <Button
          disabled={disabled || !target || links.some((l) => !l.salesItemId)}
        >
          Xác nhận liên kết sản phẩm
        </Button>
      </form>
    </details>
  );
}
