import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { Button } from "../ui/button";
import { ErrorState, LoadingSkeleton, ResponsiveDialog } from "../common";
type Notification = {
  id: string;
  entity: string;
  entityId: string;
  sequence: string;
  read: boolean;
  createdAt: string;
};
const labels: Record<string, string> = {
  production_orders: "Lệnh in của bạn vừa cập nhật",
  sales_orders: "Đơn bán của bạn vừa cập nhật",
  fulfillment: "Không gian gia công / kho vừa cập nhật",
};
export function NotificationCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem("idd.ui.notificationSound") === "1";
    } catch {
      return false;
    }
  });
  const [voice, setVoice] = useState(() => {
    try {
      return localStorage.getItem("idd.ui.notificationVoice") === "1";
    } catch {
      return false;
    }
  });
  const audio = useRef<AudioContext | null>(null);
  const latest = useRef<string | undefined>(undefined);
  const recent = useQuery({
    queryKey: ["notifications", "latest", user?.id],
    queryFn: () => api<{ items: Notification[] }>("/notifications"),
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const id = recent.data?.items[0]?.sequence;
    if (
      id &&
      latest.current &&
      BigInt(id) > BigInt(latest.current) &&
      !document.hidden
    ) {
      if (sound && audio.current?.state === "running") {
        const oscillator = audio.current.createOscillator();
        const gain = audio.current.createGain();
        gain.gain.value = 0.05;
        oscillator.connect(gain);
        gain.connect(audio.current.destination);
        oscillator.start();
        oscillator.stop(audio.current.currentTime + 0.15);
      }
      if (voice && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(
          "Bạn có cập nhật công việc mới",
        );
        utterance.lang = "vi-VN";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    }
    if (id) latest.current = id;
  }, [recent.data, sound, voice]);
  useEffect(
    () => () => {
      void audio.current?.close();
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const client = useQueryClient();
  const [before, setBefore] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!sound) return;
    try {
      audio.current ??= new AudioContext();
      const resume = () => {
        void audio.current?.resume().catch(() => {});
      };
      resume();
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
      return () => {
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
    } catch {
      setError("Trình duyệt chưa hỗ trợ âm báo.");
    }
  }, [sound]);
  const list = useQuery({
    queryKey: ["notifications", before],
    queryFn: () =>
      api<{ items: Notification[]; hasMore: boolean }>(
        "/notifications" + (before ? "?before=" + before : ""),
      ),
    enabled: open,
    refetchInterval: open ? 4000 : false,
    refetchIntervalInBackground: false,
  });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Thông báo"
      description="Cập nhật công việc dành cho tài khoản của bạn."
    >
      <div className="dialog-actions">
        <Button
          variant="outline"
          onClick={() => {
            const next = !sound;
            setSound(next);
            try {
              localStorage.setItem(
                "idd.ui.notificationSound",
                next ? "1" : "0",
              );
            } catch {
              /* UI preference only. */
            }
          }}
        >
          Âm báo: {sound ? "Bật" : "Tắt"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const next = !voice;
            setVoice(next);
            try {
              localStorage.setItem(
                "idd.ui.notificationVoice",
                next ? "1" : "0",
              );
            } catch {
              /* UI preference only. */
            }
          }}
        >
          Giọng đọc: {voice ? "Bật" : "Tắt"}
        </Button>
      </div>
      {list.isPending ? (
        <LoadingSkeleton />
      ) : list.error ? (
        <ErrorState error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          {!list.data?.items.length && <p>Chưa có thông báo.</p>}
          {list.data?.items.map((n) => (
            <article className="business-subsection" key={n.id}>
              <p>
                <strong>{labels[n.entity] || "Công việc vừa cập nhật"}</strong>{" "}
                · {n.read ? "Đã đọc" : "Chưa đọc"}
              </p>
              <time>{new Date(n.createdAt).toLocaleString("vi-VN")}</time>
              <div className="dialog-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    location.hash =
                      n.entity === "production_orders"
                        ? "production/" + n.entityId
                        : n.entity === "sales_orders"
                          ? "sales/" + n.entityId
                          : user?.role === "WAREHOUSE"
                            ? "warehouse"
                            : "finishing";
                    onOpenChange(false);
                  }}
                >
                  Mở công việc
                </Button>
                {!n.read && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void api("/notifications/" + n.id + "/read", {
                        method: "POST",
                        body: "{}",
                      })
                        .then(() =>
                          client.invalidateQueries({
                            queryKey: ["notifications"],
                          }),
                        )
                        .catch((e) => setError(e.message))
                    }
                  >
                    Đánh dấu đã đọc
                  </Button>
                )}
              </div>
            </article>
          ))}
          {list.data?.hasMore && (
            <Button
              variant="outline"
              onClick={() => setBefore(list.data!.items.at(-1)!.sequence)}
            >
              Thông báo cũ hơn
            </Button>
          )}
          {before && (
            <Button variant="ghost" onClick={() => setBefore(undefined)}>
              Mới nhất
            </Button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </ResponsiveDialog>
  );
}
