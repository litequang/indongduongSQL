import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, json } from "../../services/api";
import { Button } from "../ui/button";
import { ErrorState, Message, PageHeader, ResponsiveDialog } from "../common";
type Job = {
  id: string;
  mode: string;
  total: number;
  ok: number;
  failed: number;
  lastImageId: string;
};
export function Storage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<string>();
  const [afterId, setAfterId] = useState<string>();
  const detail = useQuery({
    queryKey: ["storage-job", selection, afterId],
    queryFn: () =>
      api<{
        items: {
          imageId: string;
          status: string;
          message: string;
          attempts: number;
        }[];
        hasMore: boolean;
      }>("/storage/jobs/" + selection + (afterId ? "?afterId=" + afterId : "")),
    enabled: !!selection && user?.role === "DEVELOPER",
  });
  const status = useQuery({
    queryKey: ["storage-status"],
    queryFn: () =>
      api<{ enabled: boolean; backupEnabled: boolean }>("/storage/status"),
  });
  const jobs = useQuery({
    queryKey: ["storage-jobs"],
    queryFn: () => api<{ items: Job[] }>("/storage/jobs"),
    enabled: user?.role === "DEVELOPER",
  });
  const coverage = useQuery({
    queryKey: ["storage-coverage"],
    queryFn: () =>
      api<{ total: number; backedUp: number }>("/storage/coverage"),
    enabled: user?.role === "DEVELOPER",
  });
  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setNotice("");
    try {
      await run();
      await client.invalidateQueries({ queryKey: ["storage-jobs"] });
      await client.invalidateQueries({ queryKey: ["storage-coverage"] });
      await client.invalidateQueries({ queryKey: ["storage-job"] });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (user?.role !== "DEVELOPER")
    return <Message>Màn hình dành cho kỹ thuật hệ thống.</Message>;
  return (
    <>
      <PageHeader
        title="Lưu trữ hình ảnh"
        description="Sao lưu, kiểm tra checksum và khôi phục ảnh thiếu. Mỗi lượt xử lý một ảnh; có thể tiếp tục sau khi đóng màn hình."
      />
      <section className="surface production-panel storage-panel">
        <p>
          {status.data?.enabled
            ? "Kho ảnh riêng đã cấu hình."
            : "Kho ảnh riêng chưa cấu hình."}{" "}
          {status.data?.backupEnabled
            ? "Bucket sao lưu riêng đã cấu hình."
            : "Bucket sao lưu chưa cấu hình."}
        </p>
        {coverage.data && (
          <p>
            Đã sao lưu và xác minh: {coverage.data.backedUp}/
            {coverage.data.total} ảnh. Chạy kiểm tra để biết tình trạng hiện tại
            của các bản sao.
          </p>
        )}
        {coverage.error && (
          <ErrorState
            error={coverage.error}
            retry={() => void coverage.refetch()}
          />
        )}
        <div className="dialog-actions">
          {(["BACKUP", "VERIFY", "RESTORE"] as const).map((mode, i) => (
            <Button
              key={mode}
              disabled={busy || !status.data?.backupEnabled}
              onClick={() =>
                void act(() =>
                  api("/storage/jobs", {
                    method: "POST",
                    body: json({ id: crypto.randomUUID(), mode }),
                  }),
                )
              }
            >
              {
                [
                  "Tạo bản sao lưu",
                  "Kiểm tra bản sao lưu",
                  "Khôi phục ảnh thiếu",
                ][i]
              }
            </Button>
          ))}
        </div>
        {jobs.error && (
          <ErrorState error={jobs.error} retry={() => void jobs.refetch()} />
        )}
        {notice && <Message>{notice}</Message>}
        {jobs.data?.items.map((j) => (
          <article key={j.id} className="business-subsection">
            <h2>
              {j.mode === "BACKUP"
                ? "Sao lưu"
                : j.mode === "VERIFY"
                  ? "Kiểm tra"
                  : "Khôi phục"}
            </h2>
            <p>
              {j.ok}/{j.total} ảnh đã xác minh · {j.failed} lỗi
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setSelection(j.id);
                setAfterId(undefined);
              }}
            >
              Chi tiết từng ảnh
            </Button>
            <Button
              variant="outline"
              disabled={
                busy || Number(j.ok) + Number(j.failed) >= Number(j.total)
              }
              onClick={() =>
                void act(async () => {
                  const r = await api<{ message?: string }>(
                    "/storage/jobs/" + j.id + "/run",
                    { method: "POST", body: "{}" },
                  );
                  setNotice(r.message || "Đã xử lý xong.");
                })
              }
            >
              Xử lý ảnh tiếp theo
            </Button>{" "}
            {Number(j.failed) > 0 && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const r = await api<{ message: string }>(
                      "/storage/jobs/" + j.id + "/run",
                      { method: "POST", body: '{"retryFailed":true}' },
                    );
                    setNotice(r.message);
                  })
                }
              >
                Thử lại ảnh lỗi
              </Button>
            )}
          </article>
        ))}
        {jobs.data?.items
          .filter((j) => Number(j.total) === 500)
          .map((j) => (
            <Button
              key={j.id}
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api("/storage/jobs", {
                    method: "POST",
                    body: json({
                      id: crypto.randomUUID(),
                      mode: j.mode,
                      afterId: j.lastImageId,
                    }),
                  }),
                )
              }
            >
              Tạo phần tiếp theo sau nhóm 500 ảnh ({j.mode})
            </Button>
          ))}
        <Button
          variant="outline"
          disabled={busy || !status.data?.enabled}
          onClick={() =>
            void act(async () => {
              const r = await api<{ cleaned: number }>("/storage/cleanup", {
                method: "POST",
                body: "{}",
              });
              setNotice(
                "Đã dọn " +
                  r.cleaned +
                  " ảnh không tham chiếu quá một ngày hoặc đã xóa.",
              );
            })
          }
        >
          Dọn tối đa 10 ảnh không còn dùng
        </Button>
      </section>
      <ResponsiveDialog
        open={!!selection}
        onOpenChange={(open) => {
          if (!open) setSelection(undefined);
        }}
        title="Kết quả từng ảnh"
        description="Mã registry, kết quả checksum và số lần xử lý của tác vụ."
      >
        {detail.error && (
          <ErrorState
            error={detail.error}
            retry={() => void detail.refetch()}
          />
        )}
        {detail.data?.items.map((image) => (
          <article key={image.imageId} className="business-subsection">
            <p className="storage-image-id">{image.imageId}</p>
            <p>
              {image.status} · {image.attempts} lần
            </p>
            <p>{image.message || "Chưa xử lý"}</p>
          </article>
        ))}
        {detail.data?.hasMore && (
          <Button
            onClick={() => setAfterId(detail.data!.items.at(-1)!.imageId)}
          >
            100 ảnh tiếp theo
          </Button>
        )}
        {afterId && (
          <Button variant="ghost" onClick={() => setAfterId(undefined)}>
            Về đầu danh sách
          </Button>
        )}
      </ResponsiveDialog>
    </>
  );
}
