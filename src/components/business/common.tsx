import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import type { AuditEntry, Page } from "../../../shared/contracts";
import type { Customer } from "../../../shared/business";
import { api, json } from "../../services/api";
import {
  ActivityTimeline,
  FormField,
  LoadingSkeleton,
  Message,
} from "../common";
import { Input } from "../ui/input";

export function endpoint(
  path: string,
  params: Record<string, string | number | undefined> = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const suffix = query.toString();
  return "/" + path + (suffix ? "?" + suffix : "");
}
export function write<T>(path: string, value: unknown, method = "POST") {
  return api<T>(endpoint(path), { method, body: json(value) });
}
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
export const localNumber = (value: number) => value.toLocaleString("vi-VN");

export function SearchBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search-field">
      <Search size={16} />
      <Input
        aria-label={label}
        placeholder={label}
        maxLength={100}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function useSearch() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 220);
    return () => window.clearTimeout(timer);
  }, [search]);
  return { search, setSearch, debounced };
}
const actionLabels: Record<string, string> = {
  CUSTOMER_CREATED: "Tạo khách hàng",
  CUSTOMER_UPDATED: "Cập nhật khách hàng",
  CUSTOMER_DELETED: "Ngừng hoạt động",
  DESIGN_CREATED: "Tạo mẫu",
  DESIGN_VERSION_ADDED: "Thêm phiên bản",
  SALES_ORDER_CREATED: "Tạo nháp",
  SALES_ORDER_UPDATED: "Cập nhật nháp",
  SALES_ORDER_CONFIRMED: "Xác nhận đơn",
  SALES_ORDER_CANCELLED: "Hủy đơn",
  SALES_ORDER_FORCE_REOPENED: "Mở lại đơn",
};
export function BusinessActivity({ activity }: { activity: AuditEntry[] }) {
  return (
    <ActivityTimeline
      items={activity.map((row) => ({
        id: row.id,
        title: actionLabels[row.action] ?? row.action,
        description: row.actorName,
        time: dateTime(row.createdAt),
      }))}
    />
  );
}

export function CustomerPicker({
  id,
  label = "Khách hàng",
  value,
  name,
  onChange,
  required = false,
}: {
  id: string;
  label?: string;
  value: string;
  name?: string;
  onChange: (id: string, name: string) => void;
  required?: boolean;
}) {
  const { search, setSearch, debounced } = useSearch();
  const customers = useQuery({
    queryKey: ["customers", "picker", debounced],
    queryFn: () =>
      api<Page<Customer>>(
        endpoint("customers", {
          search: debounced,
          pageSize: 20,
          sort: "name",
          direction: "asc",
        }),
      ),
  });
  const items = customers.data?.items ?? [];
  return (
    <FormField id={id} label={label}>
      <div className="business-picker">
        <Input
          aria-label={"Tìm " + label.toLocaleLowerCase("vi")}
          placeholder="Tên, mã hoặc điện thoại"
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          id={id}
          required={required}
          value={value}
          onChange={(event) => {
            const item = items.find(
              (customer) => customer.id === event.target.value,
            );
            onChange(event.target.value, item?.name ?? "");
          }}
        >
          <option value="">
            {required ? "Chọn khách hàng" : "Không chọn khách hàng"}
          </option>
          {value && !items.some((item) => item.id === value) && (
            <option value={value}>{name || "Khách hàng đã chọn"}</option>
          )}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.code}
            </option>
          ))}
        </select>
        {customers.isPending && (
          <small aria-live="polite">Đang tải khách hàng…</small>
        )}
        {customers.error && <Message>{customers.error.message}</Message>}
      </div>
    </FormField>
  );
}
export function BusinessDetail({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: Error | null;
  children: ReactNode;
}) {
  if (loading) return <LoadingSkeleton rows={3} />;
  if (error) return <Message>{error.message}</Message>;
  return children;
}
export function BusinessFields({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="business-fields">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
