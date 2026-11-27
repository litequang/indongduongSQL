import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Page, User } from "../../../shared/contracts";
import {
  productionFields,
  type ProductionInput,
  type ProductionDetail,
  type ProductionOrder,
  type DesignerItem,
} from "../../../shared/production";
import { parseQuickOrderText } from "../../../shared/quick-order-parser";
import { findUniquePrinterMatch } from "../../../shared/printer-matching";
import { api } from "../../services/api";
import { useConfig } from "../../context/ConfigContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FormField, Message, PageHeader } from "../common";
import { endpoint, write } from "../business/common";
import { ImageAttachment } from "../private/ImageAttachment";
import { createSynchronousSubmissionLock } from "../../../shared/submission-lock";
import { useAccess } from "../../services/access";

export function seedFromQueue(items: DesignerItem[]): ProductionInput {
  return productionFields.parse({
    title:
      items
        .map((i) => i.productName)
        .join(" + ")
        .slice(0, 150) || "Lệnh sản xuất",
    instructionRaw: items
      .map((i) => i.instructionRaw)
      .filter(Boolean)
      .join("\n")
      .slice(0, 5000),
    totalSheets: 0,
    isUrgent: items.some((i) => i.isUrgent),
    items: items.map((i) => ({
      id: crypto.randomUUID(),
      productName: i.productName,
      quantity: i.remainingQuantity,
      designVersionId: i.designVersionId,
      allocations: [
        {
          id: crypto.randomUUID(),
          salesItemId: i.id,
          quantity: i.remainingQuantity,
        },
      ],
    })),
  });
}
export function seedFromRun(
  detail: ProductionDetail,
  kind: "REPRINT" | "SUPPLEMENTAL",
): ProductionInput {
  const input = productionFields.parse(
    Object.fromEntries(
      Object.keys(productionFields.shape).map((key) => [
        key,
        detail.order[key as keyof ProductionInput],
      ]),
    ),
  );
  return {
    ...input,
    title:
      (kind === "REPRINT" ? "In lại · " : "In bổ sung · ") +
      detail.order.title.slice(0, 120),
    sourceOrderId: detail.order.id,
    runKind: kind,
    runReason: "",
    items: input.items.map((i) => ({
      ...i,
      id: crypto.randomUUID(),
      allocations: i.allocations
        .filter((a) => a.kind === "OUTPUT")
        .map((a) => ({
          ...a,
          id: crypto.randomUUID(),
          kind: kind === "REPRINT" ? "REPRINT" : "OUTPUT",
          sourceAllocationId: kind === "REPRINT" ? a.id : null,
        })),
    })),
    printImages: input.printImages.map((i) => ({
      ...i,
      id: crypto.randomUUID(),
      imageRegistryId: null,
    })),
  };
}
export function useProductionUsers() {
  return useQuery({
    queryKey: ["users", "production-directory"],
    queryFn: () =>
      api<Page<User>>(
        endpoint("users", {
          active: "true",
          pageSize: 100,
          sort: "name",
          direction: "asc",
        }),
      ),
  });
}
export function QuickComposer({
  seed,
  draft,
  onSaved,
  onCancel,
}: {
  seed?: ProductionInput;
  draft?: ProductionDetail;
  onSaved: (detail: ProductionDetail) => void;
  onCancel: () => void;
}) {
  const { settings } = useConfig();
  const client = useQueryClient();
  const users = useProductionUsers();
  const [id] = useState(() => draft?.order.id ?? crypto.randomUUID());
  const [input, setInput] = useState<ProductionInput>(
    () =>
      seed ??
      productionFields.parse({ title: "Lệnh sản xuất", totalSheets: 0 }),
  );
  const [saved, setSaved] = useState<ProductionDetail | undefined>(draft);
  const [notice, setNotice] = useState("");
  const [parseNotice, setParseNotice] = useState("");
  const [tagsText, setTagsText] = useState(input.tags.join(", "));
  const access = useAccess();
  const lock = useRef(createSynchronousSubmissionLock());
  const createPayload = useRef<ProductionInput | null>(null);
  const dispatchKey = useRef(crypto.randomUUID());
  const sources = useQuery({
    queryKey: ["production_orders", "sources"],
    queryFn: () =>
      api<Page<ProductionOrder>>(
        endpoint("production-orders", { pageSize: 100 }),
      ),
  });
  const queue = useQuery({
    queryKey: ["designer_queue", "composer"],
    queryFn: () =>
      api<Page<DesignerItem>>(endpoint("designer-queue", { pageSize: 100 })),
    enabled: true,
    retry: false,
  });
  const field = <K extends keyof ProductionInput>(
    key: K,
    value: ProductionInput[K],
  ) => {
    setInput((s) => ({ ...s, [key]: value }));
    setNotice("");
  };
  const save = useMutation({
    mutationFn: async (send: boolean) => {
      if (!lock.current.tryAcquire()) return;
      try {
        const candidate = productionFields.parse({
          ...input,
          printImages: input.printImages.map((image) => ({
            ...image,
            imageRegistryId: image.imageRegistryId ?? null,
          })),
          tags: tagsText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
        let result = saved;
        if (result) {
          const remote = await api<ProductionDetail>(
            "/production-orders/" + id,
          );
          if (remote.order.status !== "DRAFT") {
            const officialInput = productionFields.parse(
              Object.fromEntries(
                Object.keys(productionFields.shape).map((key) => [
                  key,
                  remote.order[key as keyof ProductionInput],
                ]),
              ),
            );
            if (JSON.stringify(officialInput) !== JSON.stringify(candidate))
              throw new Error(
                "Lệnh đã được phát hành. Nội dung đang nhập được giữ tại đây; mở lệnh chính thức để xem và tạo revision hoặc lượt in mới.",
              );
            onSaved(remote);
            return;
          }
          if (remote.order.version !== result.order.version)
            throw new Error(
              "Nháp đã được sửa ở cửa sổ khác. Nội dung đang nhập vẫn được giữ; mở lại nháp để đối chiếu trước khi lưu.",
            );
        }
        if (!result) {
          // Preserve the exact first payload through a lost response; recover before applying later edits.
          createPayload.current ??= candidate;
          result = await write<ProductionDetail>("production-orders", {
            id,
            ...createPayload.current,
          });
          setSaved(result);
          createPayload.current = null;
        }
        const current = productionFields.parse(
          Object.fromEntries(
            Object.keys(productionFields.shape).map((key) => [
              key,
              result!.order[key as keyof ProductionInput],
            ]),
          ),
        );
        if (JSON.stringify(current) !== JSON.stringify(candidate)) {
          result = await write<ProductionDetail>(
            "production-orders/" + id,
            { ...candidate, version: result.order.version },
            "PATCH",
          );
          setSaved(result);
          dispatchKey.current = crypto.randomUUID();
        }
        if (send) {
          result = await write<ProductionDetail>(
            "production-orders/" + id + "/dispatch",
            { version: result.order.version, requestId: dispatchKey.current },
          );
          onSaved(result);
        } else setNotice("Đã lưu nháp trên máy chủ. Có thể khôi phục sau F5.");
        void client.invalidateQueries({ queryKey: ["production_orders"] });
        void client.invalidateQueries({ queryKey: ["designer_queue"] });
      } finally {
        lock.current.release();
      }
    },
  });
  const parse = () => {
    const parsed = parseQuickOrderText(input.instructionRaw, {
      paperTypes: settings?.paperTypes,
    });
    const match = findUniquePrinterMatch(
      parsed.printerName || input.instructionRaw,
      users.data?.items ?? [],
    );
    if (parsed.tags) setTagsText(parsed.tags.join(", "));
    setInput((s) => ({
      ...s,
      paperType: parsed.paperType ?? s.paperType,
      paperGsm: parsed.paperGsm ?? s.paperGsm,
      paperWidth: parsed.paperWidth ?? s.paperWidth,
      paperHeight: parsed.paperHeight ?? s.paperHeight,
      color: parsed.color ?? s.color,
      totalSheets: parsed.quantity ?? s.totalSheets,
      plateType: parsed.plateType ?? s.plateType,
      plateNote: parsed.plateNote ?? s.plateNote,
      reference: parsed.sapoCode ?? s.reference,
      tags: parsed.tags ?? s.tags,
      printerId: match?.id ?? s.printerId,
    }));
    setParseNotice(
      match
        ? "Đã nhận diện thợ " +
            match.name +
            ". Kiểm tra lại kỹ thuật trước khi gửi."
        : "Chưa nhận diện duy nhất một thợ in. Chọn thợ từ danh sách và kiểm tra các trường vừa phân tích.",
    );
  };
  const updateItem = (
    index: number,
    patch: Partial<ProductionInput["items"][number]>,
  ) =>
    field(
      "items",
      input.items.map((i, n) => (n === index ? { ...i, ...patch } : i)),
    );
  const selectSource = (index: number, salesItemId: string) => {
    const s = queue.data?.items.find((i) => i.id === salesItemId);
    if (s)
      updateItem(index, {
        productName: s.productName,
        quantity: s.remainingQuantity,
        designVersionId: s.designVersionId,
        allocations: [
          {
            id: crypto.randomUUID(),
            salesItemId: s.id,
            quantity: s.remainingQuantity,
            kind: "OUTPUT",
            sourceAllocationId: null,
          },
        ],
      });
  };
  return (
    <>
      <PageHeader
        title={saved ? "Sửa lệnh nháp" : "Tạo lệnh sản xuất"}
        description="Nhập số sản phẩm và số tờ in riêng biệt. Chỉ lệnh được máy chủ xác nhận mới được phát hành."
        actions={
          <Button variant="outline" onClick={onCancel}>
            Quay lại danh sách
          </Button>
        }
      />
      <form
        className="surface production-form form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(false);
        }}
      >
        <fieldset
          disabled={
            save.isPending ||
            access.data?.permissions.canCreateProductionOrder !== true
          }
          className="form-stack"
        >
          <legend className="sr-only">Thông tin lệnh</legend>
          <FormField id="prod-title" label="Tên lệnh">
            <Input
              id="prod-title"
              required
              maxLength={150}
              value={input.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </FormField>
          <FormField id="prod-instruction" label="Hướng dẫn gốc / nhập nhanh">
            <textarea
              id="prod-instruction"
              rows={4}
              maxLength={5000}
              value={input.instructionRaw}
              onChange={(e) => field("instructionRaw", e.target.value)}
              placeholder="2600 tờ BB58 42x56 @Thợ in"
            />
          </FormField>
          <div>
            <Button type="button" variant="outline" onClick={parse}>
              Phân tích nội dung
            </Button>
            {parseNotice && (
              <p role="status" className="production-hint">
                {parseNotice}
              </p>
            )}
          </div>
          <div className="form-grid">
            {(
              [
                "paperType",
                "paperGsm",
                "paperWidth",
                "paperHeight",
                "color",
                "machine",
              ] as const
            ).map((key, n) => (
              <FormField
                key={key}
                id={"prod-" + key}
                label={
                  [
                    "Loại giấy",
                    "Định lượng",
                    "Khổ rộng",
                    "Khổ dài",
                    "Màu in",
                    "Máy in",
                  ][n]
                }
              >
                <Input
                  id={"prod-" + key}
                  maxLength={
                    key === "paperType" || key === "color" || key === "machine"
                      ? 100
                      : 60
                  }
                  value={input[key]}
                  onChange={(e) => field(key, e.target.value)}
                />
              </FormField>
            ))}
            <FormField id="prod-sheets" label="Tổng tờ in">
              <Input
                id="prod-sheets"
                type="number"
                min={0}
                max={1000000000}
                value={input.totalSheets}
                onChange={(e) => field("totalSheets", Number(e.target.value))}
              />
            </FormField>
            <FormField id="prod-printer" label="Thợ in">
              <select
                id="prod-printer"
                value={input.printerId ?? ""}
                onChange={(e) => field("printerId", e.target.value || null)}
              >
                <option value="">Chưa phân công</option>
                {users.data?.items
                  .filter((u) => u.role === "PRINTER")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField id="prod-plate" label="Loại kẽm">
              <select
                id="prod-plate"
                value={input.plateType}
                onChange={(e) =>
                  field(
                    "plateType",
                    e.target.value as ProductionInput["plateType"],
                  )
                }
              >
                <option value="NEW">Kẽm mới</option>
                <option value="OLD">Kẽm cũ</option>
                <option value="NONE">Không cần kẽm</option>
                <option value="UNKNOWN">Chưa rõ</option>
              </select>
            </FormField>
            <FormField id="prod-plate-note" label="Thông tin kẽm">
              <Input
                id="prod-plate-note"
                maxLength={500}
                value={input.plateNote}
                onChange={(e) => field("plateNote", e.target.value)}
              />
            </FormField>
            <FormField id="prod-kind" label="Loại lượt in">
              <select
                id="prod-kind"
                value={input.runKind}
                onChange={(e) => {
                  field(
                    "runKind",
                    e.target.value as ProductionInput["runKind"],
                  );
                  if (e.target.value === "NORMAL") field("sourceOrderId", null);
                }}
              >
                <option value="NORMAL">Lượt in mới</option>
                <option value="SUPPLEMENTAL">In bổ sung</option>
                <option value="REPRINT">In lại thay thế</option>
              </select>
            </FormField>
            {input.runKind !== "NORMAL" && (
              <>
                <FormField id="prod-source" label="Lệnh gốc">
                  <select
                    id="prod-source"
                    required
                    value={input.sourceOrderId ?? ""}
                    onChange={(e) =>
                      field("sourceOrderId", e.target.value || null)
                    }
                  >
                    <option value="">Chọn lệnh gốc</option>
                    {sources.data?.items
                      .filter(
                        (o) => o.status !== "DRAFT" && o.status !== "CANCELLED",
                      )
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.code} · {o.title}
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField id="prod-run-reason" label="Lý do in lại / bổ sung">
                  <Input
                    id="prod-run-reason"
                    required
                    maxLength={500}
                    value={input.runReason}
                    onChange={(e) => field("runReason", e.target.value)}
                  />
                </FormField>
              </>
            )}
            <FormField id="prod-reference" label="Mã tham chiếu">
              <Input
                id="prod-reference"
                maxLength={120}
                value={input.reference}
                onChange={(e) => field("reference", e.target.value)}
              />
            </FormField>
            <FormField id="prod-tags" label="Nhãn (cách nhau bằng dấu phẩy)">
              <Input
                id="prod-tags"
                maxLength={600}
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </FormField>
          </div>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={input.isUrgent}
              onChange={(e) => field("isUrgent", e.target.checked)}
            />
            Lệnh khẩn
          </label>
          {input.isUrgent && (
            <FormField id="prod-urgent-reason" label="Lý do ưu tiên">
              <Input
                id="prod-urgent-reason"
                maxLength={500}
                value={input.urgentReason}
                onChange={(e) => field("urgentReason", e.target.value)}
              />
            </FormField>
          )}
          <h2>Sản phẩm · đơn vị túi</h2>
          <p className="production-hint">
            Lệnh độc lập có thể không gắn đơn bán hàng. Liên kết truy xuất có số
            lượng 0 không được tính vào sản lượng. In lại nên tạo từ chi tiết
            lệnh gốc để giữ phân bổ nguồn.
          </p>
          {input.items.map((item, index) => (
            <fieldset className="production-item form-stack" key={item.id}>
              <legend>Sản phẩm {index + 1}</legend>
              <div className="form-grid">
                <FormField id={"item-name-" + index} label="Tên sản phẩm">
                  <Input
                    id={"item-name-" + index}
                    required
                    maxLength={150}
                    value={item.productName}
                    onChange={(e) =>
                      updateItem(index, { productName: e.target.value })
                    }
                  />
                </FormField>
                <FormField
                  id={"item-quantity-" + index}
                  label="Số lượng sản phẩm (túi)"
                >
                  <Input
                    id={"item-quantity-" + index}
                    type="number"
                    min={0}
                    max={1000000000}
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, { quantity: Number(e.target.value) })
                    }
                  />
                </FormField>
                <FormField
                  id={"item-source-" + index}
                  label="Lấy sản phẩm bán hàng"
                >
                  <select
                    id={"item-source-" + index}
                    value=""
                    onChange={(e) => selectSource(index, e.target.value)}
                  >
                    <option value="">Chọn để thay liên kết dòng này</option>
                    {queue.data?.items
                      .filter((i) => i.remainingQuantity > 0)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.salesCode} · {i.productName} ·{" "}
                          {i.remainingQuantity} túi
                        </option>
                      ))}
                  </select>
                </FormField>
                <FormField id={"item-note-" + index} label="Ghi chú sản phẩm">
                  <Input
                    id={"item-note-" + index}
                    maxLength={1000}
                    value={item.note}
                    onChange={(e) =>
                      updateItem(index, { note: e.target.value })
                    }
                  />
                </FormField>
              </div>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={item.requiresFinishing}
                  onChange={(e) =>
                    updateItem(index, { requiresFinishing: e.target.checked })
                  }
                />
                Yêu cầu gia công (sản phẩm bán hàng giữ cờ đã chốt)
              </label>
              {item.allocations.map((a, ai) => (
                <div className="production-allocation" key={a.id}>
                  <span>
                    {draft?.allocations.find((v) => v.id === a.id)?.salesCode ??
                      queue.data?.items.find((i) => i.id === a.salesItemId)
                        ?.salesCode ??
                      "Sản phẩm nguồn"}{" "}
                    ·{" "}
                    {a.kind === "REPRINT"
                      ? "In lại thay thế"
                      : a.kind === "TRACE"
                        ? "Chỉ truy xuất"
                        : "Phân bổ sản lượng"}
                  </span>
                  <Input
                    aria-label={`Phân bổ túi ${index + 1}.${ai + 1}`}
                    type="number"
                    min={a.kind === "TRACE" ? 0 : 1}
                    max={1000000000}
                    disabled={a.kind === "TRACE"}
                    value={a.quantity}
                    onChange={(e) =>
                      updateItem(index, {
                        allocations: item.allocations.map((v, n) =>
                          n === ai
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      updateItem(index, {
                        allocations: item.allocations.filter(
                          (v) => v.id !== a.id,
                        ),
                      })
                    }
                  >
                    Bỏ liên kết
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label={"Ghép thêm sản phẩm " + (index + 1)}
                  value=""
                  onChange={(e) => {
                    const s = queue.data?.items.find(
                      (i) => i.id === e.target.value,
                    );
                    if (s)
                      updateItem(index, {
                        quantity: item.quantity + s.remainingQuantity,
                        allocations: [
                          ...item.allocations,
                          {
                            id: crypto.randomUUID(),
                            salesItemId: s.id,
                            quantity: s.remainingQuantity,
                            kind: "OUTPUT",
                            sourceAllocationId: null,
                          },
                        ],
                      });
                  }}
                >
                  <option value="">Ghép thêm nguồn sản phẩm</option>
                  {queue.data?.items
                    .filter(
                      (i) =>
                        i.remainingQuantity > 0 &&
                        !item.allocations.some((a) => a.salesItemId === i.id),
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.salesCode} · {i.productName}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    field(
                      "items",
                      input.items.filter((i) => i.id !== item.id),
                    )
                  }
                >
                  Bỏ sản phẩm
                </Button>
              </div>
            </fieldset>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={input.items.length >= 30}
              onClick={() =>
                field("items", [
                  ...input.items,
                  {
                    id: crypto.randomUUID(),
                    productName: "Sản phẩm",
                    quantity: 0,
                    requiresFinishing: true,
                    note: "",
                    designVersionId: null,
                    allocations: [],
                  },
                ])
              }
            >
              Thêm sản phẩm
            </Button>
          </div>
          <h2>Bình bài kỹ thuật · đơn vị tờ</h2>
          {input.printImages.map((i, index) => (
            <div key={i.id} className="production-allocation">
              <Input
                aria-label={"Tên bình bài " + (index + 1)}
                maxLength={150}
                value={i.label}
                onChange={(e) =>
                  field(
                    "printImages",
                    input.printImages.map((v) =>
                      v.id === i.id ? { ...v, label: e.target.value } : v,
                    ),
                  )
                }
              />
              <Input
                aria-label={"Tờ bình bài " + (index + 1)}
                type="number"
                min={0}
                max={1000000000}
                value={i.sheetCount}
                onChange={(e) =>
                  field(
                    "printImages",
                    input.printImages.map((v) =>
                      v.id === i.id
                        ? { ...v, sheetCount: Number(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  field(
                    "printImages",
                    input.printImages.filter((v) => v.id !== i.id),
                  )
                }
              >
                Bỏ bình bài
              </Button>
              <ImageAttachment
                targetType="PRODUCTION"
                targetId={id}
                slot={i.id}
                value={i.imageRegistryId}
                onChange={(imageRegistryId) => {
                  setNotice("");
                  setInput((current) => ({
                    ...current,
                    printImages: current.printImages.map((v) =>
                      v.id === i.id ? { ...v, imageRegistryId } : v,
                    ),
                  }));
                }}
              />
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={input.printImages.length >= 30}
              onClick={() =>
                field("printImages", [
                  ...input.printImages,
                  {
                    id: crypto.randomUUID(),
                    label: "Bình bài " + (input.printImages.length + 1),
                    note: "",
                    sheetCount: 0,
                  },
                ])
              }
            >
              Thêm bình bài
            </Button>
          </div>
          <Message>
            Ảnh chỉ gắn vào lệnh khi lưu nháp. Nháp ảnh thiết bị được xóa khi
            đăng xuất.
          </Message>
          <div className="form-grid">
            <FormField id="prod-note" label="Ghi chú lệnh">
              <textarea
                id="prod-note"
                rows={2}
                maxLength={1000}
                value={input.note}
                onChange={(e) => field("note", e.target.value)}
              />
            </FormField>
            <FormField id="prod-finishing" label="Ghi chú bàn giao gia công">
              <textarea
                id="prod-finishing"
                rows={2}
                maxLength={1000}
                value={input.finishingNote}
                onChange={(e) => field("finishingNote", e.target.value)}
              />
            </FormField>
          </div>
        </fieldset>
        {users.error && <Message>{users.error.message}</Message>}
        {save.error && <Message>{save.error.message}</Message>}
        {notice && <p role="status">{notice}</p>}
        <div className="production-actions">
          <Button
            type="submit"
            disabled={
              save.isPending ||
              access.data?.permissions.canCreateProductionOrder !== true
            }
          >
            Lưu nháp
          </Button>
          <Button
            type="button"
            disabled={
              save.isPending ||
              access.data?.permissions.canCreateProductionOrder !== true ||
              access.data?.permissions.canDispatchOrder !== true
            }
            onClick={() => save.mutate(true)}
          >
            Lưu và gửi thợ in
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSaved(saved)}
            >
              Xem nháp đã lưu
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
