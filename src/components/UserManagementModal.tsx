import { Avatar } from "./private/Avatar";
import { useAccess } from "../services/access";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  Plus,
  Search,
  Users,
  Shield,
  ArrowUpRight,
  KeyRound,
  LockKeyhole,
  Unlock,
  LogOut,
} from "lucide-react";
import {
  ROLES,
  ROLE_LABELS,
  ADMIN_ROLES,
  canManageTarget,
  canManageUsers,
  type Role,
  type User,
} from "../../shared/contracts";
import { userRepository } from "../repositories/userRepository";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  PageHeader,
  StatusBadge,
  ResponsiveDialog,
  FormField,
  Message,
  ErrorState,
  DetailPanel,
  ConfirmDialog,
} from "./common";
import { DataTable, DataToolbar, FilterBar } from "./DataTable";
export function UserManagementModal() {
  const { user: actor, refresh } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [dialog, setDialog] = useState<User | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reset, setReset] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<{
    user: User;
    action: "lock" | "revoke";
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const list = useQuery({
    queryKey: [
      "users",
      actor?.id,
      page,
      pageSize,
      query,
      role,
      active,
      sorting,
    ],
    queryFn: () =>
      userRepository.list({
        page,
        pageSize,
        search: query,
        role: role ? (role as Role) : undefined,
        active: active ? (active as "true" | "false") : undefined,
        sort: sorting[0]?.id ?? "name",
        direction: sorting[0]?.desc ? "desc" : "asc",
      }),
    enabled: !!actor,
  });
  const detail = list.data?.items.find((x) => x.id === detailId);
  const access = useAccess();
  const manage =
    !!actor &&
    canManageUsers(actor.role) &&
    access.data?.permissions.canManageUsers === true;
  const columns = useMemo<ColumnDef<User, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nhân viên",
        enableHiding: false,
        cell: ({ row }) => (
          <button
            className="user-cell"
            onClick={() => setDetailId(row.original.id)}
          >
            <Avatar user={row.original} />
            <span>
              <strong>{row.original.name}</strong>
              <small>@{row.original.username}</small>
            </span>
          </button>
        ),
      },
      {
        accessorKey: "role",
        header: "Vai trò",
        meta: "Vai trò",
        cell: ({ getValue }) => (
          <span className="role-tag">{ROLE_LABELS[getValue() as Role]}</span>
        ),
      },
      {
        accessorKey: "phone",
        header: "Liên hệ",
        meta: "Liên hệ",
        enableSorting: false,
        cell: ({ getValue }) =>
          getValue() || <span className="muted">Chưa cập nhật</span>,
      },
      {
        accessorKey: "machineAssigned",
        header: "Máy phụ trách",
        meta: "Máy phụ trách",
        enableSorting: false,
        cell: ({ getValue }) => getValue() || "—",
      },
      {
        accessorKey: "active",
        header: "Trạng thái",
        meta: "Trạng thái",
        enableSorting: false,
        cell: ({ getValue }) => <StatusBadge active={getValue()} />,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Chi tiết ${row.original.name}`}
            onClick={() => setDetailId(row.original.id)}
          >
            <ArrowUpRight size={16} />
          </Button>
        ),
      },
    ],
    [],
  );
  const updated = async () => {
    await client.invalidateQueries({ queryKey: ["users"] });
    await refresh();
  };
  const confirmAction = async () => {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      if (confirm.action === "revoke")
        await userRepository.revoke(confirm.user.id);
      else
        await userRepository.update(confirm.user.id, {
          version: confirm.user.version,
          active: !confirm.user.active,
        });
      setNotice(
        confirm.action === "revoke"
          ? "Đã thu hồi các phiên đăng nhập."
          : "Đã cập nhật trạng thái tài khoản.",
      );
      setConfirm(null);
      await updated();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="QUẢN TRỊ ĐỘI NGŨ"
        title={manage ? "Nhân viên" : "Danh bạ nhân viên"}
        description="Đúng người, đúng vai trò. Quản lý đội ngũ trong một không gian."
        actions={
          manage ? (
            <Button onClick={() => setDialog("new")}>
              <Plus />
              Thêm nhân viên
            </Button>
          ) : undefined
        }
      />
      {notice && <Message success>{notice}</Message>}
      {error && <Message>{error}</Message>}
      <div className={detail ? "list-detail-layout" : ""}>
        <section className="surface">
          <div className="section-heading">
            <h2>
              <Users size={18} /> Đội ngũ xưởng in
            </h2>
            <span className="section-caption">
              <Shield size={14} /> Phân quyền theo vai trò
            </span>
          </div>
          <DataToolbar>
            <div className="search-field">
              <Search size={16} />
              <Input
                aria-label="Tìm nhân viên"
                placeholder="Tìm tên, tài khoản, số điện thoại…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FilterBar>
              <select
                aria-label="Lọc vai trò"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả vai trò</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc trạng thái"
                value={active}
                onChange={(e) => {
                  setActive(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Mọi trạng thái</option>
                <option value="true">Hoạt động</option>
                <option value="false">Đã khóa</option>
              </select>
            </FilterBar>
          </DataToolbar>
          {list.error ? (
            <ErrorState error={list.error} retry={() => void list.refetch()} />
          ) : (
            <DataTable
              data={list.data?.items ?? []}
              columns={columns}
              total={list.data?.total ?? 0}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              sorting={sorting}
              onSorting={(value) => {
                setSorting(value);
                setPage(1);
              }}
              loading={list.isPending}
            />
          )}
        </section>
        {detail && (
          <DetailPanel
            title="Hồ sơ nhân viên"
            onClose={() => setDetailId(null)}
          >
            <div className="profile-summary">
              <span className="avatar avatar-large">
                {detail.name.slice(0, 1)}
              </span>
              <h3>{detail.name}</h3>
              <p>@{detail.username}</p>
              <StatusBadge active={detail.active} />
            </div>
            <dl className="detail-list">
              <dt>Vai trò</dt>
              <dd>{ROLE_LABELS[detail.role]}</dd>
              <dt>Điện thoại</dt>
              <dd>{detail.phone || "Chưa cập nhật"}</dd>
              <dt>Máy phụ trách</dt>
              <dd>{detail.machineAssigned || "Chưa phân công"}</dd>
              <dt>Ngày tham gia</dt>
              <dd>
                {new Date(detail.createdAt).toLocaleDateString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
              </dd>
            </dl>
            {actor &&
              (detail.id === actor.id ||
                (manage && canManageTarget(actor.role, detail.role))) && (
                <div className="detail-actions">
                  <Button variant="outline" onClick={() => setDialog(detail)}>
                    Chỉnh sửa hồ sơ
                  </Button>
                  {detail.id !== actor.id && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setReset(detail)}
                      >
                        <KeyRound />
                        Đặt lại mật khẩu
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setConfirm({ user: detail, action: "revoke" })
                        }
                      >
                        <LogOut />
                        Thu hồi phiên
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setConfirm({ user: detail, action: "lock" })
                        }
                      >
                        {detail.active ? <LockKeyhole /> : <Unlock />}
                        {detail.active ? "Khóa tài khoản" : "Mở khóa tài khoản"}
                      </Button>
                    </>
                  )}
                </div>
              )}
          </DetailPanel>
        )}
      </div>
      {dialog && actor && (
        <UserEditor
          target={dialog}
          actor={actor}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            setNotice(
              dialog === "new"
                ? "Đã thêm nhân viên."
                : "Đã lưu hồ sơ nhân viên.",
            );
            await updated();
          }}
        />
      )}
      {reset && (
        <PasswordReset
          user={reset}
          onClose={() => setReset(null)}
          onSaved={async () => {
            setReset(null);
            setNotice("Mật khẩu đã được đặt lại; các phiên cũ đã bị thu hồi.");
            await updated();
          }}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(value) => {
          if (!value) setConfirm(null);
        }}
        title={
          confirm?.action === "revoke"
            ? "Thu hồi phiên đăng nhập?"
            : confirm?.user.active
              ? "Khóa tài khoản?"
              : "Mở khóa tài khoản?"
        }
        description={`${confirm?.user.name ?? ""}. Những phiên đang hoạt động sẽ bị thu hồi; người dùng cần đăng nhập lại.`}
        onConfirm={() => void confirmAction()}
        busy={busy}
      />
    </>
  );
}
function UserEditor({
  target,
  actor,
  onClose,
  onSaved,
}: {
  target: User | "new";
  actor: User;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isNew = target === "new";
  const existing = isNew ? null : target;
  const self = existing?.id === actor.id;
  const options = actor.role === "DEVELOPER" ? ROLES : ADMIN_ROLES;
  const [data, setData] = useState({
    name: existing?.name ?? "",
    username: existing?.username ?? "",
    phone: existing?.phone ?? "",
    role: existing?.role ?? ("PRINTER" as Role),
    machineAssigned: existing?.machineAssigned ?? "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const field = (key: keyof typeof data) => ({
    value: data[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setData({ ...data, [key]: e.target.value }),
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (isNew) await userRepository.create(data);
      else
        await userRepository.update(existing!.id, {
          name: data.name,
          phone: data.phone,
          machineAssigned: data.machineAssigned,
          ...(!self ? { role: data.role } : {}),
          version: existing!.version,
        });
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ResponsiveDialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
      title={isNew ? "Thêm nhân viên" : "Chỉnh sửa nhân viên"}
      description={
        isNew
          ? "Tạo tài khoản riêng và chọn vai trò phù hợp."
          : "Thông tin được lưu trực tiếp vào hệ thống."
      }
    >
      <form className="stack-form" onSubmit={submit}>
        {error && <Message>{error}</Message>}
        <div className="form-grid">
          <FormField
            id="staff-name"
            label="Họ và tên"
            {...field("name")}
            required
            maxLength={100}
          />
          <FormField
            id="staff-username"
            label="Tên đăng nhập"
            {...field("username")}
            required
            disabled={!isNew}
            autoComplete="off"
            pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}"
            maxLength={64}
          />
          <FormField
            id="staff-phone"
            label="Số điện thoại"
            {...field("phone")}
            type="tel"
            maxLength={30}
          />
          <FormField id="staff-role" label="Vai trò">
            <select
              id="staff-role"
              value={data.role}
              disabled={self}
              onChange={(e) =>
                setData({ ...data, role: e.target.value as Role })
              }
            >
              {options.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField
          id="staff-machine"
          label="Máy phụ trách"
          {...field("machineAssigned")}
          maxLength={100}
          placeholder="Ví dụ: Máy in 4 màu"
        />
        {isNew && (
          <FormField
            id="staff-password"
            label="Mật khẩu ban đầu"
            {...field("password")}
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            hint="Tối thiểu 12 ký tự. Cung cấp riêng cho nhân viên qua kênh an toàn."
          />
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </Button>
          <Button disabled={busy}>
            {busy ? "Đang lưu…" : isNew ? "Tạo nhân viên" : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
function PasswordReset({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveDialog
      open
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
      title="Đặt lại mật khẩu"
      description={`Đặt mật khẩu mới cho ${user.name}. Tất cả phiên của nhân viên này sẽ bị thu hồi.`}
    >
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await userRepository.reset(user, password);
            setPassword("");
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Message>{error}</Message>}
        <FormField
          id="reset-password"
          label="Mật khẩu mới"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
        <div className="dialog-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy}>Đặt lại mật khẩu</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
