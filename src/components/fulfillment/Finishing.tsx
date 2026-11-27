import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { canEditSales } from "../../../shared/business";
import { canComposeProduction } from "../../../shared/production";
import type { Page, User } from "../../../shared/contracts";
import type {
  FinishingDetail,
  FinishingEntry,
} from "../../../shared/fulfillment";
import { useAuth } from "../../context/AuthContext";
import { useConfig } from "../../context/ConfigContext";
import { api } from "../../services/api";
import {
  FormField,
  Message,
  PageHeader,
  PriorityBadge,
  ResponsiveDialog,
} from "../common";
import {
  BusinessDetail,
  BusinessFields,
  dateTime,
  endpoint,
  localNumber,
} from "../business/common";
import {
  CommandButtons,
  CommandForm,
  NoteField,
  NumberField,
  WorkflowBadge,
  WorkflowHistory,
  WorkflowList,
  field,
  withNote,
  type Command,
} from "./common";
import { IssueRows, IssuesInbox, issueCommand } from "./Issues";

const statuses = [
  "PENDING_RECEIPT",
  "READY",
  "CLAIMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
const columns: ColumnDef<FinishingEntry, unknown>[] = [
  {
    accessorKey: "productName",
    header: "Sản phẩm",
    enableSorting: false,
    cell: ({ row }) => (
      <>
        <strong>{row.original.productName}</strong>
        {row.original.urgent && (
          <div>
            <PriorityBadge />
          </div>
        )}
      </>
    ),
  },
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
  { accessorKey: "productionCode", header: "Lệnh in", enableSorting: false },
  {
    accessorKey: "quantity",
    header: "Bàn giao (túi)",
    enableSorting: false,
    cell: ({ row }) => localNumber(row.original.quantity),
  },
  {
    accessorKey: "status",
    header: "Trạng thái",
    enableSorting: false,
    cell: ({ row }) => <WorkflowBadge status={row.original.status} />,
  },
  { accessorKey: "finisherName", header: "Nhân viên", enableSorting: false },
];

export function Finishing() {
  const [selected, setSelected] = useState<FinishingEntry | null>(null);
  const detail = useQuery({
    queryKey: ["fulfillment", "finishing", selected?.id],
    enabled: !!selected,
    queryFn: () => api<FinishingDetail>("/finishing-tasks/" + selected!.id),
  });
  return (
    <>
      <PageHeader
        title="Gia công"
        description="Tiếp nhận sản lượng sau in, hoàn tất công việc và nghiệm thu theo từng bàn giao."
      />
      <WorkflowList
        path="finishing-tasks"
        label="công việc"
        statuses={statuses}
        columns={columns}
        select={setSelected}
        render={(entry) => (
          <div className="business-mobile-row">
            <div>
              <strong>{entry.productName}</strong>
              <p>
                {entry.customerName} · {entry.productionCode}
              </p>
              <p>
                {localNumber(entry.quantity)} túi ·{" "}
                {entry.requiresFinishing
                  ? "Cần gia công"
                  : "Không cần gia công"}
              </p>
            </div>
            <div>
              <WorkflowBadge status={entry.status} />
              {entry.urgent && <PriorityBadge />}
            </div>
          </div>
        )}
      />
      <IssuesInbox stage="FINISHING" />
      {selected && (
        <ResponsiveDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={selected.productName}
          description={selected.customerName + " · " + selected.productionCode}
          wide
        >
          <BusinessDetail loading={detail.isPending} error={detail.error}>
            {detail.data && (
              <FinishingPane key={selected.id} detail={detail.data} />
            )}
          </BusinessDetail>
        </ResponsiveDialog>
      )}
    </>
  );
}

function Assignment() {
  const id = useId();
  const users = useQuery({
    queryKey: ["users", "fulfillment-finishers"],
    queryFn: () =>
      api<Page<User>>(
        endpoint("users", { role: "FINISHER", active: "true", pageSize: 100 }),
      ),
  });
  return (
    <FormField id={id} label="Nhân viên gia công">
      <select id={id} name="finisherId">
        <option value="">Đưa về hàng đợi chung</option>
        {users.data?.items.map((user) => (
          <option value={user.id} key={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function FinishingPane({ detail }: { detail: FinishingDetail }) {
  const { user } = useAuth();
  const config = useConfig();
  const [command, setCommand] = useState<Command | null>(null);
  const entry = detail.entry;
  const actor = user!;
  const path = "finishing-tasks/" + entry.id;
  const own = entry.claimedBy === actor.id;
  const working = ["CLAIMED", "IN_PROGRESS"].includes(entry.status);
  const ended = ["COMPLETED", "CANCELLED"].includes(entry.status);
  const commands: Command[] = [];
  function add(
    action: string,
    fields?: React.ReactNode,
    data?: Command["data"],
    label?: string,
  ) {
    commands.push({
      path,
      action,
      version: action === "receive" ? undefined : entry.version,
      fields,
      data,
      label,
    });
  }
  if (actor.role === "FINISHER") {
    if (entry.status === "PENDING_RECEIPT") add("receive");
    if (entry.status === "READY") {
      if (entry.requiresFinishing) add("claim");
      else add("confirm-no-work", <NoteField />, withNote);
    }
    if (working && own && !entry.cancellationPending) {
      if (entry.status === "CLAIMED") add("start");
      add("complete", <NoteField />, withNote);
    }
    if (working && own && entry.cancellationPending) {
      add(
        "respond-cancel",
        <NoteField required label="Lý do đồng ý" />,
        (form) => ({ ...withNote(form), accept: true }),
        "Đồng ý hủy gia công",
      );
      add(
        "respond-cancel",
        <NoteField required label="Lý do từ chối" />,
        (form) => ({ ...withNote(form), accept: false }),
        "Từ chối hủy gia công",
      );
    }
  }
  if (
    ended &&
    entry.accepted === null &&
    !entry.replacement &&
    (canEditSales(actor.role) ||
      (actor.role === "FINISHER" &&
        (entry.claimedBy ?? entry.assignedTo) === actor.id))
  ) {
    add(
      "accept",
      <div className="business-form">
        <p>
          Đối chiếu đủ {localNumber(entry.quantity)} túi trước khi ghi nhận.
        </p>
        <div className="fulfillment-counts">
          <NumberField
            name="accepted"
            label="Số túi đạt"
            value={entry.quantity}
            max={entry.quantity}
          />
          <NumberField
            name="rejected"
            label="Số túi không đạt"
            max={entry.quantity}
          />
          <NumberField name="short" label="Số túi thiếu" max={entry.quantity} />
        </div>
        <NoteField label="Ghi chú nghiệm thu" />
      </div>,
      (form) => ({
        accepted: Number(field(form, "accepted")),
        rejected: Number(field(form, "rejected")),
        short: Number(field(form, "short")),
        ...withNote(form),
      }),
    );
  }
  if (entry.version && canComposeProduction(actor.role) && !ended) {
    if (entry.status === "READY" && entry.requiresFinishing)
      add("assign", <Assignment />, (form) => ({
        finisherId: field(form, "finisherId") || null,
      }));
    add(
      "urgent",
      undefined,
      () => ({ urgent: !entry.urgent }),
      entry.urgent ? "Bỏ ưu tiên" : "Đặt ưu tiên cao",
    );
    if (entry.requiresFinishing && !entry.cancellationPending)
      add("request-cancel", <NoteField required label="Lý do hủy" />, withNote);
  }
  if (
    entry.version &&
    (canComposeProduction(actor.role) ||
      (actor.role === "FINISHER" && (own || entry.assignedTo === actor.id)))
  )
    add("add-note", <NoteField required />, withNote);
  if (
    entry.version &&
    (canComposeProduction(actor.role) || actor.role === "FINISHER")
  )
    commands.push(issueCommand(entry.id, "FINISHING"));
  const finishingTypes = config.settings?.finishingTypes ?? [];
  const requirements = [entry.instructions, entry.productionNote]
    .filter(Boolean)
    .join(" · ");
  const matchingTypes = finishingTypes.filter((type) =>
    requirements.toLocaleLowerCase("vi").includes(type.toLocaleLowerCase("vi")),
  );
  return (
    <div className="business-form">
      <div className="business-inline">
        <WorkflowBadge status={entry.status} />
        {entry.urgent && <PriorityBadge />}
      </div>
      <BusinessFields
        items={[
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
          { label: "Đơn bán", value: entry.salesCode },
          { label: "Nhân viên", value: entry.finisherName },
          { label: "Bàn giao", value: localNumber(entry.quantity) + " túi" },
          {
            label: "Yêu cầu gia công",
            value: entry.requiresFinishing
              ? requirements || "Cần gia công · chưa có chỉ dẫn chi tiết"
              : "Không cần gia công",
          },
          ...(matchingTypes.length
            ? [{ label: "Công đoạn", value: matchingTypes.join(", ") }]
            : []),
        ]}
      />
      {entry.replacement && (
        <Message>
          Sản lượng in lại
          {entry.sourceProductionCode
            ? " từ " + entry.sourceProductionCode
            : ""}
          . Chờ quyết định nghiệm thu thay thế.
        </Message>
      )}
      {entry.cancellationPending && (
        <Message>Đang chờ người nhận việc phản hồi yêu cầu hủy.</Message>
      )}
      {detail.acceptance && (
        <BusinessFields
          items={[
            { label: "Đạt", value: localNumber(entry.accepted ?? 0) },
            { label: "Không đạt", value: localNumber(entry.rejected ?? 0) },
            { label: "Thiếu", value: localNumber(entry.short ?? 0) },
            { label: "Người nghiệm thu", value: detail.acceptance.actorName },
            {
              label: "Thời điểm",
              value: dateTime(detail.acceptance.createdAt),
            },
            { label: "Ghi chú nghiệm thu", value: detail.acceptance.note },
          ]}
        />
      )}
      {command ? (
        <CommandForm
          key={command.label ?? command.action}
          command={command}
          onClose={() => setCommand(null)}
          onSuccess={() => setCommand(null)}
        />
      ) : (
        <CommandButtons commands={commands} setCommand={setCommand} />
      )}
      {detail.history.length > 0 && (
        <section className="business-subsection">
          <h3>Lịch sử gia công</h3>
          <WorkflowHistory history={detail.history} />
        </section>
      )}
      {detail.issues.length > 0 && (
        <section className="business-subsection">
          <h3>Sự cố</h3>
          <IssueRows issues={detail.issues} onCommand={setCommand} />
        </section>
      )}
    </div>
  );
}
