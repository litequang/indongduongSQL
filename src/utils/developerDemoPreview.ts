import type { User, UserRole } from '../types';
import { AUTH_IDENTITY_ROLES, isAuthIdentityRole } from './authInitializationState';

export const DEVELOPER_DEMO_PREVIEW_STORAGE_KEY = 'flexo_developer_demo_preview_v1';

export interface PersistedDeveloperDemoPreview {
  uid: string;
  enabled: true;
  previewRole: UserRole;
}

export function canUseDeveloperDemoPreview(user: User | null | undefined): boolean {
  return Boolean(user?.active && user.role === 'DEVELOPER' && user.firebaseUid);
}

export function parsePersistedDeveloperDemoPreview(value: string | null, uid: string): PersistedDeveloperDemoPreview | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedDeveloperDemoPreview>;
    if (parsed.uid !== uid || parsed.enabled !== true || !isAuthIdentityRole(parsed.previewRole)) return null;
    return { uid, enabled: true, previewRole: parsed.previewRole };
  } catch {
    return null;
  }
}

export function serializeDeveloperDemoPreview(uid: string, previewRole: UserRole): string {
  return JSON.stringify({ uid, enabled: true, previewRole } satisfies PersistedDeveloperDemoPreview);
}

/**
 * Presentation only: the returned user drives existing role-aware UI. The
 * verified Firebase identity stays in AuthContext/firebaseProfile and is never
 * mutated by this function.
 */
export function getEffectiveUiUser(
  authenticatedUser: User,
  users: User[],
  isRolePreviewActive: boolean,
  previewRole: UserRole,
): User {
  if (!isRolePreviewActive || previewRole === authenticatedUser.role) return authenticatedUser;
  const matchingRoleUser = users.find((user) => user.active && user.role === previewRole);
  if (matchingRoleUser) return matchingRoleUser;
  return { ...authenticatedUser, role: previewRole };
}

export const DEVELOPER_DEMO_PREVIEW_ROLES = AUTH_IDENTITY_ROLES;
