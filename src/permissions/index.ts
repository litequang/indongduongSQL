import { User, UserRole, ProductionOrder, AppConfig } from '../types';

export const MANAGEMENT_ROLES: readonly UserRole[] = ['MANAGER', 'ADMIN', 'DEVELOPER'];

export const hasManagementAuthority = (user: User | null | undefined): boolean =>
  Boolean(user?.active && MANAGEMENT_ROLES.includes(user.role));

export const hasProductionTechnicalAuthority = (user: User | null | undefined): boolean =>
  Boolean(user?.active && (user.role === 'DESIGNER' || MANAGEMENT_ROLES.includes(user.role)));

export const canRequestProductionCancellation = (user: User | null | undefined): boolean =>
  Boolean(user?.active && (user.role === 'SALE' || user.role === 'DESIGNER' || MANAGEMENT_ROLES.includes(user.role)));

export const canCreateSalesOrderDraft = (user: User | null | undefined): boolean =>
  Boolean(user?.active && (user.role === 'SALE' || user.role === 'DESIGNER' || MANAGEMENT_ROLES.includes(user.role)));

export const canEditCommercialSalesOrder = (user: User | null | undefined): boolean =>
  Boolean(user?.active && (user.role === 'SALE' || MANAGEMENT_ROLES.includes(user.role)));

export const canManageCustomer = canEditCommercialSalesOrder;
/** Warehouse operations belong to the exact WAREHOUSE worker role. */
export const canOperateWarehouse = (user: User | null | undefined): boolean => Boolean(user?.active && user.role === 'WAREHOUSE');
export const canConfirmWarehouseDispatch = canOperateWarehouse;

export const canMarkProductUrgent = (user: User | null | undefined): boolean =>
  Boolean(user?.active && (user.role === 'SALE' || user.role === 'DESIGNER' || MANAGEMENT_ROLES.includes(user.role)));

const MANAGEMENT_RANK: Partial<Record<UserRole, number>> = {
  MANAGER: 1,
  ADMIN: 2,
  DEVELOPER: 3,
};

/** Exact recipients always match. Management inheritance applies only to a
 * management recipient and only upwards (MANAGER -> ADMIN -> DEVELOPER). */
export const hasIssueRecipientAuthority = (
  user: User | null | undefined,
  issue: { recipientUserIds?: readonly string[]; recipientRoles?: readonly UserRole[] },
): boolean => {
  if (!user?.active) return false;
  if (issue.recipientUserIds?.includes(user.id)) return true;
  if (issue.recipientRoles?.includes(user.role)) return true;
  const actorRank = MANAGEMENT_RANK[user.role];
  if (!actorRank) return false;
  return Boolean(issue.recipientRoles?.some(role => {
    const recipientRank = MANAGEMENT_RANK[role];
    return recipientRank !== undefined && actorRank >= recipientRank;
  }));
};

export const isIssueReporter = (
  user: User | null | undefined,
  issue: { reportedBy?: string; createdBy?: string },
): boolean => Boolean(user?.active && (issue.reportedBy === user.id || issue.createdBy === user.id));

/**
 * Centralized Role-Based Access Control (RBAC) & Dynamic Permission Matrix Layer.
 * Allows Developer to customize and toggle any capability per role or per individual user.
 */

export type PermissionKey =
  | 'canManageUsers'            // Quản lý nhân sự & cấp mã PIN
  | 'canManageWorkshopSettings' // Cài đặt xưởng in & thông số máy, giấy, màu
  | 'canUseDemoSandbox'         // Chế độ thử nghiệm Demo Sandbox
  | 'canPurgeAllOrders'         // Dọn sạch dữ liệu lệnh cũ (Khuyến nghị chỉ Developer)
  | 'canCreateProductionOrder'  // Tạo lệnh in & soạn nhanh
  | 'canDispatchOrder'          // Giao lệnh cho thợ in & phân máy
  | 'canToggleUrgent'           // Gắn/bỏ nhãn GẤP
  | 'canDeleteOrder'            // Xóa lệnh in đơn lẻ
  | 'canBulkDeleteOrders'       // Chọn nhiều & xóa hàng loạt
  | 'canRequestCancel'          // Yêu cầu hủy lệnh
  | 'canApproveCancel'          // Duyệt hủy lệnh
  | 'canAcceptPrintJob'         // Nhận lệnh in
  | 'canMarkPlateReady'         // Cập nhật trạng thái kẽm
  | 'canStartPrinting'          // Bắt đầu in (Vận hành máy)
  | 'canFinishPrinting'         // Báo in xong & bàn giao
  | 'canManageFinishing'        // Xử lý tổ gia công
  | 'canReportIssue'            // Báo cáo sự cố
  | 'canResolveIssue'           // Xác nhận xử lý xong sự cố
  | 'canViewReports'            // Xem báo cáo thống kê
  | 'canExportExcel';           // Xuất Excel / In phiếu lệnh

export interface PermissionDefinition {
  key: PermissionKey;
  name: string;
  category: 'Cấu Hình & Quản Trị' | 'Lệnh In & Điều Phối' | 'Kẽm & Vận Hành In' | 'Gia Công & Sự Cố' | 'Báo Cáo & Tiện Ích';
  description: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'canManageUsers',
    name: 'Quản Lý Nhân Sự & Mã PIN',
    category: 'Cấu Hình & Quản Trị',
    description: 'Thêm, sửa, xóa tài khoản nhân viên, phân công máy in và đặt mã PIN ca'
  },
  {
    key: 'canManageWorkshopSettings',
    name: 'Cài Đặt Xưởng In',
    category: 'Cấu Hình & Quản Trị',
    description: 'Cấu hình thông tin công ty, danh sách máy in, loại giấy, màu in, mốc cảnh báo'
  },
  {
    key: 'canUseDemoSandbox',
    name: 'Chế Độ Thử Nghiệm (Demo Sandbox)',
    category: 'Cấu Hình & Quản Trị',
    description: 'Bật/tắt thanh test nhanh giao diện và chuyển đổi vai trò dùng thử'
  },
  {
    key: 'canPurgeAllOrders',
    name: 'Dọn Dữ Liệu Lệnh Cũ',
    category: 'Cấu Hình & Quản Trị',
    description: 'Xóa sạch toàn bộ dữ liệu lệnh in (Khóa bảo vệ chống bấm nhầm)'
  },
  {
    key: 'canCreateProductionOrder',
    name: 'Tạo Lệnh In Mới & Soạn Nhanh',
    category: 'Lệnh In & Điều Phối',
    description: 'Tạo lệnh in túi bánh mì, lưu nháp, tạo lệnh từ mẫu thư viện'
  },
  {
    key: 'canDispatchOrder',
    name: 'Giao Lệnh / Điều Phối Máy',
    category: 'Lệnh In & Điều Phối',
    description: 'Phát lệnh từ bản nháp xuống xưởng, chỉ định thợ in và máy in'
  },
  {
    key: 'canToggleUrgent',
    name: 'Gắn / Bỏ Nhãn Lệnh GẤP',
    category: 'Lệnh In & Điều Phối',
    description: 'Đánh dấu ưu tiên cao để thợ in thấy nhãn gấp trên máy'
  },
  {
    key: 'canDeleteOrder',
    name: 'Xóa Lệnh In Đơn Lẻ',
    category: 'Lệnh In & Điều Phối',
    description: 'Xóa lệnh in đơn lẻ trong danh sách đơn'
  },
  {
    key: 'canBulkDeleteOrders',
    name: 'Chọn Nhiều & Xóa Hàng Loạt',
    category: 'Lệnh In & Điều Phối',
    description: 'Chọn nhiều lệnh cùng lúc để xóa nhanh'
  },
  {
    key: 'canRequestCancel',
    name: 'Yêu Cầu Hủy Lệnh',
    category: 'Lệnh In & Điều Phối',
    description: 'Gửi yêu cầu xin hủy lệnh in khi khách đổi ý hoặc sai file'
  },
  {
    key: 'canApproveCancel',
    name: 'Duyệt / Từ Chối Hủy Lệnh',
    category: 'Lệnh In & Điều Phối',
    description: 'Xác nhận đồng ý hủy lệnh hoặc từ chối hủy'
  },
  {
    key: 'canAcceptPrintJob',
    name: 'Xác Nhận Nhận Lệnh In',
    category: 'Kẽm & Vận Hành In',
    description: 'Thợ in bấm nhận lệnh trên máy được phân công'
  },
  {
    key: 'canMarkPlateReady',
    name: 'Cập Nhật Trạng Thái Kẽm',
    category: 'Kẽm & Vận Hành In',
    description: 'Báo đã gửi kẽm, xác nhận kẽm về, báo kẽm cũ hỏng cần ra lại'
  },
  {
    key: 'canStartPrinting',
    name: 'Bắt Đầu In (Vận Hành Máy)',
    category: 'Kẽm & Vận Hành In',
    description: 'Bấm bắt đầu in để kích hoạt đồng hồ tính giờ sản xuất'
  },
  {
    key: 'canFinishPrinting',
    name: 'Báo In Xong & Bàn Giao',
    category: 'Kẽm & Vận Hành In',
    description: 'Nhập số lượng in thực tế, số tờ hao hỏng, chụp ảnh sản phẩm in xong'
  },
  {
    key: 'canManageFinishing',
    name: 'Xử Lý Tổ Gia Công',
    category: 'Gia Công & Sự Cố',
    description: 'Nhận lệnh gia công dán túi bánh mì, cắt bế, đóng gói, hoàn thành'
  },
  {
    key: 'canReportIssue',
    name: 'Báo Cáo Sự Cố & Dừng In',
    category: 'Gia Công & Sự Cố',
    description: 'Báo lỗi kẽm, sai màu, rách giấy, hỏng máy để các bên kịp thời xử lý'
  },
  {
    key: 'canResolveIssue',
    name: 'Xác Nhận Đã Xử Lý Xong Sự Cố',
    category: 'Gia Công & Sự Cố',
    description: 'Đánh dấu sự cố đã được khắc phục để tiếp tục in'
  },
  {
    key: 'canViewReports',
    name: 'Xem Báo Cáo Thống Kê',
    category: 'Báo Cáo & Tiện Ích',
    description: 'Xem biểu đồ sản lượng, năng suất thợ in, tỷ lệ hao hụt'
  },
  {
    key: 'canExportExcel',
    name: 'Xuất Dữ Liệu Excel / In Phiếu',
    category: 'Báo Cáo & Tiện Ích',
    description: 'Tải file Excel danh sách lệnh và in phiếu lệnh ra giấy'
  }
];

export const DEFAULT_ROLE_PERMISSION_MATRIX: Record<UserRole, Record<PermissionKey, boolean>> = {
  DEVELOPER: {
    canManageUsers: true,
    canManageWorkshopSettings: true,
    canUseDemoSandbox: true,
    canPurgeAllOrders: true,
    canCreateProductionOrder: true,
    canDispatchOrder: true,
    canToggleUrgent: true,
    canDeleteOrder: true,
    canBulkDeleteOrders: true,
    canRequestCancel: true,
    canApproveCancel: true,
    canAcceptPrintJob: true,
    canMarkPlateReady: true,
    canStartPrinting: true,
    canFinishPrinting: true,
    canManageFinishing: true,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: true,
    canExportExcel: true,
  },
  ADMIN: {
    canManageUsers: true,
    canManageWorkshopSettings: true,
    canUseDemoSandbox: true,
    canPurgeAllOrders: false, // Developer can turn on for Admin if desired
    canCreateProductionOrder: true,
    canDispatchOrder: true,
    canToggleUrgent: true,
    canDeleteOrder: true,
    canBulkDeleteOrders: true,
    canRequestCancel: true,
    canApproveCancel: true,
    canAcceptPrintJob: true,
    canMarkPlateReady: true,
    canStartPrinting: true,
    canFinishPrinting: true,
    canManageFinishing: true,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: true,
    canExportExcel: true,
  },
  MANAGER: {
    canManageUsers: false, // Mặc định Quản lý/Sếp không vào cấu hình nhân sự (Dev có thể bật lại)
    canManageWorkshopSettings: false, // Mặc định Quản lý/Sếp không vào cài đặt xưởng in (Dev có thể bật lại)
    canUseDemoSandbox: true, // Sếp / Quản lý vẫn dùng được Demo Sandbox!
    canPurgeAllOrders: false,
    canCreateProductionOrder: true,
    canDispatchOrder: true,
    canToggleUrgent: true,
    canDeleteOrder: true,
    canBulkDeleteOrders: true,
    canRequestCancel: true,
    canApproveCancel: true,
    canAcceptPrintJob: true,
    canMarkPlateReady: true,
    canStartPrinting: true,
    canFinishPrinting: true,
    canManageFinishing: true,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: true,
    canExportExcel: true,
  },
  DESIGNER: {
    canManageUsers: false,
    canManageWorkshopSettings: false,
    canUseDemoSandbox: false,
    canPurgeAllOrders: false,
    canCreateProductionOrder: true,
    canDispatchOrder: true,
    canToggleUrgent: true,
    canDeleteOrder: false, // Only drafts
    canBulkDeleteOrders: true,
    canRequestCancel: true,
    canApproveCancel: false,
    canAcceptPrintJob: false,
    canMarkPlateReady: true,
    canStartPrinting: false,
    canFinishPrinting: false,
    canManageFinishing: false,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: true,
    canExportExcel: true,
  },
  SALE: {
    canManageUsers: false,
    canManageWorkshopSettings: false,
    canUseDemoSandbox: false,
    canPurgeAllOrders: false,
    canCreateProductionOrder: true,
    canDispatchOrder: true,
    canToggleUrgent: true,
    canDeleteOrder: false,
    canBulkDeleteOrders: false,
    canRequestCancel: true,
    canApproveCancel: false,
    canAcceptPrintJob: false,
    canMarkPlateReady: false,
    canStartPrinting: false,
    canFinishPrinting: false,
    canManageFinishing: false,
    canReportIssue: true,
    canResolveIssue: false,
    canViewReports: true,
    canExportExcel: true,
  },
  PRINTER: {
    canManageUsers: false,
    canManageWorkshopSettings: false,
    canUseDemoSandbox: false,
    canPurgeAllOrders: false,
    canCreateProductionOrder: false,
    canDispatchOrder: false,
    canToggleUrgent: false,
    canDeleteOrder: false,
    canBulkDeleteOrders: false,
    canRequestCancel: false,
    canApproveCancel: true,
    canAcceptPrintJob: true,
    canMarkPlateReady: true,
    canStartPrinting: true,
    canFinishPrinting: true,
    canManageFinishing: false,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: false,
    canExportExcel: false,
  },
  FINISHER: {
    canManageUsers: false,
    canManageWorkshopSettings: false,
    canUseDemoSandbox: false,
    canPurgeAllOrders: false,
    canCreateProductionOrder: false,
    canDispatchOrder: false,
    canToggleUrgent: false,
    canDeleteOrder: false,
    canBulkDeleteOrders: false,
    canRequestCancel: false,
    canApproveCancel: false,
    canAcceptPrintJob: false,
    canMarkPlateReady: false,
    canStartPrinting: false,
    canFinishPrinting: false,
    canManageFinishing: true,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: false,
    canExportExcel: false,
  },
  WAREHOUSE: {
    canManageUsers: false,
    canManageWorkshopSettings: false,
    canUseDemoSandbox: false,
    canPurgeAllOrders: false,
    canCreateProductionOrder: false,
    canDispatchOrder: false,
    canToggleUrgent: false,
    canDeleteOrder: false,
    canBulkDeleteOrders: false,
    canRequestCancel: false,
    canApproveCancel: false,
    canAcceptPrintJob: false,
    canMarkPlateReady: false,
    canStartPrinting: false,
    canFinishPrinting: false,
    canManageFinishing: false,
    canReportIssue: true,
    canResolveIssue: true,
    canViewReports: false,
    canExportExcel: false,
  }
};

// Global active appConfig pointer for instant reactive evaluation
let globalActiveConfig: AppConfig | null = null;

export const setGlobalAppConfig = (config: AppConfig | null) => {
  globalActiveConfig = config;
};

export const getGlobalAppConfig = (): AppConfig | null => {
  return globalActiveConfig;
};

/**
 * Universal Permission Evaluator:
 * 1. Check user-level override.
 * 2. Check role matrix in appConfig.
 * 3. Fall back to default baseline matrix.
 * Context-specific Workflow V2 helpers remain authoritative for assignment,
 * ownership, recipient and state constraints.
 */
export const hasPermission = (
  user: User | null | undefined,
  permKey: PermissionKey | string,
  appConfig?: AppConfig | null,
  order?: ProductionOrder
): boolean => {
  if (!user || !user.active) return false;

  const activeCfg = appConfig || globalActiveConfig;

  // 1. User-specific override
  const userOverrides = activeCfg?.permissions?.userOverrides?.[user.id];
  if (userOverrides && typeof userOverrides[permKey] === 'boolean') {
    return userOverrides[permKey];
  }

  // 2. Role matrix override in active configuration
  const roleOverrides = activeCfg?.permissions?.roleMatrix?.[user.role];
  if (roleOverrides && typeof roleOverrides[permKey] === 'boolean') {
    return roleOverrides[permKey];
  }

  // 3. Fallback to default role matrix
  const typedKey = permKey as PermissionKey;
  if (DEFAULT_ROLE_PERMISSION_MATRIX[user.role] && typeof DEFAULT_ROLE_PERMISSION_MATRIX[user.role][typedKey] === 'boolean') {
    return DEFAULT_ROLE_PERMISSION_MATRIX[user.role][typedKey];
  }

  return false;
};

// Role hierarchy checks
export const isDeveloper = (user: User | null | undefined): boolean => {
  return user?.role === 'DEVELOPER' && Boolean(user.active);
};

export const isAdmin = (user: User | null | undefined): boolean => {
  return (user?.role === 'ADMIN' || user?.role === 'DEVELOPER') && Boolean(user.active);
};

export const isManager = (user: User | null | undefined): boolean => {
  return (user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'DEVELOPER') && Boolean(user.active);
};

export const isDesigner = (user: User | null | undefined): boolean => {
  return (user?.role === 'DESIGNER' || user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'DEVELOPER') && Boolean(user.active);
};

export const isPrinter = (user: User | null | undefined): boolean => {
  return user?.role === 'PRINTER' && Boolean(user.active);
};

export const isFinisher = (user: User | null | undefined): boolean => {
  return user?.role === 'FINISHER' && Boolean(user.active);
};

export const isSale = (user: User | null | undefined): boolean => {
  return (user?.role === 'SALE' || user?.role === 'MANAGER' || user?.role === 'ADMIN' || user?.role === 'DEVELOPER') && Boolean(user.active);
};

// System & Technical permissions
export const canManageSystemSettings = (user: User | null | undefined): boolean => {
  if (!user || !user.active) return false;
  return user.role === 'DEVELOPER';
};

export const canManageWorkshopSettings = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canManageWorkshopSettings', appConfig);
};

export const canManageUsers = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canManageUsers', appConfig);
};

export const canUseDemoSandbox = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canUseDemoSandbox', appConfig);
};

export const canPurgeAllOrders = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canPurgeAllOrders', appConfig);
};

// Production & Orders permissions
export const canCreateProductionOrder = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canCreateProductionOrder', appConfig);
};

export const canDispatchOrder = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canDispatchOrder', appConfig);
};

export const canAcceptPrintJob = (user: User | null | undefined, order?: ProductionOrder, appConfig?: AppConfig | null): boolean => {
  return Boolean(user?.active && user.role === 'PRINTER' && (!order || order.printerId === user.id) && hasPermission(user, 'canAcceptPrintJob', appConfig, order));
};

export const canMarkPlateReady = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canMarkPlateReady', appConfig);
};

export const canStartPrinting = (user: User | null | undefined, order?: ProductionOrder, appConfig?: AppConfig | null): boolean => {
  return Boolean(user?.active && user.role === 'PRINTER' && (!order || order.printerId === user.id) && hasPermission(user, 'canStartPrinting', appConfig, order));
};

export const canFinishPrinting = (user: User | null | undefined, order?: ProductionOrder, appConfig?: AppConfig | null): boolean => {
  return Boolean(user?.active && user.role === 'PRINTER' && (!order || order.printerId === user.id) && hasPermission(user, 'canFinishPrinting', appConfig, order));
};

export const canManageFinishing = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return Boolean(user?.active && user.role === 'FINISHER' && hasPermission(user, 'canManageFinishing', appConfig));
};

export const canManageSettings = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return canManageWorkshopSettings(user, appConfig);
};

export const canRequestCancel = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canRequestCancel', appConfig);
};

export const canApproveCancel = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return Boolean(user?.active && user.role === 'PRINTER' && hasPermission(user, 'canApproveCancel', appConfig));
};

export const canDeleteOrder = (user: User | null | undefined, order?: ProductionOrder, appConfig?: AppConfig | null): boolean => {
  if (!user || !user.active) return false;
  
  if (order && order.status !== 'DRAFT') {
    // When sent to printer (not DRAFT), it cannot be deleted to avoid issues (only request cancel).
    // Exception: DEVELOPER can forcefully delete for system maintenance.
    if (user.role !== 'DEVELOPER') {
      return false;
    }
  }

  if (user.role === 'DESIGNER' && order?.status === 'DRAFT') return true;
  return hasPermission(user, 'canDeleteOrder', appConfig, order);
};

export const canBulkDeleteOrders = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canBulkDeleteOrders', appConfig);
};

export const canToggleUrgent = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canToggleUrgent', appConfig);
};

export const canReportIssue = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canReportIssue', appConfig);
};

export const canResolveIssue = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canResolveIssue', appConfig);
};

export const canViewReports = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canViewReports', appConfig);
};

export const canExportExcel = (user: User | null | undefined, appConfig?: AppConfig | null): boolean => {
  return hasPermission(user, 'canExportExcel', appConfig);
};
