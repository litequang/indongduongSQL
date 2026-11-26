import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { Plus, Trash2 } from "lucide-react";
import {
  canCreateSales,
  canEditSales,
  canForceReopenSales,
  SALES_STATUSES,
  SALES_STATUS_LABELS,
  salesFields,
  type SalesHistory,
  type SalesInput,
  type SalesItem,
  type SalesItemInput,
  type SalesOrder,
  type DesignVersion,
  type SavedDesign,
} from "../../../shared/business";
import type { AuditEntry, Page } from "../../../shared/contracts";
import { useAuth } from "../../context/AuthContext";
import { useConfig } from "../../context/ConfigContext";
import { api } from "../../services/api";
import {
  ActivityTimeline,
  ErrorState,
  FormField,
  Message,
  PageHeader,
  PriorityBadge,
  ResponsiveDialog,
  StatusBadge,
} from "../common";
import { DataTable, DataToolbar, TablePagination } from "../DataTable";
import { Button } from "../ui/button";
import {
  BusinessActivity,
  BusinessDetail,
  BusinessFields,
  CustomerPicker,
  dateTime,
  endpoint,
  localNumber,
  SearchBox,
  useSearch,
  write,
} from "./common";

type Detail = {
  order: SalesOrder;
  items: SalesItem[];
  history: SalesHistory[];
  activity: AuditEntry[];
};
type OrderAction = "confirm" | "cancel" | "force-reopen";
const actionText: Record<OrderAction, { title: string; description: string }> =
  {
    confirm: {
      title: "Xác nhận đơn",
      description:
        "Đơn sẽ khóa nội dung bán hàng và ghi nhận các yêu cầu xử lý tiếp theo.",
    },
    cancel: {
      title: "Hủy đơn",
      description:
        "Các sản phẩm trong đơn sẽ chuyển sang đã hủy. Lịch sử đơn vẫn được giữ.",
    },
    "force-reopen": {
      title: "Mở lại đơn",
      description:
        "Đơn đã giao hoặc đã hoàn thành được đưa trở lại sản xuất. Nhập lý do mở lại.",
    },
  };
const itemStatuses: Record<string, string> = {
  NEW: "Nháp",
  CONFIRMED: "Đã xác nhận",
  WAITING_DESIGN: "Chờ thiết kế",
  DESIGNING: "Đang thiết kế",
  READY_FOR_PRODUCTION: "Chờ sản xuất",
  IN_PRODUCTION: "Đang sản xuất",
  PRODUCTION_COMPLETED: "Đã sản xuất",
  READY_FOR_FINISHING: "Chờ gia công",
  FINISHING: "Đang gia công",
  WAREHOUSE_READY: "Sẵn sàng vào kho",
  CANCELLED: "Đã hủy",
};
const blankItem = (): SalesItemInput => ({
  id: crypto.randomUUID(),
  productName: "",
  quantity: 1,
  bagWidth: null,
  bagLength: null,
  bagGusset: null,
  paperPreference: "",
  gsmPreference: "",
  colorPreference: "",
  technicalRequirements: "",
  designRequirements: "",
  productionRequirements: "",
  finishingRequirements: "",
  note: "",
  requiresProduction: true,
  requiresFinishing: true,
  isUrgent: false,
  designVersionId: null,
});
function OrderBadge({ order }: { order: SalesOrder }) {
  return (
    <StatusBadge
      active={
        order.status === "DRAFT" || order.status === "CANCELLED" ? false : true
      }
    >
      {SALES_STATUS_LABELS[order.status]}
    </StatusBadge>
  );
}
export function Sales({ selection }: { selection?: string }) {
  const { user } = useAuth();
  const role = user!.role;
  const client = useQueryClient();
  const { search, setSearch, debounced } = useSearch();
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [edit, setEdit] = useState<Detail | null>(null);
  const [notice, setNotice] = useState("");
  const selected = selection && selection !== "new" ? selection : undefined;
  const sort = sorting[0];
  const params = {
    page,
    pageSize,
    status,
    priority,
    search: debounced,
    sort: sort?.id ?? "createdAt",
    direction: sort?.desc ? "desc" : "asc",
  };
  const list = useQuery({
    queryKey: ["sales_orders", "list", params],
    queryFn: () => api<Page<SalesOrder>>(endpoint("sales-orders", params)),
  });
  const detail = useQuery({
    queryKey: ["sales_orders", "detail", selected],
    queryFn: () => api<Detail>(endpoint("sales-orders/" + selected)),
    enabled: !!selected,
  });
  const open = (id: string) => {
    location.hash = "sales/" + id;
  };
  const close = () => {
    location.hash = "sales";
  };
  const columns: ColumnDef<SalesOrder, unknown>[] = [
    {
      accessorKey: "code",
      header: "Mã đơn",
      meta: "Mã đơn",
      enableHiding: false,
      cell: ({ row }) => (
        <button
          className="business-row-link"
          onClick={() => open(row.original.id)}
        >
          {row.original.code}
        </button>
      ),
    },
    {
      id: "customer",
      header: "Khách hàng",
      meta: "Khách hàng",
      enableSorting: false,
      cell: ({ row }) => row.original.customerSnapshot.name,
    },
    {
      id: "status",
      header: "Trạng thái",
      meta: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) => <OrderBadge order={row.original} />,
    },
    {
      accessorKey: "totalItems",
      header: "Sản phẩm",
      meta: "Sản phẩm",
      enableSorting: false,
    },
    {
      accessorKey: "expectedDeliveryDate",
      header: "Hẹn giao",
      meta: "Hẹn giao",
      cell: ({ row }) => row.original.expectedDeliveryDate ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: "Ngày tạo",
      meta: "Ngày tạo",
      cell: ({ row }) => dateTime(row.original.createdAt),
    },
    {
      id: "urgent",
      header: "Ưu tiên",
      meta: "Ưu tiên",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.priority === "URGENT" && <PriorityBadge />,
    },
  ];
  function saved(next: Detail) {
    setEdit(null);
    setNotice("Đã lưu đơn " + next.order.code + ".");
    setPage(1);
    client.setQueryData(["sales_orders", "detail", next.order.id], next);
    void client.invalidateQueries({ queryKey: ["sales_orders"] });
    open(next.order.id);
  }
  return (
    <>
      <PageHeader
        title="Đơn bán hàng"
        actions={
          canCreateSales(role) && (
            <Button onClick={() => open("new")}>
              <Plus /> Tạo đơn
            </Button>
          )
        }
      />
      {notice && <Message success>{notice}</Message>}
      <section className="surface business-table-surface">
        <DataToolbar>
          <SearchBox
            label="Tìm mã đơn, khách hàng hoặc sản phẩm"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <select
            aria-label="Lọc trạng thái đơn"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái</option>
            {SALES_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SALES_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc ưu tiên"
            value={priority}
            onChange={(event) => {
              setPriority(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi mức ưu tiên</option>
            <option value="URGENT">Khẩn</option>
            <option value="NORMAL">Bình thường</option>
          </select>
          <select
            className="business-mobile-control"
            aria-label="Sắp xếp đơn"
            value={sort?.id + ":" + (sort?.desc ? "desc" : "asc")}
            onChange={(event) => {
              const [id, direction] = event.target.value.split(":");
              setSorting([{ id, desc: direction === "desc" }]);
              setPage(1);
            }}
          >
            <option value="createdAt:desc">Ngày tạo mới nhất</option>
            <option value="createdAt:asc">Ngày tạo cũ nhất</option>
            <option value="code:desc">Mã giảm dần</option>
            <option value="code:asc">Mã tăng dần</option>
            <option value="expectedDeliveryDate:asc">Hẹn giao gần nhất</option>
            <option value="expectedDeliveryDate:desc">Hẹn giao xa nhất</option>
          </select>
        </DataToolbar>
        {list.error ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : (
          <DataTable
            data={list.data?.items ?? []}
            columns={columns}
            total={list.data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            label="đơn bán hàng"
            preferenceKey="sales"
            loading={list.isPending}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            sorting={sorting}
            onSorting={(value) => {
              setSorting(
                value.length ? value : [{ id: "createdAt", desc: true }],
              );
              setPage(1);
            }}
            renderMobile={(order) => (
              <article className="business-mobile-row" key={order.id}>
                <div>
                  <button
                    className="business-row-link"
                    onClick={() => open(order.id)}
                  >
                    {order.code}
                  </button>
                  <p>
                    {order.customerSnapshot.name} · {order.totalItems} sản phẩm
                  </p>
                </div>
                <div>
                  <OrderBadge order={order} />
                  {order.priority === "URGENT" && <PriorityBadge />}
                </div>
              </article>
            )}
          />
        )}
      </section>
      {(selection === "new" && canCreateSales(role)) ||
      (edit && edit.order.id === selection && canEditSales(role)) ? (
        <SalesEditor
          key={edit?.order.id ?? "new"}
          detail={edit}
          onSaved={saved}
          onClose={() => (edit ? setEdit(null) : close())}
        />
      ) : (
        selected && (
          <ResponsiveDialog
            open
            onOpenChange={(value) => {
              if (!value) close();
            }}
            wide
            title={detail.data?.order.code ?? "Chi tiết đơn"}
            description={
              detail.data?.order.customerSnapshot.name ?? "Đơn bán hàng"
            }
          >
            <BusinessDetail loading={detail.isPending} error={detail.error}>
              {detail.data && (
                <SalesDetails
                  key={selected}
                  detail={detail.data}
                  editable={canEditSales(role)}
                  admin={canForceReopenSales(role)}
                  onEdit={() => setEdit(detail.data)}
                  onSaved={(value) => {
                    client.setQueryData(
                      ["sales_orders", "detail", selected],
                      value,
                    );
                    void client.invalidateQueries({
                      queryKey: ["sales_orders"],
                    });
                  }}
                />
              )}
            </BusinessDetail>
          </ResponsiveDialog>
        )
      )}
    </>
  );
}
function SalesDetails({
  detail,
  editable,
  admin,
  onEdit,
  onSaved,
}: {
  detail: Detail;
  editable: boolean;
  admin: boolean;
  onEdit: () => void;
  onSaved: (detail: Detail) => void;
}) {
  const { order, items, history, activity } = detail;
  const [action, setAction] = useState<OrderAction | null>(null);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      write<Detail>("sales-orders/" + order.id + "/" + action, {
        version: order.version,
        ...(action === "force-reopen" ? { reason } : {}),
      }),
    onSuccess: (value) => {
      onSaved(value);
      setAction(null);
      setReason("");
    },
  });
  const cancellable =
    editable &&
    ![
      "CANCELLED",
      "COMPLETED",
      "DELIVERED",
      "SHIPPING",
      "READY_TO_SHIP",
    ].includes(order.status) &&
    !items.some((item) =>
      ["IN_PRODUCTION", "PRODUCTION_COMPLETED"].includes(item.status),
    );
  function selectAction(value: OrderAction) {
    mutation.reset();
    setAction(value);
    setReason("");
  }
  return (
    <div className="business-form">
      <div className="business-inline">
        <OrderBadge order={order} />
        {order.priority === "URGENT" && <PriorityBadge />}
      </div>
      <BusinessFields
        items={[
          { label: "Phụ trách", value: order.saleName },
          { label: "Hẹn giao", value: order.expectedDeliveryDate },
          { label: "Điện thoại", value: order.customerSnapshot.phone },
          { label: "Địa chỉ", value: order.customerSnapshot.address },
          { label: "Lời nhắn khách hàng", value: order.customerNote },
          { label: "Ghi chú nội bộ", value: order.internalNote },
        ]}
      />
      <section className="business-subsection">
        <h3>Sản phẩm ({items.length})</h3>
        {items.length === 0 && <p className="muted">Đơn chưa có sản phẩm.</p>}
        {items.map((item) => (
          <details className="business-line-details" key={item.id}>
            <summary>
              <strong>{item.productName}</strong>
              <span>{localNumber(item.quantity)} túi</span>
              <StatusBadge>
                {itemStatuses[item.status] ?? item.status}
              </StatusBadge>
            </summary>
            <BusinessFields
              items={[
                {
                  label: "Kích thước (ngang × dài × hông, cm)",
                  value: [item.bagWidth, item.bagLength, item.bagGusset].some(
                    (v) => v !== null,
                  )
                    ? [item.bagWidth, item.bagLength, item.bagGusset]
                        .map((v) => v ?? "—")
                        .join(" × ")
                    : "",
                },
                { label: "Giấy", value: item.paperPreference },
                { label: "Định lượng giấy", value: item.gsmPreference },
                { label: "Màu", value: item.colorPreference },
                { label: "Kỹ thuật", value: item.technicalRequirements },
                { label: "Thiết kế", value: item.designRequirements },
                {
                  label: "Sản xuất",
                  value: item.requiresProduction
                    ? item.productionRequirements || "Có yêu cầu"
                    : "Không yêu cầu",
                },
                {
                  label: "Gia công",
                  value: item.requiresFinishing
                    ? item.finishingRequirements || "Có yêu cầu"
                    : "Không yêu cầu",
                },
                { label: "Ghi chú", value: item.note },
                { label: "Ưu tiên", value: item.isUrgent ? "Khẩn" : "" },
                {
                  label: "Mẫu đã lưu",
                  value:
                    item.designSnapshot &&
                    `${item.designSnapshot.productName} · phiên bản ${item.designSnapshot.version}`,
                },
                ...(item.designSnapshot
                  ? [
                      {
                        label: "Thông tin mẫu tại thời điểm chọn",
                        value: [
                          item.designSnapshot.bagSize,
                          item.designSnapshot.paperType,
                          item.designSnapshot.paperGsm,
                          item.designSnapshot.color,
                          item.designSnapshot.plateReference,
                        ]
                          .filter(Boolean)
                          .join(" · "),
                      },
                    ]
                  : []),
              ]}
            />
          </details>
        ))}
      </section>
      {order.status === "CONFIRMED" && (
        <p className="muted">
          Đã ghi nhận yêu cầu. Xử lý gia công và kho sẽ có ở Phase 02C.
        </p>
      )}
      <div className="business-grid-two">
        <section className="business-subsection">
          <h3>Lịch sử trạng thái</h3>
          <ActivityTimeline
            items={history.map((entry) => ({
              id: String(entry.version),
              title:
                (entry.fromStatus
                  ? SALES_STATUS_LABELS[entry.fromStatus] + " → "
                  : "") + SALES_STATUS_LABELS[entry.toStatus],
              description: [entry.actorName, entry.reason]
                .filter(Boolean)
                .join(" · "),
              time: dateTime(entry.createdAt),
            }))}
          />
        </section>
        <section className="business-subsection">
          <h3>Lịch sử thao tác</h3>
          <BusinessActivity activity={activity} />
        </section>
      </div>
      {action ? (
        <form
          className="business-action"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <h3>{actionText[action].title}</h3>
          <p>{actionText[action].description}</p>
          {action === "force-reopen" && (
            <FormField
              id="sales-reopen-reason"
              label="Lý do mở lại"
              maxLength={500}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
          {mutation.error && <Message>{mutation.error.message}</Message>}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setAction(null)}
            >
              Quay lại
            </Button>
            <Button
              type="submit"
              variant={action === "cancel" ? "destructive" : "default"}
              disabled={mutation.isPending}
            >
              Xác nhận
            </Button>
          </div>
        </form>
      ) : (
        <div className="dialog-actions">
          {cancellable && (
            <Button variant="outline" onClick={() => selectAction("cancel")}>
              Hủy đơn
            </Button>
          )}
          {editable && order.status === "DRAFT" && (
            <>
              <Button variant="outline" onClick={onEdit}>
                Sửa nháp
              </Button>
              <Button
                disabled={!items.length}
                onClick={() => selectAction("confirm")}
              >
                Xác nhận đơn
              </Button>
            </>
          )}
          {admin && ["DELIVERED", "COMPLETED"].includes(order.status) && (
            <Button onClick={() => selectAction("force-reopen")}>
              Mở lại đơn
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
function SalesEditor({
  detail,
  onSaved,
  onClose,
}: {
  detail: Detail | null;
  onSaved: (data: Detail) => void;
  onClose: () => void;
}) {
  const [id] = useState(() => detail?.order.id ?? crypto.randomUUID());
  const [customerName, setCustomerName] = useState(
    detail?.order.customerSnapshot.name ?? "",
  );
  const [draft, setDraft] = useState<SalesInput>(() => ({
    customerId: detail?.order.customerId ?? "",
    priority: detail?.order.priority ?? "NORMAL",
    expectedDeliveryDate: detail?.order.expectedDeliveryDate ?? null,
    customerNote: detail?.order.customerNote ?? "",
    internalNote: detail?.order.internalNote ?? "",
    items: detail?.items.map(
      ({
        status: _status,
        quantityUnit: _quantityUnit,
        designSnapshot: _snapshot,
        ...item
      }) => item,
    ) ?? [blankItem()],
  }));
  const [snapshots, setSnapshots] = useState<Record<string, DesignVersion>>(
    () =>
      Object.fromEntries(
        detail?.items
          .filter((item) => item.designSnapshot)
          .map((item) => [item.id, item.designSnapshot!]) ?? [],
      ),
  );
  const [formError, setFormError] = useState("");
  const mutation = useMutation({
    mutationFn: (value: SalesInput) =>
      detail
        ? write<Detail>(
            "sales-orders/" + id,
            { ...value, version: detail.order.version },
            "PATCH",
          )
        : write<Detail>("sales-orders", { ...value, id }),
    onSuccess: onSaved,
  });
  function updateItem(id: string, patch: Partial<SalesItemInput>) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = salesFields.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(
        (issue.path[0] === "items" && typeof issue.path[1] === "number"
          ? `Sản phẩm ${issue.path[1] + 1}. `
          : "") + issue.message,
      );
      return;
    }
    setFormError("");
    mutation.mutate(parsed.data);
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(value) => {
        if (!value && !mutation.isPending) onClose();
      }}
      wide
      title={detail ? "Sửa nháp " + detail.order.code : "Tạo đơn bán hàng"}
      description="Lưu nháp để tiếp tục chỉnh sửa và xác nhận sau."
    >
      <form onSubmit={submit} className="business-form">
        <div className="form-grid">
          <CustomerPicker
            id="order-customer"
            value={draft.customerId}
            name={customerName}
            onChange={(customerId, name) => {
              setCustomerName(name);
              setDraft({ ...draft, customerId });
            }}
            required
          />
          <FormField
            id="order-date"
            label="Ngày hẹn giao"
            type="date"
            value={draft.expectedDeliveryDate ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                expectedDeliveryDate: event.target.value || null,
              })
            }
          />
          <FormField id="order-priority" label="Mức ưu tiên">
            <select
              id="order-priority"
              value={draft.priority}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  priority: event.target.value as SalesInput["priority"],
                })
              }
            >
              <option value="NORMAL">Bình thường</option>
              <option value="URGENT">Khẩn</option>
            </select>
          </FormField>
        </div>
        <div className="business-product-editor">
          <h3>Sản phẩm ({draft.items.length})</h3>
          {draft.items.map((item, index) => (
            <SalesItemEditor
              key={item.id}
              item={item}
              index={index}
              snapshot={snapshots[item.id]}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() =>
                setDraft({
                  ...draft,
                  items: draft.items.filter((entry) => entry.id !== item.id),
                })
              }
              onSample={(version) => {
                if (version)
                  setSnapshots((prev) => ({ ...prev, [item.id]: version }));
                else
                  setSnapshots((prev) =>
                    Object.fromEntries(
                      Object.entries(prev).filter(([key]) => key !== item.id),
                    ),
                  );
                updateItem(
                  item.id,
                  version
                    ? {
                        designVersionId: version.id,
                        productName: item.productName || version.productName,
                        paperPreference:
                          item.paperPreference || version.paperType,
                        gsmPreference: item.gsmPreference || version.paperGsm,
                        colorPreference: item.colorPreference || version.color,
                      }
                    : { designVersionId: null },
                );
              }}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.items.length >= 30}
            onClick={() =>
              setDraft({ ...draft, items: [...draft.items, blankItem()] })
            }
          >
            <Plus /> Thêm sản phẩm
          </Button>
        </div>
        <div className="form-grid">
          <FormField id="order-customer-note" label="Lời nhắn khách hàng">
            <textarea
              id="order-customer-note"
              maxLength={1000}
              value={draft.customerNote}
              onChange={(event) =>
                setDraft({ ...draft, customerNote: event.target.value })
              }
            />
          </FormField>
          <FormField id="order-notes" label="Ghi chú nội bộ">
            <textarea
              id="order-notes"
              maxLength={1000}
              value={draft.internalNote}
              onChange={(event) =>
                setDraft({ ...draft, internalNote: event.target.value })
              }
            />
          </FormField>
        </div>
        {(formError || mutation.error) && (
          <Message>{formError || mutation.error?.message}</Message>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Đóng
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang lưu…" : "Lưu nháp"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
function SalesItemEditor({
  item,
  index,
  snapshot,
  onChange,
  onSample,
  onRemove,
}: {
  item: SalesItemInput;
  index: number;
  snapshot?: DesignVersion;
  onChange: (patch: Partial<SalesItemInput>) => void;
  onSample: (sample: DesignVersion | null) => void;
  onRemove: () => void;
}) {
  const { settings } = useConfig();
  const prefix = "product-" + item.id;
  const textFields = [
    ["technicalRequirements", "Yêu cầu kỹ thuật"],
    ["designRequirements", "Yêu cầu thiết kế"],
    ["productionRequirements", "Yêu cầu sản xuất"],
    ["finishingRequirements", "Yêu cầu gia công"],
    ["note", "Ghi chú sản phẩm"],
  ] as const;
  return (
    <fieldset className="business-product">
      <legend>Sản phẩm {index + 1}</legend>
      <div className="business-inline business-product-heading">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Bỏ sản phẩm ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 /> Bỏ dòng
        </Button>
      </div>
      <div className="form-grid">
        <FormField
          id={prefix + "-name"}
          label="Tên sản phẩm"
          value={item.productName}
          required
          maxLength={150}
          onChange={(event) => onChange({ productName: event.target.value })}
        />
        <FormField
          id={prefix + "-qty"}
          label="Số lượng (túi)"
          type="number"
          inputMode="numeric"
          min={1}
          max={1_000_000_000}
          step="1"
          value={item.quantity || ""}
          required
          onChange={(event) =>
            onChange({ quantity: Number(event.target.value) })
          }
        />
      </div>
      <details className="business-item-options">
        <summary>Quy cách, yêu cầu và mẫu thiết kế</summary>
        <div className="form-grid three">
          {(
            [
              ["bagWidth", "Ngang (cm)"],
              ["bagLength", "Dài (cm)"],
              ["bagGusset", "Hông (cm)"],
            ] as const
          ).map(([key, label]) => (
            <FormField
              key={key}
              id={prefix + key}
              label={label}
              type="number"
              inputMode="decimal"
              min={0}
              max="9999999.999"
              step="0.001"
              value={item[key] ?? ""}
              onChange={(event) =>
                onChange({
                  [key]: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          ))}
          <FormField
            id={prefix + "paper"}
            label="Vật liệu / giấy"
            list={prefix + "paper-options"}
            maxLength={100}
            value={item.paperPreference}
            onChange={(event) =>
              onChange({ paperPreference: event.target.value })
            }
          />
          <datalist id={prefix + "paper-options"}>
            {settings?.paperTypes.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <FormField
            id={prefix + "gsm"}
            label="Định lượng giấy"
            maxLength={60}
            value={item.gsmPreference}
            onChange={(event) =>
              onChange({ gsmPreference: event.target.value })
            }
          />
          <FormField
            id={prefix + "color"}
            label="Màu"
            maxLength={100}
            value={item.colorPreference}
            onChange={(event) =>
              onChange({ colorPreference: event.target.value })
            }
          />
        </div>
        <div className="business-inline business-checks">
          {(
            [
              ["requiresProduction", "Yêu cầu sản xuất"],
              ["requiresFinishing", "Yêu cầu gia công"],
              ["isUrgent", "Khẩn"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={item[key]}
                onChange={(event) => onChange({ [key]: event.target.checked })}
              />{" "}
              {label}
            </label>
          ))}
        </div>
        <div className="form-grid">
          {textFields.map(([key, label]) => (
            <FormField id={prefix + key} key={key} label={label}>
              <textarea
                id={prefix + key}
                maxLength={key === "note" ? 1000 : 500}
                value={item[key]}
                onChange={(event) => onChange({ [key]: event.target.value })}
              />
            </FormField>
          ))}
        </div>
        <DesignPicker prefix={prefix} selected={snapshot} onChange={onSample} />
      </details>
      {snapshot && (
        <p className="muted">
          Mẫu {snapshot.productName} · phiên bản {snapshot.version}
        </p>
      )}
    </fieldset>
  );
}
function DesignPicker({
  prefix,
  selected,
  onChange,
}: {
  prefix: string;
  selected?: DesignVersion;
  onChange: (version: DesignVersion | null) => void;
}) {
  const { search, setSearch, debounced } = useSearch();
  const [versionPage, setVersionPage] = useState(1);
  const designs = useQuery({
    queryKey: ["saved_designs", "picker", debounced],
    queryFn: () =>
      api<Page<SavedDesign>>(
        endpoint("saved-designs", { pageSize: 20, search: debounced }),
      ),
  });
  const options = designs.data?.items ?? [];
  const versions = useQuery({
    queryKey: [
      "saved_designs",
      "picker-versions",
      selected?.designId,
      versionPage,
    ],
    queryFn: () =>
      api<Page<DesignVersion>>(
        endpoint("saved-designs/" + selected!.designId + "/versions", {
          page: versionPage,
          pageSize: 20,
        }),
      ),
    enabled: !!selected,
  });
  const revisionOptions = versions.data?.items ?? [];
  return (
    <div className="business-picker">
      <SearchBox label="Tìm mẫu thiết kế" value={search} onChange={setSearch} />
      <FormField id={prefix + "-sample"} label="Mẫu thiết kế">
        <select
          id={prefix + "-sample"}
          value={selected?.designId ?? ""}
          onChange={(event) => {
            setVersionPage(1);
            onChange(
              options.find((design) => design.id === event.target.value)
                ?.current ?? null,
            );
          }}
        >
          <option value="">Không sử dụng mẫu</option>
          {selected &&
            !options.some((design) => design.id === selected.designId) && (
              <option value={selected.designId}>{selected.productName}</option>
            )}
          {options.map((design) => (
            <option key={design.id} value={design.id}>
              {design.current.productName} ·{" "}
              {design.current.customerName || "Mẫu chung"}
            </option>
          ))}
        </select>
      </FormField>
      {selected && (
        <FormField id={prefix + "-version"} label="Phiên bản mẫu">
          <select
            id={prefix + "-version"}
            value={selected.id}
            onChange={(event) => {
              const revision = revisionOptions.find(
                (version) => version.id === event.target.value,
              );
              if (revision) onChange(revision);
            }}
          >
            {!revisionOptions.some((version) => version.id === selected.id) && (
              <option value={selected.id}>Phiên bản {selected.version}</option>
            )}
            {revisionOptions.map((version) => (
              <option key={version.id} value={version.id}>
                Phiên bản {version.version} · {version.productName}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {versions.data && versions.data.total > 20 && (
        <TablePagination
          total={versions.data.total}
          page={versionPage}
          pageSize={20}
          onPage={setVersionPage}
        />
      )}
      {(designs.error || versions.error) && (
        <Message>{designs.error?.message ?? versions.error?.message}</Message>
      )}
    </div>
  );
}
