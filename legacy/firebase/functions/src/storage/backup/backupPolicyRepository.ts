import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { addWorkflowAudit } from '../../workflows/workflowAudit';
import { WorkflowActor } from '../../workflows/workflowAuth';
import { StorageAdminError } from '../storageAdminError';
import { StorageObjectProviderType } from '../types';
import { STORAGE_BACKUP_POLICIES_COLLECTION, StorageBackupPolicyRecord } from './types';

function timestamp(value: unknown, field: string): Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new StorageAdminError('failed-precondition', `Backup policy ${field} timestamp is invalid.`);
  }
  return value;
}

export function parseBackupPolicy(policyId: string, data: FirebaseFirestore.DocumentData): StorageBackupPolicyRecord {
  if (
    data.policyId !== policyId || typeof data.displayName !== 'string' ||
    typeof data.enabled !== 'boolean' || typeof data.autoBackupNewImages !== 'boolean' ||
    !['R2', 'FIREBASE_STORAGE'].includes(data.sourceProviderType) ||
    !['R2', 'FIREBASE_STORAGE'].includes(data.targetProviderType) ||
    typeof data.sourceProviderConfigId !== 'string' || typeof data.targetProviderConfigId !== 'string' ||
    data.sourceProviderConfigId === data.targetProviderConfigId ||
    typeof data.createdBy !== 'string' || typeof data.updatedBy !== 'string'
  ) {
    throw new StorageAdminError('failed-precondition', 'Backup policy record is invalid.');
  }
  return {
    policyId,
    displayName: data.displayName,
    enabled: data.enabled,
    autoBackupNewImages: data.autoBackupNewImages,
    sourceProviderType: data.sourceProviderType,
    sourceProviderConfigId: data.sourceProviderConfigId,
    targetProviderType: data.targetProviderType,
    targetProviderConfigId: data.targetProviderConfigId,
    ...(typeof data.activeBackfillJobId === 'string' ? { activeBackfillJobId: data.activeBackfillJobId } : {}),
    ...(data.lastActivityAt instanceof Timestamp ? { lastActivityAt: data.lastActivityAt } : {}),
    ...(data.lastBackfillAt instanceof Timestamp ? { lastBackfillAt: data.lastBackfillAt } : {}),
    ...(data.lastCoverageCheckAt instanceof Timestamp ? { lastCoverageCheckAt: data.lastCoverageCheckAt } : {}),
    ...(typeof data.lastErrorCode === 'string' ? { lastErrorCode: data.lastErrorCode } : {}),
    createdAt: timestamp(data.createdAt, 'createdAt'),
    updatedAt: timestamp(data.updatedAt, 'updatedAt'),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

export class BackupPolicyRepository {
  constructor(private readonly db: Firestore) {}

  ref(policyId: string) {
    return this.db.collection(STORAGE_BACKUP_POLICIES_COLLECTION).doc(policyId);
  }

  async get(policyId: string): Promise<StorageBackupPolicyRecord> {
    const snapshot = await this.ref(policyId).get();
    if (!snapshot.exists) throw new StorageAdminError('not-found', 'Backup policy was not found.');
    return parseBackupPolicy(policyId, snapshot.data() || {});
  }

  async list(limit = 50): Promise<StorageBackupPolicyRecord[]> {
    const snapshot = await this.db.collection(STORAGE_BACKUP_POLICIES_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => parseBackupPolicy(document.id, document.data()));
  }

  async listAutoPolicies(sourceProviderConfigId: string): Promise<StorageBackupPolicyRecord[]> {
    const snapshot = await this.db.collection(STORAGE_BACKUP_POLICIES_COLLECTION)
      .where('sourceProviderConfigId', '==', sourceProviderConfigId)
      .limit(50)
      .get();
    return snapshot.docs
      .map((document) => parseBackupPolicy(document.id, document.data()))
      .filter((policy) => policy.enabled && policy.autoBackupNewImages);
  }

  async create(input: {
    policyId: string;
    displayName: string;
    autoBackupNewImages: boolean;
    sourceProviderType: StorageObjectProviderType;
    sourceProviderConfigId: string;
    targetProviderType: StorageObjectProviderType;
    targetProviderConfigId: string;
  }, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    batch.create(this.ref(input.policyId), {
      ...input,
      enabled: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.businessUserId,
      updatedBy: actor.businessUserId,
    });
    addWorkflowAudit(this.db, batch, actor, {
      action: 'BACKUP_POLICY_CREATED',
      targetType: 'STORAGE_BACKUP_POLICY',
      targetId: input.policyId,
      targetState: 'DISABLED',
      extra: {
        sourceProviderConfigId: input.sourceProviderConfigId,
        targetProviderConfigId: input.targetProviderConfigId,
      },
    });
    await batch.commit();
  }

  async update(policyId: string, input: {
    displayName: string;
    autoBackupNewImages: boolean;
    sourceProviderType: StorageObjectProviderType;
    sourceProviderConfigId: string;
    targetProviderType: StorageObjectProviderType;
    targetProviderConfigId: string;
  }, actor: WorkflowActor): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const reference = this.ref(policyId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new StorageAdminError('not-found', 'Backup policy was not found.');
      const current = parseBackupPolicy(policyId, snapshot.data() || {});
      transaction.update(reference, {
        ...input,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.businessUserId,
        lastErrorCode: FieldValue.delete(),
      });
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'BACKUP_POLICY_UPDATED',
        targetType: 'STORAGE_BACKUP_POLICY',
        targetId: policyId,
        sourceState: current.enabled ? 'ENABLED' : 'DISABLED',
        targetState: current.enabled ? 'ENABLED' : 'DISABLED',
      });
    });
  }

  async setEnabled(policyId: string, enabled: boolean, actor: WorkflowActor): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const reference = this.ref(policyId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new StorageAdminError('not-found', 'Backup policy was not found.');
      const current = parseBackupPolicy(policyId, snapshot.data() || {});
      if (current.enabled === enabled) return;
      transaction.update(reference, {
        enabled,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.businessUserId,
        lastErrorCode: FieldValue.delete(),
      });
      addWorkflowAudit(this.db, transaction, actor, {
        action: enabled ? 'BACKUP_POLICY_ENABLED' : 'BACKUP_POLICY_DISABLED',
        targetType: 'STORAGE_BACKUP_POLICY',
        targetId: policyId,
        sourceState: enabled ? 'DISABLED' : 'ENABLED',
        targetState: enabled ? 'ENABLED' : 'DISABLED',
      });
    });
  }

  async recordActivity(policyId: string, errorCode?: string): Promise<void> {
    await this.ref(policyId).update({
      lastActivityAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(errorCode ? { lastErrorCode: errorCode } : { lastErrorCode: FieldValue.delete() }),
    });
  }

  async recordCoverageCheck(policyId: string): Promise<void> {
    await this.ref(policyId).update({ lastCoverageCheckAt: FieldValue.serverTimestamp() });
  }
}
