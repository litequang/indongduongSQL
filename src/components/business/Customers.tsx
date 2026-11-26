import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { FileUp, Plus, Trash2 } from "lucide-react";
import {
  IMPORT_FIELDS,
  canManageCustomers,
  customerFields,
  type Customer,
  type CustomerInput,
  type SalesOrder,
} from "../../../shared/business";
import type { AuditEntry, Page } from "../../../shared/contracts";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import {
  ConfirmDialog,
  DetailPanel,
  ErrorState,
  FormField,
  Message,
  PageHeader,
  ResponsiveDialog,
  StatusBadge,
} from "../common";
import { DataTable, DataToolbar, TablePagination } from "../DataTable";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  BusinessActivity,
  BusinessDetail,
  BusinessFields,
  endpoint,
  SearchBox,
  useSearch,
  write,
} from "./common";
import { CustomerImport } from "./CustomerImport";

type CustomerDetail = { customer: Customer; activity: AuditEntry[] };
const customerKeys = Object.keys(IMPORT_FIELDS) as (keyof CustomerInput)[];
const emptyCustomer = () =>
  Object.fromEntries(customerKeys.map((k) => [k, ""])) as CustomerInput;

export function Customers() {
  const { user } = useAuth();
  const manage = canManageCustomers(user!.role);
  const client = useQueryClient();
  const { search, setSearch, debounced } = useSearch();
  const [province, setProvince] = useState("");
  const [active, setActive] = useState("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [selected, setSelected] = useState<string | null>(null);
  const [orderPage, setOrderPage] = useState(1);
  const [checked, setChecked] = useState<string[]>([]);
  const [editor, setEditor] = useState<Customer | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; version: number }[]>(
    [],
  );
  const [notice, setNotice] = useState("");
  const sort = sorting[0];
  const params = {
    search: debounced,
    province,
    active,
    page,
    pageSize,
    sort: sort?.id ?? "name",
    direction: sort?.desc ? "desc" : "asc",
  };
  const list = useQuery({
    queryKey: ["customers", "list", params],
    queryFn: () => api<Page<Customer>>(endpoint("customers", params)),
  });
  const detail = useQuery({
    queryKey: ["customers", "detail", selected],
    queryFn: () => api<CustomerDetail>(endpoint("customers/" + selected)),
    enabled: !!selected,
  });
  const orders = useQuery({
    queryKey: ["sales_orders", "customer", selected, orderPage],
    queryFn: () =>
      api<Page<SalesOrder>>(
        endpoint("sales-orders", {
          customerId: selected!,
          page: orderPage,
          pageSize: 10,
        }),
      ),
    enabled: !!selected,
  });
  const current = detail.data?.customer;
  const remove = useMutation({
    mutationFn: (items: typeof removing) =>
      write("customers/bulk-delete", { items }),
    onSuccess: () => {
      setRemoving([]);
      setChecked([]);
      setPage(1);
      setNotice("Đã ngừng hoạt động khách hàng đã chọn.");
      void client.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  function resetPage() {
    setPage(1);
    setChecked([]);
  }
  function toggle(row: Customer) {
    setChecked((prev) =>
      prev.includes(row.id)
        ? prev.filter((id) => id !== row.id)
        : [...prev, row.id],
    );
  }
  function showCustomer(row: Customer) {
    setSelected(row.id);
    setOrderPage(1);
    if (window.matchMedia("(max-width: 1050px)").matches) window.scrollTo(0, 0);
  }
  const data = list.data?.items ?? [];
  const selectedCustomers = data.filter(
    (row) => checked.includes(row.id) && !row.deletedAt,
  );
  const columns: ColumnDef<Customer, unknown>[] = [
    ...(manage
      ? [
          {
            id: "selection",
            header: "Chọn",
            enableSorting: false,
            enableHiding: false,
            cell: ({ row }: { row: { original: Customer } }) => (
              <input
                type="checkbox"
                aria-label={"Chọn " + row.original.name}
                disabled={!!row.original.deletedAt}
                checked={checked.includes(row.original.id)}
                onChange={() => toggle(row.original)}
              />
            ),
          },
        ]
      : []),
    {
      accessorKey: "name",
      header: "Khách hàng",
      meta: "Khách hàng",
      enableHiding: false,
      cell: ({ row }) => (
        <button
          className="business-row-link"
          onClick={() => showCustomer(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: "code", header: "Mã khách hàng", meta: "Mã khách hàng" },
    {
      accessorKey: "phone",
      header: "Điện thoại",
      meta: "Điện thoại",
      enableSorting: false,
    },
    {
      accessorKey: "province",
      header: "Tỉnh/thành",
      meta: "Tỉnh/thành",
      enableSorting: false,
    },
    {
      id: "state",
      header: "Trạng thái",
      meta: "Trạng thái",
      enableSorting: false,
      cell: ({ row }) => (
        <StatusBadge active={!row.original.deletedAt}>
          {row.original.deletedAt ? "Đã ngừng" : "Hoạt động"}
        </StatusBadge>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Khách hàng"
        actions={
          manage && (
            <>
              <Button variant="outline" onClick={() => setImporting(true)}>
                <FileUp /> Nhập Excel/CSV
              </Button>
              <Button
                onClick={() => {
                  setNotice("");
                  setEditor("new");
                }}
              >
                <Plus /> Thêm khách hàng
              </Button>
            </>
          )
        }
      />
      {notice && <Message success>{notice}</Message>}
      <div
        className={
          selected ? "list-detail-layout business-detail-layout" : undefined
        }
      >
        <section className="surface business-table-surface">
          <DataToolbar
            actions={
              selectedCustomers.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    remove.reset();
                    setRemoving(selectedCustomers);
                  }}
                >
                  <Trash2 /> Ngừng hoạt động ({selectedCustomers.length})
                </Button>
              )
            }
          >
            <SearchBox
              label="Tìm khách hàng"
              value={search}
              onChange={(value) => {
                setSearch(value);
                resetPage();
              }}
            />
            <Input
              aria-label="Lọc tỉnh/thành"
              placeholder="Tỉnh/thành (tên đầy đủ)"
              maxLength={100}
              value={province}
              onChange={(event) => {
                setProvince(event.target.value);
                resetPage();
              }}
            />
            <select
              aria-label="Trạng thái khách hàng"
              value={active}
              onChange={(event) => {
                setActive(event.target.value);
                resetPage();
              }}
            >
              <option value="active">Đang hoạt động</option>
              <option value="deleted">Đã ngừng</option>
              <option value="all">Tất cả</option>
            </select>
            <select
              className="business-mobile-control"
              aria-label="Sắp xếp khách hàng"
              value={sort?.id + ":" + (sort?.desc ? "desc" : "asc")}
              onChange={(event) => {
                const [id, direction] = event.target.value.split(":");
                setSorting([{ id, desc: direction === "desc" }]);
                resetPage();
              }}
            >
              <option value="name:asc">Tên A–Z</option>
              <option value="name:desc">Tên Z–A</option>
              <option value="code:desc">Mã mới nhất</option>
              <option value="code:asc">Mã cũ nhất</option>
            </select>
          </DataToolbar>
          {list.error ? (
            <ErrorState error={list.error} retry={() => void list.refetch()} />
          ) : (
            <DataTable
              data={data}
              columns={columns}
              total={list.data?.total ?? 0}
              page={page}
              pageSize={pageSize}
              label="khách hàng"
              preferenceKey="customers"
              loading={list.isPending}
              onPage={(n) => {
                setPage(n);
                setChecked([]);
              }}
              onPageSize={(n) => {
                setPageSize(n);
                resetPage();
              }}
              sorting={sorting}
              onSorting={(value) => {
                setSorting(
                  value.length ? value : [{ id: "name", desc: false }],
                );
                resetPage();
              }}
              renderMobile={(row) => (
                <article key={row.id} className="business-mobile-row">
                  <div>
                    <button
                      className="business-row-link"
                      onClick={() => showCustomer(row)}
                    >
                      {row.name}
                    </button>
                    <p>
                      {row.code}
                      {row.phone && " · " + row.phone}
                    </p>
                  </div>
                  {manage && !row.deletedAt && (
                    <input
                      type="checkbox"
                      aria-label={"Chọn " + row.name}
                      checked={checked.includes(row.id)}
                      onChange={() => toggle(row)}
                    />
                  )}
                </article>
              )}
            />
          )}
        </section>
        {selected && (
          <DetailPanel
            title="Chi tiết khách hàng"
            onClose={() => setSelected(null)}
          >
            <div className="business-panel-content">
              <BusinessDetail loading={detail.isPending} error={detail.error}>
                {current && (
                  <>
                    <div>
                      <h3>{current.name}</h3>
                      <div className="business-inline">
                        <span className="muted">{current.code}</span>
                        <StatusBadge active={!current.deletedAt}>
                          {current.deletedAt ? "Đã ngừng" : "Hoạt động"}
                        </StatusBadge>
                      </div>
                    </div>
                    {manage && !current.deletedAt && (
                      <div className="business-inline">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor(current)}
                        >
                          Chỉnh sửa
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            remove.reset();
                            setRemoving([current]);
                          }}
                        >
                          Ngừng hoạt động
                        </Button>
                      </div>
                    )}
                    <BusinessFields
                      items={customerKeys
                        .filter((key) => key !== "name" && current[key])
                        .map((key) => ({
                          label: IMPORT_FIELDS[key],
                          value: current[key],
                        }))}
                    />
                    <section>
                      <h4>Lịch sử đơn hàng</h4>
                      <BusinessDetail
                        loading={orders.isPending}
                        error={orders.error}
                      >
                        {orders.data?.items.length ? (
                          <ul className="business-link-list">
                            {orders.data.items.map((order) => (
                              <li key={order.id}>
                                <a href={"#sales/" + order.id}>{order.code}</a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted">Chưa có đơn hàng.</p>
                        )}
                        {orders.data && orders.data.total > 10 && (
                          <TablePagination
                            total={orders.data.total}
                            page={orderPage}
                            pageSize={10}
                            onPage={setOrderPage}
                          />
                        )}
                      </BusinessDetail>
                    </section>
                    <section>
                      <h4>Lịch sử thao tác</h4>
                      <BusinessActivity
                        activity={detail.data?.activity ?? []}
                      />
                    </section>
                  </>
                )}
              </BusinessDetail>
            </div>
          </DetailPanel>
        )}
      </div>
      {editor && (
        <CustomerEditor
          key={editor === "new" ? "new" : editor.id}
          customer={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={(row) => {
            setEditor(null);
            setSelected(row.id);
            setOrderPage(1);
            setNotice("Đã lưu khách hàng.");
            resetPage();
            void client.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
      <ConfirmDialog
        open={removing.length > 0}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setRemoving([]);
        }}
        title="Ngừng hoạt động khách hàng"
        description={`Xác nhận ngừng hoạt động ${removing.length} khách hàng. Đơn hàng đã lưu vẫn còn trong lịch sử.`}
        busy={remove.isPending}
        error={remove.error?.message}
        onConfirm={() =>
          remove.mutate(removing.map(({ id, version }) => ({ id, version })))
        }
      />
      {importing && (
        <CustomerImport
          onClose={() => setImporting(false)}
          onDone={() =>
            void client.invalidateQueries({ queryKey: ["customers"] })
          }
        />
      )}
    </>
  );
}

function CustomerEditor({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: (row: Customer) => void;
}) {
  const [draft, setDraft] = useState<CustomerInput>(() =>
    customer
      ? (Object.fromEntries(
          customerKeys.map((key) => [key, customer[key]]),
        ) as CustomerInput)
      : emptyCustomer(),
  );
  const [id] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<
    { id: string; name: string; code: string }[] | null
  >(null);
  const save = useMutation({
    mutationFn: (input: CustomerInput) =>
      customer
        ? write<{ customer: Customer }>(
            "customers/" + customer.id,
            { ...input, version: customer.version },
            "PATCH",
          )
        : write<{ customer: Customer }>("customers", { ...input, id }),
    onSuccess: ({ customer: row }) => onSaved(row),
  });
  const check = useMutation({
    mutationFn: () =>
      write<{ items: NonNullable<typeof matches> }>(
        "customers/check-duplicate",
        { ...draft, excludeId: customer?.id },
      ),
    onSuccess: ({ items }) => setMatches(items),
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = customerFields.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    save.mutate(parsed.data);
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      wide
      title={customer ? "Sửa khách hàng" : "Thêm khách hàng"}
      description="Thông tin liên hệ và địa chỉ dùng cho đơn bán hàng."
    >
      <form onSubmit={submit} className="business-form">
        <div className="form-grid">
          {customerKeys.map((key) => (
            <FormField
              key={key}
              id={"customer-" + key}
              label={IMPORT_FIELDS[key]}
            >
              {key === "note" ? (
                <textarea
                  id={"customer-" + key}
                  value={draft[key]}
                  maxLength={1000}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              ) : (
                <Input
                  id={"customer-" + key}
                  type={
                    key === "email" ? "email" : key === "phone" ? "tel" : "text"
                  }
                  required={key === "name"}
                  value={draft[key]}
                  onChange={(event) => {
                    setMatches(null);
                    setDraft({ ...draft, [key]: event.target.value });
                  }}
                />
              )}
            </FormField>
          ))}
        </div>
        {(error || save.error || check.error) && (
          <Message>
            {error || save.error?.message || check.error?.message}
          </Message>
        )}
        {matches && (
          <Message success={!matches.length}>
            {matches.length
              ? matches.map((item) => item.code + " · " + item.name).join(", ")
              : "Chưa thấy số điện thoại hoặc mã ngoài trùng."}
          </Message>
        )}
        <div className="dialog-actions">
          <Button
            variant="outline"
            type="button"
            disabled={check.isPending || !draft.name.trim()}
            onClick={() => check.mutate()}
          >
            Kiểm tra trùng
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Đang lưu…" : "Lưu khách hàng"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
