import type { Express } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { Config } from "../config";
import { routeContext } from "../auth/context";
import { rows, transaction } from "../database/pool";
import { wrap } from "../middleware/http";
import { reportQuery, csvCell, type ReportRow } from "../../shared/reports";
import { requireCapability } from "../services/access";
import { ApiError } from "../errors";
import { sessionFor } from "../auth/session";
const aggregate = `COUNT(*) AS orders,SUM(p.status='PRINTED') AS completed,SUM(p.status='CANCELLED') AS cancelled,COALESCE(SUM(p.total_sheets),0) AS planned,COALESCE(SUM(p.actual_printed_sheets),0) AS actual,COALESCE(SUM(p.spoilage_sheets),0) AS spoilage,SUM(EXISTS(SELECT 1 FROM production_issues i WHERE i.order_id=p.id)) AS issueOrders`;
const columns = `p.id,p.code,p.title,COALESCE(u.name,'Chưa phân công') AS printer,c.name AS creator,p.paper_type AS paper,p.status,p.total_sheets AS planned,p.actual_printed_sheets AS actual,p.spoilage_sheets AS spoilage,p.created_at`;
const joined = `production_orders p LEFT JOIN users u ON u.id=p.printer_id JOIN users c ON c.id=p.created_by`;
const map = (r: RowDataPacket): ReportRow => ({
  id: r.id,
  code: r.code,
  title: r.title,
  printer: r.printer,
  creator: r.creator,
  paper: r.paper,
  status: r.status,
  planned: Number(r.planned),
  actual: r.actual === null ? null : Number(r.actual),
  spoilage: r.spoilage === null ? null : Number(r.spoilage),
  createdAt: new Date(r.created_at).toISOString(),
});
export function registerReportRoutes(app: Express, pool: Pool, config: Config) {
  const { readSession } = routeContext(pool, config);
  for (const exportCsv of [false, true])
    app.get(
      exportCsv ? "/api/reports/production.csv" : "/api/reports/production",
      wrap(async (req, res) => {
        const session = await readSession(req);
        const q = reportQuery.parse(req.query);
        const data = await transaction(pool, async (db) => {
          // Re-read the session and permissions in this snapshot, including revocation.
          const current = await sessionFor(db, req, config);
          if (current.user.id !== session.user.id)
            throw new ApiError(401, "UNAUTHENTICATED", "Phiên đã thay đổi.");
          await requireCapability(db, current.user, "canViewReports");
          if (exportCsv)
            await requireCapability(db, current.user, "canExportExcel");
          const args: unknown[] = [
            new Date(q.from + "T00:00:00+07:00"),
            new Date(Date.parse(q.to + "T00:00:00+07:00") + 86400000),
          ];
          const filters = [
            "p.status<>'DRAFT'",
            "p.created_at>=?",
            "p.created_at<?",
          ];
          if (q.printerId) {
            filters.push("p.printer_id=?");
            args.push(q.printerId);
          }
          if (q.paper) {
            filters.push("p.paper_type=?");
            args.push(q.paper);
          }
          if (q.status) {
            filters.push("p.status=?");
            args.push(q.status);
          }
          const where = filters.join(" AND ");
          const [total] = await rows(
            db,
            `SELECT ${aggregate} FROM production_orders p WHERE ${where}`,
            args,
          );
          const totals = Object.fromEntries(
            Object.entries(total).map(([k, v]) => [k, Number(v ?? 0)]),
          );
          if (exportCsv && totals.orders > 2000)
            throw new ApiError(
              422,
              "EXPORT_LIMIT",
              "Có hơn 2.000 lệnh. Thu hẹp bộ lọc trước khi xuất.",
            );
          const items = await rows(
            db,
            `SELECT ${columns} FROM ${joined} WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT ${exportCsv ? 2000 : q.pageSize} OFFSET ${exportCsv ? 0 : (q.page - 1) * q.pageSize}`,
            args,
          );
          if (exportCsv)
            return { items: items.map(map), totals, daily: [], groups: [] };
          const daily = await rows(
            db,
            `SELECT DATE_FORMAT(DATE_ADD(p.created_at,INTERVAL 7 HOUR),'%Y-%m-%d') AS day,COUNT(*) AS orders,SUM(p.total_sheets) AS planned,COALESCE(SUM(p.actual_printed_sheets),0) AS actual FROM production_orders p WHERE ${where} GROUP BY day ORDER BY day`,
            args,
          );
          const groups = [];
          for (const [dimension, id, label] of [
            [
              "printer",
              "COALESCE(p.printer_id,'')",
              "COALESCE(u.name,'Chưa phân công')",
            ],
            ["paper", "p.paper_type", "p.paper_type"],
            ["creator", "p.created_by", "c.name"],
          ]) {
            const grouped = await rows(
              db,
              `SELECT ${id} AS id,${label} AS label,COUNT(*) AS orders,SUM(p.total_sheets) AS planned,COALESCE(SUM(p.actual_printed_sheets),0) AS actual,COALESCE(SUM(p.spoilage_sheets),0) AS spoilage FROM ${joined} WHERE ${where} GROUP BY ${id},${label} ORDER BY actual DESC,id LIMIT 100`,
              args,
            );
            groups.push(
              ...grouped.map((r) => ({
                ...r,
                dimension,
                orders: Number(r.orders),
                planned: Number(r.planned),
                actual: Number(r.actual),
                spoilage: Number(r.spoilage),
              })),
            );
          }
          return {
            totals,
            daily: daily.map((r) => ({
              ...r,
              orders: Number(r.orders),
              planned: Number(r.planned),
              actual: Number(r.actual),
            })),
            groups,
            items: items.map(map),
          };
        });
        if (exportCsv) {
          const lines: (string | number | null)[][] = [
            [
              "Mã lệnh",
              "Tên lệnh",
              "Thợ in",
              "Người tạo",
              "Giấy",
              "Trạng thái",
              "Tờ dự kiến",
              "Tờ thực in",
              "Tờ hỏng",
              "Ngày tạo UTC",
            ],
            ...data.items.map((r) => [
              r.code,
              r.title,
              r.printer,
              r.creator,
              r.paper,
              r.status,
              r.planned,
              r.actual,
              r.spoilage,
              r.createdAt,
            ]),
          ];
          res
            .type("text/csv; charset=utf-8")
            .set(
              "Content-Disposition",
              `attachment; filename="production-${q.from}-${q.to}.csv"`,
            )
            .send(
              "\uFEFF" +
                lines.map((r) => r.map(csvCell).join(",")).join("\r\n") +
                "\r\n",
            );
        } else
          res.json({
            ...data,
            total: data.totals.orders,
            page: q.page,
            pageSize: q.pageSize,
          });
      }),
    );
}
