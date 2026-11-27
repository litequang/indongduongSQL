import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { canEditSales } from "../../../shared/business";
import {
  DISPOSITIONS,
  METHODS,
  METHOD_LABELS,
  SHIPMENT_ACTIONS,
  type DispatchDetail,
  type DispatchEntry,
  type DispatchLine,
  type OrderProgress,
  type ShipmentDetail,
  type ShipmentEntry,
  type StockDetail,
  type StockEntry,
} from "../../../shared/fulfillment";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { Button } from "../ui/button";
import { FormField, Message, PageHeader, ResponsiveDialog } from "../common";
import {
  BusinessDetail,
  BusinessFields,
  dateTime,
  localNumber,
} from "../business/common";
import { IssueRows, IssuesInbox, issueCommand } from "./Issues";
import { ProductChecklist } from "./Progress";
import {
  CommandButtons,
  CommandForm,
  LABELS,
  NoteField,
  NumberField,
  TextField,
  WorkflowBadge,
  WorkflowHistory,
  WorkflowList,
  field,
  withNote,
  type Command,
} from "./common";

const stockColumns: ColumnDef<StockEntry, unknown>[] = [
  { accessorKey: "productName", header: "Thành phẩm", enableSorting: false },
  {
    accessorKey: "customerName",
    header: "Khách hàng",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        {row.original.customerName}
        <br />
        <small>{row.original.salesCode}</small>
      </>
    ),
  },
  { accessorKey: "productionCode", header: "Lệnh nguồn", enableSorting: false },
  {
    accessorKey: "accepted",
    header: "Nhập",
    enableSorting: false,
    cell: ({ row }) => localNumber(row.original.accepted ?? 0),
  },
  {
    accessorKey: "dispatched",
    header: "Đã xuất",
    enableSorting: false,
    cell: ({ row }) => localNumber(row.original.dispatched),
  },
  {
    accessorKey: "remaining",
    header: "Còn lại",
    enableSorting: false,
    cell: ({ row }) => <strong>{localNumber(row.original.remaining)}</strong>,
  },
];
const orderColumns: ColumnDef<OrderProgress, unknown>[] = [
  { accessorKey: "code", header: "Đơn bán", enableSorting: false },
  { accessorKey: "customerName", header: "Khách hàng", enableSorting: false },
  {
    accessorKey: "status",
    header: "Trạng thái",
    enableSorting: false,
    cell: ({ row }) => (
      <WorkflowBadge
        status={
          row.original.canDispatch
            ? "READY_TO_SHIP"
            : (row.original.dispatchStatus ?? row.original.status)
        }
      />
    ),
  },
  {
    id: "readiness",
    header: "Đủ hàng",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        {row.original.products.filter((p) => p.available >= p.ordered).length} /{" "}
        {row.original.products.length} sản phẩm
      </>
    ),
  },
];
const dispatchColumns: ColumnDef<DispatchEntry, unknown>[] = [
  { accessorKey: "code", header: "Phiếu xuất", enableSorting: false },
  { accessorKey: "salesCode", header: "Đơn bán", enableSorting: false },
  { accessorKey: "customerName", header: "Khách hàng", enableSorting: false },
  {
    accessorKey: "method",
    header: "Phương thức",
    enableSorting: false,
    cell: ({ row }) => METHOD_LABELS[row.original.method],
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    enableSorting: false,
    cell: ({ row }) => <WorkflowBadge status={row.original.status} />,
  },
  {
    accessorKey: "createdAt",
    header: "Thời điểm xuất",
    enableSorting: false,
    cell: ({ row }) => dateTime(row.original.createdAt),
  },
];
const shipmentColumns: ColumnDef<ShipmentEntry, unknown>[] = [
  { accessorKey: "code", header: "Vận đơn", enableSorting: false },
  { accessorKey: "dispatchCode", header: "Phiếu xuất", enableSorting: false },
  { accessorKey: "receiverName", header: "Người nhận", enableSorting: false },
  { accessorKey: "trackingCode", header: "Mã theo dõi", enableSorting: false },
  {
    accessorKey: "status",
    header: "Trạng thái",
    enableSorting: false,
    cell: ({ row }) => <WorkflowBadge status={row.original.status} />,
  },
];
const shipmentStatuses = [
  "READY",
  ...new Set(Object.values(SHIPMENT_ACTIONS).map((value) => value.target)),
];

function Summary({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <div className="business-mobile-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {status && <WorkflowBadge status={status} />}
    </div>
  );
}

type Selection = {
  kind: "stock" | "order" | "dispatch" | "shipment";
  id: string;
  title: string;
};
export function Logistics({ shipping }: { shipping: boolean }) {
  const [tab, setTab] = useState(shipping ? "waiting" : "stock");
  const [selected, setSelected] = useState<Selection | null>(null);
  const tabs = shipping
    ? [
        { id: "waiting", label: "Chờ tạo vận đơn" },
        { id: "shipments", label: "Vận đơn" },
      ]
    : [
        { id: "stock", label: "Thành phẩm" },
        { id: "queue", label: "Sẵn sàng xuất" },
        { id: "dispatches", label: "Phiếu xuất" },
      ];
  const choose = (kind: Selection["kind"], id: string, title: string) =>
    setSelected({ kind, id, title });
  return (
    <>
      <PageHeader
        title={shipping ? "Giao hàng" : "Kho thành phẩm"}
        description={
          shipping
            ? "Tạo vận đơn từ phiếu xuất, cập nhật giao nhận và kiểm tra hàng hoàn."
            : "Tra cứu tồn theo nguồn sản lượng, kiểm tra đủ hàng và xuất nguyên đơn."
        }
      />
      <nav
        className="business-inline fulfillment-tabs"
        aria-label={shipping ? "Phân hệ giao hàng" : "Phân hệ kho"}
      >
        {tabs.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      {tab === "stock" && (
        <WorkflowList
          path="finished-goods"
          label="lô thành phẩm"
          statuses={["AVAILABLE", "DEPLETED"]}
          columns={stockColumns}
          select={(entry) => choose("stock", entry.id, entry.productName)}
          render={(entry) => (
            <Summary
              title={entry.productName}
              description={
                entry.customerName +
                " · " +
                entry.productionCode +
                " · Nhập " +
                localNumber(entry.accepted ?? 0) +
                " · Xuất " +
                localNumber(entry.dispatched) +
                " · Còn " +
                localNumber(entry.remaining)
              }
              status={entry.remaining ? "AVAILABLE" : "DEPLETED"}
            />
          )}
        />
      )}
      {tab === "queue" && (
        <WorkflowList
          path="dispatch-queue"
          label="đơn"
          columns={orderColumns}
          statuses={[
            "READY_TO_SHIP",
            "CONFIRMED",
            "DESIGNING",
            "IN_PRODUCTION",
            "FULFILLING",
            "PRODUCTION_COMPLETED",
          ]}
          select={(entry) => choose("order", entry.id, entry.code)}
          render={(entry) => (
            <Summary
              title={entry.code}
              description={entry.customerName}
              status={entry.dispatchStatus ?? entry.status}
            />
          )}
        />
      )}
      {(tab === "dispatches" || tab === "waiting") && (
        <WorkflowList
          key={tab}
          path="warehouse-dispatches"
          label="phiếu"
          initialStatus={tab === "waiting" ? "AWAITING_SHIPMENT" : undefined}
          statuses={
            tab === "dispatches"
              ? ["DISPATCHED", "REVERSED", "RESTOCKED"]
              : undefined
          }
          columns={dispatchColumns}
          select={(entry) => choose("dispatch", entry.id, entry.code)}
          render={(entry) => (
            <Summary
              title={entry.code}
              description={entry.customerName + " · " + entry.salesCode}
              status={entry.status}
            />
          )}
        />
      )}
      {tab === "shipments" && (
        <WorkflowList
          path="shipments"
          label="vận đơn"
          statuses={shipmentStatuses}
          columns={shipmentColumns}
          searchLabel="Tìm theo mã, người nhận hoặc mã theo dõi"
          select={(entry) => choose("shipment", entry.id, entry.code)}
          render={(entry) => (
            <Summary
              title={entry.code}
              description={entry.receiverName + " · " + entry.dispatchCode}
              status={entry.status}
            />
          )}
        />
      )}
      {!shipping && <IssuesInbox stage="WAREHOUSE" />}
      {selected && (
        <ResponsiveDialog
          open
          wide
          title={selected.title}
          description={
            {
              stock: "Chi tiết thành phẩm",
              order: "Kiểm tra trước khi xuất",
              dispatch: "Chi tiết phiếu xuất",
              shipment: "Theo dõi vận đơn",
            }[selected.kind]
          }
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          {selected.kind === "stock" && (
            <StockPane key={selected.id} id={selected.id} />
          )}
          {selected.kind === "order" && (
            <OrderPane
              key={selected.id}
              id={selected.id}
              onDispatch={(id) => choose("dispatch", id, "Phiếu xuất mới")}
            />
          )}
          {selected.kind === "dispatch" && (
            <DispatchPane
              key={selected.id}
              id={selected.id}
              onShipment={(id) => choose("shipment", id, "Vận đơn")}
            />
          )}
          {selected.kind === "shipment" && (
            <ShipmentPane key={selected.id} id={selected.id} />
          )}
        </ResponsiveDialog>
      )}
    </>
  );
}

function StockPane({ id }: { id: string }) {
  const { user } = useAuth();
  const [command, setCommand] = useState<Command | null>(null);
  const detail = useQuery({
    queryKey: ["fulfillment", "stock", id],
    queryFn: () => api<StockDetail>("/finished-goods/" + id),
  });
  const entry = detail.data?.entry;
  return (
    <BusinessDetail loading={detail.isPending} error={detail.error}>
      {entry && detail.data && (
        <div className="business-form">
          <BusinessFields
            items={[
              { label: "Khách hàng", value: entry.customerName },
              { label: "Đơn bán", value: entry.salesCode },
              {
                label: "Lệnh nguồn",
                value: (
                  <a
                    className="fulfillment-link"
                    href={"#production/" + entry.productionId}
                  >
                    {entry.productionCode}
                  </a>
                ),
              },
              { label: "Nhập đạt", value: localNumber(entry.accepted ?? 0) },
              { label: "Không đạt", value: localNumber(entry.rejected ?? 0) },
              { label: "Thiếu", value: localNumber(entry.short ?? 0) },
              { label: "Đã xuất lũy kế", value: localNumber(entry.dispatched) },
              {
                label: "Đã trả / nhập lại",
                value:
                  localNumber(entry.returned) +
                  " / " +
                  localNumber(entry.restocked),
              },
              {
                label: "Tồn khả dụng",
                value: <strong>{localNumber(entry.remaining)} túi</strong>,
              },
              {
                label: "Người nghiệm thu",
                value: detail.data.acceptance?.actorName,
              },
              {
                label: "Ghi chú nghiệm thu",
                value: detail.data.acceptance?.note,
              },
            ]}
          />
          {command ? (
            <CommandForm
              key={command.action}
              command={command}
              onClose={() => setCommand(null)}
              onSuccess={() => setCommand(null)}
            />
          ) : (
            (user?.role === "WAREHOUSE" || canEditSales(user!.role)) && (
              <CommandButtons
                commands={[issueCommand(id, "WAREHOUSE")]}
                setCommand={setCommand}
              />
            )
          )}
          {detail.data.issues.length > 0 && (
            <IssueRows issues={detail.data.issues} onCommand={setCommand} />
          )}
          <section className="business-subsection">
            <h3>Lịch sử biến động</h3>
            <ul className="fulfillment-entries">
              {detail.data.movements.map((m) => (
                <li key={m.id}>
                  <strong>
                    {LABELS[m.kind] ?? m.kind} · {localNumber(m.quantity)} túi
                  </strong>
                  <p>
                    Tồn {m.delta > 0 ? "+" : ""}
                    {localNumber(m.delta)} · {m.actorName} ·{" "}
                    {dateTime(m.createdAt)}
                  </p>
                  {(m.dispatchCode || m.shipmentCode) && (
                    <small>
                      {[m.dispatchCode, m.shipmentCode]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </BusinessDetail>
  );
}

function MethodField() {
  const id = useId();
  return (
    <FormField id={id} label="Phương thức giao hàng">
      <select id={id} name="method">
        {METHODS.map((method) => (
          <option key={method} value={method}>
            {METHOD_LABELS[method]}
          </option>
        ))}
      </select>
    </FormField>
  );
}
function OrderPane({
  id,
  onDispatch,
}: {
  id: string;
  onDispatch: (id: string) => void;
}) {
  const { user } = useAuth();
  const [command, setCommand] = useState<Command | null>(null);
  const detail = useQuery({
    queryKey: ["fulfillment", "order", id],
    queryFn: () => api<OrderProgress>("/sales-orders/" + id + "/progress"),
  });
  const entry = detail.data;
  return (
    <BusinessDetail loading={detail.isPending} error={detail.error}>
      {entry && (
        <div className="business-form">
          <div className="business-inline">
            <strong>{entry.customerName}</strong>
            <WorkflowBadge status={entry.dispatchStatus ?? entry.status} />
          </div>
          {command ? (
            <CommandForm
              command={command}
              onClose={() => setCommand(null)}
              onSuccess={() => setCommand(null)}
            />
          ) : (
            <>
              <ProductChecklist order={entry} />
              {entry.dispatchStatus ? (
                <Message>Đơn đã có phiếu xuất hiệu lực.</Message>
              ) : !entry.canDispatch ? (
                <Message>
                  Cần đủ tồn khả dụng cho từng sản phẩm còn hiệu lực.
                </Message>
              ) : (
                user?.role === "WAREHOUSE" && (
                  <CommandButtons
                    setCommand={setCommand}
                    commands={[
                      {
                        path: "sales-orders/" + id,
                        action: "dispatch",
                        version: entry.version,
                        fields: (
                          <>
                            <ProductChecklist order={entry} confirm />
                            <MethodField />
                            <TextField
                              label="Địa chỉ giao hàng"
                              name="address"
                              defaultValue={entry.customerAddress}
                              required
                              maxLength={500}
                            />
                            <NoteField />
                          </>
                        ),
                        data: (form) => ({
                          method: field(form, "method"),
                          address: field(form, "address"),
                          ...withNote(form),
                        }),
                        onSuccess: (result) => onDispatch(result.id),
                      },
                    ]}
                  />
                )
              )}
            </>
          )}
        </div>
      )}
    </BusinessDetail>
  );
}

function DispatchLines({ lines }: { lines: DispatchLine[] }) {
  return (
    <ul className="fulfillment-entries">
      {lines.map((line) => (
        <li key={line.id}>
          <strong>
            {line.productName} · {localNumber(line.quantity)} túi
          </strong>
          <p>{line.productionCode}</p>
        </li>
      ))}
    </ul>
  );
}

function DispatchPane({
  id,
  onShipment,
}: {
  id: string;
  onShipment: (id: string) => void;
}) {
  const { user } = useAuth();
  const [command, setCommand] = useState<Command | null>(null);
  const detail = useQuery({
    queryKey: ["fulfillment", "dispatch", id],
    queryFn: () => api<DispatchDetail>("/warehouse-dispatches/" + id),
  });
  const entry = detail.data?.entry;
  const commands: Command[] = [];
  const path = "warehouse-dispatches/" + id;
  if (entry?.status === "DISPATCHED" && !entry.shipmentId) {
    if (user?.role === "WAREHOUSE")
      commands.push({
        path,
        action: "reverse-dispatch",
        version: entry.version,
        fields: <NoteField required label="Lý do đảo phiếu" />,
        data: withNote,
      });
    if (canEditSales(user!.role))
      commands.push({
        path,
        action: "create-shipment",
        version: entry.version,
        fields: (
          <>
            <TextField
              name="receiverName"
              label="Người nhận"
              defaultValue={entry.customerName}
              required
            />
            <TextField
              name="receiverPhone"
              label="Điện thoại người nhận"
              defaultValue={entry.customerPhone}
              required
              maxLength={50}
            />
            <TextField
              name="address"
              label="Địa chỉ nhận"
              defaultValue={entry.address}
              required
              maxLength={500}
            />
            <TextField name="carrier" label="Đơn vị vận chuyển" />
            <TextField name="trackingCode" label="Mã theo dõi" />
            <div className="fulfillment-counts">
              <NumberField name="packages" label="Số kiện" value={1} min={1} />
              <NumberField name="weightGrams" label="Khối lượng (g)" />
              <NumberField name="codAmount" label="Thu hộ (đồng)" />
            </div>
            <NoteField />
          </>
        ),
        data: (form) => ({
          receiverName: field(form, "receiverName"),
          receiverPhone: field(form, "receiverPhone"),
          address: field(form, "address"),
          carrier: field(form, "carrier"),
          trackingCode: field(form, "trackingCode"),
          packages: Number(field(form, "packages")),
          weightGrams: Number(field(form, "weightGrams")),
          codAmount: Number(field(form, "codAmount")),
          ...withNote(form),
        }),
        onSuccess: (result) => onShipment(result.id),
      });
  }
  return (
    <BusinessDetail loading={detail.isPending} error={detail.error}>
      {entry && detail.data && (
        <div className="business-form">
          <div className="business-inline">
            <strong>{entry.code}</strong>
            <WorkflowBadge status={entry.status} />
          </div>
          <BusinessFields
            items={[
              { label: "Đơn bán", value: entry.salesCode },
              { label: "Khách hàng", value: entry.customerName },
              { label: "Địa chỉ giao", value: entry.address },
              { label: "Phương thức", value: METHOD_LABELS[entry.method] },
              { label: "Người xuất", value: entry.actorName },
              { label: "Thời điểm xuất", value: dateTime(entry.createdAt) },
              { label: "Ghi chú", value: entry.note },
            ]}
          />
          <section className="business-subsection">
            <h3>Sản phẩm đã xuất</h3>
            <DispatchLines lines={detail.data.lines} />
          </section>
          {detail.data.history.length > 0 && (
            <WorkflowHistory history={detail.data.history} />
          )}
          {entry.shipmentId && (
            <div>
              <Button
                variant="outline"
                onClick={() => onShipment(entry.shipmentId!)}
              >
                Xem vận đơn
              </Button>
            </div>
          )}
          {command ? (
            <CommandForm
              key={command.action}
              command={command}
              onClose={() => setCommand(null)}
              onSuccess={() => setCommand(null)}
            />
          ) : (
            <CommandButtons commands={commands} setCommand={setCommand} />
          )}
        </div>
      )}
    </BusinessDetail>
  );
}

function ReturnFields({ lines }: { lines: DispatchLine[] }) {
  const id = useId();
  return (
    <>
      <p>
        Kiểm tra thực tế toàn bộ hàng hoàn. Chỉ dòng đủ điều kiện được cộng tồn
        khả dụng.
      </p>
      {lines.map((line, index) => (
        <FormField
          key={line.id}
          id={id + index}
          label={
            line.productName +
            " · " +
            localNumber(line.quantity) +
            " túi · " +
            line.productionCode
          }
        >
          <select id={id + index} name={line.id} required defaultValue="">
            <option value="" disabled>
              Chọn kết quả kiểm tra
            </option>
            {DISPOSITIONS.map((disposition) => (
              <option key={disposition} value={disposition}>
                {LABELS[disposition]}
              </option>
            ))}
          </select>
        </FormField>
      ))}
      <NoteField required label="Lý do và tình trạng hàng" />
    </>
  );
}

function ShipmentPane({ id }: { id: string }) {
  const { user } = useAuth();
  const [command, setCommand] = useState<Command | null>(null);
  const detail = useQuery({
    queryKey: ["fulfillment", "shipment", id],
    queryFn: () => api<ShipmentDetail>("/shipments/" + id),
  });
  const entry = detail.data?.entry;
  const commands: Command[] = [];
  const path = "shipments/" + id;
  if (entry && detail.data && canEditSales(user!.role)) {
    for (const [action, transition] of Object.entries(SHIPMENT_ACTIONS)) {
      if (!(transition.from as readonly string[]).includes(entry.status))
        continue;
      commands.push({
        path,
        action,
        version: entry.version,
        fields: (
          <NoteField
            required={[
              "fail-delivery",
              "start-return",
              "cancel-shipment",
            ].includes(action)}
          />
        ),
        data: withNote,
      });
    }
    if (entry.status === "RETURNED" && !detail.data.returns.length) {
      const { lines } = detail.data;
      commands.push({
        path,
        action: "inspect-return",
        version: entry.version,
        fields: <ReturnFields lines={lines} />,
        data: (form) => ({
          lines: lines.map((line) => ({
            lineId: line.id,
            disposition: field(form, line.id),
          })),
          ...withNote(form),
        }),
      });
    }
  }
  return (
    <BusinessDetail loading={detail.isPending} error={detail.error}>
      {entry && detail.data && (
        <div className="business-form">
          <div className="business-inline">
            <strong>{entry.code}</strong>
            <WorkflowBadge status={entry.status} />
          </div>
          <BusinessFields
            items={[
              { label: "Phiếu xuất", value: entry.dispatchCode },
              { label: "Đơn bán", value: entry.salesCode },
              { label: "Người nhận", value: entry.receiverName },
              { label: "Điện thoại", value: entry.receiverPhone },
              { label: "Địa chỉ", value: entry.address },
              { label: "Phương thức", value: METHOD_LABELS[entry.method] },
              { label: "Đơn vị vận chuyển", value: entry.carrier },
              { label: "Mã theo dõi", value: entry.trackingCode },
              { label: "Số kiện", value: localNumber(entry.packages) },
              { label: "Ghi chú", value: entry.note },
            ]}
          />
          {entry.status === "RETURNED" && !detail.data.returns.length && (
            <Message>
              Đã nhận hàng hoàn · chờ kiểm tra trước khi nhập lại kho.
            </Message>
          )}
          {command ? (
            <CommandForm
              key={command.action}
              command={command}
              onClose={() => setCommand(null)}
              onSuccess={() => setCommand(null)}
            />
          ) : (
            <CommandButtons commands={commands} setCommand={setCommand} />
          )}
          {detail.data.returns.length > 0 && (
            <section className="business-subsection">
              <h3>Kết quả kiểm tra hàng hoàn</h3>
              <ul className="fulfillment-entries">
                {detail.data.returns.map((r) => (
                  <li key={r.lineId}>
                    <strong>
                      {
                        detail.data?.lines.find((line) => line.id === r.lineId)
                          ?.productName
                      }{" "}
                      · {localNumber(r.quantity)} túi
                    </strong>
                    <p>
                      {LABELS[r.disposition]} · {r.actorName} ·{" "}
                      {dateTime(r.createdAt)}
                    </p>
                    <p>{r.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="business-subsection">
            <h3>Lịch sử vận chuyển</h3>
            <WorkflowHistory history={detail.data.history} />
          </section>
        </div>
      )}
    </BusinessDetail>
  );
}
