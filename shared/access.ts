import { ROLES, type Role } from "./contracts";
export const CAPABILITIES = {
  canManageUsers: "Quản lý nhân viên",
  canManageWorkshopSettings: "Cấu hình xưởng",
  canCreateProductionOrder: "Soạn lệnh in",
  canDispatchOrder: "Gửi lệnh in",
  canToggleUrgent: "Đánh dấu khẩn",
  canRequestCancel: "Yêu cầu hủy lệnh in",
  canApproveCancel: "Phản hồi hủy lệnh in",
  canAcceptPrintJob: "Nhận lệnh và xác nhận phiên bản",
  canMarkPlateReady: "Cập nhật kẽm",
  canStartPrinting: "Bắt đầu in",
  canFinishPrinting: "Hoàn thành in",
  canManageFinishing: "Xử lý gia công",
  canReportIssue: "Báo sự cố",
  canResolveIssue: "Xử lý sự cố được giao",
  canViewReports: "Xem báo cáo",
  canExportExcel: "Xuất CSV",
} as const;
export type Capability = keyof typeof CAPABILITIES;
export const FEATURES = {
  production: "Sản xuất",
  finishing: "Gia công",
  customer: "Khách hàng",
  salesOrder: "Đơn hàng",
  warehouseDispatch: "Xuất kho",
  shipping: "Giao hàng",
  comments: "Bình luận lệnh in",
  soundAlerts: "Âm thanh thông báo",
  sampleLibrary: "Thư viện mẫu",
} as const;
export type Feature = keyof typeof FEATURES;
export type Overrides = Partial<Record<Capability, boolean>>;
export interface AccessPolicy {
  version: number;
  features: Record<Feature, boolean>;
  roleOverrides: Partial<Record<Role, Overrides>>;
  userOverrides: Record<string, Overrides>;
}
export const defaultFeatures = Object.fromEntries(
  Object.keys(FEATURES).map((k) => [k, true]),
) as Record<Feature, boolean>;
const commercial: readonly Role[] = [
  "DEVELOPER",
  "ADMIN",
  "MANAGER",
  "DESIGNER",
  "SALE",
];
// These ceilings never replace object ownership, specialist checks or workflow invariants.
export function capabilityCeiling(role: Role, key: Capability): boolean {
  if (key === "canManageUsers" || key === "canManageWorkshopSettings")
    return role === "DEVELOPER" || role === "ADMIN";
  if (
    [
      "canAcceptPrintJob",
      "canApproveCancel",
      "canStartPrinting",
      "canFinishPrinting",
    ].includes(key)
  )
    return role === "PRINTER";
  if (key === "canManageFinishing")
    return role === "FINISHER" || commercial.includes(role);
  if (key === "canReportIssue" || key === "canResolveIssue")
    return ROLES.includes(role);
  if (key === "canMarkPlateReady")
    return role === "PRINTER" || commercial.includes(role);
  return commercial.includes(role);
}
export function effectivePermission(
  policy: AccessPolicy,
  role: Role,
  userId: string,
  key: Capability,
) {
  return (
    capabilityCeiling(role, key) &&
    (policy.userOverrides[userId]?.[key] ??
      policy.roleOverrides[role]?.[key] ??
      true)
  );
}
export const FEATURE_DEPENDENCIES: Partial<Record<Feature, Feature[]>> = {
  salesOrder: ["customer"],
  warehouseDispatch: ["salesOrder"],
  shipping: ["salesOrder", "warehouseDispatch"],
};
