import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "./ui/button";
import { FormField, Message } from "./common";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "./AuthLayout";
export function LoginModal() {
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(String(data.get("username")), String(data.get("password")));
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
          <LockKeyhole size={21} />
        </div>
        <h2>Chào mừng trở lại</h2>
        <p>Đăng nhập để tiếp tục công việc của bạn.</p>
      </div>
      <form onSubmit={submit} className="stack-form">
        {error && <Message>{error}</Message>}
        <FormField
          id="login-username"
          label="Tên đăng nhập"
          name="username"
          autoComplete="username"
          placeholder="Nhập tên đăng nhập"
          required
          autoFocus
          maxLength={64}
        />
        <div className="password-field">
          <FormField
            id="login-password"
            label="Mật khẩu"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            required
            maxLength={128}
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={() => setVisible(!visible)}
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <Button className="auth-submit" disabled={busy}>
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
              Đăng nhập
              <ArrowRight />
            </>
          )}
        </Button>
      </form>
      <p className="auth-help">
        Quên mật khẩu? Liên hệ quản trị viên của xưởng để được hỗ trợ.
      </p>
    </AuthLayout>
  );
}
