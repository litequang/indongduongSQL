import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Grid2X2, ImageOff, List, Plus } from "lucide-react";
import {
  canManageDesigns,
  designFields,
  type DesignInput,
  type DesignVersion,
  type SavedDesign,
} from "../../../shared/business";
import type { AuditEntry, Page } from "../../../shared/contracts";
import { useAuth } from "../../context/AuthContext";
import { useConfig } from "../../context/ConfigContext";
import { api } from "../../services/api";
import {
  EmptyState,
  ErrorState,
  FormField,
  LoadingSkeleton,
  Message,
  PageHeader,
  ResponsiveDialog,
  StatusBadge,
} from "../common";
import { DataToolbar, TablePagination } from "../DataTable";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  BusinessActivity,
  BusinessDetail,
  BusinessFields,
  CustomerPicker,
  dateTime,
  endpoint,
  SearchBox,
  useSearch,
  write,
} from "./common";

type DesignDetail = { design: SavedDesign; activity: AuditEntry[] };
export function Designs() {
  const { user } = useAuth();
  const { settings } = useConfig();
  const client = useQueryClient();
  const manage = canManageDesigns(user!.role);
  const { search, setSearch, debounced } = useSearch();
  const [paper, setPaper] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<SavedDesign | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const params = {
    page,
    pageSize: 18,
    search: debounced,
    customerId,
    paperType: paper,
  };
  const designs = useQuery({
    queryKey: ["saved_designs", "list", params],
    queryFn: () => api<Page<SavedDesign>>(endpoint("saved-designs", params)),
  });
  const detail = useQuery({
    queryKey: ["saved_designs", "detail", selected],
    queryFn: () => api<DesignDetail>(endpoint("saved-designs/" + selected)),
    enabled: !!selected,
  });
  return (
    <>
      <PageHeader
        title="Thư viện mẫu thiết kế"
        actions={
          manage && (
            <Button
              onClick={() => {
                setNotice("");
                setEditor("new");
              }}
            >
              <Plus /> Tạo mẫu
            </Button>
          )
        }
      />
      {notice && <Message success>{notice}</Message>}
      <section className="surface business-table-surface">
        <DataToolbar
          actions={
            <div className="business-inline" aria-label="Cách hiển thị mẫu">
              <Button
                title="Dạng lưới"
                aria-label="Dạng lưới"
                aria-pressed={view === "grid"}
                size="icon"
                variant={view === "grid" ? "secondary" : "outline"}
                onClick={() => setView("grid")}
              >
                <Grid2X2 />
              </Button>
              <Button
                title="Dạng danh sách"
                aria-label="Dạng danh sách"
                aria-pressed={view === "list"}
                size="icon"
                variant={view === "list" ? "secondary" : "outline"}
                onClick={() => setView("list")}
              >
                <List />
              </Button>
            </div>
          }
        >
          <SearchBox
            label="Tìm mẫu thiết kế"
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <Input
            aria-label="Lọc vật liệu"
            placeholder="Loại giấy (tên đầy đủ)"
            value={paper}
            maxLength={100}
            list="library-paper-options"
            onChange={(event) => {
              setPaper(event.target.value);
              setPage(1);
            }}
          />
          <datalist id="library-paper-options">
            {settings?.paperTypes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </datalist>
        </DataToolbar>
        <div className="business-design-filter">
          <details open={customerId ? true : undefined}>
            <summary>
              Lọc theo khách hàng{customerName && " · " + customerName}
            </summary>
            <CustomerPicker
              id="design-customer-filter"
              value={customerId}
              name={customerName}
              onChange={(id, name) => {
                setCustomerId(id);
                setCustomerName(name);
                setPage(1);
              }}
            />
          </details>
        </div>
        {designs.error ? (
          <ErrorState
            error={designs.error}
            retry={() => void designs.refetch()}
          />
        ) : designs.isPending ? (
          <LoadingSkeleton />
        ) : !designs.data.items.length ? (
          <EmptyState
            title="Chưa tìm thấy mẫu thiết kế"
            description="Thử tìm kiếm theo sản phẩm hoặc thay đổi bộ lọc."
          />
        ) : (
          <ul
            className={
              "business-designs " +
              (view === "list" ? "business-designs-list" : "")
            }
          >
            {designs.data.items.map((design) => (
              <li key={design.id}>
                <button
                  className="business-design-tile"
                  onClick={() => setSelected(design.id)}
                >
                  <div className="business-design-media">
                    <ImageOff size={23} aria-hidden="true" />
                    <span>Chưa có ảnh</span>
                  </div>
                  <div className="business-design-text">
                    <div>
                      <strong>{design.current.productName}</strong>
                      <small>
                        {design.current.customerName || "Mẫu chung"}
                      </small>
                    </div>
                    <div className="business-inline">
                      <StatusBadge>Phiên bản {design.version}</StatusBadge>
                      {design.current.paperType && (
                        <span className="muted">
                          {design.current.paperType}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        <TablePagination
          total={designs.data?.total ?? 0}
          page={page}
          pageSize={18}
          onPage={setPage}
        />
      </section>
      {selected && !editor && (
        <ResponsiveDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          wide
          title={detail.data?.design.current.productName ?? "Chi tiết mẫu"}
          description="Thông tin mẫu và các phiên bản đã lưu."
        >
          <BusinessDetail loading={detail.isPending} error={detail.error}>
            {detail.data && (
              <DesignDetails
                key={selected}
                detail={detail.data}
                onEdit={
                  manage ? () => setEditor(detail.data.design) : undefined
                }
              />
            )}
          </BusinessDetail>
        </ResponsiveDialog>
      )}
      {editor && (
        <DesignEditor
          key={editor === "new" ? "new" : editor.id}
          design={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={(design) => {
            setEditor(null);
            setSelected(design.id);
            setPage(1);
            setNotice("Đã lưu phiên bản " + design.version + ".");
            void client.invalidateQueries({ queryKey: ["saved_designs"] });
          }}
        />
      )}
    </>
  );
}
function DesignDetails({
  detail,
  onEdit,
}: {
  detail: DesignDetail;
  onEdit?: () => void;
}) {
  const { design, activity } = detail;
  const [page, setPage] = useState(1);
  const versions = useQuery({
    queryKey: ["saved_designs", "versions", design.id, page],
    queryFn: () =>
      api<Page<DesignVersion>>(
        endpoint("saved-designs/" + design.id + "/versions", {
          page,
          pageSize: 10,
        }),
      ),
  });
  return (
    <div className="business-form">
      <p className="business-image-note">
        <ImageOff size={16} /> Tải ảnh thiết kế sẽ có ở Phase 03.
      </p>
      <section className="business-subsection">
        <h3>Phiên bản hiện tại · {design.version}</h3>
        <VersionFields version={design.current} />
      </section>
      <section className="business-subsection">
        <h3>Lịch sử phiên bản</h3>
        <BusinessDetail loading={versions.isPending} error={versions.error}>
          {versions.data && (
            <>
              {versions.data.items.map((version) => (
                <details key={version.id} className="business-line-details">
                  <summary>
                    <strong>Phiên bản {version.version}</strong>
                    <time>{dateTime(version.createdAt)}</time>
                  </summary>
                  <VersionFields version={version} />
                </details>
              ))}
              {versions.data.total > 10 && (
                <TablePagination
                  total={versions.data.total}
                  page={page}
                  pageSize={10}
                  onPage={setPage}
                />
              )}
            </>
          )}
        </BusinessDetail>
      </section>
      <section className="business-subsection">
        <h3>Lịch sử thao tác</h3>
        <BusinessActivity activity={activity} />
      </section>
      {onEdit && (
        <div className="dialog-actions">
          <Button onClick={onEdit}>Chỉnh sửa và tạo phiên bản</Button>
        </div>
      )}
    </div>
  );
}
function VersionFields({ version }: { version: DesignVersion }) {
  return (
    <BusinessFields
      items={[
        { label: "Sản phẩm", value: version.productName },
        { label: "Khách hàng", value: version.customerName },
        { label: "Kích thước", value: version.bagSize },
        { label: "Vật liệu / giấy", value: version.paperType },
        { label: "Định lượng giấy", value: version.paperGsm },
        { label: "Màu", value: version.color },
        { label: "Mã kẽm", value: version.plateReference },
        { label: "Nhãn", value: version.tags.join(", ") },
        { label: "Ghi chú", value: version.note },
      ]}
    />
  );
}
function DesignEditor({
  design,
  onClose,
  onSaved,
}: {
  design: SavedDesign | null;
  onClose: () => void;
  onSaved: (design: SavedDesign) => void;
}) {
  const { settings } = useConfig();
  const [id] = useState(() => design?.id ?? crypto.randomUUID());
  const [draft, setDraft] = useState<DesignInput>(() => ({
    customerId: design?.current.customerId ?? null,
    customerName: design?.current.customerName ?? "",
    productName: design?.current.productName ?? "",
    bagSize: design?.current.bagSize ?? "",
    paperType: design?.current.paperType ?? "",
    paperGsm: design?.current.paperGsm ?? "",
    color: design?.current.color ?? "",
    plateReference: design?.current.plateReference ?? "",
    note: design?.current.note ?? "",
    tags: design?.current.tags ?? [],
  }));
  const [tags, setTags] = useState(draft.tags.join(", "));
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: (input: DesignInput) =>
      design
        ? write<{ design: SavedDesign }>(
            "saved-designs/" + id,
            { ...input, version: design.version },
            "PATCH",
          )
        : write<{ design: SavedDesign }>("saved-designs", { ...input, id }),
    onSuccess: (value) => onSaved(value.design),
  });
  const fields = [
    ["productName", "Tên sản phẩm", 150],
    ["bagSize", "Kích thước", 100],
    ["paperType", "Vật liệu / giấy", 100],
    ["paperGsm", "Định lượng giấy", 60],
    ["color", "Màu", 100],
    ["plateReference", "Mã kẽm", 150],
  ] as const;
  function submit(event: FormEvent) {
    event.preventDefault();
    const input = designFields.safeParse({
      ...draft,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    if (!input.success) {
      setError(
        "Kiểm tra tên mẫu, các trường và số lượng nhãn (tối đa 12 nhãn, 50 ký tự mỗi nhãn).",
      );
      return;
    }
    setError("");
    save.mutate(input.data);
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      wide
      title={design ? "Tạo phiên bản mẫu" : "Tạo mẫu thiết kế"}
      description="Đơn đã chọn phiên bản trước vẫn giữ nguyên thông tin mẫu."
    >
      <form className="business-form" onSubmit={submit}>
        <div className="form-grid">
          <CustomerPicker
            id="design-customer"
            value={draft.customerId ?? ""}
            name={draft.customerName}
            onChange={(customerId, customerName) =>
              setDraft({
                ...draft,
                customerId: customerId || null,
                customerName,
              })
            }
          />
          {!draft.customerId && (
            <FormField
              id="design-customer-name"
              label="Tên khách hàng tham chiếu (tùy chọn)"
              value={draft.customerName}
              maxLength={150}
              onChange={(event) =>
                setDraft({ ...draft, customerName: event.target.value })
              }
            />
          )}
          {fields.map(([key, label, max]) => (
            <FormField
              key={key}
              id={"design-" + key}
              label={label}
              maxLength={max}
              list={key === "paperType" ? "design-papers" : undefined}
              required={key === "productName"}
              value={draft[key]}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
            />
          ))}
          <datalist id="design-papers">
            {settings?.paperTypes.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <FormField
            id="design-tags"
            label="Nhãn"
            value={tags}
            hint="Phân cách các nhãn bằng dấu phẩy."
            maxLength={620}
            onChange={(event) => setTags(event.target.value)}
          />
          <FormField id="design-note" label="Ghi chú">
            <textarea
              id="design-note"
              value={draft.note}
              maxLength={1000}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
            />
          </FormField>
        </div>
        <p className="business-image-note">
          <ImageOff size={16} /> Tải ảnh thiết kế sẽ có ở Phase 03.
        </p>
        {(error || save.error) && (
          <Message>{error || save.error?.message}</Message>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={onClose}
          >
            Đóng
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending
              ? "Đang lưu…"
              : design
                ? "Lưu phiên bản"
                : "Lưu mẫu"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
