import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Page } from "../../../shared/contracts";
import type { DesignerItem } from "../../../shared/production";
import { api } from "../../services/api";
import { DataTable, DataToolbar } from "../DataTable";
import { PageHeader, Message, FormField } from "../common";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  endpoint,
  write,
  SearchBox,
  useSearch,
  localNumber,
} from "../business/common";

export const QUEUE_LABELS: Record<string, string> = {
  WAITING_DESIGN: "Chờ thiết kế",
  NEEDS_INFO: "Thiếu thông tin",
  DESIGNING: "Đang thiết kế",
  READY_FOR_PRODUCTION: "Sẵn sàng sản xuất",
};
export function DesignerQueue({
  onCompose,
}: {
  onCompose: (items: DesignerItem[]) => void;
}) {
  const client = useQueryClient();
  const { search, setSearch, debounced } = useSearch();
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [status, setStatus] = useState("");
  const [selected, setSelected] = useState<DesignerItem[]>([]),
    [editing, setEditing] = useState<DesignerItem | null>(null);
  const list = useQuery({
    queryKey: ["designer_queue", page, pageSize, debounced, status],
    queryFn: () =>
      api<Page<DesignerItem>>(
        endpoint("designer-queue", {
          page,
          pageSize,
          search: debounced,
          status,
        }),
      ),
  });
  function pick(item: DesignerItem) {
    setSelected((s) =>
      s.some((i) => i.id === item.id)
        ? s.filter((i) => i.id !== item.id)
        : [...s, item],
    );
  }
  const checkbox = (i: DesignerItem) => (
    <input
      type="checkbox"
      aria-label={"Chọn " + i.salesCode + " " + i.productName}
      checked={selected.some((s) => s.id === i.id)}
      disabled={i.remainingQuantity === 0}
      onChange={() => pick(i)}
    />
  );
  return (
    <>
      <PageHeader
        title="Hàng đợi thiết kế"
        description="Chốt kỹ thuật và phân bổ sản phẩm vào các lượt in."
        actions={
          <Button
            disabled={!selected.length}
            onClick={() => onCompose(selected)}
          >
            Tạo lệnh từ {selected.length} sản phẩm
          </Button>
        }
      />
      {list.error && <Message>{list.error.message}</Message>}
      <section className="surface business-table-surface production-table-surface">
        <DataToolbar>
          <SearchBox
            label="Tìm sản phẩm, đơn hoặc khách"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <select
            aria-label="Trạng thái thiết kế"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Mọi trạng thái thiết kế</option>
            {Object.entries(QUEUE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </DataToolbar>
        <DataTable
          data={list.data?.items ?? []}
          columns={[
            {
              id: "select",
              header: "Chọn",
              enableSorting: false,
              cell: ({ row }) => checkbox(row.original),
            },
            {
              accessorKey: "productName",
              header: "Sản phẩm",
              enableSorting: false,
              cell: ({ row: r }) => (
                <>
                  <strong>{r.original.productName}</strong>
                  <small className="block">
                    {r.original.customerName} ·{" "}
                    <a href={"#sales/" + r.original.orderId}>
                      {r.original.salesCode}
                    </a>
                  </small>
                </>
              ),
            },
            {
              id: "quantity",
              header: "Sản phẩm (túi)",
              enableSorting: false,
              cell: ({ row: r }) => (
                <>
                  {localNumber(r.original.remainingQuantity)} còn lại /{" "}
                  {localNumber(r.original.quantity)}
                </>
              ),
            },
            {
              id: "status",
              header: "Thiết kế",
              enableSorting: false,
              cell: ({ row: r }) => (
                <>
                  {QUEUE_LABELS[r.original.queueStatus]}
                  {r.original.isUrgent && " · Khẩn"}
                </>
              ),
            },
            {
              id: "design",
              header: "Mẫu",
              enableSorting: false,
              cell: ({ row: r }) =>
                r.original.designName
                  ? `${r.original.designName} · v${r.original.designVersion}`
                  : "Chưa chọn mẫu",
            },
            {
              id: "action",
              header: "Thao tác",
              enableSorting: false,
              cell: ({ row: r }) => (
                <Button
                  variant="outline"
                  onClick={() => setEditing(r.original)}
                  disabled={r.original.status === "IN_PRODUCTION"}
                >
                  Kỹ thuật
                </Button>
              ),
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
          label="sản phẩm"
          preferenceKey="designer-queue"
          renderMobile={(i) => (
            <article className="production-mobile-row" key={i.id}>
              <div className="flex gap-3">
                {checkbox(i)}
                <div>
                  <strong>{i.productName}</strong>
                  <p>
                    {i.customerName} · {i.salesCode}
                  </p>
                  <p>
                    {localNumber(i.remainingQuantity)} túi còn lại ·{" "}
                    {QUEUE_LABELS[i.queueStatus]}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(i)}
                    disabled={i.status === "IN_PRODUCTION"}
                  >
                    Kỹ thuật
                  </Button>
                </div>
              </div>
            </article>
          )}
        />
      </section>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="responsive-dialog">
          <DialogHeader>
            <DialogTitle>Kỹ thuật sản phẩm</DialogTitle>
            <DialogDescription>
              {editing?.productName} · {editing?.salesCode}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <QueueEditor
              key={editing.id}
              item={editing}
              done={() => {
                setEditing(null);
                void client.invalidateQueries({ queryKey: ["designer_queue"] });
                void client.invalidateQueries({ queryKey: ["sales_orders"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function QueueEditor({ item, done }: { item: DesignerItem; done: () => void }) {
  const [status, setStatus] = useState(item.queueStatus),
    [instructionRaw, setInstruction] = useState(item.instructionRaw),
    [note, setNote] = useState(item.note),
    [isUrgent, setUrgent] = useState(item.isUrgent);
  const save = useMutation({
    mutationFn: () =>
      write(
        "designer-queue/" + item.id,
        { version: item.version, status, instructionRaw, note, isUrgent },
        "PATCH",
      ),
    onSuccess: done,
  });
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <FormField id="queue-status" label="Trạng thái">
        <select
          id="queue-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {Object.entries(QUEUE_LABELS).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="queue-instruction" label="Hướng dẫn kỹ thuật">
        <textarea
          id="queue-instruction"
          maxLength={5000}
          rows={5}
          value={instructionRaw}
          onChange={(e) => setInstruction(e.target.value)}
        />
      </FormField>
      <FormField id="queue-note" label="Ghi chú">
        <Input
          id="queue-note"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={isUrgent}
          onChange={(e) => setUrgent(e.target.checked)}
        />
        Ưu tiên khẩn
      </label>
      {save.error && <Message>{save.error.message}</Message>}
      <Button disabled={save.isPending}>Lưu kỹ thuật</Button>
    </form>
  );
}
