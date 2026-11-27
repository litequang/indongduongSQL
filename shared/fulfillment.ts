import { z } from "zod";
import { canEditSales, idSchema } from "./business";
import { ROLES, type Role } from "./contracts";
import { actionBase, canComposeProduction } from "./production";

const text = (max: number) => z.string().trim().max(max);
const note = text(1000).default("");
const reason = text(1000).min(1);
const quantity = z.number().int().min(0).max(1_000_000_000);

export const canSeeFinishing = (role: Role) =>
  role === "FINISHER" || canComposeProduction(role);
export const canSeeWarehouse = (role: Role) =>
  role === "WAREHOUSE" || role === "FINISHER" || canEditSales(role);
export const canSeeShipping = (role: Role) =>
  role === "WAREHOUSE" || canEditSales(role);

export const METHODS = [
  "INTERNAL_DELIVERY",
  "CUSTOMER_PICKUP",
  "BUS",
  "OTHER",
] as const;
export const METHOD_LABELS: Record<(typeof METHODS)[number], string> = {
  INTERNAL_DELIVERY: "Giao nội bộ",
  CUSTOMER_PICKUP: "Khách tự lấy",
  BUS: "Gửi xe",
  OTHER: "Phương thức khác",
};

export const SHIPMENT_ACTIONS = {
  register: { target: "CREATED", from: ["READY"], label: "Đăng ký vận chuyển" },
  "schedule-pickup": {
    target: "PICKUP_PENDING",
    from: ["READY", "CREATED"],
    label: "Chờ lấy hàng",
  },
  "pick-up": {
    target: "PICKED_UP",
    from: ["READY", "CREATED", "PICKUP_PENDING"],
    label: "Đã bàn giao hàng",
  },
  "start-delivery": {
    target: "IN_TRANSIT",
    from: ["PICKED_UP", "DELIVERY_FAILED"],
    label: "Bắt đầu giao",
  },
  deliver: {
    target: "DELIVERED",
    from: ["IN_TRANSIT"],
    label: "Xác nhận giao thành công",
  },
  "fail-delivery": {
    target: "DELIVERY_FAILED",
    from: ["IN_TRANSIT"],
    label: "Báo giao thất bại",
  },
  "start-return": {
    target: "RETURNING",
    from: ["IN_TRANSIT", "DELIVERY_FAILED"],
    label: "Chuyển hoàn",
  },
  "receive-return": {
    target: "RETURNED",
    from: ["RETURNING"],
    label: "Đã nhận hàng hoàn",
  },
  "cancel-shipment": {
    target: "CANCELLED",
    from: ["READY", "CREATED", "PICKUP_PENDING"],
    label: "Hủy vận đơn",
  },
} as const;
export type ShipmentAction = keyof typeof SHIPMENT_ACTIONS;
export type ReturnDisposition = (typeof DISPOSITIONS)[number];
export const DISPOSITIONS = ["RESTOCKED", "SCRAPPED", "CUSTOMER_HOLD"] as const;

export const FULFILLMENT_ACTIONS = {
  receive: actionBase.omit({ version: true }),
  assign: actionBase.extend({ finisherId: idSchema.nullable() }),
  claim: actionBase,
  start: actionBase,
  complete: actionBase.extend({ note }),
  "confirm-no-work": actionBase.extend({ note }),
  "add-note": actionBase.extend({ note: reason }),
  urgent: actionBase.extend({ urgent: z.boolean() }),
  "request-cancel": actionBase.extend({ note: reason }),
  "respond-cancel": actionBase.extend({ accept: z.boolean(), note: reason }),
  accept: actionBase.extend({
    accepted: quantity,
    rejected: quantity,
    short: quantity,
    note,
  }),
  "report-issue": actionBase.omit({ version: true }).extend({
    stage: z.enum(["FINISHING", "WAREHOUSE"]),
    issueType: text(100).min(1),
    note: reason,
    urgent: z.boolean().default(false),
    recipientRoles: z.array(z.enum(ROLES)).max(8).default([]),
    recipientUserIds: z.array(idSchema).max(20).default([]),
  }),
  "resolve-issue": actionBase.extend({ note }),
  "cancel-issue": actionBase.extend({ note }),
  dispatch: actionBase.extend({
    method: z.enum(METHODS),
    address: text(500).min(1),
    note,
  }),
  "reverse-dispatch": actionBase.extend({ note: reason }),
  "create-shipment": actionBase.extend({
    receiverName: text(150).min(1),
    receiverPhone: text(50).min(1),
    address: text(500).min(1),
    carrier: text(150).default(""),
    trackingCode: text(150).default(""),
    packages: quantity.min(1).default(1),
    weightGrams: quantity.default(0),
    codAmount: quantity.default(0),
    note,
  }),
  "inspect-return": actionBase.extend({
    lines: z
      .array(
        z
          .object({ lineId: idSchema, disposition: z.enum(DISPOSITIONS) })
          .strict(),
      )
      .min(1)
      .max(900),
    note: reason,
  }),
  register: actionBase.extend({ note }),
  "schedule-pickup": actionBase.extend({ note }),
  "pick-up": actionBase.extend({ note }),
  "start-delivery": actionBase.extend({ note }),
  deliver: actionBase.extend({ note }),
  "fail-delivery": actionBase.extend({ note: reason }),
  "start-return": actionBase.extend({ note: reason }),
  "receive-return": actionBase.extend({ note }),
  "cancel-shipment": actionBase.extend({ note: reason }),
} as const;
export type FulfillmentAction = keyof typeof FULFILLMENT_ACTIONS;
export type FulfillmentInput = {
  [K in FulfillmentAction]: z.output<(typeof FULFILLMENT_ACTIONS)[K]> & {
    action: K;
  };
}[FulfillmentAction];
export interface FulfillmentResult {
  id: string;
  version: number;
}
export interface EventEntry {
  action: string;
  status: string;
  actorName: string;
  note: string;
  createdAt: string;
}
export interface IssueEntry {
  id: string;
  stage: string;
  issueType: string;
  status: string;
  message: string;
  reporterName: string;
  urgent: boolean;
  createdAt: string;
  version: number;
  canResolve: boolean;
  canCancel: boolean;
}
export interface FinishingEntry {
  id: string;
  productName: string;
  customerName: string;
  salesCode: string | null;
  productionCode: string;
  productionId: string;
  quantity: number;
  requiresFinishing: boolean;
  instructions: string;
  productionNote: string;
  replacement: boolean;
  sourceProductionCode: string | null;
  status: string;
  version: number;
  claimedBy: string | null;
  assignedTo: string | null;
  finisherName: string | null;
  urgent: boolean;
  cancellationPending: boolean;
  accepted: number | null;
  rejected: number | null;
  short: number | null;
  createdAt: string;
}
export interface FinishingDetail {
  entry: FinishingEntry;
  history: EventEntry[];
  issues: IssueEntry[];
  acceptance: { actorName: string; note: string; createdAt: string } | null;
}
export interface StockEntry extends FinishingEntry {
  remaining: number;
  dispatched: number;
  returned: number;
  restocked: number;
}
export interface MovementEntry {
  id: string;
  kind: string;
  quantity: number;
  delta: number;
  actorName: string;
  createdAt: string;
  dispatchCode: string | null;
  shipmentCode: string | null;
}
export interface StockDetail extends Omit<FinishingDetail, "entry"> {
  entry: StockEntry;
  movements: MovementEntry[];
}
export interface ProductProgress {
  id: string;
  name: string;
  status: string;
  ordered: number;
  allocated: number;
  printed: number;
  checkedFinishing: number;
  accepted: number;
  rejected: number;
  short: number;
  available: number;
  dispatched: number;
  requiresProduction: boolean;
  requiresFinishing: boolean;
  replacementPending: number;
  designReady: boolean;
  reason: string | null;
}
export interface OrderProgress {
  id: string;
  code: string;
  customerName: string;
  customerAddress: string;
  status: string;
  version: number;
  canDispatch: boolean;
  dispatchStatus: string | null;
  shipmentStatus: string | null;
  products: ProductProgress[];
}
export interface DispatchEntry {
  id: string;
  code: string;
  salesCode: string;
  customerName: string;
  customerPhone: string;
  address: string;
  status: string;
  method: (typeof METHODS)[number];
  shipmentId: string | null;
  note: string;
  actorName: string;
  version: number;
  createdAt: string;
}
export interface DispatchLine {
  id: string;
  productName: string;
  quantity: number;
  productionCode: string;
}
export interface DispatchDetail {
  entry: DispatchEntry;
  lines: DispatchLine[];
  history: EventEntry[];
}
export interface ShipmentEntry {
  id: string;
  code: string;
  dispatchId: string;
  dispatchCode: string;
  salesCode: string;
  status: string;
  method: (typeof METHODS)[number];
  receiverName: string;
  receiverPhone: string;
  address: string;
  carrier: string;
  trackingCode: string;
  note: string;
  version: number;
  createdAt: string;
  packages: number;
  weightGrams: number;
  codAmount: number;
}
export interface ShipmentDetail {
  entry: ShipmentEntry;
  history: EventEntry[];
  lines: DispatchLine[];
  returns: {
    lineId: string;
    quantity: number;
    disposition: ReturnDisposition;
    actorName: string;
    note: string;
    createdAt: string;
  }[];
}
