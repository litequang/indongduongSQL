import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthLayout } from "./AuthLayout";
import { FormField, Message } from "./common";
import { Button } from "./ui/button";
import { bootstrapService } from "../services/bootstrapService";
export function BootstrapFirstRun({ enabled }: { enabled: boolean }) {
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState({
    companyName: "In Đông Dương",
    name: "",
    username: "",
    password: "",
    confirm: "",
    setupSecret: "",
  });
  const field = (key: keyof typeof data) => ({
    value: data[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setData({ ...data, [key]: e.target.value }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (step === 1 && data.password !== data.confirm) {
      setError("Hai mật khẩu chưa khớp.");
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const { confirm: _confirm, ...input } = data;
      await bootstrapService.bootstrap(input);
      setData({ ...data, password: "", confirm: "", setupSecret: "" });
      await client.invalidateQueries({ queryKey: ["setup"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout>
      <div className="auth-heading">
        <div className="small-icon">
          <ShieldCheck size={22} />
        </div>
        <span className="eyebrow">BẮT ĐẦU KHÔNG GIAN MỚI</span>
        <h2>Thiết lập xưởng in</h2>
        <p>Một vài thông tin để sẵn sàng làm việc.</p>
      </div>
      <ol className="setup-stepper" aria-label="Tiến trình thiết lập">
        {["Xưởng in", "Tài khoản", "Xác nhận"].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? "step" : undefined}
            className={step >= index ? "current" : ""}
          >
            <span>{step > index ? <Check size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {!enabled ? (
        <Message>
          Quản trị máy chủ cần cấu hình khóa thiết lập trước khi tiếp tục.
        </Message>
      ) : (
        <form className="stack-form" onSubmit={submit}>
          {error && <Message>{error}</Message>}
          {step === 0 && (
            <>
              <FormField
                id="setup-company"
                label="Tên xưởng / công ty"
                {...field("companyName")}
                required
                maxLength={120}
                autoFocus
              />
              <div className="setup-note">
                <ShieldCheck size={19} />
                <p>
                  Không gian mới bắt đầu với dữ liệu trống. Chỉ tài khoản quản
                  trị đầu tiên được tạo ở bước này.
                </p>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <FormField
                id="setup-name"
                label="Họ và tên"
                {...field("name")}
                required
                maxLength={100}
                autoFocus
              />
              <FormField
                id="setup-username"
                label="Tên đăng nhập"
                {...field("username")}
                required
                pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,63}"
                autoComplete="username"
                hint="3–64 ký tự, chữ không dấu và số."
              />
              <FormField
                id="setup-password"
                label="Mật khẩu"
                {...field("password")}
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                hint="Tối thiểu 12 ký tự. Dùng một mật khẩu riêng cho tài khoản này."
              />
              <FormField
                id="setup-confirm"
                label="Nhập lại mật khẩu"
                {...field("confirm")}
                type="password"
                required
                autoComplete="new-password"
              />
            </>
          )}
          {step === 2 && (
            <>
              <div className="setup-summary">
                <span>Xưởng in</span>
                <strong>{data.companyName}</strong>
                <span>Quản trị kỹ thuật đầu tiên</span>
                <strong>
                  {data.name} · {data.username}
                </strong>
              </div>
              <FormField
                id="setup-secret"
                label="Khóa thiết lập một lần"
                {...field("setupSecret")}
                type="password"
                required
                minLength={32}
                maxLength={256}
                autoComplete="off"
                hint="Nhập khóa riêng do quản trị máy chủ cung cấp. Thiết lập sẽ đóng vĩnh viễn sau khi hoàn tất."
                autoFocus
              />
            </>
          )}
          <div className="dialog-actions">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft />
                Quay lại
              </Button>
            )}
            <Button className="flex-1" disabled={busy}>
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : step < 2 ? (
                <>
                  Tiếp tục
                  <ArrowRight />
                </>
              ) : (
                <>
                  Hoàn tất thiết lập
                  <Check />
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
