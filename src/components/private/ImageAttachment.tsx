import { useEffect, useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, json } from "../../services/api";
import { deviceDraft } from "../../services/device-drafts";
import { Button } from "../ui/button";
import { Message } from "../common";

export function PrivateImage({ id, alt }: { id?: string | null; alt: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const { user } = useAuth();
  useEffect(() => {
    if (!id) return;
    let alive = true;
    let objectUrl = "";
    const controller = new AbortController();
    void fetch("/api/images/" + id + "/content", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Không đọc được ảnh riêng tư.");
        return r.blob();
      })
      .then((blob) => {
        if (alive) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (alive)
          setError("Ảnh chưa sẵn sàng hoặc quyền truy cập đã thay đổi.");
      });
    return () => {
      alive = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl("");
      setError("");
    };
  }, [id, user?.id]);
  if (!id) return null;
  return url ? (
    <img className="private-image" src={url} alt={alt} />
  ) : (
    <p role="status">{error || "Đang tải ảnh…"}</p>
  );
}
export function ImageAttachment({
  targetType,
  targetId,
  slot,
  value,
  onChange,
}: {
  targetType: "DESIGN" | "PRODUCTION" | "AVATAR";
  targetId: string;
  slot: string;
  value?: string | null;
  onChange: (id: string | null) => void;
}) {
  const { user } = useAuth();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [ticket, setTicket] = useState("");
  const status = useQuery({
    queryKey: ["storage-status"],
    queryFn: () => api<{ enabled: boolean }>("/storage/status"),
  });
  useEffect(() => {
    let alive = true;
    void deviceDraft(user!.id, targetId, slot)
      .then((f) => {
        if (alive && f) {
          setFile(f);
          setNotice("Đã khôi phục nháp ảnh trên thiết bị này.");
        }
      })
      .catch(() => {
        if (alive) setNotice("Thiết bị không cho phép lưu nháp ảnh.");
      });
    return () => {
      alive = false;
    };
  }, [user?.id, targetId, slot]);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Chọn ảnh trước khi tải.");
      const id = ticket || crypto.randomUUID();
      setTicket(id);
      await api("/images", {
        method: "POST",
        body: json({ id, targetType, targetId }),
      });
      await api("/images/" + id + "/content", {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      onChange(id);
      let cleared = true;
      await deviceDraft(user!.id, targetId, slot, null).catch(() => {
        cleared = false;
      });
      setFile(null);
      setNotice(
        cleared
          ? "Ảnh đã xác minh. Lưu bản ghi để gắn ảnh."
          : "Ảnh đã xác minh. Lưu bản ghi để gắn ảnh. Không xóa được nháp thiết bị; kiểm tra quyền lưu trữ của trình duyệt.",
      );
    },
  });
  return (
    <div className="image-attachment">
      <PrivateImage id={value} alt="Ảnh đính kèm" />
      <label htmlFor={inputId}>Ảnh JPEG / PNG / WebP · tối đa 5 MiB</label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={upload.isPending}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
            f.size > 5 * 1024 * 1024
          ) {
            setNotice("Chọn ảnh hợp lệ tối đa 5 MiB.");
            return;
          }
          setFile(f);
          setTicket("");
          setNotice(
            "Ảnh đang ở bộ nhớ. Có thể lưu nháp thiết bị trước khi tải.",
          );
        }}
      />
      {file && <p>{file.name}</p>}
      <div className="dialog-actions">
        <Button
          type="button"
          variant="outline"
          disabled={!file || upload.isPending}
          onClick={() =>
            void deviceDraft(user!.id, targetId, slot, file)
              .then(() =>
                setNotice(
                  "Đã lưu nháp ảnh trên thiết bị. Mở lại cùng bản nháp đã lưu để khôi phục; đăng xuất sẽ xóa nháp thiết bị.",
                ),
              )
              .catch(() =>
                setNotice(
                  "Không lưu được nháp: kiểm tra quyền hoặc dung lượng thiết bị.",
                ),
              )
          }
        >
          Lưu nháp ảnh trên thiết bị
        </Button>
        <Button
          type="button"
          disabled={!file || !status.data?.enabled || upload.isPending}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? "Đang xác minh…" : "Tải và xác minh ảnh"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            Bỏ ảnh khỏi phiên bản mới
          </Button>
        )}
      </div>
      {status.data && !status.data.enabled && (
        <p>
          Kho ảnh chưa được cấu hình. Bạn vẫn có thể lưu nháp ảnh trên thiết bị.
        </p>
      )}
      {status.error && <Message>{status.error.message}</Message>}
      {(notice || upload.error) && (
        <Message>{upload.error?.message || notice}</Message>
      )}
    </div>
  );
}
