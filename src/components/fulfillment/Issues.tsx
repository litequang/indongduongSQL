import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ROLES,
  ROLE_LABELS,
  type Page,
  type User,
} from "../../../shared/contracts";
import type { IssueEntry } from "../../../shared/fulfillment";
import { api } from "../../services/api";
import { FormField, Message } from "../common";
import { Button } from "../ui/button";
import { dateTime, endpoint, SearchBox, useSearch } from "../business/common";
import {
  CommandButtons,
  CommandForm,
  NoteField,
  TextField,
  WorkflowBadge,
  field,
  withNote,
  type Command,
} from "./common";

function RecipientFields() {
  const id = useId();
  const { search, setSearch, debounced } = useSearch();
  const users = useQuery({
    queryKey: ["users", "fulfillment-recipients", debounced],
    queryFn: () =>
      api<Page<User>>(
        endpoint("users", { search: debounced, pageSize: 30, active: "true" }),
      ),
  });
  return (
    <>
      <FormField
        id={id}
        label="Vai trò xử lý"
        hint="Mặc định gửi Kinh doanh, Thiết kế và Quản lý xưởng."
      >
        <select id={id} name="recipientRole">
          <option value="">Mặc định</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </FormField>
      <SearchBox
        label="Tìm nhân viên nhận sự cố"
        value={search}
        onChange={setSearch}
      />
      <FormField id={id + "-user"} label="Nhân viên xử lý">
        <select id={id + "-user"} name="recipientUser">
          <option value="">Không chọn</option>
          {users.data?.items.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · {ROLE_LABELS[user.role]}
            </option>
          ))}
        </select>
      </FormField>
    </>
  );
}

export function issueCommand(
  id: string,
  stage: "FINISHING" | "WAREHOUSE",
): Command {
  return {
    path: "fulfillment-sources/" + id,
    action: "report-issue",
    fields: (
      <>
        <TextField
          name="issueType"
          label="Loại sự cố"
          required
          maxLength={100}
        />
        <NoteField required label="Mô tả sự cố" />
        <RecipientFields />
        <label className="fulfillment-check">
          <input type="checkbox" name="urgent" />
          Ưu tiên cao
        </label>
      </>
    ),
    data: (form) => ({
      stage,
      issueType: field(form, "issueType"),
      ...withNote(form),
      urgent: form.has("urgent"),
      recipientRoles: form.getAll("recipientRole").filter(Boolean),
      recipientUserIds: form.getAll("recipientUser").filter(Boolean),
    }),
  };
}
export function IssueRows({
  issues,
  onCommand,
}: {
  issues: IssueEntry[];
  onCommand: (command: Command) => void;
}) {
  return (
    <ul className="fulfillment-entries">
      {issues.map((issue) => (
        <li key={issue.id}>
          <div className="business-inline">
            <strong>{issue.issueType}</strong>
            <WorkflowBadge status={issue.status} />
          </div>
          <p>{issue.message}</p>
          <small>
            {issue.reporterName} · {dateTime(issue.createdAt)}
          </small>
          {issue.status === "OPEN" && (
            <CommandButtons
              setCommand={onCommand}
              commands={[
                ...(issue.canResolve ? [{ action: "resolve-issue" }] : []),
                ...(issue.canCancel ? [{ action: "cancel-issue" }] : []),
              ].map((command) => ({
                ...command,
                path: "workflow-issues/" + issue.id,
                version: issue.version,
                fields: <NoteField />,
                data: withNote,
              }))}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
export function IssuesInbox({ stage }: { stage?: "FINISHING" | "WAREHOUSE" }) {
  const [page, setPage] = useState(1);
  const [command, setCommand] = useState<Command | null>(null);
  const list = useQuery({
    queryKey: ["fulfillment", "issues", stage, page],
    queryFn: () =>
      api<Page<IssueEntry>>(
        endpoint("workflow-issues", { page, pageSize: 20, stage }),
      ),
  });
  return (
    <section className="surface business-surface fulfillment-section">
      <h2>Sự cố cần theo dõi</h2>
      {command && (
        <CommandForm
          command={command}
          onClose={() => setCommand(null)}
          onSuccess={() => setCommand(null)}
        />
      )}
      {list.error && <Message>{list.error.message}</Message>}
      {list.data?.items.length ? (
        <IssueRows issues={list.data.items} onCommand={setCommand} />
      ) : (
        <p className="muted">
          {list.isPending ? "Đang tải sự cố…" : "Chưa có sự cố dành cho bạn."}
        </p>
      )}
      {list.data && list.data.total > list.data.pageSize && (
        <div className="business-inline">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </Button>
          <span>Trang {page}</span>
          <Button
            variant="outline"
            disabled={page * list.data.pageSize >= list.data.total}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </Button>
        </div>
      )}
    </section>
  );
}
