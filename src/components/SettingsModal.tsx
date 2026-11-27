import { scrollToSection } from "./common";
import { useState, type FormEvent } from "react";
import { Building2, SlidersHorizontal, Palette, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type Settings, canManageSettings } from "../../shared/contracts";
import { useAuth } from "../context/AuthContext";
import { useConfig } from "../context/ConfigContext";
import { settingsRepository } from "../repositories/settingsRepository";
import { Button } from "./ui/button";
import { AccessSettings } from "./AccessSettings";
import { useAccess } from "../services/access";
import {
  PageHeader,
  FormField,
  Message,
  LoadingSkeleton,
  ErrorState,
} from "./common";
export function SettingsModal() {
  const { settings, loading, error, refresh } = useConfig();
  return (
    <>
      <PageHeader
        eyebrow="KHÔNG GIAN LÀM VIỆC"
        title="Cài đặt hệ thống"
        description="Nhận diện công ty, danh mục và các mốc theo dõi công việc."
      />
      {error ? (
        <ErrorState error={error} retry={() => void refresh()} />
      ) : loading ? (
        <LoadingSkeleton />
      ) : (
        settings && <SettingsEditor initial={settings} />
      )}
      <AccessSettings />
    </>
  );
}
function SettingsEditor({ initial }: { initial: Settings }) {
  const { user } = useAuth();
  const access = useAccess();
  const { settings: remote } = useConfig();
  const client = useQueryClient();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const editable =
    canManageSettings(user!.role) &&
    access.data?.permissions.canManageWorkshopSettings === true;
  const field = (key: keyof Settings) => ({
    value: form[key] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({
        ...form,
        [key]:
          e.target.type === "number" ? Number(e.target.value) : e.target.value,
      }),
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await settingsRepository.save(form);
      setForm(result.settings);
      client.setQueryData(["settings", user!.id], result);
      setNotice("Cài đặt đã được lưu.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      {error && <Message>{error}</Message>}
      {notice && <Message success>{notice}</Message>}
      {remote && remote.version !== form.version && (
        <Message>
          Cài đặt đã thay đổi ở thiết bị khác.{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => setForm(remote)}
          >
            Tải bản mới
          </button>{" "}
          trước khi tiếp tục.
        </Message>
      )}
      {!editable && (
        <div className="readonly-note">
          Bạn đang xem cấu hình. Chỉ quản trị viên được thay đổi.
        </div>
      )}
      <div className="settings-layout">
        <aside className="settings-nav">
          <a href="#company" onClick={scrollToSection}>
            <Building2 size={17} />
            Thông tin công ty
          </a>
          <a href="#appearance" onClick={scrollToSection}>
            <Palette size={17} />
            Nhận diện
          </a>
          <a href="#workflow" onClick={scrollToSection}>
            <SlidersHorizontal size={17} />
            Quy trình & danh mục
          </a>
        </aside>
        <div className="settings-content">
          <fieldset disabled={!editable || busy}>
            <section className="surface settings-section" id="company">
              <div className="section-heading">
                <div>
                  <h2>Thông tin công ty</h2>
                  <p>Thông tin hiển thị trong không gian làm việc.</p>
                </div>
                <Building2 size={20} />
              </div>
              <div className="form-grid">
                <FormField
                  id="settings-company"
                  label="Tên công ty"
                  {...field("companyName")}
                  required
                  maxLength={120}
                />
                <FormField
                  id="settings-short"
                  label="Tên viết tắt"
                  {...field("shortName")}
                  required
                  maxLength={40}
                />
                <FormField
                  id="settings-phone"
                  label="Số điện thoại"
                  {...field("phone")}
                  type="tel"
                  maxLength={30}
                />
                <FormField
                  id="settings-website"
                  label="Website"
                  {...field("website")}
                  type="url"
                  maxLength={250}
                  placeholder="https://"
                />
              </div>
              <FormField
                id="settings-address"
                label="Địa chỉ"
                {...field("address")}
                maxLength={250}
              />
              <FormField
                id="settings-slogan"
                label="Thông điệp công ty"
                {...field("slogan")}
                maxLength={160}
              />
            </section>
            <section className="surface settings-section" id="appearance">
              <h2>Nhận diện thương hiệu</h2>
              <p className="muted">
                Màu chủ đạo cho điều hướng và thao tác chính.
              </p>
              <div className="color-options">
                {["#2563eb", "#1d4ed8", "#4f46e5", "#0f766e", "#7c3aed"].map(
                  (color) => (
                    <button
                      type="button"
                      key={color}
                      aria-label={`Màu ${color}`}
                      aria-pressed={form.primaryColor === color}
                      className={form.primaryColor === color ? "selected" : ""}
                      style={{ background: color }}
                      onClick={() => setForm({ ...form, primaryColor: color })}
                    >
                      {form.primaryColor === color ? "✓" : ""}
                    </button>
                  ),
                )}
              </div>
            </section>
            <section className="surface settings-section" id="workflow">
              <h2>Quy trình & danh mục</h2>
              <p className="muted">
                Các mốc cảnh báo tính bằng phút; áp dụng khi module sản xuất sẵn
                sàng.
              </p>
              <div className="form-grid three">
                <FormField
                  id="settings-acceptance"
                  label="Chờ nhận lệnh (phút)"
                  {...field("acceptanceMinutes")}
                  type="number"
                  min={1}
                  max={10080}
                  required
                />
                <FormField
                  id="settings-plate"
                  label="Chờ kẽm (phút)"
                  {...field("plateMinutes")}
                  type="number"
                  min={1}
                  max={10080}
                  required
                />
                <FormField
                  id="settings-print"
                  label="Theo dõi in (phút)"
                  {...field("printingMinutes")}
                  type="number"
                  min={1}
                  max={10080}
                  required
                />
              </div>
              {(
                ["printers", "paperTypes", "colors", "finishingTypes"] as const
              ).map((key, index) => (
                <div className="form-field" key={key}>
                  <label htmlFor={`settings-${key}`}>
                    {
                      [
                        "Danh sách máy in",
                        "Loại giấy",
                        "Màu in",
                        "Công đoạn gia công",
                      ][index]
                    }
                  </label>
                  <textarea
                    id={`settings-${key}`}
                    value={form[key].join("\n")}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value.split("\n") })
                    }
                    onBlur={() =>
                      setForm((current) => ({
                        ...current,
                        [key]: current[key]
                          .map((x) => x.trim())
                          .filter(Boolean),
                      }))
                    }
                    rows={3}
                  />
                  <p className="field-hint">
                    Mỗi dòng một giá trị, không trùng lặp.
                  </p>
                </div>
              ))}
              <FormField
                id="settings-poll"
                label="Chu kỳ cập nhật (mili giây)"
                {...field("pollIntervalMs")}
                type="number"
                min={3000}
                max={30000}
                step={1000}
                required
                hint="Mặc định 4 giây. Ứng dụng tạm dừng đồng bộ khi tab ở nền."
              />
            </section>
          </fieldset>
          {editable && (
            <div className="sticky-save">
              <span>Thay đổi chỉ có hiệu lực sau khi lưu.</span>
              <Button disabled={busy}>
                <Save size={16} />
                {busy ? "Đang lưu…" : "Lưu cài đặt"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
