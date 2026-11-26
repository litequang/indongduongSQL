import { Firestore } from 'firebase-admin/firestore';
import { UserRole, isUserRole } from '../types';

export type WorkflowErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'not-found'
  | 'already-exists'
  | 'internal';

export class WorkflowError extends Error {
  constructor(public readonly code: WorkflowErrorCode, message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export interface WorkflowActor {
  firebaseUid: string;
  businessUserId: string;
  role: UserRole;
  name: string;
}

export const MANAGEMENT_ROLES: readonly UserRole[] = ['DEVELOPER', 'ADMIN', 'MANAGER'];
export const SALES_ROLES: readonly UserRole[] = ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE'];
export const WAREHOUSE_ROLES: readonly UserRole[] = ['WAREHOUSE'];

const MANAGEMENT_RANK: Partial<Record<UserRole, number>> = {
  MANAGER: 1,
  ADMIN: 2,
  DEVELOPER: 3,
};

/** Management inheritance is upward and applies only when the recipient is
 * itself a management role. It never grants specialist-recipient authority. */
export function hasManagementRecipientAuthority(
  actorRole: UserRole,
  recipientRoles: readonly UserRole[],
): boolean {
  const actorRank = MANAGEMENT_RANK[actorRole];
  if (!actorRank) return false;
  return recipientRoles.some(role => {
    const recipientRank = MANAGEMENT_RANK[role];
    return recipientRank !== undefined && actorRank >= recipientRank;
  });
}

export function requireText(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new WorkflowError('invalid-argument', `${field} is required and must be at most ${max} characters.`);
  }
  return value.trim();
}

export function requireNumber(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new WorkflowError('invalid-argument', `${field} is invalid.`);
  }
  return value;
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new WorkflowError('invalid-argument', `${field} is invalid.`);
  }
  return value as T;
}

/** Resolve the authoritative Firebase UID -> business identity mapping. */
export async function requireWorkflowActor(
  db: Firestore,
  firebaseUid: string | undefined,
  allowedRoles: readonly UserRole[],
): Promise<WorkflowActor> {
  if (!firebaseUid) throw new WorkflowError('unauthenticated', 'Sign in is required.');
  const identity = await db.collection('auth_identities').doc(firebaseUid).get();
  if (!identity.exists) throw new WorkflowError('permission-denied', 'No business identity is linked to this account.');
  const mapped = identity.data() || {};
  if (mapped.active !== true || typeof mapped.businessUserId !== 'string' || !isUserRole(mapped.role)) {
    throw new WorkflowError('permission-denied', 'The mapped business identity is inactive or invalid.');
  }
  if (!allowedRoles.includes(mapped.role)) {
    throw new WorkflowError('permission-denied', 'Your business role is not allowed to perform this workflow action.');
  }
  const profile = await db.collection('users').doc(mapped.businessUserId).get();
  if (!profile.exists || profile.get('active') === false || profile.get('role') !== mapped.role) {
    throw new WorkflowError('permission-denied', 'The business user profile is inactive or inconsistent.');
  }
  return {
    firebaseUid,
    businessUserId: mapped.businessUserId,
    role: mapped.role,
    name: typeof profile.get('name') === 'string' ? profile.get('name') : mapped.businessUserId,
  };
}
