import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import { ConfigProvider, useConfig } from "./context/ConfigContext";
import { bootstrapService } from "./services/bootstrapService";
import { BootstrapFirstRun } from "./components/BootstrapFirstRun";
import { LoginModal } from "./components/LoginModal";
import { AppShell } from "./components/AppShell";
import { DashboardOverview, AuditPage } from "./components/DashboardOverview";
import { UserManagementModal } from "./components/UserManagementModal";
import { UserProfileModal } from "./components/UserProfileModal";
import { SettingsModal } from "./components/SettingsModal";
import { MODULES } from "./components/workspaces";
import {
  ErrorState,
  LoadingSkeleton,
  PageHeader,
  EmptyState,
  Message,
} from "./components/common";
import { Button } from "./components/ui/button";
import { Customers } from "./components/business/Customers";
import { Sales } from "./components/business/Sales";
import { Designs } from "./components/business/Designs";
import { idSchema } from "../shared/business";
export default function App() {
  const auth = useAuth();
  const setup = useQuery({
    queryKey: ["setup"],
    queryFn: bootstrapService.status,
    enabled: !auth.user,
  });
  if (auth.loading || (!auth.user && setup.isPending))
    return (
      <div className="startup-state">
        <LoadingSkeleton rows={3} />
        <p>Đang mở không gian làm việc…</p>
      </div>
    );
  if (auth.error)
    return (
      <div className="startup-state">
        <ErrorState error={auth.error} retry={() => void auth.refresh()} />
      </div>
    );
  if (!auth.user && setup.error)
    return (
      <div className="startup-state">
        <ErrorState error={setup.error} retry={() => void setup.refetch()} />
      </div>
    );
  if (!auth.user)
    return setup.data?.initialized ? (
      <LoginModal />
    ) : (
      <BootstrapFirstRun enabled={!!setup.data?.setupEnabled} />
    );
  return (
    <ConfigProvider>
      <Workspace />
    </ConfigProvider>
  );
}
function Workspace() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || "home");
  const [page, selection] = route.split("/");
  const { user } = useAuth();
  const showBusiness = MODULES.some(
    (module) => module.id === page && module.roles.includes(user!.role),
  );
  const { error, loading, refresh } = useConfig();
  useEffect(() => {
    const update = () => {
      setRoute(location.hash.slice(1) || "home");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <AppShell page={page}>
      {error ? (
        <ErrorState error={error} retry={() => void refresh()} />
      ) : loading ? (
        <LoadingSkeleton />
      ) : page === "home" ? (
        <DashboardOverview />
      ) : page === "users" ? (
        <UserManagementModal />
      ) : page === "profile" ? (
        <UserProfileModal />
      ) : page === "settings" ? (
        <SettingsModal />
      ) : page === "audit" ? (
        <AuditPage />
      ) : page === "customers" && showBusiness ? (
        <Customers />
      ) : page === "sales" && showBusiness ? (
        <Sales
          selection={
            selection === "new" || idSchema.safeParse(selection).success
              ? selection
              : undefined
          }
        />
      ) : page === "design" && showBusiness ? (
        <Designs />
      ) : (
        <UnavailableModule id={page} />
      )}
    </AppShell>
  );
}
function UnavailableModule({ id }: { id: string }) {
  const { user } = useAuth();
  const module = MODULES.find((m) => m.id === id);
  if (!module || !module.roles.includes(user!.role))
    return (
      <EmptyState
        title="Màn hình không khả dụng"
        description="Chọn một phân hệ trong menu để tiếp tục."
        action={
          <Button asChild>
            <a href="#home">Về tổng quan</a>
          </Button>
        }
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="PHÂN HỆ NGHIỆP VỤ"
        title={module.label}
        description={module.description}
      />
      <section className="surface unavailable-surface">
        <div className="coming-icon">
          <Clock3 size={30} />
        </div>
        <span className="status-badge neutral">Đang chuẩn bị</span>
        <h2>Phân hệ chưa khả dụng</h2>
        <p>
          Chức năng này đang được chuyển đổi sang hệ thống mới. Hiện chưa thể
          tạo hoặc cập nhật dữ liệu tại đây.
        </p>
        <div className="unavailable-details">
          <ShieldCheck size={20} />
          <span>
            Quy trình và phân quyền sẽ được kiểm thử trước khi đưa vào sử dụng.
          </span>
        </div>
        <Button asChild variant="outline">
          <a href="#home">
            Về không gian làm việc
            <ArrowRight />
          </a>
        </Button>
      </section>
      <Message>
        Không có dữ liệu minh họa hoặc thao tác ghi nghiệp vụ trên màn hình này.
      </Message>
    </>
  );
}
