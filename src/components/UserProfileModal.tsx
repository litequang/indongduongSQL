import { Avatar } from "./private/Avatar";
import { scrollToSection } from "./common";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, KeyRound, UserRound } from "lucide-react";
import { ROLE_LABELS } from "../../shared/contracts";
import { useAuth } from "../context/AuthContext";
import { userRepository } from "../repositories/userRepository";
import { api, json } from "../services/api";
import { Button } from "./ui/button";
import { ImageAttachment } from "./private/ImageAttachment";
import { PageHeader, FormField, Message, ConfirmDialog } from "./common";
export function UserProfileModal() {
  const { user, refresh } = useAuth();
  const client = useQueryClient();
  const [form, setForm] = useState({
    name: user!.name,
    phone: user!.phone,
    machineAssigned: user!.machineAssigned,
    version: user!.version,
    avatarRegistryId: user!.avatarRegistryId,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await userRepository.update(user!.id, form);
      setForm({
        name: result.user.name,
        phone: result.user.phone,
        machineAssigned: result.user.machineAssigned,
        version: result.user.version,
        avatarRegistryId: result.user.avatarRegistryId,
      });
      await refresh();
      await client.invalidateQueries({ queryKey: ["users"] });
      setNotice("Hồ sơ đã được cập nhật.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="TÀI KHOẢN CỦA BẠN"
        title="Hồ sơ cá nhân"
        description="Thông tin cá nhân và bảo mật đăng nhập."
      />
      {error && <Message>{error}</Message>}
      {notice && <Message success>{notice}</Message>}
      <div className="settings-layout">
        <aside className="settings-nav">
          <a href="#personal" onClick={scrollToSection}>
            <UserRound size={17} />
            Thông tin cá nhân
          </a>
          <a href="#security" onClick={scrollToSection}>
            <KeyRound size={17} />
            Bảo mật
          </a>
        </aside>
        <div className="settings-content">
          <section className="surface settings-section" id="personal">
            <div className="section-heading">
              <h2>Thông tin cá nhân</h2>
              <ShieldCheck size={17} />
            </div>
            <form className="stack-form" onSubmit={save}>
              <div className="profile-inline">
                <Avatar user={user!} large />
                <div>
                  <strong>{user!.name}</strong>
                  <p>
                    {ROLE_LABELS[user!.role]} · @{user!.username}
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <FormField
                  id="profile-name"
                  label="Họ và tên"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={100}
                />
                <FormField
                  id="profile-phone"
                  label="Số điện thoại"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  type="tel"
                  maxLength={30}
                />
              </div>
              <ImageAttachment
                targetType="AVATAR"
                targetId={user!.id}
                slot="avatar"
                value={form.avatarRegistryId}
                onChange={(avatarRegistryId) =>
                  setForm({ ...form, avatarRegistryId })
                }
              />
              <FormField
                id="profile-machine"
                label="Máy phụ trách"
                value={form.machineAssigned}
                onChange={(e) =>
                  setForm({ ...form, machineAssigned: e.target.value })
                }
                maxLength={100}
              />
              <div className="form-footer">
                <span>Vai trò được quản lý bởi quản trị viên.</span>
                <Button disabled={busy}>Lưu hồ sơ</Button>
              </div>
            </form>
          </section>
          <PasswordChange />
          <section className="surface settings-section">
            <h2>Phiên đăng nhập</h2>
            <p className="muted">
              Kết thúc đăng nhập trên mọi thiết bị, bao gồm thiết bị hiện tại.
            </p>
            <Button variant="outline" onClick={() => setRevoke(true)}>
              Đăng xuất tất cả thiết bị
            </Button>
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={revoke}
        onOpenChange={setRevoke}
        title="Đăng xuất tất cả thiết bị?"
        description="Bạn sẽ cần đăng nhập lại trên các thiết bị của mình."
        onConfirm={() => {
          void userRepository
            .revoke(user!.id)
            .then(() => {
              client.clear();
              client.setQueryData(["session"], null);
            })
            .catch((e) => {
              setError(e.message);
              setRevoke(false);
            });
        }}
      />
    </>
  );
}
function PasswordChange() {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="surface settings-section" id="security">
      <div className="section-heading">
        <h2>Đổi mật khẩu</h2>
        <KeyRound size={17} />
      </div>
      <p className="muted">
        Sau khi thay đổi, bạn sẽ được yêu cầu đăng nhập lại trên mọi thiết bị.
      </p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (data.get("password") !== data.get("confirm")) {
            setError("Hai mật khẩu mới chưa khớp.");
            return;
          }
          setError("");
          setBusy(true);
          try {
            await api("/auth/change-password", {
              method: "POST",
              body: json({
                currentPassword: data.get("current"),
                newPassword: data.get("password"),
              }),
            });
            client.clear();
            client.setQueryData(["session"], null);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Message>{error}</Message>}
        <FormField
          id="profile-current"
          name="current"
          label="Mật khẩu hiện tại"
          type="password"
          required
          autoComplete="current-password"
          maxLength={128}
        />
        <div className="form-grid">
          <FormField
            id="profile-new"
            name="password"
            label="Mật khẩu mới"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            hint="Tối thiểu 12 ký tự."
          />
          <FormField
            id="profile-confirm"
            name="confirm"
            label="Nhập lại mật khẩu mới"
            type="password"
            required
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
        <div className="form-footer">
          <span>Không dùng chung mật khẩu với dịch vụ khác.</span>
          <Button disabled={busy}>Đổi mật khẩu</Button>
        </div>
      </form>
    </section>
  );
}
