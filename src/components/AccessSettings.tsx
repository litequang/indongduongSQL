import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CAPABILITIES,
  FEATURES,
  capabilityCeiling,
  type AccessPolicy,
  type Capability,
  type Feature,
  type Overrides,
} from "../../shared/access";
import { ROLES, ROLE_LABELS, type Role } from "../../shared/contracts";
import { useAccess } from "../services/access";
import { api, json } from "../services/api";
import { userRepository } from "../repositories/userRepository";
import { Button } from "./ui/button";
import { Message, ErrorState, LoadingSkeleton } from "./common";
export function AccessSettings() {
  const access = useAccess();
  if (access.error)
    return (
      <ErrorState error={access.error} retry={() => void access.refetch()} />
    );
  if (access.isPending) return <LoadingSkeleton rows={2} />;
  if (!access.data.policy) return null;
  return (
    <PolicyEditor
      initial={access.data.policy}
      remote={access.data.policy}
      refresh={() => void access.refetch()}
    />
  );
}
function PolicyEditor({
  initial,
  remote,
  refresh,
}: {
  initial: AccessPolicy;
  remote: AccessPolicy;
  refresh: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [kind, setKind] = useState<"role" | "user">("role");
  const [role, setRole] = useState<Role>("MANAGER");
  const [userId, setUserId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const users = useQuery({
    queryKey: ["users", "permissions", search, page],
    queryFn: () => userRepository.list({ page, pageSize: 50, search }),
    enabled: kind === "user",
  });
  const targetRole =
    kind === "role"
      ? role
      : users.data?.items.find((u) => u.id === userId)?.role;
  const selected: Overrides =
    kind === "role"
      ? (form.roleOverrides[role] ?? {})
      : (form.userOverrides[userId] ?? {});
  const setPermission = (key: Capability, value: string) => {
    const next = { ...selected };
    if (value === "inherit") delete next[key];
    else next[key] = value === "true";
    setForm(
      kind === "role"
        ? { ...form, roleOverrides: { ...form.roleOverrides, [role]: next } }
        : { ...form, userOverrides: { ...form.userOverrides, [userId]: next } },
    );
  };
  return (
    <section className="surface settings-section access-settings">
      <h2>Phân hệ và quyền thao tác</h2>
      <p className="muted">
        Chỉ kỹ thuật hệ thống được đổi cấu hình này. Quyền cá nhân ưu tiên hơn
        vai trò; giới hạn vai trò và phạm vi bản ghi luôn được áp dụng. Đổi
        quyền sẽ kết thúc các phiên bị ảnh hưởng.
      </p>
      {remote.version !== form.version && (
        <Message>
          Cấu hình đã thay đổi.{" "}
          <button className="text-link" onClick={() => setForm(remote)}>
            Tải bản mới
          </button>
        </Message>
      )}
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await api<{ policy: AccessPolicy }>("/access", {
              method: "PUT",
              body: json(form),
            });
            setForm(r.policy);
            refresh();
            setMessage("Đã lưu cấu hình.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>Phân hệ được mở thao tác ghi</legend>
          <div className="policy-grid">
            {Object.entries(FEATURES).map(([key, label]) => (
              <label key={key} className="checkbox-line">
                <input
                  type="checkbox"
                  checked={form.features[key as Feature]}
                  disabled={key === "production" || key === "finishing"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      features: { ...form.features, [key]: e.target.checked },
                    })
                  }
                />
                {label}
                {["production", "finishing"].includes(key) ? " (lõi)" : ""}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted">
          Đơn hàng cần Khách hàng; Xuất kho cần Đơn hàng; Giao hàng cần cả Đơn
          hàng và Xuất kho. Tắt phân hệ giữ dữ liệu lịch sử để tra cứu.
        </p>
        <div className="form-grid">
          <label>
            Phạm vi
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="role">Theo vai trò</option>
              <option value="user">Theo nhân viên</option>
            </select>
          </label>
          {kind === "role" ? (
            <label>
              Vai trò
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div>
              <label>
                Tìm nhân viên
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                    setUserId("");
                  }}
                  maxLength={100}
                />
              </label>
              <label>
                Nhân viên
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">Chọn nhân viên</option>
                  {users.data?.items.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.username}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dialog-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => {
                    setPage(page - 1);
                    setUserId("");
                  }}
                >
                  Trước
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!users.data || page * 50 >= users.data.total}
                  onClick={() => {
                    setPage(page + 1);
                    setUserId("");
                  }}
                >
                  Sau
                </Button>
              </div>
              {users.error && <Message>{users.error.message}</Message>}
            </div>
          )}
        </div>
        {targetRole && (
          <div className="policy-grid">
            {Object.entries(CAPABILITIES).map(([key, label]) => {
              const k = key as Capability;
              const ceiling = capabilityCeiling(targetRole, k);
              return (
                <label key={key}>
                  {label}
                  <select
                    disabled={busy}
                    value={
                      selected[k] === undefined
                        ? "inherit"
                        : String(selected[k])
                    }
                    onChange={(e) => setPermission(k, e.target.value)}
                  >
                    <option value="inherit">
                      {ceiling ? "Kế thừa" : "Ngoài phạm vi vai trò"}
                    </option>
                    <option value="false">Giới hạn</option>
                    {ceiling && (
                      <option value="true">Cho phép trong vai trò</option>
                    )}
                  </select>
                </label>
              );
            })}
          </div>
        )}
        {message && <Message>{message}</Message>}
        <Button disabled={busy || form.version !== remote.version}>
          Lưu phân hệ và quyền
        </Button>
      </form>
    </section>
  );
}
