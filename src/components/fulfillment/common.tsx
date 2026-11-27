import { useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import type { Page } from "../../../shared/contracts";
import {
  SALES_STATUS_LABELS,
  type SalesStatus,
} from "../../../shared/business";
import {
  SHIPMENT_ACTIONS,
  type EventEntry,
  type FulfillmentResult,
} from "../../../shared/fulfillment";
import { api, ApiError } from "../../services/api";
import { ActivityTimeline, FormField, Message } from "../common";
import { DataTable, DataToolbar } from "../DataTable";
import {
  dateTime,
  endpoint,
  SearchBox,
  useSearch,
  write,
} from "../business/common";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export const LABELS: Record<string, string> = {
  ...SALES_STATUS_LABELS,
  PENDING_RECEIPT: "Chờ tiếp nhận",
  READY: "Sẵn sàng",
  CLAIMED: "Đã nhận việc",
  IN_PROGRESS: "Đang gia công",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  AVAILABLE: "Còn tồn",
  DEPLETED: "Hết tồn",
  OPEN: "Đang mở",
  RESOLVED: "Đã xử lý",
  DISPATCHED: "Đã xuất kho",
  REVERSED: "Đã đảo phiếu",
  CREATED: "Đã đăng ký",
  PICKUP_PENDING: "Chờ lấy hàng",
  PICKED_UP: "Đã bàn giao",
  IN_TRANSIT: "Đang vận chuyển",
  DELIVERED: "Đã giao",
  DELIVERY_FAILED: "Giao thất bại",
  RETURNING: "Đang chuyển hoàn",
  RETURNED: "Đã nhận hàng hoàn",
  RESTOCKED: "Nhập lại kho",
  SCRAPPED: "Hỏng / loại bỏ",
  CUSTOMER_HOLD: "Giữ riêng chờ xử lý",
  ACCEPTED: "Nhập từ nghiệm thu",
  WAITING_DESIGN: "Chờ thiết kế",
  READY_FOR_PRODUCTION: "Chờ in",
  READY_FOR_FINISHING: "Chờ gia công",
  FINISHING: "Đang gia công",
  WAREHOUSE_READY: "Đủ số lượng nghiệm thu",
  NEW: "Nháp",
};
export const actionLabels: Record<string, string> = {
  receive: "Tiếp nhận bàn giao",
  assign: "Phân công",
  claim: "Nhận việc",
  start: "Bắt đầu gia công",
  complete: "Hoàn thành gia công",
  "confirm-no-work": "Xác nhận không cần gia công",
  "add-note": "Ghi chú",
  urgent: "Đổi ưu tiên",
  "request-cancel": "Yêu cầu hủy gia công",
  "respond-cancel": "Phản hồi yêu cầu hủy",
  accept: "Nghiệm thu thành phẩm",
  "report-issue": "Báo sự cố",
  "resolve-issue": "Xử lý sự cố",
  "cancel-issue": "Hủy báo cáo",
  dispatch: "Xuất nguyên đơn",
  "reverse-dispatch": "Đảo phiếu xuất",
  "create-shipment": "Tạo vận đơn",
  "inspect-return": "Kiểm tra hàng hoàn",
  ...Object.fromEntries(
    Object.entries(SHIPMENT_ACTIONS).map(([key, value]) => [key, value.label]),
  ),
};
const success = [
  "READY",
  "AVAILABLE",
  "COMPLETED",
  "WAREHOUSE_READY",
  "READY_TO_SHIP",
  "DELIVERED",
  "RESOLVED",
  "RESTOCKED",
];
const danger = [
  "CANCELLED",
  "DELIVERY_FAILED",
  "SCRAPPED",
  "RETURNED",
  "CUSTOMER_HOLD",
];
export function WorkflowBadge({ status }: { status: string }) {
  return (
    <span
      className={
        "status-badge " +
        (success.includes(status)
          ? "positive"
          : danger.includes(status)
            ? "urgent"
            : "neutral")
      }
    >
      {LABELS[status] ?? SALES_STATUS_LABELS[status as SalesStatus] ?? status}
    </span>
  );
}

export function WorkflowList<T extends { id: string }>({
  path,
  statuses,
  columns,
  label,
  select,
  render,
  initialStatus,
  searchLabel = "Tìm theo mã, khách hàng hoặc sản phẩm",
}: {
  path: string;
  statuses?: readonly string[];
  columns: ColumnDef<T, unknown>[];
  label: string;
  select: (value: T) => void;
  render: (value: T) => ReactNode;
  initialStatus?: string;
  searchLabel?: string;
}) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([]);
  const { search, setSearch, debounced } = useSearch();
  const params = {
    page,
    pageSize,
    search: debounced,
    status,
    direction: sorting[0] && !sorting[0].desc ? "asc" : "desc",
  };
  const detailColumn: ColumnDef<T, unknown> = {
    id: "detail",
    header: "Chi tiết",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => (
      <Button
        size="sm"
        variant="outline"
        onClick={(event) => {
          event.stopPropagation();
          select(row.original);
        }}
      >
        Xem chi tiết
      </Button>
    ),
  };
  const data = useQuery({
    queryKey: ["fulfillment", path, params],
    queryFn: () => api<Page<T>>(endpoint(path, params)),
  });
  return (
    <section className="surface business-table-surface">
      <DataToolbar>
        <SearchBox
          label={searchLabel}
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        {statuses && (
          <select
            aria-label="Lọc trạng thái"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {LABELS[value] ?? value}
              </option>
            ))}
          </select>
        )}
      </DataToolbar>
      {data.error ? (
        <Message>{data.error.message}</Message>
      ) : (
        <DataTable
          data={data.data?.items ?? []}
          columns={[...columns, detailColumn]}
          loading={data.isPending}
          total={data.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          sorting={sorting}
          onSorting={setSorting}
          onRow={select}
          renderMobile={(entry) => (
            <button
              type="button"
              key={entry.id}
              className="fulfillment-mobile-button"
              onClick={() => select(entry)}
            >
              {render(entry)}
            </button>
          )}
          preferenceKey={path}
          label={label}
        />
      )}
    </section>
  );
}

export function WorkflowHistory({ history }: { history: EventEntry[] }) {
  return (
    <ActivityTimeline
      items={history.map((entry, index) => ({
        id: String(index),
        title: actionLabels[entry.action] ?? entry.action,
        description: entry.actorName + (entry.note ? " · " + entry.note : ""),
        time: dateTime(entry.createdAt),
      }))}
    />
  );
}

export interface Command {
  path: string;
  action: string;
  label?: string;
  version?: number;
  fields?: ReactNode;
  data?: (form: FormData) => Record<string, unknown>;
  onSuccess?: (result: FulfillmentResult) => void;
}
export function CommandForm({
  command,
  onSuccess,
  onClose,
}: {
  command: Command;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const lock = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      const key = JSON.stringify(payload);
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      return write<FulfillmentResult>(command.path + "/" + command.action, {
        ...payload,
        requestId: request.current.id,
      });
    },
    onSuccess: (value) => {
      command.onSuccess?.(value);
      onSuccess();
      void client.invalidateQueries({ queryKey: ["fulfillment"] });
      void client.invalidateQueries({ queryKey: ["sales_orders"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({ queryKey: ["fulfillment"] });
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  const heading =
    command.label ?? actionLabels[command.action] ?? command.action;
  return (
    <form
      className="business-form fulfillment-command"
      aria-label={heading}
      onSubmit={(event) => {
        event.preventDefault();
        if (lock.current) return;
        const form = new FormData(event.currentTarget);
        lock.current = true;
        mutation.mutate({ version: command.version, ...command.data?.(form) });
      }}
    >
      <h3>{heading}</h3>
      {command.fields}
      {mutation.error && <Message>{mutation.error.message}</Message>}
      <div className="dialog-actions">
        <Button
          variant="outline"
          type="button"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Quay lại
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          Xác nhận
        </Button>
      </div>
    </form>
  );
}

export function CommandButtons({
  commands,
  setCommand,
}: {
  commands: Command[];
  setCommand: (command: Command) => void;
}) {
  return (
    <div className="business-inline fulfillment-actions">
      {commands.map((command, index) => (
        <Button
          key={command.label ?? command.action}
          variant={index === 0 ? "default" : "outline"}
          onClick={() => setCommand(command)}
        >
          {command.label ?? actionLabels[command.action] ?? command.action}
        </Button>
      ))}
    </div>
  );
}

export const field = (form: FormData, key: string) =>
  String(form.get(key) ?? "");
export const withNote = (form: FormData) => ({ note: field(form, "note") });

export function NoteField({
  required = false,
  label = "Ghi chú",
}: {
  required?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      <textarea id={id} name="note" required={required} maxLength={1000} />
    </FormField>
  );
}
export function TextField({
  name,
  label,
  defaultValue,
  required = false,
  maxLength = 150,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
      />
    </FormField>
  );
}
export function NumberField({
  name,
  label,
  value = 0,
  max = 1_000_000_000,
  min = 0,
}: {
  name: string;
  label: string;
  value?: number;
  max?: number;
  min?: number;
}) {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      <Input
        id={id}
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        required
      />
    </FormField>
  );
}
