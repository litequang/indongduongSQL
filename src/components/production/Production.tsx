import { LABELS as FULFILLMENT_LABELS } from "../fulfillment/common";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Page } from "../../../shared/contracts";
import {
  PRODUCTION_STATUSES,
  PRODUCTION_LABELS,
  PLATE_LABELS,
  PLATE_STATUSES,
  canComposeProduction,
  productionFields,
  type ProductionOrder,
  type ProductionDetail,
  type ProductionInput,
} from "../../../shared/production";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { PageHeader, Message, ErrorState, LoadingSkeleton } from "../common";
import { DataTable, DataToolbar } from "../DataTable";
import { Button } from "../ui/button";
import {
  endpoint,
  write,
  SearchBox,
  useSearch,
  localNumber,
  dateTime,
  BusinessFields,
} from "../business/common";
import { QuickComposer, seedFromRun } from "./QuickComposer";
import { ProductionActions } from "./ProductionActions";

export function Production({
  selection,
  seed,
  plates = false,
}: {
  selection?: string;
  seed?: ProductionInput;
  plates?: boolean;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [localSeed, setSeed] = useState<ProductionInput | undefined>();
  const detail = useQuery({
    queryKey: ["production_orders", "detail", selection],
    queryFn: () => api<ProductionDetail>("/production-orders/" + selection),
    enabled: !!selection && selection !== "new",
  });
  const done = (d: ProductionDetail) => {
    client.setQueryData(["production_orders", "detail", d.order.id], d);
    void client.invalidateQueries({ queryKey: ["production_orders"] });
    location.hash = "production/" + d.order.id;
  };
  if (selection === "new")
    return (
      <QuickComposer
        key={localSeed ? JSON.stringify(localSeed) : "new"}
        seed={localSeed ?? seed}
        onSaved={done}
        onCancel={() => {
          location.hash = "production";
        }}
      />
    );
  if (selection) {
    if (detail.isPending) return <LoadingSkeleton />;
    if (detail.error)
      return (
        <ErrorState error={detail.error} retry={() => void detail.refetch()} />
      );
    const d = detail.data!,
      o = d.order;
    if (o.status === "DRAFT" && o.createdBy === user!.id)
      return (
        <QuickComposer
          key={o.id}
          seed={productionFieldsOnly(o)}
          draft={d}
          onSaved={done}
          onCancel={() => {
            location.hash = "production";
          }}
        />
      );
    const newRun = (kind: "REPRINT" | "SUPPLEMENTAL") => {
      setSeed(seedFromRun(d, kind));
      location.hash = "production/new";
    };
    return (
      <>
        <PageHeader
          title={`${o.code} · ${o.title}`}
          description={`${PRODUCTION_LABELS[o.status]} · ${o.printerName || "Chưa phân công"} · revision ${o.revision}`}
          actions={
            <Button variant="outline" asChild>
              <a href="#production">Danh sách lệnh</a>
            </Button>
          }
        />
        {o.isUrgent && (
          <Message>Lệnh khẩn · {o.urgentReason || "Ưu tiên sản xuất"}</Message>
        )}
        <div className="production-detail-grid">
          <section className="surface production-panel">
            <h2>Hướng dẫn sản xuất</h2>
            <p className="production-instruction">{o.instructionRaw}</p>
            {user!.role === "PRINTER" && (
              <p>
                {o.paperType} {o.paperGsm} · {o.paperWidth} × {o.paperHeight} ·{" "}
                {localNumber(o.totalSheets)} tờ · {PLATE_LABELS[o.plateStatus]}
              </p>
            )}
            <details open={user!.role !== "PRINTER"}>
              <summary>Thông số kỹ thuật và ghi chú</summary>
              <BusinessFields
                items={[
                  {
                    label: "Giấy / định lượng",
                    value: o.paperType + " " + o.paperGsm,
                  },
                  {
                    label: "Khổ giấy",
                    value: o.paperWidth + " × " + o.paperHeight,
                  },
                  { label: "Màu / máy", value: o.color + " · " + o.machine },
                  {
                    label: "Tờ in kế hoạch",
                    value: localNumber(o.totalSheets),
                  },
                  {
                    label: "Thợ xác nhận",
                    value: `Revision ${o.acknowledgedRevision} / ${o.revision}`,
                  },
                  { label: "Kẽm", value: PLATE_LABELS[o.plateStatus] },
                  { label: "Tham chiếu", value: o.reference },
                  {
                    label: "Loại lượt in",
                    value:
                      o.runKind === "NORMAL"
                        ? "Lượt mới"
                        : o.runKind === "REPRINT"
                          ? "In lại thay thế"
                          : "In bổ sung",
                  },
                  { label: "Ghi chú kẽm", value: o.plateNote },
                  { label: "Ghi chú", value: o.note },
                  { label: "Bàn giao gia công", value: o.finishingNote },
                ]}
              />
            </details>
            {o.sourceOrderId && (
              <a href={"#production/" + o.sourceOrderId}>
                Xem lệnh gốc · {o.runReason}
              </a>
            )}
            {o.printedAt && (
              <>
                <h3>Kết quả in</h3>
                <p>
                  {localNumber(o.actualPrintedSheets ?? 0)} tờ thực in ·{" "}
                  {localNumber(o.spoilageSheets ?? 0)} tờ hỏng
                </p>
                <p>{o.printedNote}</p>
                <Message>
                  Đã in xong. Xem trạng thái từng bàn giao bên dưới. Nghiệm thu
                  thành phẩm mới ghi tăng tồn kho.
                </Message>
              </>
            )}
            {o.printImages.length > 0 && (
              <>
                <h3>Bình bài kỹ thuật</h3>
                {o.printImages.map((i) => (
                  <p key={i.id}>
                    {i.label} · {localNumber(i.sheetCount)} tờ · {i.note}
                  </p>
                ))}
              </>
            )}
            <p className="production-hint">
              Đính kèm ảnh chưa khả dụng (Phase 03).
            </p>
            {canComposeProduction(user!.role) && o.status !== "CANCELLED" && (
              <div className="production-actions">
                <Button
                  variant="outline"
                  onClick={() => newRun("SUPPLEMENTAL")}
                >
                  Tạo lệnh in bổ sung
                </Button>
                {o.status === "PRINTED" && (
                  <Button variant="outline" onClick={() => newRun("REPRINT")}>
                    Tạo lệnh in lại
                  </Button>
                )}
              </div>
            )}
          </section>
          <ProductionActions key={o.id} detail={d} onUpdate={done} />
        </div>
        <section className="surface production-panel">
          <h2>Sản phẩm và phân bổ</h2>
          {!o.items.length && (
            <p>Lệnh độc lập, không phân bổ sản phẩm bán hàng.</p>
          )}
          {o.items.map((i) => (
            <article className="production-line" key={i.id}>
              <strong>
                {i.productName} · {localNumber(i.quantity)} túi
              </strong>
              <p>{i.note}</p>
              {i.allocations.map((a) => {
                const link = d.allocations.find((v) => v.id === a.id);
                return (
                  <p key={a.id}>
                    <a href={"#sales/" + link?.salesOrderId}>
                      {link?.salesCode}
                    </a>{" "}
                    · {link?.customerName} · {localNumber(a.quantity)} túi ·{" "}
                    {a.kind === "TRACE"
                      ? "Chỉ truy xuất"
                      : a.kind === "REPRINT"
                        ? "In lại thay thế"
                        : "Phân bổ sản lượng"}{" "}
                    ·{" "}
                    {link?.state === "RELEASED"
                      ? "Đã hoàn trả"
                      : link?.state === "ACTIVE"
                        ? "Đang hiệu lực"
                        : "Đề xuất"}
                  </p>
                );
              })}
            </article>
          ))}
          {d.handoffs.map((h) => (
            <p key={h.id}>
              {localNumber(h.quantity)} túi ·{" "}
              {h.superseded ? "Liên kết cũ đã thay thế · " : ""}
              {h.requiresFinishing
                ? "Cần gia công"
                : "Cần xác nhận không gia công"}{" "}
              {!h.superseded &&
                " · " +
                  (h.inspected
                    ? "Đã nghiệm thu"
                    : FULFILLMENT_LABELS[h.taskStatus ?? "PENDING_RECEIPT"])}
              {h.replacement
                ? " · Sản lượng thay thế, cần đối soát nghiệm thu"
                : ""}
            </p>
          ))}
        </section>
        <section className="surface production-panel">
          <h2>Lịch sử hoạt động</h2>
          <ol className="production-timeline">
            {d.history.map((h) => (
              <li key={h.id}>
                <strong>{eventLabel(h.action)}</strong>
                <span>
                  {h.actorName} · {dateTime(h.createdAt)}
                </span>
                {h.note && <p>{h.note}</p>}
              </li>
            ))}
          </ol>
          <details>
            <summary>Lịch sử revision ({d.revisions.length})</summary>
            {d.revisions.map((r) => (
              <article className="production-line" key={r.revision}>
                <strong>
                  Revision {r.revision} · {r.actorName}
                </strong>
                <p className="production-instruction">{r.instructionRaw}</p>
                <p>
                  {r.technical.paperType} {r.technical.paperGsm} ·{" "}
                  {r.technical.paperWidth} × {r.technical.paperHeight} ·{" "}
                  {r.technical.color} · {localNumber(r.technical.totalSheets)}{" "}
                  tờ
                </p>
              </article>
            ))}
          </details>
          <details>
            <summary>Lịch sử kẽm ({d.plates.length})</summary>
            {d.plates.map((p) => (
              <p key={p.id}>
                {PLATE_LABELS[p.status]} · {p.note} · {p.actorName} ·{" "}
                {dateTime(p.createdAt)}
              </p>
            ))}
          </details>
        </section>
      </>
    );
  }
  return (
    <ProductionList
      plates={plates}
      onCreate={() => {
        setSeed(
          productionFields.parse({ title: "Lệnh sản xuất", totalSheets: 0 }),
        );
        location.hash = "production/new";
      }}
    />
  );
}
function productionFieldsOnly(o: ProductionOrder): ProductionInput {
  const {
    title,
    instructionRaw,
    paperType,
    paperGsm,
    paperWidth,
    paperHeight,
    color,
    totalSheets,
    machine,
    printerId,
    note,
    finishingNote,
    reference,
    tags,
    isUrgent,
    urgentReason,
    runKind,
    sourceOrderId,
    runReason,
    plateType,
    plateNote,
    items,
    printImages,
  } = o;
  return {
    title,
    instructionRaw,
    paperType,
    paperGsm,
    paperWidth,
    paperHeight,
    color,
    totalSheets,
    machine,
    printerId,
    note,
    finishingNote,
    reference,
    tags,
    isUrgent,
    urgentReason,
    runKind,
    sourceOrderId,
    runReason,
    plateType,
    plateNote,
    items,
    printImages,
  };
}
export function eventLabel(action: string) {
  return (
    (
      {
        PRODUCTION_LINK_PRODUCTS: "Liên kết sản phẩm bán hàng",
        PRODUCTION_DRAFT_CREATED: "Tạo nháp",
        PRODUCTION_DRAFT_UPDATED: "Sửa nháp",
        PRODUCTION_DISPATCH: "Phát lệnh",
        PRODUCTION_ACCEPT: "Nhận lệnh",
        PRODUCTION_WAIT_PRINT: "Chờ in",
        PRODUCTION_ACKNOWLEDGE: "Xác nhận kỹ thuật",
        PRODUCTION_START: "Bắt đầu in",
        PRODUCTION_COMPLETE: "Hoàn thành in",
        PRODUCTION_REVISE: "Sửa kỹ thuật / phân công",
        PRODUCTION_URGENT: "Thay đổi ưu tiên",
        PRODUCTION_PLATE_SEND: "Gửi kẽm",
        PRODUCTION_PLATE_RECEIVE: "Nhận kẽm",
        PRODUCTION_PLATE_REPORT: "Báo kẽm hỏng / thiếu",
        PRODUCTION_PLATE_REISSUE: "Ra lại kẽm",
        PRODUCTION_ISSUE_REPORT: "Báo sự cố",
        PRODUCTION_ISSUE_ASSIGN: "Phân công sự cố",
        PRODUCTION_ISSUE_RESOLVE: "Giải quyết sự cố",
        PRODUCTION_ISSUE_CANCEL: "Hủy báo cáo",
        PRODUCTION_CANCEL_REQUEST: "Yêu cầu hủy",
        PRODUCTION_CANCEL_RESPOND: "Phản hồi hủy",
        PRODUCTION_COMMENT: "Bình luận",
      } as Record<string, string>
    )[action] ?? action
  );
}
function ProductionList({
  plates,
  onCreate,
}: {
  plates: boolean;
  onCreate: () => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [status, setStatus] = useState(""),
    [plateStatus, setPlate] = useState(""),
    [machine, setMachine] = useState("");
  const { search, setSearch, debounced } = useSearch();
  const [selected, setSelected] = useState<ProductionOrder[]>([]);
  const [results, setResults] = useState<
    {
      id: string;
      ok: boolean;
      order?: ProductionOrder;
      error?: { message: string };
    }[]
  >([]);
  const keys = useRef(new Map<string, string>());
  const lock = useRef(false);
  const list = useQuery({
    queryKey: [
      "production_orders",
      "list",
      page,
      pageSize,
      status,
      plateStatus,
      debounced,
      machine,
    ],
    queryFn: () =>
      api<Page<ProductionOrder>>(
        endpoint("production-orders", {
          page,
          pageSize,
          status,
          plateStatus,
          search: debounced,
          machine,
        }),
      ),
  });
  const dashboard = useQuery({
    queryKey: ["production_orders", "dashboard", user!.id],
    queryFn: async () => {
      const data = [];
      for (const state of [
        "WAITING_ACCEPTANCE",
        "PRINTING",
        "PRINTED",
      ] as const) {
        const r = await api<Page<ProductionOrder>>(
          endpoint("production-orders", { status: state, pageSize: 1 }),
        );
        data.push({ state, total: r.total });
      }
      return data;
    },
  });
  const batch = useMutation({
    mutationFn: async () => {
      if (lock.current) return;
      lock.current = true;
      try {
        const items = selected.map((o) => {
          const key = o.id + ":" + o.version;
          if (!keys.current.has(key))
            keys.current.set(key, crypto.randomUUID());
          return {
            id: o.id,
            version: o.version,
            requestId: keys.current.get(key)!,
          };
        });
        const data = await write<{ results: typeof results }>(
          "production-batches/dispatch",
          { items },
        );
        setResults(data.results);
        setSelected((s) =>
          s.filter((o) => !data.results.some((r) => r.id === o.id && r.ok)),
        );
        void client.invalidateQueries({ queryKey: ["production_orders"] });
      } finally {
        lock.current = false;
      }
    },
  });
  const choose = (o: ProductionOrder) => (
    <input
      type="checkbox"
      aria-label={"Chọn nháp " + o.title}
      disabled={selected.length >= 20 && !selected.some((i) => i.id === o.id)}
      checked={selected.some((i) => i.id === o.id)}
      onChange={() =>
        setSelected((s) =>
          s.some((i) => i.id === o.id)
            ? s.filter((i) => i.id !== o.id)
            : [...s, o],
        )
      }
    />
  );
  const open = (o: ProductionOrder) => {
    location.hash = "production/" + o.id;
  };
  const active = user!.role === "PRINTER";
  return (
    <>
      <PageHeader
        title={
          plates
            ? "Quản lý kẽm"
            : active
              ? "Công việc in được giao"
              : "Lệnh sản xuất"
        }
        description={
          plates
            ? "Luồng kẽm độc lập, đầy đủ ghi nhận giao nhận và sự cố."
            : active
              ? "Nhận lệnh, xác nhận kỹ thuật và ghi kết quả in."
              : "Điều hành lượt in, sản phẩm và tiến độ xưởng."
        }
        actions={
          canComposeProduction(user!.role) && (
            <Button onClick={onCreate}>Tạo lệnh sản xuất</Button>
          )
        }
      />
      {!plates && (
        <div className="production-stats">
          {dashboard.data?.map((s) => (
            <button
              key={s.state}
              onClick={() => {
                setStatus(s.state);
                setPage(1);
              }}
            >
              <strong>{s.total}</strong>
              <span>{PRODUCTION_LABELS[s.state]}</span>
            </button>
          ))}
        </div>
      )}
      {list.error && <Message>{list.error.message}</Message>}
      {dashboard.error && <Message>{dashboard.error.message}</Message>}
      <section className="surface business-table-surface production-table-surface">
        <DataToolbar
          actions={
            canComposeProduction(user!.role) && (
              <Button
                variant="outline"
                disabled={!selected.length || batch.isPending}
                onClick={() => batch.mutate()}
              >
                Gửi {selected.length} nháp đã chọn
              </Button>
            )
          }
        >
          <SearchBox
            label="Tìm mã, tên hoặc hướng dẫn"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <select
            aria-label="Trạng thái sản xuất"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái</option>
            {PRODUCTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRODUCTION_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Trạng thái kẽm"
            value={plateStatus}
            onChange={(e) => {
              setPlate(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái kẽm</option>
            {PLATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PLATE_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            className="production-machine-filter"
            aria-label="Lọc máy in"
            placeholder="Máy in (tên chính xác)"
            value={machine}
            onChange={(e) => {
              setMachine(e.target.value);
              setPage(1);
            }}
            maxLength={100}
          />
        </DataToolbar>
        <DataTable
          data={list.data?.items ?? []}
          columns={[
            {
              id: "code",
              header: "Lệnh in",
              enableSorting: false,
              cell: ({ row: r }) => (
                <button className="table-link" onClick={() => open(r.original)}>
                  {r.original.code ?? "Nháp"} · {r.original.title}
                  {r.original.isUrgent ? " · Khẩn" : ""}
                </button>
              ),
            },
            {
              id: "tech",
              header: "Kỹ thuật",
              enableSorting: false,
              cell: ({ row: r }) => (
                <>
                  {r.original.paperType} {r.original.paperGsm}
                  <small className="block">
                    {r.original.paperWidth} × {r.original.paperHeight} ·{" "}
                    {localNumber(r.original.totalSheets)} tờ
                  </small>
                </>
              ),
            },
            {
              id: "printer",
              header: "Thợ / máy",
              enableSorting: false,
              cell: ({ row: r }) =>
                r.original.printerName + " · " + r.original.machine,
            },
            {
              id: "status",
              header: "Trạng thái",
              enableSorting: false,
              cell: ({ row: r }) => (
                <span className="status-badge neutral">
                  {PRODUCTION_LABELS[r.original.status]}
                </span>
              ),
            },
            {
              id: "plate",
              header: "Kẽm",
              enableSorting: false,
              cell: ({ row: r }) => PLATE_LABELS[r.original.plateStatus],
            },
            {
              id: "select",
              header: "Chọn nháp",
              enableSorting: false,
              cell: ({ row: r }) =>
                r.original.status === "DRAFT" ? choose(r.original) : "—",
            },
          ]}
          total={list.data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
          sorting={[]}
          onSorting={() => {}}
          loading={list.isPending}
          label="lệnh in"
          preferenceKey="production"
          renderMobile={(o) => (
            <article key={o.id} className="production-mobile-row">
              <div className="flex justify-between gap-3">
                <button className="table-link" onClick={() => open(o)}>
                  {o.code ?? "Nháp"} · {o.title}
                </button>
                {o.status === "DRAFT" && choose(o)}
              </div>
              <p>
                {PRODUCTION_LABELS[o.status]}
                {o.isUrgent ? " · Khẩn" : ""}
              </p>
              <p>
                {o.paperType} {o.paperGsm} · {localNumber(o.totalSheets)} tờ
              </p>
              <p>
                {PLATE_LABELS[o.plateStatus]} · {o.printerName}
              </p>
              <Button
                className={active ? "printer-touch" : ""}
                variant="outline"
                onClick={() => open(o)}
              >
                Mở lệnh
              </Button>
            </article>
          )}
        />
      </section>
      {batch.error && (
        <Message>
          {batch.error.message} · Có thể thử lại cùng lô để đối chiếu kết quả từ
          máy chủ.
        </Message>
      )}
      {results.length > 0 && (
        <section
          className="surface production-panel"
          aria-label="Kết quả gửi lô"
        >
          <h2>Kết quả từng lệnh</h2>
          {results.map((r, index) => (
            <p key={r.id + "-" + index} role="status">
              {r.ok ? (
                <a href={"#production/" + r.id}>{r.order?.code} · Đã gửi</a>
              ) : (
                <>
                  Nháp {selected.find((o) => o.id === r.id)?.title} ·{" "}
                  {r.error?.message}{" "}
                  <a href={"#production/" + r.id}>Sửa nháp</a>
                </>
              )}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
