import { z } from "zod";
import type { Role } from "./contracts";

export const canManageCustomers = (role: Role) =>
  (["DEVELOPER", "ADMIN", "MANAGER", "SALE"] as Role[]).includes(role);
export const canEditSales = canManageCustomers;
export const canCreateSales = (role: Role) =>
  canEditSales(role) || role === "DESIGNER";
export const canManageDesigns = canCreateSales;
export const canForceReopenSales = (role: Role) =>
  role === "ADMIN" || role === "DEVELOPER";

const text = (max: number) => z.string().trim().max(max);
export const idSchema = z.uuid();
export const versionSchema = z.number().int().min(1).max(4294967295);
export const normalizePhone = (value: string) =>
  value
    .trim()
    .replace(/[\s().-]/g, "")
    .replace(/^(?:\+84|0084|84)(?=\d{9,10}$)/, "0");
export const customerFields = z
  .object({
    name: text(150).min(1, "Cần nhập tên khách hàng."),
    phone: text(40)
      .refine(
        (v) => !v || /^\+?\d{7,15}$/.test(normalizePhone(v)),
        "Số điện thoại không hợp lệ.",
      )
      .default(""),
    contactName: text(150).default(""),
    email: text(254)
      .refine(
        (v) => !v || z.email().safeParse(v).success,
        "Email không hợp lệ.",
      )
      .default(""),
    address: text(300).default(""),
    province: text(100).default(""),
    district: text(100).default(""),
    ward: text(100).default(""),
    zalo: text(200).default(""),
    facebook: text(250).default(""),
    note: text(1000).default(""),
    externalSource: text(40).toLowerCase().default(""),
    externalId: text(120).default(""),
  })
  .strict();
export type CustomerInput = z.output<typeof customerFields>;
export type Customer = CustomerInput & {
  id: string;
  code: string;
  phoneNormalized: string;
  source: string;
  importJobId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export const designFields = z
  .object({
    customerId: idSchema.nullable().default(null),
    customerName: text(150).default(""),
    productName: text(150).min(1),
    bagSize: text(100).default(""),
    paperType: text(100).default(""),
    paperGsm: text(60).default(""),
    color: text(100).default(""),
    plateReference: text(150).default(""),
    note: text(1000).default(""),
    tags: z.array(text(50).min(1)).max(12).default([]),
  })
  .strict();
export type DesignInput = z.output<typeof designFields>;
export interface DesignImageReference {
  registryId: string;
}
export type DesignVersion = DesignInput & {
  id: string;
  designId: string;
  version: number;
  createdBy: string;
  createdAt: string;
  image: DesignImageReference | null;
};
export interface SavedDesign {
  id: string;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  printCount: number;
  lastPrintedAt: string | null;
  lastPrinterId: string | null;
  current: DesignVersion;
}

export const SALES_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "DESIGNING",
  "FULFILLING",
  "IN_PRODUCTION",
  "PRODUCTION_COMPLETED",
  "READY_TO_SHIP",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];
export const SALES_STATUS_LABELS: Record<SalesStatus, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã xác nhận",
  DESIGNING: "Chờ thiết kế",
  FULFILLING: "Đang xử lý",
  IN_PRODUCTION: "Đang sản xuất",
  PRODUCTION_COMPLETED: "Đã sản xuất",
  READY_TO_SHIP: "Sẵn sàng giao",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
const dimension = z
  .number()
  .min(0)
  .max(9999999.999)
  .multipleOf(0.001)
  .nullable()
  .default(null);
export const salesItemFields = z
  .object({
    id: idSchema,
    productName: text(150).min(1),
    quantity: z.number().int().min(1).max(1_000_000_000),
    bagWidth: dimension,
    bagLength: dimension,
    bagGusset: dimension,
    paperPreference: text(100).default(""),
    gsmPreference: text(60).default(""),
    colorPreference: text(100).default(""),
    technicalRequirements: text(500).default(""),
    designRequirements: text(500).default(""),
    productionRequirements: text(500).default(""),
    finishingRequirements: text(500).default(""),
    note: text(1000).default(""),
    requiresProduction: z.boolean().default(true),
    requiresFinishing: z.boolean().default(true),
    isUrgent: z.boolean().default(false),
    designVersionId: idSchema.nullable().default(null),
  })
  .strict();
export const salesFields = z
  .object({
    customerId: idSchema,
    priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
    expectedDeliveryDate: z.iso.date().nullable().default(null),
    customerNote: text(1000).default(""),
    internalNote: text(1000).default(""),
    items: z
      .array(salesItemFields)
      .max(30)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Mã dòng sản phẩm bị trùng.",
      ),
  })
  .strict();
export type SalesItemInput = z.output<typeof salesItemFields>;
export type SalesInput = z.output<typeof salesFields>;
export type SalesItem = SalesItemInput & {
  status: string;
  quantityUnit: "BAG";
  designSnapshot: DesignVersion | null;
};
export interface SalesOrder extends Omit<SalesInput, "items"> {
  id: string;
  code: string;
  saleId: string;
  saleName: string;
  version: number;
  status: SalesStatus;
  customerSnapshot: { name: string; phone: string; address: string };
  totalItems: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
}
export interface SalesHistory {
  version: number;
  fromStatus: SalesStatus | null;
  toStatus: SalesStatus;
  actorName: string;
  reason: string;
  createdAt: string;
}

export const IMPORT_BATCH = 20;
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_FIELDS = {
  name: "Tên khách hàng",
  phone: "Điện thoại",
  contactName: "Người liên hệ",
  email: "Email",
  address: "Địa chỉ",
  province: "Tỉnh/thành",
  district: "Quận/huyện",
  ward: "Phường/xã",
  zalo: "Zalo",
  facebook: "Facebook",
  note: "Ghi chú",
  externalSource: "Hệ thống ngoài",
  externalId: "Mã ngoài",
} satisfies Record<keyof CustomerInput, string>;
export interface ImportJob {
  id: string;
  fileName: string;
  source: "CSV_IMPORT" | "EXCEL_IMPORT";
  totalRows: number;
  status: "STAGING" | "REVIEW" | "PROCESSING" | "COMPLETED" | "CANCELLED";
  policy: "SKIP" | "UPDATE" | null;
  version: number;
  createdAt: string;
  completedAt: string | null;
  staged: number;
  valid: number;
  invalid: number;
  duplicate: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}
export interface ImportItem {
  rowNumber: number;
  name: string;
  phone: string;
  matchedName: string | null;
  classification: "VALID" | "INVALID" | "DUPLICATE";
  status: "PENDING" | "CREATED" | "UPDATED" | "SKIPPED" | "FAILED";
  message: string;
}
