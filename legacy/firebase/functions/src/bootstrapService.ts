import { Auth } from 'firebase-admin/auth';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { ProvisioningError } from './staffProvisioningService';
import { isUserRole } from './types';

const BOOTSTRAP_REF = ['settings', 'system_bootstrap'] as const;

export interface BootstrapFirstDeveloperRequest {
  companyName?: unknown;
  appName?: unknown;
  tagline?: unknown;
  logoUrl?: unknown;
  name?: unknown;
  email?: unknown;
  password?: unknown;
  setupKey?: unknown;
}

function text(value: unknown, field: string, maximum: number, required = true): string | undefined {
  if ((value === undefined || value === null || value === '') && !required) return undefined;
  if (typeof value !== 'string') throw new ProvisioningError('invalid-argument', `${field} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ProvisioningError('invalid-argument', `${field} must be between 1 and ${maximum} characters.`);
  }
  return normalized;
}

function email(value: unknown): string {
  const normalized = text(value, 'Email', 254)!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ProvisioningError('invalid-argument', 'Email is invalid.');
  }
  return normalized;
}

function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new ProvisioningError('invalid-argument', 'Password must be 8 to 128 characters.');
  }
  return value;
}

function sameSecret(provided: string, expected: string): boolean {
  if (!expected || provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/** One-time server-side initialization. It deliberately has no client writes. */
export class BootstrapService {
  constructor(private readonly auth: Auth, private readonly db: Firestore) {}

  async getStatus(): Promise<{ needsSetup: boolean }> {
    const marker = await this.db.doc(BOOTSTRAP_REF.join('/')).get();
    if (marker.get('status') === 'COMPLETED' || marker.get('status') === 'IN_PROGRESS') return { needsSetup: false };
    return { needsSetup: !(await this.hasValidIdentity()) };
  }

  async bootstrap(request: BootstrapFirstDeveloperRequest, configuredSecret: string): Promise<{ businessUserId: string }> {
    const companyName = text(request?.companyName, 'Company name', 120)!;
    const appName = text(request?.appName, 'App name', 80)!;
    const tagline = text(request?.tagline, 'Tagline', 180, false);
    const logoUrl = text(request?.logoUrl, 'Logo URL', 2048, false);
    const name = text(request?.name, 'Name', 100)!;
    const normalizedEmail = email(request?.email);
    const initialPassword = password(request?.password);
    const setupKey = text(request?.setupKey, 'Setup key', 512)!;
    if (!sameSecret(setupKey, configuredSecret)) {
      throw new ProvisioningError('permission-denied', 'The setup key is invalid.');
    }

    const markerRef = this.db.doc(BOOTSTRAP_REF.join('/'));
    await this.db.runTransaction(async (transaction) => {
      const marker = await transaction.get(markerRef);
      if (marker.exists || await this.hasValidIdentityInTransaction(transaction)) {
        if (!marker.exists) transaction.create(markerRef, { status: 'COMPLETED', legacyDetected: true, completedAt: FieldValue.serverTimestamp() });
        throw new ProvisioningError('failed-precondition', 'This workshop has already been initialized.');
      }
      transaction.create(markerRef, { status: 'IN_PROGRESS', startedAt: FieldValue.serverTimestamp() });
    });

    let firebaseUid: string | undefined;
    let businessUserId: string | undefined;
    try {
      businessUserId = await this.allocateFirstDeveloperId();
      const authUser = await this.auth.createUser({ email: normalizedEmail, password: initialPassword, displayName: name });
      firebaseUid = authUser.uid;
      const batch = this.db.batch();
      batch.create(this.db.collection('users').doc(businessUserId), {
        id: businessUserId, name, email: normalizedEmail, role: 'DEVELOPER', active: true,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: 'SYSTEM_BOOTSTRAP',
      });
      batch.create(this.db.collection('auth_identities').doc(firebaseUid), {
        businessUserId, role: 'DEVELOPER', active: true,
        createdAt: FieldValue.serverTimestamp(), createdBy: 'SYSTEM_BOOTSTRAP',
      });
      batch.set(this.db.collection('settings').doc('app'), {
        company: { name: companyName, shortName: appName, slogan: tagline || '', ...(logoUrl ? { logoUrl } : {}) },
        system: { bootstrapStatus: 'completed', initializedAt: FieldValue.serverTimestamp() },
      }, { merge: true });
      batch.set(markerRef, { status: 'COMPLETED', businessUserId, completedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.create(this.db.collection('audit_logs').doc(), {
        action: 'SYSTEM_BOOTSTRAPPED', targetType: 'SYSTEM', targetId: 'system_bootstrap',
        userId: businessUserId, userRole: 'DEVELOPER', actorBusinessUserId: businessUserId,
        timestamp: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      return { businessUserId };
    } catch (error) {
      if (firebaseUid) {
        await this.auth.deleteUser(firebaseUid).catch(async (rollbackError) => {
          logger.error('Bootstrap Auth rollback failed; disabling account.', { error: String(rollbackError) });
          await this.auth.updateUser(firebaseUid!, { disabled: true }).catch(() => undefined);
        });
      }
      await this.db.runTransaction(async (transaction) => {
        const marker = await transaction.get(markerRef);
        if (marker.get('status') === 'IN_PROGRESS') transaction.delete(markerRef);
      }).catch((rollbackError) => logger.error('Bootstrap lock rollback failed.', { error: String(rollbackError), businessUserId }));
      if (error instanceof ProvisioningError) throw error;
      const code = String((error as { code?: unknown })?.code || '');
      if (code === 'auth/email-already-exists') throw new ProvisioningError('already-exists', 'Email already has a Firebase Auth account.');
      logger.error('Bootstrap failed.', { errorCode: code || 'unknown' });
      throw new ProvisioningError('internal', 'The workshop could not be initialized. No setup was confirmed.');
    }
  }

  private async hasValidIdentity(): Promise<boolean> {
    const identities = await this.db.collection('auth_identities').where('active', '==', true).limit(20).get();
    return identities.docs.some((doc) => typeof doc.get('businessUserId') === 'string' && isUserRole(doc.get('role')));
  }

  private async hasValidIdentityInTransaction(transaction: FirebaseFirestore.Transaction): Promise<boolean> {
    const identities = await transaction.get(this.db.collection('auth_identities').where('active', '==', true).limit(20));
    return identities.docs.some((doc) => typeof doc.get('businessUserId') === 'string' && isUserRole(doc.get('role')));
  }

  private async allocateFirstDeveloperId(): Promise<string> {
    const counterRef = this.db.collection('counters').doc('staff_user_ids');
    return this.db.runTransaction(async (transaction) => {
      const counter = await transaction.get(counterRef);
      let next = Number(counter.get('next') || 0);
      if (!Number.isInteger(next) || next < 0) next = 0;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        next += 1;
        const id = `u-developer-${next}`;
        if (!(await transaction.get(this.db.collection('users').doc(id))).exists) {
          transaction.set(counterRef, { next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return id;
        }
      }
      throw new ProvisioningError('internal', 'Could not allocate the first Developer ID.');
    });
  }
}
