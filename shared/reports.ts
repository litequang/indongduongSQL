import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Ngày không hợp lệ",
  );
export const reportQuery = z
  .object({
    from: date,
    to: date,
    printerId: z.string().uuid().optional(),
    paper: z.string().trim().max(100).optional(),
    status: z
      .enum([
        "WAITING_ACCEPTANCE",
        "ACCEPTED",
        "WAITING_PRINT",
        "PRINTING",
        "PRINTED",
        "CANCELLED",
      ])
      .optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine((v) => {
    const days = (Date.parse(v.to) - Date.parse(v.from)) / 86400000;
    return days >= 0 && days < 366;
  }, "Chọn khoảng ngày tối đa 366 ngày.");
export interface ReportTotals {
  orders: number;
  completed: number;
  cancelled: number;
  planned: number;
  actual: number;
  spoilage: number;
  issueOrders: number;
}
export interface ReportRow {
  id: string;
  code: string;
  title: string;
  printer: string;
  creator: string;
  paper: string;
  status: string;
  planned: number;
  actual: number | null;
  spoilage: number | null;
  createdAt: string;
}
export interface ProductionReport {
  totals: ReportTotals;
  daily: { day: string; orders: number; actual: number; planned: number }[];
  groups: {
    dimension: "printer" | "paper" | "creator";
    id: string;
    label: string;
    orders: number;
    actual: number;
    planned: number;
    spoilage: number;
  }[];
  items: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
}
export function csvCell(value: string | number | null) {
  if (typeof value === "number") return String(value);
  let s = value ?? "";
  // eslint-disable-next-line no-control-regex -- Treat leading ASCII controls as formula prefixes too.
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
