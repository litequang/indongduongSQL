import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { ProductionReport } from "../../shared/reports";
import type { Page, User } from "../../shared/contracts";
import { api } from "../services/api";
import { useAccess } from "../services/access";
import { useConfig } from "../context/ConfigContext";
import { userRepository } from "../repositories/userRepository";
import { Button } from "./ui/button";
import { ErrorState, LoadingSkeleton, PageHeader, Message } from "./common";
const dateNow = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const number = (n: number | null) =>
  n === null ? "Chưa ghi nhận" : n.toLocaleString("vi-VN");
export function Reports() {
  const today = dateNow();
  const [filters, setFilters] = useState({
    from: today.slice(0, 8) + "01",
    to: today,
    printerId: "",
    paper: "",
    status: "",
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const access = useAccess();
  const { settings } = useConfig();
  const printers = useInfiniteQuery({
    queryKey: ["users", "report-printers"],
    initialPageParam: 1,
    getNextPageParam: (last: Page<User>) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    queryFn: ({ pageParam }) =>
      userRepository.list({
        page: pageParam,
        pageSize: 100,
        search: "",
        role: "PRINTER",
      }),
  });
  const params = new URLSearchParams(
    Object.entries({ ...applied, page: String(page) }).filter(
      ([, v]) => v !== "",
    ),
  ).toString();
  const report = useQuery({
    queryKey: ["reports", params],
    queryFn: () => api<ProductionReport>("/reports/production?" + params),
    enabled: access.data?.permissions.canViewReports === true,
  });
  const download = async () => {
    setExporting(true);
    setExportError("");
    try {
      const r = await fetch("/api/reports/production.csv?" + params, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error?.message || "Không thể xuất báo cáo.");
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `san-xuat-${applied.from}-${applied.to}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="DỮ LIỆU SẢN XUẤT"
        title="Báo cáo sản xuất"
        description="Theo ngày tạo lệnh tại Việt Nam (UTC+7), tối đa 366 ngày. Không tính bản nháp; lệnh hủy được ghi riêng."
      />
      {access.error ? (
        <ErrorState error={access.error} retry={() => void access.refetch()} />
      ) : access.isPending ? (
        <LoadingSkeleton />
      ) : !access.data.permissions.canViewReports ? (
        <Message>Bạn chưa được cấp quyền xem báo cáo.</Message>
      ) : (
        <>
          <form
            className="surface settings-section stack-form report-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(filters);
              setPage(1);
            }}
          >
            <div className="form-grid">
              <label>
                Từ ngày
                <input
                  type="date"
                  required
                  value={filters.from}
                  onChange={(e) =>
                    setFilters({ ...filters, from: e.target.value })
                  }
                />
              </label>
              <label>
                Đến ngày
                <input
                  type="date"
                  required
                  value={filters.to}
                  onChange={(e) =>
                    setFilters({ ...filters, to: e.target.value })
                  }
                />
              </label>
              <label>
                Thợ in
                <select
                  value={filters.printerId}
                  onChange={(e) =>
                    setFilters({ ...filters, printerId: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  {printers.data?.pages
                    .flatMap((p) => p.items)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
                {printers.hasNextPage && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={printers.isFetchingNextPage}
                    onClick={() => void printers.fetchNextPage()}
                  >
                    Tải thêm thợ in
                  </Button>
                )}
                {printers.error && (
                  <span role="alert">
                    Không tải được danh sách thợ in.{" "}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => void printers.refetch()}
                    >
                      Thử lại
                    </button>
                  </span>
                )}
              </label>
              <label>
                Giấy
                <input
                  list="report-papers"
                  maxLength={100}
                  value={filters.paper}
                  onChange={(e) =>
                    setFilters({ ...filters, paper: e.target.value })
                  }
                />
                <datalist id="report-papers">
                  {settings?.paperTypes.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Trạng thái
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters({ ...filters, status: e.target.value })
                  }
                >
                  <option value="">Tất cả</option>
                  {Object.entries(statusLabels).map(([s, label]) => (
                    <option value={s} key={s}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="dialog-actions">
              <Button>Áp dụng bộ lọc</Button>
              <Button
                type="button"
                variant="outline"
                disabled={
                  !access.data.permissions.canExportExcel ||
                  exporting ||
                  !report.data
                }
                onClick={() => void download()}
              >
                Xuất CSV
              </Button>
            </div>
            <p className="muted">
              CSV tương thích Excel, tối đa 2.000 lệnh mỗi lần xuất. Tờ thực in
              chưa ghi nhận không được thay bằng tờ dự kiến.
            </p>
          </form>
          {exportError && <Message>{exportError}</Message>}
          {report.error ? (
            <ErrorState
              error={report.error}
              retry={() => void report.refetch()}
            />
          ) : report.isPending ? (
            <LoadingSkeleton />
          ) : (
            <ReportData report={report.data} />
          )}
          {report.data && (
            <div className="dialog-actions">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Trang trước
              </Button>
              <span>
                Trang {page} · {number(report.data.total)} lệnh
              </span>
              <Button
                variant="outline"
                disabled={page * report.data.pageSize >= report.data.total}
                onClick={() => setPage(page + 1)}
              >
                Trang sau
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
const statusLabels: Record<string, string> = {
  WAITING_ACCEPTANCE: "Chờ nhận",
  ACCEPTED: "Đã nhận",
  WAITING_PRINT: "Chờ in",
  PRINTING: "Đang in",
  PRINTED: "Đã in",
  CANCELLED: "Đã hủy",
};
function ReportData({ report: r }: { report: ProductionReport }) {
  const t = r.totals;
  return (
    <>
      <div className="policy-grid report-metrics">
        {[
          ["Lệnh in", t.orders],
          ["Đã in", t.completed],
          ["Đã hủy", t.cancelled],
          ["Tờ dự kiến", t.planned],
          ["Tờ thực in", t.actual],
          ["Tờ hỏng", t.spoilage],
          ["Lệnh có sự cố", t.issueOrders],
        ].map(([label, value]) => (
          <div className="surface settings-section" key={label}>
            <span className="muted">{label}</span>
            <strong>{number(value as number)}</strong>
          </div>
        ))}
      </div>
      <section className="surface settings-section">
        <h2>Số tờ theo ngày tạo lệnh</h2>
        <p className="muted">
          Tờ dự kiến bao gồm lệnh hủy. Tờ thực in và tờ hỏng chỉ cộng số đã được
          ghi nhận.
        </p>
        <div style={{ height: 280, width: "100%", minWidth: 0 }}>
          {r.daily.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.daily} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar name="Dự kiến" dataKey="planned" fill="#64748b" />
                <Bar name="Thực in" dataKey="actual" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p>Chưa có lệnh trong khoảng ngày này.</p>
          )}
        </div>
      </section>
      <section className="surface settings-section">
        <h2>Chi tiết lệnh</h2>
        <div className="report-table">
          <table>
            <caption>
              Sản lượng theo từng lệnh · cùng bộ lọc với biểu đồ
            </caption>
            <thead>
              <tr>
                {[
                  "Lệnh",
                  "Thợ in / giấy",
                  "Trạng thái",
                  "Tờ dự kiến",
                  "Tờ thực in",
                  "Tờ hỏng",
                ].map((s) => (
                  <th key={s} scope="col">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.items.map((o) => (
                <tr key={o.id}>
                  <td>
                    <a className="text-link" href={"#production/" + o.id}>
                      {o.code}
                    </a>
                    <br />
                    {o.title}
                  </td>
                  <td>
                    {o.printer}
                    <br />
                    {o.paper}
                  </td>
                  <td>{statusLabels[o.status]}</td>
                  <td>{number(o.planned)}</td>
                  <td>{number(o.actual)}</td>
                  <td>{number(o.spoilage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {(["printer", "paper", "creator"] as const).map((d) => (
        <section className="surface settings-section" key={d}>
          <h2>
            {d === "printer"
              ? "Theo thợ in"
              : d === "paper"
                ? "Theo giấy"
                : "Theo người tạo"}
          </h2>
          <div className="report-table">
            <table>
              <caption>
                100 nhóm đầu theo tờ thực in; tổng toàn bộ ở trên
              </caption>
              <thead>
                <tr>
                  {["Nhóm", "Lệnh", "Dự kiến", "Thực in", "Hỏng"].map((s) => (
                    <th scope="col" key={s}>
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.groups
                  .filter((g) => g.dimension === d)
                  .map((g) => (
                    <tr key={g.id}>
                      <th scope="row">{g.label || "Chưa ghi nhận"}</th>
                      <td>{number(g.orders)}</td>
                      <td>{number(g.planned)}</td>
                      <td>{number(g.actual)}</td>
                      <td>{number(g.spoilage)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
