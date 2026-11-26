import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  IMPORT_BATCH,
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  type ImportItem,
  type ImportJob,
} from "../../../shared/business";
import type { Page } from "../../../shared/contracts";
import { api } from "../../services/api";
import {
  EmptyState,
  ErrorState,
  FormField,
  LoadingSkeleton,
  Message,
  ResponsiveDialog,
  StatusBadge,
} from "../common";
import { TablePagination } from "../DataTable";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { dateTime, endpoint, write } from "./common";
import {
  guessMapping,
  parseImportFile,
  type ImportField,
  type Sheet,
} from "./import-file";

const importStatuses: Record<ImportJob["status"], string> = {
  STAGING: "Đang chuẩn bị",
  REVIEW: "Chờ xác nhận",
  PROCESSING: "Đang nhập",
  COMPLETED: "Đã kết thúc",
  CANCELLED: "Đã hủy",
};
const rowStatuses: Record<ImportItem["status"], string> = {
  PENDING: "Chờ xử lý",
  CREATED: "Đã tạo",
  UPDATED: "Đã cập nhật",
  SKIPPED: "Bỏ qua",
  FAILED: "Thất bại",
};
const classificationLabels: Record<ImportItem["classification"], string> = {
  VALID: "Hợp lệ",
  INVALID: "Có lỗi",
  DUPLICATE: "Trùng",
};
type Step =
  "file" | "mapping" | "preview" | "policy" | "confirm" | "result" | "history";
type Policy = "SKIP" | "UPDATE";
const steps: Record<Step, string> = {
  file: "Chọn tệp",
  mapping: "Ánh xạ cột",
  preview: "Kiểm tra dữ liệu",
  policy: "Xử lý trùng",
  confirm: "Xác nhận",
  result: "Kết quả",
  history: "Lịch sử nhập",
};
const importPath = (jobId: string, action = "") =>
  "customer-imports/" + jobId + (action ? "/" + action : "");
type JobResponse = { job: ImportJob };

export function CustomerImport({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("file");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<(ImportField | "")[]>([]);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [job, setJob] = useState<ImportJob | null>(null);
  const [policy, setPolicy] = useState<Policy>("SKIP");
  const [page, setPage] = useState(1);
  const [localError, setLocalError] = useState("");
  const parse = useMutation({
    mutationFn: parseImportFile,
    onSuccess: (value) => {
      setSheet(value);
      setMapping(guessMapping(value.headers));
      setStep("mapping");
      setId(crypto.randomUUID());
      setJob(null);
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      if (!sheet) throw new Error("Chọn tệp nhập.");
      const { job: initial } = await write<JobResponse>("customer-imports", {
        id,
        fileName: sheet.fileName,
        source: sheet.source,
        totalRows: sheet.rows.length,
      });
      setJob(initial);
      const items = sheet.rows.map(({ rowNumber, cells }) => ({
        rowNumber,
        values: Object.fromEntries(
          mapping.flatMap((field, index) => {
            if (!field) return [];
            const value = cells[index] ?? "";
            return [
              [
                field,
                value.length > 1600
                  ? value.slice(0, 1599).trimEnd().padEnd(1600, "…")
                  : value,
              ],
            ];
          }),
        ),
      }));
      let next = initial;
      for (let offset = initial.staged; offset < items.length;) {
        const batch: typeof items = [];
        let bytes = 0;
        for (const item of items.slice(offset, offset + IMPORT_BATCH)) {
          const size =
            new TextEncoder().encode(JSON.stringify(item)).length + 1;
          if (bytes + size > 400000 && batch.length) break;
          batch.push(item);
          bytes += size;
        }
        ({ job: next } = await write<JobResponse>(importPath(id, "rows"), {
          offset,
          items: batch,
        }));
        setJob(next);
        offset += batch.length;
      }
      return next;
    },
    onSuccess: () => {
      setPage(1);
      setStep("preview");
    },
  });
  const execute = useMutation({
    mutationFn: async () => {
      if (!job) throw new Error("Chưa có đợt nhập.");
      let next = job;
      if (next.status === "REVIEW")
        ({ job: next } = await write<JobResponse>(
          importPath(job.id, "confirm"),
          { version: job.version, policy },
        ));
      setJob(next);
      setStep("result");
      setPage(1);
      for (
        let batch = 0;
        next.status === "PROCESSING" &&
        batch < Math.ceil(IMPORT_MAX_ROWS / IMPORT_BATCH);
        batch++
      ) {
        ({ job: next } = await write<JobResponse>(
          importPath(job.id, "process"),
          {},
        ));
        setJob(next);
      }
      return next;
    },
    onSettled: onDone,
  });
  const cancel = useMutation({
    mutationFn: () =>
      write<JobResponse>(importPath(job!.id, "cancel"), {
        version: job!.version,
      }),
    onSuccess: ({ job: cancelled }) => {
      setJob(cancelled);
      setStep("result");
    },
  });
  const history = useQuery({
    queryKey: ["customer-imports", "history", page],
    queryFn: () =>
      api<Page<ImportJob>>(
        endpoint("customer-imports", { page, pageSize: 10 }),
      ),
    enabled: step === "history",
    staleTime: 0,
  });
  const rows = useQuery({
    queryKey: ["customer-imports", "rows", job?.id, job?.version, page],
    queryFn: () =>
      api<Page<ImportItem>>(
        endpoint(importPath(job!.id, "items"), { page, pageSize: 20 }),
      ),
    enabled:
      !!job && (step === "preview" || step === "result") && !execute.isPending,
  });
  const busy =
    parse.isPending ||
    preview.isPending ||
    execute.isPending ||
    cancel.isPending;
  const failure =
    localError ||
    parse.error?.message ||
    preview.error?.message ||
    execute.error?.message ||
    cancel.error?.message;
  function reopen(row: ImportJob) {
    setJob(row);
    setPolicy(row.policy ?? "SKIP");
    setPage(1);
    setStep(row.status === "REVIEW" ? "preview" : "result");
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      wide
      title="Nhập khách hàng"
      description={steps[step] + (job ? " · " + job.fileName : "")}
    >
      <div className="business-form">
        {failure && <Message>{failure}</Message>}
        {busy && (
          <p className="muted" role="status">
            {execute.isPending
              ? "Đang ghi các lô dữ liệu…"
              : "Đang kiểm tra dữ liệu…"}
          </p>
        )}
        {step === "file" && (
          <>
            <FormField
              id="import-file"
              label="Tệp Excel hoặc CSV"
              hint="XLSX dùng trang tính đầu. CSV dùng UTF-8. Đặt tiêu đề ở dòng đầu có dữ liệu và định dạng cột điện thoại là văn bản."
            >
              <Input
                id="import-file"
                type="file"
                accept=".csv,.xlsx"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    parse.reset();
                    parse.mutate(file);
                  }
                }}
              />
            </FormField>
            <p className="muted">
              Tối đa {IMPORT_MAX_ROWS} dòng dữ liệu, 60 cột và 2 MiB mỗi tệp.
            </p>
            <div className="dialog-actions">
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => {
                  parse.reset();
                  setPage(1);
                  setStep("history");
                }}
              >
                Lịch sử nhập
              </Button>
            </div>
          </>
        )}
        {step === "mapping" && sheet && (
          <>
            <p>
              {sheet.fileName} · {sheet.rows.length} dòng
            </p>
            {job?.status === "STAGING" && (
              <p className="muted">
                Đã kiểm tra {job.staged} dòng. Tiếp tục với cùng ánh xạ.
              </p>
            )}
            <div className="form-grid">
              {sheet.headers.map((header, index) => (
                <FormField
                  key={index}
                  id={"mapping-" + index}
                  label={header}
                  hint={sheet.rows[0]?.cells[index]?.slice(0, 55)}
                >
                  <select
                    id={"mapping-" + index}
                    value={mapping[index]}
                    disabled={busy || !!job}
                    onChange={(event) => {
                      setLocalError("");
                      setMapping(
                        mapping.map((value, i) =>
                          i === index
                            ? (event.target.value as ImportField)
                            : value,
                        ),
                      );
                    }}
                  >
                    <option value="">Bỏ qua cột</option>
                    {Object.entries(IMPORT_FIELDS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
              ))}
            </div>
            <div className="dialog-actions">
              <Button
                variant="outline"
                disabled={busy || !!job}
                onClick={() => {
                  setLocalError("");
                  setStep("file");
                }}
              >
                Chọn tệp khác
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  const used = mapping.filter(Boolean);
                  if (
                    !used.includes("name") ||
                    new Set(used).size !== used.length
                  ) {
                    setLocalError(
                      "Ánh xạ cột tên khách hàng và chỉ chọn mỗi trường một lần.",
                    );
                    return;
                  }
                  setLocalError("");
                  preview.mutate();
                }}
              >
                {job ? "Tiếp tục kiểm tra" : "Kiểm tra dữ liệu"}
              </Button>
            </div>
          </>
        )}
        {job && ["preview", "policy", "confirm", "result"].includes(step) && (
          <div className="business-import-summary">
            <StatusBadge active={job.status === "COMPLETED"}>
              {importStatuses[job.status]}
            </StatusBadge>
            <BusinessImportCounts job={job} />
          </div>
        )}
        {(step === "preview" || step === "result") && (
          <>
            {rows.isPending && !execute.isPending && (
              <LoadingSkeleton rows={2} />
            )}
            {rows.error && (
              <ErrorState
                error={rows.error}
                retry={() => void rows.refetch()}
              />
            )}
            {rows.data && (
              <>
                <ul className="business-import-rows">
                  {rows.data.items.map((item) => (
                    <li key={item.rowNumber}>
                      <div>
                        <strong>
                          Dòng {item.rowNumber}
                          {item.name && " · " + item.name}
                        </strong>
                        {item.phone && <small>{item.phone}</small>}
                        {item.matchedName && (
                          <small>Khớp với {item.matchedName}</small>
                        )}
                      </div>
                      <div>
                        <StatusBadge active={item.classification === "VALID"}>
                          {classificationLabels[item.classification]}
                        </StatusBadge>
                        {step === "result" && (
                          <small>{rowStatuses[item.status]}</small>
                        )}
                        {item.message && <small>{item.message}</small>}
                      </div>
                    </li>
                  ))}
                </ul>
                <TablePagination
                  total={rows.data.total}
                  page={page}
                  pageSize={20}
                  onPage={setPage}
                />
              </>
            )}
          </>
        )}
        {step === "preview" && (
          <div className="dialog-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => cancel.mutate()}
            >
              Hủy đợt nhập
            </Button>
            <Button disabled={busy} onClick={() => setStep("policy")}>
              Xử lý trùng
            </Button>
          </div>
        )}
        {step === "policy" && (
          <fieldset className="business-options">
            <legend>Chọn cách xử lý khách hàng trùng</legend>
            <label>
              <input
                type="radio"
                name="duplicate-policy"
                checked={policy === "SKIP"}
                onChange={() => setPolicy("SKIP")}
              />{" "}
              Bỏ qua dòng trùng
            </label>
            <label>
              <input
                type="radio"
                name="duplicate-policy"
                checked={policy === "UPDATE"}
                onChange={() => setPolicy("UPDATE")}
              />
              Cập nhật khách hàng khớp duy nhất bằng các ô có giá trị
            </label>
            <p className="muted">
              Dòng trùng trong tệp hoặc khớp nhiều khách hàng sẽ được bỏ qua. Dữ
              liệu đã thay đổi sau khi xem trước sẽ được báo lỗi theo dòng.
            </p>
            <div className="dialog-actions">
              <Button variant="outline" onClick={() => setStep("preview")}>
                Quay lại
              </Button>
              <Button onClick={() => setStep("confirm")}>Xem xác nhận</Button>
            </div>
          </fieldset>
        )}
        {step === "confirm" && (
          <>
            <p>
              {policy === "SKIP"
                ? "Chỉ tạo khách hàng mới từ các dòng hợp lệ."
                : "Tạo khách mới và cập nhật các trường có dữ liệu cho khách hàng khớp duy nhất."}{" "}
              Dòng có lỗi sẽ được bỏ qua.
            </p>
            <div className="dialog-actions">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setStep("policy")}
              >
                Quay lại
              </Button>
              <Button disabled={busy} onClick={() => execute.mutate()}>
                Xác nhận nhập
              </Button>
            </div>
          </>
        )}
        {step === "result" && job && (
          <>
            {job.status === "COMPLETED" && (
              <Message success={!job.failed}>
                Đã ghi kết quả nhập. {job.created} khách hàng mới, {job.updated}{" "}
                cập nhật.
              </Message>
            )}
            {job.status === "STAGING" && (
              <p className="muted">
                Đợt nhập chưa kiểm tra xong trong phiên trước. Hủy đợt này để
                bắt đầu lại từ tệp.
              </p>
            )}
            <div className="dialog-actions">
              {job.status === "STAGING" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => cancel.mutate()}
                >
                  Hủy đợt nhập
                </Button>
              )}
              {job.status === "PROCESSING" && (
                <Button disabled={busy} onClick={() => execute.mutate()}>
                  Tiếp tục nhập
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  execute.reset();
                  cancel.reset();
                  setPage(1);
                  setStep("history");
                  void history.refetch();
                }}
              >
                Lịch sử nhập
              </Button>
              <Button variant="outline" disabled={busy} onClick={onClose}>
                Đóng
              </Button>
            </div>
          </>
        )}
        {step === "history" && (
          <>
            {history.isPending && <LoadingSkeleton rows={2} />}
            {history.error && (
              <ErrorState
                error={history.error}
                retry={() => void history.refetch()}
              />
            )}
            {history.data &&
              (history.data.items.length ? (
                <>
                  <ul className="business-import-rows">
                    {history.data.items.map((row) => (
                      <li key={row.id}>
                        <div>
                          <button
                            className="business-row-link"
                            onClick={() => reopen(row)}
                          >
                            {row.fileName}
                          </button>
                          <small>
                            {dateTime(row.createdAt)} · {row.totalRows} dòng
                          </small>
                        </div>
                        <StatusBadge active={row.status === "COMPLETED"}>
                          {importStatuses[row.status]}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                  <TablePagination
                    total={history.data.total}
                    page={page}
                    pageSize={10}
                    onPage={setPage}
                  />
                </>
              ) : (
                <EmptyState
                  title="Chưa có đợt nhập"
                  description="Các đợt nhập của bạn sẽ xuất hiện tại đây."
                />
              ))}
            <div className="dialog-actions">
              <Button
                onClick={() => {
                  setJob(null);
                  setStep("file");
                }}
              >
                Chọn tệp mới
              </Button>
            </div>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
function BusinessImportCounts({ job }: { job: ImportJob }) {
  return (
    <p>
      {job.valid} hợp lệ · {job.invalid} có lỗi · {job.duplicate} trùng ·{" "}
      {job.skipped} bỏ qua · {job.failed} thất bại
    </p>
  );
}
