import { z } from "zod";
import { idSchema, versionSchema } from "./business";
import { ROLES, type Role } from "./contracts";

const text = (max: number) => z.string().trim().max(max);
const quantity = z.number().int().min(0).max(1_000_000_000);
export const PRODUCTION_STATUSES = ["DRAFT", "WAITING_ACCEPTANCE", "ACCEPTED", "WAITING_PRINT", "PRINTING", "PRINTED", "CANCELLED"] as const;
export type ProductionStatus = typeof PRODUCTION_STATUSES[number];
export const PRODUCTION_LABELS: Record<ProductionStatus, string> = {
  DRAFT: "Nháp", WAITING_ACCEPTANCE: "Chờ nhận lệnh", ACCEPTED: "Đã nhận", WAITING_PRINT: "Chờ in", PRINTING: "Đang in", PRINTED: "In xong · chờ gia công", CANCELLED: "Đã hủy",
};
export const PLATE_STATUSES = ["NOT_REQUIRED", "NOT_SENT", "SENT", "RECEIVED", "OLD_PLATE", "PLATE_DAMAGED"] as const;
export type PlateStatus = typeof PLATE_STATUSES[number];
export const PLATE_LABELS: Record<PlateStatus, string> = {
  NOT_REQUIRED: "Không cần kẽm", NOT_SENT: "Chưa gửi kẽm", SENT: "Đã gửi kẽm", RECEIVED: "Đã nhận kẽm", OLD_PLATE: "Kẽm cũ", PLATE_DAMAGED: "Kẽm mất / hỏng",
};
export const canComposeProduction = (role: Role) => ["DEVELOPER", "ADMIN", "MANAGER", "DESIGNER", "SALE"].includes(role);
export const canReviseProduction = (role: Role) => ["DEVELOPER", "ADMIN", "MANAGER", "DESIGNER"].includes(role);
export const isManagement = (role: Role) => ["DEVELOPER", "ADMIN", "MANAGER"].includes(role);
export const allocationFields = z.object({
  id: idSchema, salesItemId: idSchema, quantity,
  kind: z.enum(["OUTPUT", "TRACE", "REPRINT"]).default("OUTPUT"),
  sourceAllocationId: idSchema.nullable().default(null),
}).strict().refine(v => v.kind === "TRACE" ? v.quantity === 0 : v.quantity > 0, "Liên kết truy xuất có số lượng 0; phân bổ phải lớn hơn 0.");
export const productionItemFields = z.object({
  id: idSchema, productName: text(150).min(1), quantity,
  requiresFinishing: z.boolean().default(true), note: text(1000).default(""),
  designVersionId: idSchema.nullable().default(null),
  allocations: z.array(allocationFields).max(30).default([]),
}).strict();
export const technicalFields = z.object({
  instructionRaw: text(5000).default(""), paperType: text(100).default(""), paperGsm: text(60).default(""),
  paperWidth: text(60).default(""), paperHeight: text(60).default(""), color: text(100).default(""),
  totalSheets: quantity, machine: text(100).default(""),
}).strict();
export const productionFields = technicalFields.extend({
  title: text(150).min(1), printerId: idSchema.nullable().default(null),
  note: text(1000).default(""), finishingNote: text(1000).default(""),
  reference: text(120).default(""), tags: z.array(text(50).min(1)).max(12).default([]),
  isUrgent: z.boolean().default(false), urgentReason: text(500).default(""),
  runKind: z.enum(["NORMAL", "SUPPLEMENTAL", "REPRINT"]).default("NORMAL"),
  sourceOrderId: idSchema.nullable().default(null), runReason: text(500).default(""),
  plateType: z.enum(["NEW", "OLD", "UNKNOWN", "NONE"]).default("NEW"),
  plateNote: text(500).default(""),
  items: z.array(productionItemFields).max(30).default([]),
  printImages: z.array(z.object({ id: idSchema, label: text(150), note: text(500).default(""), sheetCount: quantity }).strict()).max(30).default([]),
}).strict();
export type ProductionInput = z.output<typeof productionFields>;
export type ProductionItem = ProductionInput["items"][number];
export type Allocation = ProductionItem["allocations"][number] & {
  state: "PROPOSED" | "ACTIVE" | "RELEASED";
  salesOrderId: string; salesCode: string; customerName: string; productName: string;
};
export interface ProductionOrder extends ProductionInput {
  id: string; code: string | null; createdBy: string; creatorName: string; printerName: string;
  status: ProductionStatus; version: number; revision: number; acknowledgedRevision: number;
  plateStatus: PlateStatus; createdAt: string; updatedAt: string;
  acceptedAt: string | null; startedAt: string | null; printedAt: string | null;
  actualPrintedSheets: number | null; spoilageSheets: number | null; printedNote: string | null;
  cancellationPending: boolean;
}
export const ISSUE_TYPES = ["PLATE", "MACHINE", "PRINT", "SHIPPING", "RETURN", "GENERAL"] as const;
export const ISSUE_POLICIES: Record<typeof ISSUE_TYPES[number], { reporters: readonly Role[]; recipients: readonly Role[] }> = {
  PLATE: { reporters: ["PRINTER"], recipients: ["DESIGNER", "MANAGER", "ADMIN", "DEVELOPER"] },
  MACHINE: { reporters: ["PRINTER"], recipients: ["MANAGER", "ADMIN", "DEVELOPER"] },
  PRINT: { reporters: ["PRINTER"], recipients: ["MANAGER", "ADMIN", "DEVELOPER"] },
  SHIPPING: { reporters: ["SALE", "MANAGER", "ADMIN", "DEVELOPER"], recipients: ["SALE", "MANAGER", "ADMIN", "DEVELOPER"] },
  RETURN: { reporters: ["SALE", "MANAGER", "ADMIN", "DEVELOPER"], recipients: ["MANAGER", "ADMIN", "DEVELOPER"] },
  GENERAL: { reporters: ["PRINTER", "SALE", "DESIGNER", "MANAGER", "ADMIN", "DEVELOPER", "FINISHER", "WAREHOUSE"], recipients: ["MANAGER", "ADMIN", "DEVELOPER"] },
};
export interface ProductionIssue {
  id: string; type: string; message: string; status: "OPEN" | "RESOLVED" | "CANCELLED";
  reportedBy: string; reporterName: string; recipientUserIds: string[]; recipientRoles: Role[];
  urgent: boolean; isBlocking: false; createdAt: string;
}
export interface ProductionEvent { id: string; action: string; actorName: string; fromStatus: string | null; toStatus: string; note: string; createdAt: string }
export interface ProductionDetail {
  order: ProductionOrder;
  allocations: Allocation[];
  history: ProductionEvent[];
  revisions: { revision: number; instructionRaw: string; technical: z.output<typeof technicalFields>; actorName: string; createdAt: string }[];
  issues: ProductionIssue[];
  cancellations: { id: string; status: string; reason: string; responseReason: string | null; requesterName: string; responderName: string | null; createdAt: string }[];
  comments: { id: string; content: string; actorName: string; createdAt: string }[];
  plates: { id: string; status: PlateStatus; type: string; note: string; actorName: string; createdAt: string }[];
  handoffs: { id: string; allocationId: string | null; productionItemId: string; quantity: number; requiresFinishing: boolean; status: "PENDING_02C"; replacement: boolean }[];
}
export const actionBase = z.object({ requestId: idSchema, version: versionSchema }).strict();
export const ACTION_SCHEMAS = {
  dispatch: actionBase,
  accept: actionBase,
  "wait-print": actionBase,
  acknowledge: actionBase.extend({ revision: versionSchema }),
  start: actionBase,
  complete: actionBase.extend({ actualPrintedSheets: quantity, spoilageSheets: quantity, note: text(500).default("") }),
  revise: actionBase.extend({ technical: technicalFields, printerId: idSchema, reason: text(500).min(1) }),
  urgent: actionBase.extend({ isUrgent: z.boolean(), reason: text(500).min(1) }),
  "plate-send": actionBase.extend({ note: text(500).default("") }),
  "plate-receive": actionBase,
  "plate-report": actionBase.extend({ reason: text(500).min(1) }),
  "plate-reissue": actionBase.extend({ note: text(500).min(1) }),
  "issue-report": actionBase.extend({ type: z.enum(ISSUE_TYPES), message: text(1000).min(1), recipientUserIds: z.array(idSchema).max(20).default([]), recipientRoles: z.array(z.enum(ROLES)).max(8).default([]), urgent: z.boolean().default(false) }),
  "issue-assign": actionBase.extend({ issueId: idSchema, recipientUserIds: z.array(idSchema).max(20), recipientRoles: z.array(z.enum(ROLES)).max(8) }),
  "issue-resolve": actionBase.extend({ issueId: idSchema }),
  "issue-cancel": actionBase.extend({ issueId: idSchema }),
  "cancel-request": actionBase.extend({ reason: text(500).min(1) }),
  "cancel-respond": actionBase.extend({ cancellationId: idSchema, accept: z.boolean(), reason: text(500).min(1) }),
  comment: actionBase.extend({ content: text(1000).min(1) }),
} as const;
export type ProductionAction = keyof typeof ACTION_SCHEMAS;
export type ProductionActionInput = { [K in ProductionAction]: z.output<typeof ACTION_SCHEMAS[K]> & { action: K } }[ProductionAction];
export interface DesignerItem {
  id: string; orderId: string; salesCode: string; customerName: string; productName: string;
  quantity: number; allocatedQuantity: number; remainingQuantity: number; status: string;
  queueStatus: string; version: number; instructionRaw: string; note: string; isUrgent: boolean;
  designVersionId: string | null; designName: string; designVersion: number | null;
  paperType: string; paperGsm: string; color: string;
}
