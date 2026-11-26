import { Auth } from 'firebase-admin/auth';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  ADMIN_ASSIGNABLE_ROLES,
  CallerIdentity,
  ChangeStaffRoleRequest,
  isUserRole,
  ProvisionStaffRequest,
  ResetStaffPasswordRequest,
  SetStaffActiveRequest,
  StaffStatusRecord,
  UserRole,
  USER_ROLES,
} from './types';

export type ProvisioningErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'already-exists'
  | 'failed-precondition'
  | 'not-found'
  | 'internal';

export class ProvisioningError extends Error {
  constructor(public readonly code: ProvisioningErrorCode, message: string) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

type ExistingProfile = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  username?: string;
  avatar?: string;
  machineAssigned?: string;
};

type OptionalProfileInput = {
  phone?: string;
  username?: string;
  avatar?: string;
  machineAssigned?: string;
};

function errorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code || '');
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new ProvisioningError('invalid-argument', `${field} is required.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ProvisioningError('invalid-argument', `${field} must be between 1 and ${maxLength} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ProvisioningError('invalid-argument', `${field} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ProvisioningError('invalid-argument', `${field} is too long.`);
  }
  return normalized || undefined;
}

function normalizeEmail(value: unknown): string {
  const email = requiredText(value, 'Email', 254).toLowerCase();
  // Firebase Auth performs the definitive validation; this avoids avoidable calls.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ProvisioningError('invalid-argument', 'Email is invalid.');
  }
  return email;
}

function validatePassword(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new ProvisioningError('invalid-argument', `${field} must be 8 to 128 characters.`);
  }
  return value;
}

function validateOptionalProfileInput(request: ProvisionStaffRequest): OptionalProfileInput {
  const username = optionalText(request.username, 'Username', 40)?.toLowerCase();
  if (username && !/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new ProvisioningError('invalid-argument', 'Username may contain only lowercase letters, numbers, dots, underscores, and hyphens.');
  }
  return {
    phone: optionalText(request.phone, 'Phone', 30),
    username,
    avatar: optionalText(request.avatar, 'Avatar', 2048),
    machineAssigned: optionalText(request.machineAssigned, 'Machine assignment', 100),
  };
}

function assertRole(value: unknown): UserRole {
  if (!isUserRole(value)) {
    throw new ProvisioningError('invalid-argument', `Role must be one of: ${USER_ROLES.join(', ')}.`);
  }
  return value;
}

function assertBoolean(value: unknown, field: string, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new ProvisioningError('invalid-argument', `${field} must be true or false.`);
  }
  return value;
}

/** Server-only staff lifecycle implementation. It is never imported by browser code. */
export class StaffProvisioningService {
  constructor(
    private readonly auth: Auth,
    private readonly db: Firestore,
  ) {}

  async provision(callerUid: string | undefined, request: ProvisionStaffRequest): Promise<{
    businessUserId: string;
    role: UserRole;
    active: boolean;
    mode: 'new' | 'linkExisting';
  }> {
    const caller = await this.requireProvisioner(callerUid);
    const mode = request?.mode === 'linkExisting' ? 'linkExisting' : 'new';
    const email = normalizeEmail(request?.email);
    const initialPassword = validatePassword(request?.initialPassword, 'Initial password');

    if (mode === 'linkExisting') {
      return this.linkExistingUser(caller, request, email, initialPassword);
    }
    return this.createNewUser(caller, request, email, initialPassword);
  }

  async getStaffStatus(callerUid: string | undefined): Promise<{ staff: StaffStatusRecord[] }> {
    await this.requireProvisioner(callerUid);
    const [profiles, identities] = await Promise.all([
      this.db.collection('users').get(),
      this.db.collection('auth_identities').get(),
    ]);
    const linkedBusinessUserIds = new Set<string>();
    identities.forEach((identity) => {
      const businessUserId = identity.get('businessUserId');
      if (typeof businessUserId === 'string') linkedBusinessUserIds.add(businessUserId);
    });

    const staff = profiles.docs.flatMap((profile): StaffStatusRecord[] => {
      const data = profile.data();
      const role = data.role;
      const id = typeof data.id === 'string' ? data.id : profile.id;
      if (!isUserRole(role) || typeof data.name !== 'string' || !id) return [];
      return [{
        businessUserId: id,
        name: data.name,
        email: typeof data.email === 'string' ? data.email : undefined,
        phone: typeof data.phone === 'string' ? data.phone : undefined,
        role,
        active: data.active !== false,
        authLinked: linkedBusinessUserIds.has(id),
        machineAssigned: typeof data.machineAssigned === 'string' ? data.machineAssigned : undefined,
      }];
    }).sort((left, right) => left.name.localeCompare(right.name));

    return { staff };
  }

  async setStaffActive(callerUid: string | undefined, request: SetStaffActiveRequest): Promise<{ businessUserId: string; active: boolean }> {
    const caller = await this.requireProvisioner(callerUid);
    const businessUserId = requiredText(request?.businessUserId, 'Business user ID', 128);
    const active = assertBoolean(request?.active, 'Active', true);
    if (businessUserId === caller.businessUserId) {
      throw new ProvisioningError('failed-precondition', 'You cannot deactivate or reactivate your own account from this screen.');
    }
    const profile = await this.getExistingProfile(businessUserId);
    this.assertCanManageRole(caller, profile.role);
    const identity = await this.findIdentityByBusinessUserId(businessUserId);

    if (!identity) {
      await this.commitProfileAndAudit(profile, { active, updatedAt: FieldValue.serverTimestamp() }, {
        action: active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        actor: caller,
        targetBusinessUserId: businessUserId,
        targetRole: profile.role,
        authLinked: false,
      });
      return { businessUserId, active };
    }

    const authUser = await this.auth.getUser(identity.uid).catch((error: unknown) => {
      if (errorCode(error) === 'auth/user-not-found') {
        throw new ProvisioningError('failed-precondition', 'The identity mapping points to a missing Firebase Auth user.');
      }
      throw error;
    });
    await this.auth.updateUser(identity.uid, { disabled: !active });

    try {
      const batch = this.db.batch();
      batch.update(this.db.collection('users').doc(businessUserId), { active, updatedAt: FieldValue.serverTimestamp() });
      batch.update(identity.ref, { active, updatedAt: FieldValue.serverTimestamp() });
      this.addAudit(batch, {
        action: active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
        actor: caller,
        targetBusinessUserId: businessUserId,
        targetRole: profile.role,
        authLinked: true,
      });
      await batch.commit();
    } catch (error) {
      await this.auth.updateUser(identity.uid, { disabled: authUser.disabled }).catch((rollbackError: unknown) => {
        logger.error('Staff active-state rollback failed', { uid: identity.uid, businessUserId, errorCode: errorCode(rollbackError) });
      });
      throw new ProvisioningError('internal', 'The account state could not be synchronized. No change was confirmed.');
    }
    return { businessUserId, active };
  }

  async changeStaffRole(callerUid: string | undefined, request: ChangeStaffRoleRequest): Promise<{ businessUserId: string; role: UserRole }> {
    const caller = await this.requireProvisioner(callerUid);
    const businessUserId = requiredText(request?.businessUserId, 'Business user ID', 128);
    const role = assertRole(request?.role);
    if (businessUserId === caller.businessUserId) {
      throw new ProvisioningError('failed-precondition', 'You cannot change your own role from this screen.');
    }
    const profile = await this.getExistingProfile(businessUserId);
    this.assertCanManageRole(caller, profile.role);
    this.assertCanManageRole(caller, role);
    const identity = await this.findIdentityByBusinessUserId(businessUserId);
    if (!identity) {
      throw new ProvisioningError('failed-precondition', 'This staff profile has no linked Firebase Auth account. Link an account before changing its role.');
    }

    const batch = this.db.batch();
    batch.update(this.db.collection('users').doc(businessUserId), { role, updatedAt: FieldValue.serverTimestamp() });
    batch.update(identity.ref, { role, updatedAt: FieldValue.serverTimestamp() });
    this.addAudit(batch, {
      action: 'USER_ROLE_CHANGED',
      actor: caller,
      targetBusinessUserId: businessUserId,
      targetRole: role,
      previousRole: profile.role,
      authLinked: true,
    });
    await batch.commit();
    return { businessUserId, role };
  }

  async resetStaffPassword(callerUid: string | undefined, request: ResetStaffPasswordRequest): Promise<{ businessUserId: string }> {
    const caller = await this.requireProvisioner(callerUid);
    const businessUserId = requiredText(request?.businessUserId, 'Business user ID', 128);
    const temporaryPassword = validatePassword(request?.temporaryPassword, 'Temporary password');
    const profile = await this.getExistingProfile(businessUserId);
    this.assertCanManageRole(caller, profile.role);
    const identity = await this.findIdentityByBusinessUserId(businessUserId);
    if (!identity) {
      throw new ProvisioningError('failed-precondition', 'This staff profile has no linked Firebase Auth account.');
    }

    await this.auth.updateUser(identity.uid, { password: temporaryPassword });
    try {
      const batch = this.db.batch();
      this.addAudit(batch, {
        action: 'USER_PASSWORD_RESET',
        actor: caller,
        targetBusinessUserId: businessUserId,
        targetRole: profile.role,
        authLinked: true,
      });
      await batch.commit();
    } catch (error) {
      logger.error('Password reset audit write failed', { businessUserId, errorCode: errorCode(error) });
      throw new ProvisioningError('internal', 'Password was changed but the audit record failed. Contact an owner for review.');
    }
    return { businessUserId };
  }

  private async createNewUser(caller: CallerIdentity, request: ProvisionStaffRequest, email: string, initialPassword: string): Promise<{
    businessUserId: string;
    role: UserRole;
    active: boolean;
    mode: 'new';
  }> {
    const name = requiredText(request?.name, 'Name', 100);
    const role = assertRole(request?.role);
    const active = assertBoolean(request?.active, 'Active', true);
    this.assertCanManageRole(caller, role);
    const optional = validateOptionalProfileInput(request);
    if (role !== 'PRINTER' && optional.machineAssigned) {
      throw new ProvisioningError('invalid-argument', 'Machine assignment is valid only for PRINTER staff.');
    }
    if (optional.username) {
      const duplicateUsername = await this.db.collection('users').where('username', '==', optional.username).limit(1).get();
      if (!duplicateUsername.empty) {
        throw new ProvisioningError('already-exists', 'Username is already in use.');
      }
    }

    const businessUserId = await this.allocateBusinessUserId(role);
    let firebaseUid: string | undefined;
    try {
      const authUser = await this.auth.createUser({
        email,
        password: initialPassword,
        displayName: name,
        disabled: !active,
      });
      firebaseUid = authUser.uid;
      const batch = this.db.batch();
      const profile = {
        id: businessUserId,
        name,
        email,
        role,
        active,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: caller.businessUserId,
        ...(optional.phone ? { phone: optional.phone } : {}),
        ...(optional.username ? { username: optional.username } : {}),
        ...(optional.avatar ? { avatar: optional.avatar } : {}),
        ...(optional.machineAssigned ? { machineAssigned: optional.machineAssigned } : {}),
      };
      batch.create(this.db.collection('users').doc(businessUserId), profile);
      batch.create(this.db.collection('auth_identities').doc(firebaseUid), {
        businessUserId,
        role,
        active,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: caller.businessUserId,
      });
      this.addAudit(batch, {
        action: 'USER_PROVISIONED',
        actor: caller,
        targetBusinessUserId: businessUserId,
        targetRole: role,
        authLinked: true,
      });
      await batch.commit();
      return { businessUserId, role, active, mode: 'new' };
    } catch (error) {
      if (firebaseUid) await this.rollbackAuthUser(firebaseUid, businessUserId);
      throw this.normalizeProvisioningError(error);
    }
  }

  private async linkExistingUser(caller: CallerIdentity, request: ProvisionStaffRequest, email: string, initialPassword: string): Promise<{
    businessUserId: string;
    role: UserRole;
    active: boolean;
    mode: 'linkExisting';
  }> {
    const businessUserId = requiredText(request?.existingBusinessUserId, 'Existing business user ID', 128);
    const profile = await this.getExistingProfile(businessUserId);
    this.assertCanManageRole(caller, profile.role);
    if (request.role !== undefined && request.role !== profile.role) {
      throw new ProvisioningError('invalid-argument', 'Existing staff role must be changed through the dedicated role-change action.');
    }
    const existingIdentity = await this.findIdentityByBusinessUserId(businessUserId);
    if (existingIdentity) {
      throw new ProvisioningError('already-exists', 'This business user already has a linked Firebase Auth account.');
    }

    let firebaseUid: string | undefined;
    try {
      const authUser = await this.auth.createUser({
        email,
        password: initialPassword,
        displayName: profile.name,
        disabled: !profile.active,
      });
      firebaseUid = authUser.uid;
      const batch = this.db.batch();
      batch.create(this.db.collection('auth_identities').doc(firebaseUid), {
        businessUserId,
        role: profile.role,
        active: profile.active,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: caller.businessUserId,
      });
      batch.update(this.db.collection('users').doc(businessUserId), {
        email,
        updatedAt: FieldValue.serverTimestamp(),
      });
      this.addAudit(batch, {
        action: 'USER_AUTH_LINKED',
        actor: caller,
        targetBusinessUserId: businessUserId,
        targetRole: profile.role,
        authLinked: true,
      });
      await batch.commit();
      return { businessUserId, role: profile.role, active: profile.active, mode: 'linkExisting' };
    } catch (error) {
      if (firebaseUid) await this.rollbackAuthUser(firebaseUid, businessUserId);
      throw this.normalizeProvisioningError(error);
    }
  }

  private async requireProvisioner(firebaseUid: string | undefined): Promise<CallerIdentity> {
    if (!firebaseUid) {
      throw new ProvisioningError('unauthenticated', 'Sign in is required.');
    }
    const snapshot = await this.db.collection('auth_identities').doc(firebaseUid).get();
    if (!snapshot.exists) {
      throw new ProvisioningError('permission-denied', 'No active business identity is mapped to this Firebase account.');
    }
    const data = snapshot.data() || {};
    if (data.active !== true || typeof data.businessUserId !== 'string' || !isUserRole(data.role)) {
      throw new ProvisioningError('permission-denied', 'The business identity is inactive or invalid.');
    }
    const caller = { firebaseUid, businessUserId: data.businessUserId, role: data.role };
    if (caller.role !== 'DEVELOPER' && caller.role !== 'ADMIN') {
      throw new ProvisioningError('permission-denied', 'Only DEVELOPER or ADMIN may manage staff accounts.');
    }
    return caller;
  }

  private assertCanManageRole(caller: CallerIdentity, role: UserRole): void {
    if (caller.role === 'DEVELOPER') return;
    if (caller.role === 'ADMIN' && (ADMIN_ASSIGNABLE_ROLES as readonly string[]).includes(role)) return;
    throw new ProvisioningError('permission-denied', 'Your role is not permitted to manage that staff role.');
  }

  private async getExistingProfile(businessUserId: string): Promise<ExistingProfile> {
    const snapshot = await this.db.collection('users').doc(businessUserId).get();
    if (!snapshot.exists) {
      throw new ProvisioningError('not-found', 'Business user was not found.');
    }
    const data = snapshot.data() || {};
    if (typeof data.name !== 'string' || !isUserRole(data.role)) {
      throw new ProvisioningError('failed-precondition', 'Business user profile is invalid.');
    }
    return {
      id: businessUserId,
      name: data.name,
      email: typeof data.email === 'string' ? data.email : undefined,
      phone: typeof data.phone === 'string' ? data.phone : undefined,
      role: data.role,
      active: data.active !== false,
      username: typeof data.username === 'string' ? data.username : undefined,
      avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
      machineAssigned: typeof data.machineAssigned === 'string' ? data.machineAssigned : undefined,
    };
  }

  private async findIdentityByBusinessUserId(businessUserId: string): Promise<{ uid: string; ref: FirebaseFirestore.DocumentReference } | null> {
    const snapshot = await this.db.collection('auth_identities').where('businessUserId', '==', businessUserId).limit(2).get();
    if (snapshot.size > 1) {
      throw new ProvisioningError('failed-precondition', 'Multiple Firebase Auth identities are linked to this business user. Manual remediation is required.');
    }
    if (snapshot.empty) return null;
    const identity = snapshot.docs[0];
    return { uid: identity.id, ref: identity.ref };
  }

  private async allocateBusinessUserId(role: UserRole): Promise<string> {
    const counterRef = this.db.collection('counters').doc('staff_user_ids');
    const roleSlug = role.toLowerCase();
    return this.db.runTransaction(async (transaction) => {
      const counter = await transaction.get(counterRef);
      let next = Number(counter.get('next') || 0);
      if (!Number.isInteger(next) || next < 0) next = 0;
      for (let attempts = 0; attempts < 100; attempts += 1) {
        next += 1;
        const businessUserId = `u-${roleSlug}-${next}`;
        const existing = await transaction.get(this.db.collection('users').doc(businessUserId));
        if (!existing.exists) {
          transaction.set(counterRef, { next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return businessUserId;
        }
      }
      throw new ProvisioningError('internal', 'Could not allocate a unique business user ID.');
    });
  }

  private async commitProfileAndAudit(
    profile: ExistingProfile,
    profileUpdate: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    audit: Parameters<StaffProvisioningService['addAudit']>[1],
  ): Promise<void> {
    const batch = this.db.batch();
    batch.update(this.db.collection('users').doc(profile.id), profileUpdate);
    this.addAudit(batch, audit);
    await batch.commit();
  }

  private addAudit(batch: FirebaseFirestore.WriteBatch, details: {
    action: 'USER_PROVISIONED' | 'USER_AUTH_LINKED' | 'USER_DEACTIVATED' | 'USER_REACTIVATED' | 'USER_PASSWORD_RESET' | 'USER_ROLE_CHANGED';
    actor: CallerIdentity;
    targetBusinessUserId: string;
    targetRole: UserRole;
    previousRole?: UserRole;
    authLinked: boolean;
  }): void {
    batch.create(this.db.collection('audit_logs').doc(), {
      action: details.action,
      targetType: 'USER',
      targetId: details.targetBusinessUserId,
      userId: details.actor.businessUserId,
      userRole: details.actor.role,
      actorBusinessUserId: details.actor.businessUserId,
      targetBusinessUserId: details.targetBusinessUserId,
      targetRole: details.targetRole,
      ...(details.previousRole ? { previousRole: details.previousRole } : {}),
      authLinked: details.authLinked,
      timestamp: FieldValue.serverTimestamp(),
    });
  }

  private async rollbackAuthUser(firebaseUid: string, businessUserId: string): Promise<void> {
    try {
      await this.auth.deleteUser(firebaseUid);
    } catch (deleteError) {
      logger.error('Auth rollback delete failed; attempting safe disable', {
        firebaseUid,
        businessUserId,
        errorCode: errorCode(deleteError),
      });
      await this.auth.updateUser(firebaseUid, { disabled: true }).catch((disableError: unknown) => {
        logger.error('Auth rollback disable failed; manual remediation required', {
          firebaseUid,
          businessUserId,
          errorCode: errorCode(disableError),
        });
      });
    }
  }

  private normalizeProvisioningError(error: unknown): ProvisioningError {
    if (error instanceof ProvisioningError) return error;
    const code = errorCode(error);
    if (code === 'auth/email-already-exists') return new ProvisioningError('already-exists', 'Email already has a Firebase Auth account.');
    if (code === 'auth/invalid-email') return new ProvisioningError('invalid-argument', 'Email is invalid.');
    if (code === 'auth/invalid-password' || code === 'auth/weak-password') return new ProvisioningError('invalid-argument', 'Password does not meet the required policy.');
    logger.error('Unexpected staff provisioning failure', { errorCode: code || 'unknown' });
    return new ProvisioningError('internal', 'Staff provisioning could not be completed.');
  }
}
