import {
  useEffect,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Loader2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { cn } from "../lib/utils";
import { api } from "../services/api";
export function scrollToSection(event: React.MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  document.getElementById(event.currentTarget.hash.slice(1))?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
export function FormField({
  label,
  hint,
  id,
  children,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="form-field">
      <Label htmlFor={id}>{label}</Label>
      {children ?? <Input id={id} {...props} />}{" "}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
export function Message({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      role={success ? "status" : "alert"}
      className={cn("message", success && "success")}
    >
      {success ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>{children}</span>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={23} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div className="error-state">
      <Message>{error.message}</Message>
      <Button variant="outline" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-label="Đang tải" role="status" className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
      <span className="sr-only">Đang tải dữ liệu</span>
    </div>
  );
}
export function StatusBadge({
  active,
  children,
}: {
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "status-badge",
        active === true && "positive",
        active === false && "neutral",
      )}
    >
      <i />
      {children ?? (active ? "Hoạt động" : "Đã khóa")}
    </span>
  );
}
export function PriorityBadge() {
  return <span className="status-badge urgent">Ưu tiên cao</span>;
}
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("responsive-dialog", wide && "dialog-wide")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  busy = false,
  error,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      {error && <Message>{error}</Message>}
      <div className="dialog-actions">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Quay lại
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>
          {busy && <Loader2 className="animate-spin" />}Xác nhận
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
export function DetailPanel({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <aside className="detail-panel">
      <div className="section-heading">
        <h2>{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Đóng chi tiết"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {children}
    </aside>
  );
}
export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const health = useQuery({
    queryKey: ["connection"],
    queryFn: () => api("/ready"),
    refetchInterval: 15000,
    retry: false,
  });
  const connected = online && !health.isError;
  return (
    <span
      className={cn("connection-status", !connected && "disconnected")}
      title={
        connected
          ? "Máy chủ đang sẵn sàng"
          : "Không thể kết nối; dữ liệu chưa được lưu khi có lỗi."
      }
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      <span>{connected ? "Đã kết nối" : "Mất kết nối"}</span>
    </span>
  );
}
export function ActivityTimeline({
  items,
}: {
  items: { id: string; title: string; description: string; time: string }[];
}) {
  return (
    <ol
      className="activity-timeline"
      tabIndex={0}
      aria-label="Lịch sử hoạt động"
    >
      {items.map((item) => (
        <li key={item.id}>
          <span className="timeline-dot" />
          <div>
            <p>{item.title}</p>
            <span>{item.description}</span>
            <time>{item.time}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function QuantityInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input {...props} inputMode="decimal" type="number" min={0} step={1} />
  );
}
export function ImagePreview({ src, alt }: { src: string; alt: string }) {
  return (
    <a className="image-preview" href={src} target="_blank" rel="noreferrer">
      <img src={src} alt={alt} />
      <ArrowUpRight size={14} />
    </a>
  );
}
