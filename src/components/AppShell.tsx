import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  FileText,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Search,
  Bell,
  Moon,
  Sun,
  LogOut,
  UserRound,
  Factory,
  Shapes,
  Package,
  Truck,
  ChartNoAxesCombined,
  Layers3,
  BookUser,
  HardDrive,
  Command,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { canManageUsers, ROLE_LABELS } from "../../shared/contracts";
import { MODULES } from "./workspaces";
import { Brand } from "./AuthLayout";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  ResponsiveDialog,
  ConnectionStatus,
  EmptyState,
  Message,
} from "./common";
import { cn } from "../lib/utils";
export const PAGE_LABELS: Record<string, string> = {
  home: "Tổng quan",
  users: "Nhân viên",
  settings: "Cài đặt hệ thống",
  profile: "Hồ sơ cá nhân",
  audit: "Nhật ký hoạt động",
  ...Object.fromEntries(MODULES.map((m) => [m.id, m.label])),
};
const ICONS: Record<string, typeof Users> = {
  home: LayoutDashboard,
  users: Users,
  settings: Settings,
  profile: UserRound,
  audit: FileText,
  customers: BookUser,
  sales: FileText,
  design: Shapes,
  production: Factory,
  plates: Layers3,
  finishing: Shapes,
  warehouse: Package,
  shipping: Truck,
  reports: ChartNoAxesCombined,
  storage: HardDrive,
};
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Nonessential UI preferences only. */
  }
}
export function AppShell({
  page,
  children,
}: {
  page: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { settings } = useConfig();
  const [collapsed, setCollapsed] = useState(
    () => preference("idd.ui.sidebar", "open") === "closed",
  );
  const [theme, setTheme] = useState(() =>
    preference(
      "idd.ui.theme",
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    ),
  );
  const [density, setDensity] = useState(() =>
    preference("idd.ui.density", "comfortable"),
  );
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const modules = MODULES.filter((m) => m.roles.includes(user!.role));
  const privileged = canManageUsers(user!.role);
  const visiblePages = [
    "home",
    ...modules.map((m) => m.id),
    "users",
    "settings",
    "profile",
    ...(privileged ? ["audit"] : []),
  ];
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.density = density;
    savePreference("idd.ui.theme", theme);
    savePreference("idd.ui.density", density);
  }, [theme, density]);
  useEffect(() => {
    savePreference("idd.ui.sidebar", collapsed ? "closed" : "open");
  }, [collapsed]);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((current) => !current);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    setMenu(false);
    setHidden(false);
  }, [page]);
  useEffect(() => {
    if (!["home", ...MODULES.map((x) => x.id)].includes(page)) return;
    let previous = window.scrollY;
    const scroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - previous) > 12) {
        setHidden(y > previous && y > 160);
        previous = y;
      }
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, [page]);
  const navigate = (id: string) => {
    location.hash = id;
    setMenu(false);
    setSearch(false);
  };
  const nav = (mobile = false) => (
    <>
      <div className="sidebar-section-label">KHÔNG GIAN LÀM VIỆC</div>
      <NavLink id="home" page={page} />
      <div className="sidebar-section-label">VẬN HÀNH</div>
      {modules
        .filter((x) => x.id !== "storage")
        .map((m) => (
          <NavLink
            key={m.id}
            id={m.id}
            page={page}
            pending
            onClick={() => mobile && setMenu(false)}
          />
        ))}
      <div className="sidebar-section-label">
        {privileged ? "QUẢN TRỊ" : "ĐỘI NGŨ"}
      </div>
      <NavLink id="users" page={page} />
      <NavLink id="settings" page={page} />
      {privileged && <NavLink id="audit" page={page} />}{" "}
      {user!.role === "DEVELOPER" && (
        <NavLink id="storage" page={page} pending />
      )}
    </>
  );
  return (
    <div
      className={cn(
        "app-shell",
        collapsed && "sidebar-collapsed",
        hidden && "mobile-chrome-hidden",
      )}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Bỏ qua điều hướng
      </a>
      <aside className="desktop-sidebar">
        <a href="#home" className="sidebar-brand">
          <Brand />
        </a>
        <nav aria-label="Điều hướng chính">{nav()}</nav>
        <div className="sidebar-bottom">
          <div className="sidebar-workshop">
            <span className="workshop-mini">
              {(settings?.shortName ?? "ĐD").slice(0, 2)}
            </span>
            <div>
              <strong>{settings?.shortName ?? "ĐÔNG DƯƠNG"}</strong>
              <span>{ROLE_LABELS[user!.role]}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
            <span>Thu gọn</span>
          </Button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="header-left">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu-button"
              aria-label="Mở menu"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </Button>
            <div className="breadcrumb">
              <span>Không gian làm việc</span>
              <ChevronRight size={13} />
              <strong>{PAGE_LABELS[page] ?? "Phân hệ"}</strong>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="global-search-trigger"
              onClick={() => setSearch(true)}
              aria-label="Tìm trong không gian"
            >
              <Search size={16} />
              <span>Tìm trong không gian…</span>
              <kbd>
                <Command size={10} />K
              </kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={
                theme === "light" ? "Bật giao diện tối" : "Bật giao diện sáng"
              }
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNotifications(true)}
              aria-label="Thông báo"
            >
              <Bell size={18} />
            </Button>
            <div className="header-divider" />
            <a
              href="#profile"
              className="account-link"
              aria-label="Mở hồ sơ cá nhân"
            >
              <span className="avatar avatar-small">
                {user!.name.slice(0, 1)}
              </span>
              <span>
                <strong>{user!.name}</strong>
                <small>{ROLE_LABELS[user!.role]}</small>
              </span>
            </a>
          </div>
        </header>
        <main className="page-content" id="main-content" tabIndex={-1}>
          {error && <Message>{error}</Message>}
          {children}
        </main>
        <footer className="app-footer">
          <span>Đông Dương Workspace</span>
          <div>
            <button
              onClick={() =>
                setDensity(density === "compact" ? "comfortable" : "compact")
              }
              className="density-toggle"
            >
              {density === "compact" ? "Gọn" : "Thoáng"}
            </button>
            <ConnectionStatus />
            <button
              className="logout-link"
              onClick={() => {
                void logout().catch((e) => setError(e.message));
              }}
            >
              <LogOut size={13} />
              Đăng xuất
            </button>
          </div>
        </footer>
      </div>
      <MobileNavigation
        page={page}
        main={modules[0]?.id}
        onMenu={() => setMenu(true)}
      />
      <ResponsiveDialog
        open={menu}
        onOpenChange={setMenu}
        title="Không gian làm việc"
        description="Chọn phân hệ hoặc truy cập tài khoản."
      >
        <nav className="mobile-menu" onClick={() => setMenu(false)}>
          {nav(true)}
          <NavLink id="profile" page={page} />
          <button
            className="nav-link"
            onClick={() => {
              void logout().catch((e) => setError(e.message));
            }}
          >
            <LogOut />
            <span>Đăng xuất</span>
          </button>
        </nav>
      </ResponsiveDialog>
      <GlobalSearch
        open={search}
        onOpenChange={setSearch}
        pages={visiblePages}
        onNavigate={navigate}
      />
      <NotificationCenter
        open={notifications}
        onOpenChange={setNotifications}
      />
    </div>
  );
}
function NavLink({
  id,
  page,
  pending = false,
  onClick,
}: {
  id: string;
  page: string;
  pending?: boolean;
  onClick?: () => void;
}) {
  const Icon = ICONS[id] ?? Layers3;
  return (
    <a
      href={`#${id}`}
      onClick={onClick}
      className={cn("nav-link", page === id && "active")}
      aria-current={page === id ? "page" : undefined}
      title={PAGE_LABELS[id]}
    >
      <Icon size={18} />
      <span>{PAGE_LABELS[id]}</span>
      {pending && <i className="pending-dot" title="Đang chuẩn bị" />}
    </a>
  );
}
export function MobileNavigation({
  page,
  main,
  onMenu,
}: {
  page: string;
  main?: string;
  onMenu: () => void;
}) {
  return (
    <nav className="mobile-navigation" aria-label="Điều hướng di động">
      <NavLink id="home" page={page} />
      {main && <NavLink id={main} page={page} />}
      <NavLink id="profile" page={page} />
      <button className="nav-link" onClick={onMenu}>
        <Menu size={20} />
        <span>Thêm</span>
      </button>
    </nav>
  );
}
export function GlobalSearch({
  open,
  onOpenChange,
  pages,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  pages: string[];
  onNavigate: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = pages.filter((id) =>
    (PAGE_LABELS[id] ?? id)
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(
        query
          .toLocaleLowerCase("vi")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""),
      ),
  );
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tìm trong không gian"
      description="Tìm nhanh màn hình và phân hệ. Dùng Ctrl / ⌘ K để mở."
    >
      <Input
        aria-label="Tìm màn hình"
        placeholder="Nhập tên phân hệ…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="search-results">
        {matches.map((id) => (
          <button key={id} onClick={() => onNavigate(id)}>
            <span>{PAGE_LABELS[id]}</span>
            <ArrowRight size={15} />
          </button>
        ))}
        {!matches.length && <p>Không tìm thấy màn hình phù hợp.</p>}
      </div>
    </ResponsiveDialog>
  );
}
export function NotificationCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Thông báo"
      description="Thông báo công việc sẽ được triển khai cùng các phân hệ nghiệp vụ."
    >
      <EmptyState
        title="Thông báo chưa khả dụng"
        description="Bạn có thể theo dõi các thao tác quản trị trong nhật ký hoạt động."
      />
    </ResponsiveDialog>
  );
}
