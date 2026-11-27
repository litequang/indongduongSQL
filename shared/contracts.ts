export const ROLES = [
  "DEVELOPER",
  "ADMIN",
  "MANAGER",
  "DESIGNER",
  "SALE",
  "PRINTER",
  "FINISHER",
  "WAREHOUSE",
] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  DEVELOPER: "Kỹ thuật hệ thống",
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý xưởng",
  DESIGNER: "Thiết kế",
  SALE: "Kinh doanh",
  PRINTER: "Thợ in",
  FINISHER: "Gia công",
  WAREHOUSE: "Kho vận",
};
export const ADMIN_ROLES: readonly Role[] = [
  "MANAGER",
  "DESIGNER",
  "SALE",
  "PRINTER",
  "FINISHER",
  "WAREHOUSE",
];
export interface User {
  id: string;
  username: string;
  name: string;
  phone: string;
  role: Role;
  machineAssigned: string;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface Settings {
  companyName: string;
  shortName: string;
  phone: string;
  address: string;
  website: string;
  slogan: string;
  primaryColor: string;
  acceptanceMinutes: number;
  plateMinutes: number;
  printingMinutes: number;
  pollIntervalMs: number;
  printers: string[];
  paperTypes: string[];
  colors: string[];
  finishingTypes: string[];
  version: number;
}
export const DEFAULT_SETTINGS: Settings = {
  companyName: "In Đông Dương",
  shortName: "ĐÔNG DƯƠNG",
  phone: "",
  address: "",
  website: "",
  slogan: "Quản lý xưởng in",
  primaryColor: "#2563eb",
  acceptanceMinutes: 30,
  plateMinutes: 60,
  printingMinutes: 60,
  pollIntervalMs: 4000,
  printers: [],
  paperTypes: ["Kraft", "OP", "MG", "Fort", "Duplex", "BB", "Ivory"],
  colors: [],
  finishingTypes: ["Dán", "Cắt", "Bế", "Xén", "Đục lỗ", "Đóng gói"],
  version: 1,
};
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ChangePage {
  changes: {
    sequence: string;
    entity: ChangeEntity;
    entityId: string;
    version: number;
    deleted: boolean;
  }[];
  cursor: string;
  hasMore: boolean;
}
export interface AuditEntry {
  id: string;
  actorName: string;
  action: string;
  entityId: string;
  createdAt: string;
}
export const canManageUsers = (role: Role) =>
  role === "DEVELOPER" || role === "ADMIN";
export const canManageSettings = (role: Role) =>
  role === "DEVELOPER" || role === "ADMIN";
export function canManageTarget(actor: Role, target: Role): boolean {
  return (
    actor === "DEVELOPER" || (actor === "ADMIN" && ADMIN_ROLES.includes(target))
  );
}

export type ChangeEntity =
  | "users"
  | "settings"
  | "customers"
  | "sales_orders"
  | "saved_designs"
  | "production_orders"
  | "fulfillment"
  | "notifications";
