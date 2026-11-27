import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Users,
  ShieldCheck,
  Building2,
  Layers3,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import {
  ROLE_LABELS,
  canManageUsers,
  type AuditEntry,
  type Page,
} from "../../shared/contracts";
import { userRepository } from "../repositories/userRepository";
import { api } from "../services/api";
import { Button } from "./ui/button";
import {
  PageHeader,
  LoadingSkeleton,
  ErrorState,
  ActivityTimeline,
  EmptyState,
  StatusBadge,
} from "./common";
import { isBusinessAvailable, WORKSPACE, MODULES } from "./workspaces";
const ACTION_LABELS: Record<string, string> = {
  SYSTEM_BOOTSTRAPPED: "Thiết lập không gian làm việc",
  LOGIN: "Đăng nhập hệ thống",
  LOGOUT: "Đăng xuất",
  USER_CREATED: "Thêm nhân viên",
  USER_UPDATED: "Cập nhật nhân viên",
  PROFILE_UPDATED: "Cập nhật hồ sơ",
  PASSWORD_CHANGED: "Đổi mật khẩu",
  PASSWORD_RESET: "Đặt lại mật khẩu",
  SESSIONS_REVOKED: "Thu hồi phiên đăng nhập",
  SETTINGS_UPDATED: "Cập nhật cài đặt",
  ACCESS_POLICY_UPDATED: "Cập nhật quyền và phân hệ",
};
export const displayAction = (action: string) =>
  ACTION_LABELS[action] ?? action;
const date = (value: string) =>
  new Date(value).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
export function DashboardOverview() {
  const { user } = useAuth();
  const { settings } = useConfig();
  const workspace = WORKSPACE[user!.role];
  const users = useQuery({
    queryKey: ["users", "overview", user!.id],
    queryFn: () => userRepository.list({ page: 1, pageSize: 10, search: "" }),
  });
  const privileged = canManageUsers(user!.role);
  const audit = useQuery({
    queryKey: ["audit", "recent", user!.id],
    queryFn: () => api<Page<AuditEntry>>("/audit"),
    enabled: privileged,
    refetchInterval: 15000,
  });
  return (
    <>
      <PageHeader
        eyebrow={new Date()
          .toLocaleDateString("vi-VN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
          })
          .toUpperCase()}
        title={workspace.title}
        description={workspace.description}
        actions={
          <a href="#profile" className="subtle-link">
            Hồ sơ của bạn
            <ArrowUpRight size={16} />
          </a>
        }
      />
      <section className="welcome-panel">
        <div>
          <span className="welcome-kicker">
            <span className="live-dot" /> KHÔNG GIAN CỦA BẠN
          </span>
          <h2>
            Chào {user!.name.split(" ").slice(-1)[0]},<br />
            cùng bắt đầu ngày làm việc.
          </h2>
          <p>
            {settings?.slogan ||
              "Tập trung vào công việc. Kết nối cùng đội ngũ."}
          </p>
          <Button asChild>
            <a href={privileged ? "#users" : "#profile"}>
              {privileged ? "Quản lý đội ngũ" : "Xem hồ sơ cá nhân"}
              <ArrowRight />
            </a>
          </Button>
        </div>
        <div className="welcome-workshop">
          <div className="workshop-monogram">
            <Layers3 size={38} strokeWidth={1.5} />
          </div>
          <strong>{settings?.companyName ?? "Không gian xưởng in"}</strong>
          <span>{ROLE_LABELS[user!.role]}</span>
          <StatusBadge active={user!.active} />
        </div>
      </section>
      <div className="metric-grid">
        <a className="metric" href="#users">
          <div className="metric-top">
            <span>Đội ngũ xưởng in</span>
            <Users size={17} />
          </div>
          <strong>
            {users.isError ? "—" : (users.data?.total ?? "…")}
            <small>nhân viên</small>
          </strong>
          <span className="metric-footer">
            Danh bạ đang sử dụng
            <ArrowUpRight size={14} />
          </span>
        </a>
        <a className="metric" href="#profile">
          <div className="metric-top">
            <span>Vai trò của bạn</span>
            <ShieldCheck size={17} />
          </div>
          <strong className="metric-text">{ROLE_LABELS[user!.role]}</strong>
          <span className="metric-footer">
            Tài khoản @{user!.username}
            <ArrowUpRight size={14} />
          </span>
        </a>
        <a className="metric" href="#settings">
          <div className="metric-top">
            <span>Không gian làm việc</span>
            <Building2 size={17} />
          </div>
          <strong className="metric-text">
            {settings?.shortName ?? "Đang tải…"}
          </strong>
          <span className="metric-footer">
            Thông tin và cấu hình
            <ArrowUpRight size={14} />
          </span>
        </a>
      </div>
      {users.error && (
        <ErrorState error={users.error} retry={() => void users.refetch()} />
      )}
      <div className="dashboard-columns">
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>Truy cập nhanh</h2>
              <p>Ưu tiên cho công việc của bạn.</p>
            </div>
            <Layers3 size={18} />
          </div>
          <div className="quick-links">
            {workspace.focus.map((id) => {
              const module = MODULES.find((m) => m.id === id);
              const implemented =
                id === "users" || id === "settings" || isBusinessAvailable(id);
              return (
                <a href={`#${id}`} key={id}>
                  <span className="quick-link-icon">
                    {id === "users" ? (
                      <Users size={19} />
                    ) : id === "settings" ? (
                      <Building2 size={19} />
                    ) : (
                      <Layers3 size={19} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {id === "users"
                        ? "Nhân viên"
                        : id === "settings"
                          ? "Cài đặt hệ thống"
                          : module?.label}
                    </strong>
                    <p>
                      {implemented
                        ? "Sẵn sàng sử dụng"
                        : "Đang chuẩn bị · Chưa khả dụng"}
                    </p>
                  </div>
                  <ArrowUpRight size={17} />
                </a>
              );
            })}
          </div>
          <div className="workspace-note">
            <CheckCircle2 size={18} />
            <div>
              <strong>Nền tảng sẵn sàng</strong>
              <p>
                Tài khoản, phân quyền và cấu hình đã được kết nối. Các phân hệ
                nghiệp vụ đang được hoàn thiện.
              </p>
            </div>
          </div>
        </section>
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>
                {privileged ? "Hoạt động gần đây" : "Vai trò & công việc"}
              </h2>
              <p>
                {privileged
                  ? "Nhật ký thực tế trong hệ thống."
                  : "Không gian phù hợp với nhiệm vụ của bạn."}
              </p>
            </div>
            <Clock3 size={18} />
          </div>
          {privileged ? (
            audit.isPending ? (
              <LoadingSkeleton rows={3} />
            ) : audit.error ? (
              <ErrorState
                error={audit.error}
                retry={() => void audit.refetch()}
              />
            ) : (
              <ActivityTimeline
                items={audit.data!.items.slice(0, 5).map((item) => ({
                  id: item.id,
                  title: displayAction(item.action),
                  description: item.actorName,
                  time: date(item.createdAt),
                }))}
              />
            )
          ) : (
            <div className="role-workspace-note">
              <span className="role-tag">{user!.role}</span>
              <h3>{workspace.title}</h3>
              <p>{workspace.description}</p>
              <p>
                Các công việc chính sẽ xuất hiện tại đây khi phân hệ được triển
                khai. Hồ sơ và danh bạ đã có thể sử dụng.
              </p>
              <Button asChild variant="outline">
                <a href="#users">
                  Xem đội ngũ
                  <ArrowRight />
                </a>
              </Button>
            </div>
          )}
          {privileged && (
            <a href="#audit" className="surface-footer-link">
              Xem toàn bộ nhật ký
              <ArrowRight size={15} />
            </a>
          )}
        </section>
      </div>
    </>
  );
}
export function AuditPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ["audit", user!.id, page],
    queryFn: () => api<Page<AuditEntry>>(`/audit?page=${page}`),
    enabled: canManageUsers(user!.role),
  });
  if (!canManageUsers(user!.role))
    return (
      <EmptyState
        title="Không có quyền truy cập"
        description="Nhật ký quản trị chỉ dành cho quản trị viên."
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="KIỂM SOÁT HỆ THỐNG"
        title="Nhật ký hoạt động"
        description="Theo dõi các thao tác tài khoản và cấu hình đã được ghi nhận."
      />
      <section className="surface audit-surface">
        {result.isPending ? (
          <LoadingSkeleton />
        ) : result.error ? (
          <ErrorState
            error={result.error}
            retry={() => void result.refetch()}
          />
        ) : (
          <ActivityTimeline
            items={result.data!.items.map((item) => ({
              id: item.id,
              title: displayAction(item.action),
              description: item.actorName,
              time: date(item.createdAt),
            }))}
          />
        )}
        <div className="table-pagination">
          <span>Trang {page}</span>
          <div>
            <Button
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              disabled={!result.data || page * 30 >= result.data.total}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
import { useState } from "react";
