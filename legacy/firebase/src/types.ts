import type { StorageProviderType } from './storage/types';

export type UserRole = 'DEVELOPER' | 'ADMIN' | 'MANAGER' | 'DESIGNER' | 'SALE' | 'PRINTER' | 'FINISHER' | 'WAREHOUSE';

/**
 * Persisted image information. Image bytes live only in a remote provider;
 * Firestore stores this small reference. downloadUrl is a legacy/Firebase
 * compatibility field and is intentionally empty for R2 images.
 */
export interface StoredImageReference {
  imageId?: string;
  providerType?: StorageProviderType;
  providerConfigId?: string;
  objectKey?: string;
  sha256?: string;
  /** Legacy provider-path alias retained for existing documents and callers. */
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  size: number;
  width?: number;
  height?: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface User {
  id: string;
  /** Firebase Auth UID is resolved only through auth_identities/{uid}; users/{id} uses this business ID. */
  firebaseUid?: string;
  /** Stable pre-Firebase application ID retained by historical order references. */
  legacyUserId?: string;
  name: string;
  email?: string;
  role: UserRole;
  avatar?: string;
  avatarImage?: StoredImageReference;
  phone?: string;
  username?: string;
  pin?: string;
  machineAssigned?: string;
  active: boolean;
  deletedAt?: string;
  updatedAt?: string;
  createdAt?: string;
}

export type PlateStatus = 
  | 'NOT_REQUIRED'  // Không cần kẽm
  | 'NOT_SENT'      // Chưa gửi kẽm (Cảnh báo 🔴)
  | 'SENT'          // Đã gửi ra kẽm (Chờ kẽm về 🟡)
  | 'RECEIVED'      // Đã nhận kẽm (🟢)
  | 'OLD_PLATE'     // Dùng kẽm cũ (🟢)
  | 'PLATE_DAMAGED';// Kẽm cũ bị mất/hỏng, thợ báo không còn kẽm cần ra lại kẽm (🔴)

export type ProductionStatus = 
  | 'DRAFT'              // Lệnh nháp / Chưa gửi thợ in (Thiết kế / Sale đang gom, ghép hoặc kiểm tra)
  | 'WAITING_ACCEPTANCE' // Chờ thợ xác nhận
  | 'WAITING_PLATE'      // Chờ ra kẽm
  | 'ACCEPTED'           // Thợ đã nhận
  | 'WAITING_PRINT'      // Sẵn sàng in / Chờ kẽm
  | 'PRINTING'           // Đang in
  | 'PRINTED'            // In xong
  | 'FINISHING'          // Đang gia công
  | 'COMPLETED'          // Hoàn thành
  
  | 'CANCELLED';         // Hủy

export type FinishingType = 'Dán' | 'Cắt' | 'Bế' | 'Xén' | 'Đục lỗ' | 'Đóng gói' | 'Khác';

export interface ProductionItem {
  id: string;
  productionOrderId?: string;
  salesOrderId?: string;
  salesOrderItemId?: string;
  sourceType?: 'SALES_ORDER' | 'MANUAL' | 'REPRINT';
  sourceReferenceId?: string;
  sampleId?: string;
  sampleVersionId?: string;
  imageUrl: string;
  image?: StoredImageReference;
  customerId?: string;
  customerNameSnapshot?: string;
  customerName?: string;
  sampleName?: string;
  productName?: string;
  sapoCode?: string;
  tags?: string[];
  
  // quantity in ProductionItem means allocated product quantity (e.g. bags), not sheets
  quantity: number;
  allocatedProductQuantity?: number; // Clearer name for quantity allocated from sales order
  requiresFinishing?: boolean;
  
  bagWidth?: number;
  bagLength?: number;
  bagGusset?: number;
  
  color?: string;
  note?: string;
  oldPlateReference?: string;
  plateRequirement?: 'NEW' | 'OLD' | 'NOT_REQUIRED';
}

/** A technical imposition supplied by Design. It is intentionally distinct
 * from a Sales Product image and carries its own sheet quantity. */
export interface PrintImage {
  id: string;
  imageUrl?: string;
  image?: StoredImageReference;
  label?: string;
  note?: string;
  sheetCount: number;
}

export interface FinishingJob {
  id: string;
  finisherId?: string;
  finisherName?: string;
  types: FinishingType[];
  status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';
  note?: string;
  assignedAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Issue {
  id: string;
  type: string;
  message: string;
  imageUrl?: string;
  image?: StoredImageReference;
  createdBy: string;
  createdByName: string;
  assignedToUserId?: string;
  assignedToRole?: UserRole;
  recipientUserIds?: string[];
  recipientRoles?: UserRole[];
  priority?: 'NORMAL' | 'WARNING' | 'URGENT' | 'CRITICAL';
  isBlocking?: boolean;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  message: string;
  imageUrl?: string;
  image?: StoredImageReference;
  createdAt: string;
}

export interface CancellationRequest {
  requestedBy: string;
  requestedByName: string;
  requestedRole: UserRole;
  requestedAt: string;
  reason: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  respondedBy?: string;
  respondedByName?: string;
  respondedAt?: string;
  responseReason?: string;
}

export type SalesOrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'DESIGNING'
  | 'FULFILLING'
  | 'IN_PRODUCTION'
  | 'PRODUCTION_COMPLETED'
  | 'READY_TO_SHIP'
  | 'SHIPPING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type SalesOrderItemStatus =
  | 'NEW'
  | 'WAITING_DESIGN'
  | 'DESIGNING'
  | 'READY_FOR_PRODUCTION'
  | 'IN_PRODUCTION'
  | 'PRODUCTION_COMPLETED'
  | 'READY_FOR_FINISHING'
  | 'FINISHING'
  | 'WAREHOUSE_READY'
  | 'CANCELLED';

export interface ProductionLinkHistory {
  productionOrderId: string;
  productionItemId: string;
  allocatedProductQuantity: number;
  linkedAt: string;
  linkedBy: string;
}

export interface SalesOrderItem {
  id: string;
  salesOrderId: string;
  customerId: string;
  sampleId?: string;
  sampleVersionId?: string;
  productName: string;
  imageUrl?: string;
  image?: StoredImageReference;
  bagWidth?: number;
  bagLength?: number;
  bagGusset?: number;
  quantity: number;
  requiresProduction?: boolean;
  requiresFinishing?: boolean;
  allocatedQuantity?: number;
  paperPreference?: string;
  gsmPreference?: string;
  colorPreference?: string;
  note?: string;
  status: SalesOrderItemStatus;
  linkedProductionItemIds?: string[];
  linkedProductionOrderIds?: string[];
  productionHistory?: ProductionLinkHistory[];
  finishingTaskIds?: string[];
  warehouseReadyAt?: string;
  isUrgent?: boolean;
  /** Present as null on active records when queried as part of a soft-delete model. */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type FinishingTaskStatus = 'READY' | 'CLAIMED' | 'COMPLETED' | 'CANCELLED';

export interface FinishingTask {
  id: string;
  salesOrderId?: string;
  salesOrderItemId?: string;
  productionOrderId?: string;
  productionItemId?: string;
  productName: string;
  customerId?: string;
  customerName?: string;
  imageUrl?: string;
  image?: StoredImageReference;
  quantity: number;
  /** False means the Finishing department only confirms the no-work checkpoint. */
  requiresFinishing: boolean;
  urgent?: boolean;
  status: FinishingTaskStatus;
  claimedBy?: string;
  claimedByName?: string;
  claimedAt?: string;
  completedBy?: string;
  completedByName?: string;
  completedAt?: string;
  cancellationRequest?: CancellationRequest;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type WorkflowIssueStage = 'FINISHING' | 'WAREHOUSE';

export interface WorkflowIssue {
  id: string;
  entityType: 'SALES_ORDER_ITEM';
  entityId: string;
  salesOrderId: string;
  stage: WorkflowIssueStage;
  issueType: string;
  message: string;
  recipientUserIds: string[];
  recipientRoles: UserRole[];
  urgent: boolean;
  priority: 'NORMAL' | 'URGENT';
  status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  reportedBy: string;
  reportedByName: string;
  reportedByRole: UserRole;
  createdAt: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  cancelledBy?: string;
  cancelledByName?: string;
  cancelledAt?: string;
}

export interface SalesOrder {
  id: string;
  code: string;
  customerId: string;
  saleId: string;
  saleNameSnapshot?: string;
  customerSnapshot: {
    name: string;
    phone?: string;
    address?: string;
  };
  status: SalesOrderStatus;
  priority?: 'NORMAL' | 'URGENT';
  customerNote?: string;
  internalNote?: string;
  expectedDeliveryDate?: string;
  totalItems: number;
  productionProgress?: {
    total: number;
    waiting: number;
    inProduction: number;
    completed: number;
  };
  shippingStatus?: string;
  createdBy: string;
  createdAt: string;
  confirmedAt?: string;
  productionCompletedAt?: string;
  readyToShipAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  updatedAt?: string;
  /** Present as null on active records; a timestamp marks a soft delete. */
  deletedAt?: string | null;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string;
  phoneNormalized?: string;
  address?: string;
  province?: string;
  district?: string;
  ward?: string;
  zalo?: string;
  facebook?: string;
  note?: string;
  source?: string;
  externalId?: string;
  importJobId?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CustomerImportJob {
  id: string;
  fileName: string;
  source: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  duplicateRows: number;
  failedRows: number;
  importedBy: string;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  time: string;
  author: string;
  content: string;
  type: 'urgent' | 'draft' | 'dispatch' | 'create' | 'accept' | 'plate' | 'start_print' | 'print_done' | 'finish_start' | 'finish_done' | 'issue' | 'cancel_request' | 'cancel_done' | 'cancel_rejected' | 'other';
}

export interface ProductionOrder {
  id: string;
  code: string; // e.g. LIN-0198
  productName?: string; // Tên sản phẩm / Tên túi (vd: Túi Bánh mì Hoa Mai 15x25)
  sapoCode?: string; // Mã đơn hàng Sapo hoặc mã tham chiếu POS
  tags?: string[]; // Danh sách nhãn / tag phân loại
  createdBy: string; // User ID
  createdByName: string;
  designerId?: string;
  designerName?: string;
  saleId?: string;
  saleName?: string;
  printerId: string;
  printerName: string;

  /** Original free-text production instruction. Parsed fields below are only supporting metadata. */
  instructionRaw?: string;
  /** Stable client identity used for idempotent local-draft dispatch. */
  clientDraftId?: string;
  /** Local-first draft synchronization metadata. Never required on legacy official orders. */
  draftSync?: {
    localRevision: number;
    backupRevision: number;
    backupStatus: 'PENDING' | 'BACKING_UP' | 'BACKED_UP' | 'FAILED';
    lastBackupError?: string;
  };
  /** Technical edits before printing increment this revision. */
  productionRevision?: number;
  /** Assigned printer must acknowledge the latest technical revision before starting. */
  printerAcknowledgedRevision?: number;

  paperType: 'Kraft' | 'OP' | 'MG' | 'Fort' | 'Duplex' | 'BB' | 'Ivory' | 'Couche' | 'Bristol' | string;
  paperGsm: string; // e.g. 58, 60, 70, 80, 250
  paperWidth: string; // e.g. 25, 27.5, 30
  paperHeight: string; // e.g. 46, 48, 50
  
  totalSheets: number;
  /** Product references are only traceability links; they never determine print sheets. */
  linkedProductIds?: string[];
  /** Technical print/imposition images, independently supplied by Design. */
  printImages?: PrintImage[];
  color: string; // e.g. "Xanh", "Nâu", "Xanh + Nâu", "2 màu"
  note?: string;
  finishingNote?: string; // Ghi chú riêng cho bộ phận gia công (VD: Túi bế miệng, dán xong để riêng mỗi loại 1 thùng...)

  plateType: 'NEW' | 'OLD' | 'UNKNOWN' | 'NONE';
  plateStatus: PlateStatus;
  plateDate?: string; // Ngày ra kẽm (dd/mm/yyyy, ví dụ "12/02/2025")
  originalPlateDate?: string; // Ngày ra kẽm gốc ban đầu, được kế thừa qua các lần in lại (dd/mm/yyyy)
  plateNote?: string; // e.g. "In lại kẽm cũ ngày 12/02/2025", "Kho A kệ 3"

  isReprint?: boolean; // Lệnh in lại
  reprintFromCode?: string; // Mã lệnh cũ (vd: LIN-0185)
  reprintFromDate?: string; // Ngày in cũ (dd/mm/yyyy)

  isUrgent?: boolean; // Đơn hàng CẦN GẤP - Sale/Thiết kế đánh dấu để thợ in ưu tiên in trước
  urgentReason?: string;
  urgentSetBy?: string;
  urgentSetName?: string;

  status: ProductionStatus;
  /** Server-maintained summary used by Rules to guard printer start. */
  hasBlockingIssue?: boolean;
  cancellationRequest?: CancellationRequest;

  items: ProductionItem[]; // Mẫu đơn lẻ hoặc nhiều mẫu ghép
  finishing?: FinishingJob;
  issues: Issue[];
  comments: Comment[];
  timeline: TimelineEvent[];

  actualPrintedSheets?: number;
  spoilageSheets?: number; // Số tờ hao/hỏng
  printedNote?: string;
  printedImageUrl?: string;
  printedImage?: StoredImageReference;

  createdAt: string; // ISO date string
  updatedAt?: string; // ISO date string for sync and merge ordering
  acceptedAt?: string;
  plateSentAt?: string;
  plateReceivedAt?: string;
  printingStartedAt?: string;
  printingCompletedAt?: string;
  completedAt?: string;
  deadline?: string;
  deletedAt?: string; // Soft delete timestamp
}

export interface NotificationItem {
  id: string;
  userId?: string; // Target user or all if undefined
  targetRole?: UserRole;
  orderId: string;
  orderCode: string;
  title: string;
  message: string;
  type: 'urgent' | 'new_order' | 'accepted' | 'plate_sent' | 'plate_received' | 'plate_missing' | 'plate_damaged' | 'plate_reissued' | 'printing' | 'printed' | 'finishing' | 'completed' | 'issue' | 'cancel_requested' | 'cancel_accepted' | 'cancel_rejected' | 'warning' | 'info';
  read: boolean;
  priority?: 'NORMAL' | 'WARNING' | 'URGENT' | 'CRITICAL';
  actionRequired?: boolean;
  issueId?: string;
  createdAt: string;
}

export interface SavedDesign {
  id: string;
  imageUrl: string;
  image?: StoredImageReference;
  customerId?: string;
  customerName: string;
  productName: string;
  tags?: string[];
  bagSize: string; // e.g. 25 × 48 cm
  paperType: string;
  paperGsm: string;
  color: string;
  plateReference: string;
  lastPrintedAt: string;
  printCount: number;
  creatorId?: string;
  printerId?: string;
}

export interface WorkshopSettings {
  unacceptedWarningMinutes: number; // Mặc định 30 phút
  plateDelayWarningMinutes: number;   // Mặc định 60 phút
  printDelayWarningMinutes: number;   // Mặc định 60 phút
  soundAlerts: boolean;
  autoPlayVoice: boolean;
}

/**
 * Complete Instance AppConfig structure stored in `settings/app`
 * Allows multi-workshop customization without changing any code.
 */
export interface AppConfig {
  company: {
    name: string;
    shortName: string;
    logoUrl?: string;
    logoImage?: StoredImageReference;
    phone?: string;
    address?: string;
    website?: string;
    customAppUrl?: string; // Đường link truy cập Web App thực tế của xưởng in (chia sẻ cho thợ in / chi nhánh)
    slogan?: string;
  };

  production: {
    paperTypes: string[];
    defaultGsmList: string[];
    defaultSizes: string[];
    colorsList: string[];
    finishingTypes: string[];
    defaultPaperUnit: string;
    printersList?: string[]; // Danh sách các máy in của xưởng (Developer / Admin cấu hình)
  };

  workflow: {
    printerAcceptanceTimeoutMinutes: number;
    plateWaitingWarningMinutes: number;
    printingStuckWarningMinutes: number;
    autoCloseCompletedAfterHours: number;
  };

  features: {
    production: boolean; // Core module
    finishing: boolean;  // Core module
    customer: boolean;
    salesOrder: boolean;
    warehouseDispatch: boolean;
    shipping: boolean;
    
    // Existing UI flags
    comments: boolean;
    notifications: boolean;
    sampleLibrary: boolean;
    soundAlerts: boolean;
    autoPlayVoice: boolean;
    urgentBadges: boolean;
  };

  system: {
    schemaVersion: number;
    appVersion: string;
    deploymentMode: 'DEMO' | 'PRODUCTION'; // DEMO: Cho phép Admin test nhanh mọi vai trò. PRODUCTION: Nhân viên phải đăng nhập PIN, khóa chuyển nhanh
    lastMigratedAt?: string;
  };

  // Developer Dynamic Permission Matrix & Custom Feature Flags
  permissions?: {
    roleMatrix?: Partial<Record<UserRole, Record<string, boolean>>>;
    userOverrides?: Record<string, Record<string, boolean>>; // Keyed by userId
    customFeatures?: Array<{
      key: string;
      name: string;
      category: string;
      description: string;
    }>;
  };
}



export type FinishedGoodStatus = 'WAITING' | 'READY' | 'PARTIALLY_DISPATCHED' | 'DISPATCHED';

export interface FinishedGood {
  id: string;
  salesOrderId: string;
  salesOrderItemId: string;
  customerId: string;
  
  /** Immutable, deterministic source identity for idempotent production output. */
  sourceProductionOrderId?: string;
  sourceProductionItemId?: string;
  sourceProductionItemIds?: string[];
  sourceProductionOrderIds?: string[];

  productName: string;
  customerSnapshot?: {
    name?: string;
    phone?: string;
    address?: string;
  };
  imageUrl?: string;
  image?: StoredImageReference;
  
  bagWidth?: number;
  bagLength?: number;
  bagGusset?: number;
  
  orderedQuantity: number;
  producedQuantity?: number;
  acceptedQuantity: number;
  dispatchedQuantity: number; // Net quantity currently dispatched / out of warehouse
  totalDispatchedQuantity?: number; // Gross historical quantity ever dispatched (never decremented on return)
  returnedQuantity?: number; // Total quantity returned from failed/returned shipments
  restockedQuantity?: number; // Quantity of returned items successfully inspected and returned to available stock
  remainingQuantity: number; // Available stock ready for new dispatches
  quantityUnit: 'BAG';
  
  status: FinishedGoodStatus;
  createdAt: string;
  updatedAt?: string;
}

export type WarehouseDispatchStatus = 'DRAFT' | 'READY' | 'DISPATCHED' | 'CANCELLED';
export type DispatchMethod = 'VIETTEL_POST' | 'INTERNAL_DELIVERY' | 'CUSTOMER_PICKUP' | 'BUS' | 'OTHER';

export interface WarehouseDispatch {
  id: string;
  code: string;
  salesOrderId: string;
  customerId: string;

  customerSnapshot: {
    name: string;
    phone?: string;
    address?: string;
  };
  
  deliveryAddress?: string;

  status: WarehouseDispatchStatus;
  dispatchMethod?: DispatchMethod;
  note?: string;

  createdBy: string;
  createdAt: string;
  
  confirmedBy?: string;
  confirmedAt?: string;
  
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface WarehouseDispatchItem {
  id: string;
  dispatchId: string;
  salesOrderId: string;
  salesOrderItemId: string;
  finishedGoodId: string;

  productName: string;
  quantity: number;
  quantityUnit: 'BAG';
  imageUrl?: string;
  image?: StoredImageReference;
  
  createdAt: string;
}



export type ShipmentStatus =
  | 'DRAFT'
  | 'READY'
  | 'CREATED'
  | 'PICKUP_PENDING'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNING'
  | 'RETURNED'
  | 'CANCELLED';

export type ReturnInspectionStatus = 
  | 'WAITING_INSPECTION'
  | 'RESTOCKED'
  | 'SCRAPPED'
  | 'CUSTOMER_HOLD';

export interface Shipment {
  id: string;
  code: string;

  warehouseDispatchId: string;
  salesOrderId: string;
  customerId: string;

  method: DispatchMethod;

  carrier?: string;
  provider?: string;

  providerShipmentId?: string;
  trackingCode?: string;

  receiverSnapshot: {
    name: string;
    phone: string;
    address: string;
    province?: string;
    district?: string;
    ward?: string;
  };

  packageCount?: number;
  weightGrams?: number;

  codAmount?: number;
  shippingFee?: number;

  note?: string;

  status: ShipmentStatus;
  providerRawStatus?: string;

  returnInspectionStatus?: ReturnInspectionStatus;
  returnInspectionResult?: 'RESTOCKED' | 'SCRAPPED' | 'CUSTOMER_HOLD';
  returnInspectionNote?: string;
  returnInspectedBy?: string;
  returnInspectedByName?: string;
  returnInspectedAt?: string;

  createdBy: string;
  createdAt: string;

  confirmedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  returnedAt?: string;
  cancelledAt?: string;

  updatedAt?: string;
}
