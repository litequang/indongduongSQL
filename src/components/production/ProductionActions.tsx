import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  canComposeProduction,
  canReviseProduction,
  isManagement,
  ISSUE_POLICIES,
  ISSUE_TYPES,
  type ProductionAction,
  type ProductionDetail,
  type ProductionIssue,
} from "../../../shared/production";
import { ROLE_LABELS, type Role } from "../../../shared/contracts";
import { useAuth } from "../../context/AuthContext";
import { write, dateTime } from "../business/common";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FormField, Message } from "../common";
import { useProductionUsers } from "./QuickComposer";
import { LinkProducts } from "./LinkProducts";

export function ProductionActions({
  detail,
  onUpdate,
}: {
  detail: ProductionDetail;
  onUpdate: (detail: ProductionDetail) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const o = detail.order;
  const actor = user!;
  const users = useProductionUsers();
  const assigned = actor.role === "PRINTER" && o.printerId === actor.id,
    designer = canReviseProduction(actor.role),
    commercial = canComposeProduction(actor.role),
    preprint = ["WAITING_ACCEPTANCE", "ACCEPTED", "WAITING_PRINT"].includes(
      o.status,
    );
  const [reason, setReason] = useState(""),
    [comment, setComment] = useState(""),
    [message, setMessage] = useState(""),
    [issueType, setIssueType] =
      useState<(typeof ISSUE_TYPES)[number]>("GENERAL");
  const [recipientUserIds, setRecipients] = useState<string[]>([]),
    [recipientRoles, setRoles] = useState<Role[]>([]);
  const [instruction, setInstruction] = useState(o.instructionRaw),
    [printerId, setPrinter] = useState(o.printerId ?? ""),
    [actual, setActual] = useState(o.totalSheets),
    [spoilage, setSpoilage] = useState(0);
  const [tech, setTech] = useState({
    paperType: o.paperType,
    paperGsm: o.paperGsm,
    paperWidth: o.paperWidth,
    paperHeight: o.paperHeight,
    color: o.color,
    totalSheets: o.totalSheets,
    machine: o.machine,
  });
  const lock = useRef(false),
    receipts = useRef(new Map<string, string>());
  const mutation = useMutation({
    mutationFn: async ({
      action,
      fields,
    }: {
      action: ProductionAction;
      fields: Record<string, unknown>;
    }) => {
      if (lock.current) return;
      lock.current = true;
      try {
        const key = JSON.stringify([o.version, action, fields]);
        if (!receipts.current.has(key))
          receipts.current.set(key, crypto.randomUUID());
        const d = await write<ProductionDetail>(
          "production-orders/" + o.id + "/" + action,
          {
            version: o.version,
            requestId: receipts.current.get(key),
            ...fields,
          },
        );
        onUpdate(d);
        if (action === "comment") setComment("");
        if (action === "issue-report") setMessage("");
      } finally {
        lock.current = false;
      }
    },
  });
  const act = (
    action: ProductionAction,
    fields: Record<string, unknown> = {},
  ) => mutation.mutate({ action, fields });
  const button = (
    label: string,
    action: ProductionAction,
    fields: Record<string, unknown> = {},
    disabled = false,
  ) => (
    <Button
      type="button"
      className={assigned ? "printer-touch" : ""}
      variant={
        action === "start" || action === "accept" || action === "complete"
          ? "default"
          : "outline"
      }
      disabled={mutation.isPending || disabled}
      onClick={() => act(action, fields)}
    >
      {label}
    </Button>
  );
  const pending = detail.cancellations.find((c) => c.status === "PENDING");
  const canResolve = (issue: ProductionIssue) => {
    const rank: Partial<Record<Role, number>> = {
      MANAGER: 1,
      ADMIN: 2,
      DEVELOPER: 3,
    };
    return (
      issue.recipientUserIds.includes(actor.id) ||
      issue.recipientRoles.includes(actor.role) ||
      issue.recipientRoles.some(
        (r) => rank[r] !== undefined && (rank[actor.role] ?? 0) >= rank[r]!,
      )
    );
  };
  return (
    <section
      className="surface production-panel form-stack"
      aria-label="Thao tác lệnh"
    >
      <h2>{assigned ? "Thao tác thợ in" : "Điều hành lệnh"}</h2>
      {mutation.error && (
        <Message>
          {mutation.error.message} Tải lại lệnh để đối chiếu trạng thái máy chủ
          trước khi thử tiếp.
          <Button
            variant="outline"
            onClick={() => {
              void queryClient.invalidateQueries({
                queryKey: ["production_orders", "detail", o.id],
              });
              mutation.reset();
            }}
          >
            Tải lại trạng thái
          </Button>
        </Message>
      )}
      {assigned && (
        <>
          <div className="production-actions">
            {o.status === "WAITING_ACCEPTANCE" && button("Nhận lệnh", "accept")}
            {preprint &&
              button(
                `Xác nhận kỹ thuật revision ${o.revision}`,
                "acknowledge",
                { revision: o.revision },
                o.acknowledgedRevision === o.revision,
              )}
            {o.status === "ACCEPTED" && button("Chuyển chờ in", "wait-print")}
            {["ACCEPTED", "WAITING_PRINT"].includes(o.status) &&
              button(
                "Bắt đầu in",
                "start",
                {},
                o.acknowledgedRevision !== o.revision || !!pending,
              )}
          </div>
          {preprint && o.acknowledgedRevision !== o.revision && (
            <Message>
              Đọc hướng dẫn gốc và xác nhận revision {o.revision} trước khi bắt
              đầu.
            </Message>
          )}
        </>
      )}
      {pending && (
        <div className="production-cancellation">
          <h3>Đang chờ phản hồi hủy</h3>
          <p>
            {pending.requesterName} · {pending.reason}
          </p>
          <p>Bắt đầu in bị khóa trong khi chờ phản hồi.</p>
          {assigned && (
            <>
              <FormField id="cancel-response" label="Lý do phản hồi">
                <Input
                  id="cancel-response"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </FormField>
              <div className="production-actions">
                {button(
                  "Đồng ý hủy lệnh",
                  "cancel-respond",
                  { cancellationId: pending.id, accept: true, reason },
                  !reason.trim(),
                )}
                {button(
                  "Từ chối hủy",
                  "cancel-respond",
                  { cancellationId: pending.id, accept: false, reason },
                  !reason.trim(),
                )}
              </div>
            </>
          )}
        </div>
      )}
      {assigned && o.status === "PRINTING" && (
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            act("complete", {
              actualPrintedSheets: actual,
              spoilageSheets: spoilage,
              note: reason,
            });
          }}
        >
          <h3>Ghi nhận in xong</h3>
          <FormField id="printed-actual" label="Số tờ thực in">
            <Input
              id="printed-actual"
              type="number"
              min={0}
              max={1000000000}
              required
              value={actual}
              onChange={(e) => setActual(Number(e.target.value))}
            />
          </FormField>
          <FormField
            id="printed-spoilage"
            label="Số tờ hỏng (trong số thực in)"
          >
            <Input
              id="printed-spoilage"
              type="number"
              min={0}
              max={actual}
              required
              value={spoilage}
              onChange={(e) => setSpoilage(Number(e.target.value))}
            />
          </FormField>
          <FormField id="printed-note" label="Ghi chú kết quả">
            <Input
              id="printed-note"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          <Button className="printer-touch" disabled={mutation.isPending}>
            Hoàn thành in
          </Button>
        </form>
      )}
      {designer && preprint && (
        <details>
          <summary>Sửa kỹ thuật / phân công</summary>
          <form
            className="form-stack production-inner"
            onSubmit={(e) => {
              e.preventDefault();
              act("revise", {
                technical: { ...tech, instructionRaw: instruction },
                printerId,
                reason,
              });
            }}
          >
            <FormField id="revision-instruction" label="Hướng dẫn revision mới">
              <textarea
                id="revision-instruction"
                required
                rows={4}
                maxLength={5000}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </FormField>
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
              ).map((k, n) => (
                <FormField
                  key={k}
                  id={"revision-" + k}
                  label={
                    [
                      "Loại giấy",
                      "Định lượng",
                      "Khổ rộng",
                      "Khổ dài",
                      "Màu",
                      "Máy",
                    ][n]
                  }
                >
                  <Input
                    id={"revision-" + k}
                    maxLength={100}
                    value={tech[k]}
                    onChange={(e) =>
                      setTech((s) => ({ ...s, [k]: e.target.value }))
                    }
                  />
                </FormField>
              ))}
            </div>
            <FormField id="revision-sheets" label="Tờ in revision">
              <Input
                id="revision-sheets"
                type="number"
                min={1}
                max={1000000000}
                value={tech.totalSheets}
                onChange={(e) =>
                  setTech((s) => ({
                    ...s,
                    totalSheets: Number(e.target.value),
                  }))
                }
              />
            </FormField>
            <FormField id="revision-printer" label="Thợ in được giao">
              <select
                id="revision-printer"
                required
                value={printerId}
                onChange={(e) => setPrinter(e.target.value)}
              >
                {users.data?.items
                  .filter((u) => u.role === "PRINTER")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </FormField>
            <FormField id="revision-reason" label="Lý do sửa">
              <Input
                id="revision-reason"
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
            <Button disabled={mutation.isPending}>
              Lưu revision / phân công
            </Button>
          </form>
        </details>
      )}
      {(designer || assigned || isManagement(actor.role)) &&
        o.status !== "CANCELLED" && (
          <details open>
            <summary>Thao tác kẽm</summary>
            <div className="form-stack production-inner">
              <FormField id="plate-action-note" label="Ghi chú thao tác kẽm">
                <Input
                  id="plate-action-note"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </FormField>
              <div className="production-actions">
                {designer &&
                  o.plateStatus === "NOT_SENT" &&
                  button("Gửi kẽm", "plate-send", { note: reason })}
                {(designer || assigned) &&
                  o.plateStatus === "SENT" &&
                  button("Đã nhận kẽm", "plate-receive")}
                {(assigned || isManagement(actor.role)) &&
                  preprint &&
                  o.plateStatus !== "NOT_REQUIRED" &&
                  button(
                    "Báo thiếu / hỏng kẽm",
                    "plate-report",
                    { reason },
                    !reason.trim(),
                  )}
                {designer &&
                  o.plateStatus === "PLATE_DAMAGED" &&
                  button(
                    "Ra lại kẽm mới",
                    "plate-reissue",
                    { note: reason },
                    !reason.trim(),
                  )}
              </div>
              <small>
                Kẽm và báo cáo sự cố là luồng song song. Điều kiện bắt đầu in:
                đúng thợ, đúng trạng thái, ACK mới nhất, không chờ hủy.
              </small>
            </div>
          </details>
        )}
      {commercial && o.status !== "CANCELLED" && (
        <details>
          <summary>Ưu tiên và yêu cầu hủy</summary>
          <div className="form-stack production-inner">
            <FormField
              id="production-reason"
              label="Lý do ưu tiên / yêu cầu hủy"
            >
              <Input
                id="production-reason"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </FormField>
            <div className="production-actions">
              {button(
                o.isUrgent ? "Bỏ ưu tiên khẩn" : "Đánh dấu khẩn",
                "urgent",
                { isUrgent: !o.isUrgent, reason },
                !reason.trim(),
              )}
              {preprint &&
                !pending &&
                button(
                  "Gửi yêu cầu hủy",
                  "cancel-request",
                  { reason },
                  !reason.trim(),
                )}
            </div>
          </div>
        </details>
      )}
      <h3>Sự cố và người xử lý</h3>
      {commercial &&
        o.status !== "CANCELLED" &&
        o.runKind !== "REPRINT" &&
        o.items.length > 0 && (
          <LinkProducts
            detail={detail}
            disabled={mutation.isPending}
            submit={(fields) => act("link-products", fields)}
          />
        )}
      {detail.issues.length === 0 && (
        <p className="production-hint">Chưa có báo cáo.</p>
      )}
      {detail.issues.map((issue) => (
        <article key={issue.id} className="production-line">
          <strong>
            {issue.type} ·{" "}
            {issue.status === "OPEN"
              ? "Đang mở"
              : issue.status === "RESOLVED"
                ? "Đã giải quyết"
                : "Đã hủy"}
          </strong>
          <p>{issue.message}</p>
          <small>
            {issue.reporterName} · {dateTime(issue.createdAt)}
          </small>
          <p className="production-hint">
            Người nhận:{" "}
            {[
              ...issue.recipientRoles.map((r) => ROLE_LABELS[r]),
              ...issue.recipientUserIds.map(
                (id) =>
                  users.data?.items.find((u) => u.id === id)?.name ??
                  "Nhân viên được chọn",
              ),
            ].join(", ")}{" "}
            · Không chặn in
          </p>
          {issue.status === "OPEN" && (
            <div className="production-actions">
              {canResolve(issue) &&
                button("Giải quyết sự cố", "issue-resolve", {
                  issueId: issue.id,
                })}
              {issue.reportedBy === actor.id &&
                button("Hủy báo cáo", "issue-cancel", { issueId: issue.id })}
              {(issue.reportedBy === actor.id || canResolve(issue)) &&
                button(
                  "Giao người xử lý đã chọn",
                  "issue-assign",
                  { issueId: issue.id, recipientUserIds, recipientRoles },
                  !recipientUserIds.length && !recipientRoles.length,
                )}
            </div>
          )}
        </article>
      ))}
      <details>
        <summary>Báo cáo / chọn người xử lý</summary>
        <div className="form-stack production-inner">
          <FormField
            id="issue-recipient"
            label="Người xử lý (có thể chọn nhiều)"
          >
            <select
              id="issue-recipient"
              multiple
              value={recipientUserIds}
              onChange={(e) =>
                setRecipients(
                  Array.from(e.target.selectedOptions).map((o) => o.value),
                )
              }
            >
              {users.data?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="issue-role" label="Vai trò xử lý">
            <select
              id="issue-role"
              multiple
              value={recipientRoles}
              onChange={(e) =>
                setRoles(
                  Array.from(e.target.selectedOptions).map(
                    (o) => o.value as Role,
                  ),
                )
              }
            >
              {Object.entries(ROLE_LABELS).map(([r, label]) => (
                <option key={r} value={r}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="issue-type" label="Loại sự cố">
            <select
              id="issue-type"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value as typeof issueType)}
            >
              {ISSUE_TYPES.filter((type) =>
                ISSUE_POLICIES[type].reporters.includes(actor.role),
              ).map((type) => (
                <option key={type} value={type}>
                  {
                    {
                      PLATE: "Kẽm",
                      MACHINE: "Máy",
                      PRINT: "Chất lượng in",
                      SHIPPING: "Giao hàng",
                      RETURN: "Hàng trả",
                      GENERAL: "Khác",
                    }[type]
                  }
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="issue-message" label="Nội dung sự cố">
            <textarea
              id="issue-message"
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </FormField>
          {button(
            "Gửi báo cáo sự cố",
            "issue-report",
            {
              type: issueType,
              message,
              recipientUserIds,
              recipientRoles,
              urgent: false,
            },
            !message.trim() || o.status === "CANCELLED",
          )}
        </div>
      </details>
      <h3>Trao đổi</h3>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          act("comment", { content: comment });
        }}
      >
        <FormField id="production-comment" label="Bình luận">
          <textarea
            id="production-comment"
            rows={2}
            maxLength={1000}
            required
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </FormField>
        <Button
          variant="outline"
          disabled={mutation.isPending || !comment.trim()}
        >
          Gửi bình luận
        </Button>
      </form>
      <p className="production-hint">
        Bình luận không thay cho ACK kỹ thuật, xử lý sự cố hay phản hồi hủy.
      </p>
      {detail.comments.map((c) => (
        <article className="production-line" key={c.id}>
          <strong>{c.actorName}</strong>
          <p>{c.content}</p>
          <small>{dateTime(c.createdAt)}</small>
        </article>
      ))}
      {detail.cancellations
        .filter((c) => c.status !== "PENDING")
        .map((c) => (
          <p key={c.id}>
            Yêu cầu hủy: {c.status === "ACCEPTED" ? "Đã đồng ý" : "Đã từ chối"}{" "}
            · {c.reason} · {c.responderName}: {c.responseReason}
          </p>
        ))}
    </section>
  );
}
