import { useState, type ReactNode } from "react";
import {
  Printer,
  Layers3,
  ArrowRight,
  ShieldCheck,
  Moon,
  Sun,
} from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <Printer size={23} />
      </span>
      <div>
        <strong>ĐÔNG DƯƠNG</strong>
        <span>PRINT WORKSPACE</span>
      </div>
    </div>
  );
}
export function AuthLayout({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(
    document.documentElement.classList.contains("dark"),
  );
  return (
    <main className="auth-layout">
      <button
        className="auth-theme-toggle"
        aria-label={dark ? "Bật giao diện sáng" : "Bật giao diện tối"}
        onClick={() => {
          document.documentElement.classList.toggle("dark", !dark);
          setDark(!dark);
          try {
            localStorage.setItem("idd.ui.theme", dark ? "light" : "dark");
          } catch {
            /* UI preference only. */
          }
        }}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="story-tag">
            <Layers3 size={14} /> Không gian làm việc xưởng in
          </span>
          <h1>
            Mỗi công đoạn.
            <br />
            Một dòng chảy.
          </h1>
          <p>
            Kết nối con người và quy trình.
            <br />
            Cùng làm việc rõ ràng, tập trung và hiệu quả.
          </p>
          <div className="flow-illustration" aria-hidden="true">
            <div className="flow-node">
              <span>01</span>
              <strong>Đơn hàng</strong>
              <i />
            </div>
            <ArrowRight />
            <div className="flow-node">
              <span>02</span>
              <strong>Sản xuất</strong>
              <i />
            </div>
            <ArrowRight />
            <div className="flow-node">
              <span>03</span>
              <strong>Thành phẩm</strong>
              <i />
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <ShieldCheck size={16} /> Không gian riêng cho đội ngũ của bạn
        </div>
      </section>
      <section className="auth-form-area">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-card">{children}</div>
        <p className="auth-copyright">In Đông Dương · Quản lý xưởng in</p>
      </section>
    </main>
  );
}
