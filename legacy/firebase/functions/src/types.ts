export const USER_ROLES = ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'SALE', 'PRINTER', 'FINISHER', 'WAREHOUSE'] as const;
export const ADMIN_ASSIGNABLE_ROLES = ['MANAGER', 'DESIGNER', 'SALE', 'PRINTER', 'FINISHER', 'WAREHOUSE'] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type StaffProvisionMode = 'new' | 'linkExisting';

export interface CallerIdentity {
  firebaseUid: string;
  businessUserId: string;
  role: UserRole;
}

export interface ProvisionStaffRequest {
  mode?: StaffProvisionMode;
  name?: unknown;
  email?: unknown;
  initialPassword?: unknown;
  role?: unknown;
  phone?: unknown;
  username?: unknown;
  avatar?: unknown;
  machineAssigned?: unknown;
  active?: unknown;
  existingBusinessUserId?: unknown;
}

export interface SetStaffActiveRequest {
  businessUserId?: unknown;
  active?: unknown;
}

export interface ChangeStaffRoleRequest {
  businessUserId?: unknown;
  role?: unknown;
}

export interface ResetStaffPasswordRequest {
  businessUserId?: unknown;
  temporaryPassword?: unknown;
}

export interface StaffStatusRecord {
  businessUserId: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  authLinked: boolean;
  machineAssigned?: string;
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
