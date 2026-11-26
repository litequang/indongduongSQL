import { Firestore } from 'firebase-admin/firestore';
import { requireWorkflowActor } from '../../workflows/workflowAuth';
import { StorageAdminError } from '../storageAdminError';
import { BackupPolicyRepository } from './backupPolicyRepository';
import { ImageBackupRepository } from './backupRepository';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

function requestObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A backup coverage request object is required.');
  }
  const data = value as Record<string, unknown>;
  const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
  if (unexpected) throw new StorageAdminError('invalid-argument', `Unexpected field: ${unexpected}.`);
  return data;
}

function policyId(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new StorageAdminError('invalid-argument', 'policyId is invalid.');
  }
  return value;
}

async function count(query: FirebaseFirestore.Query): Promise<number> {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

export class BackupCoverageService {
  constructor(
    private readonly db: Firestore,
    private readonly policies: BackupPolicyRepository,
    private readonly backups: ImageBackupRepository,
  ) {}

  private requireDeveloper(firebaseUid: string | undefined) {
    return requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER']);
  }

  async coverage(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    const data = requestObject(request, ['policyId']);
    const policy = await this.policies.get(policyId(data.policyId));
    const canonical = this.db.collection('image_registry')
      .where('providerConfigId', '==', policy.sourceProviderConfigId)
      .where('status', '==', 'ACTIVE');
    const replicas = this.db.collection('image_replicas')
      .where('sourceProviderConfigId', '==', policy.sourceProviderConfigId)
      .where('providerConfigId', '==', policy.targetProviderConfigId)
      .where('canonicalStatus', '==', 'ACTIVE');
    const [eligibleImages, verifiedReplicas, failedReplicas, missingReplicas, retiredReplicas] = await Promise.all([
      count(canonical),
      count(replicas.where('status', '==', 'VERIFIED')),
      count(replicas.where('status', '==', 'FAILED')),
      count(replicas.where('status', '==', 'MISSING')),
      count(replicas.where('status', '==', 'RETIRED')),
    ]);
    const unhealthyReplicas = failedReplicas + missingReplicas + retiredReplicas;
    const missingBackup = Math.max(0, eligibleImages - verifiedReplicas - unhealthyReplicas);
    await this.policies.recordCoverageCheck(policy.policyId);
    return {
      policyId: policy.policyId,
      eligibleImages,
      verifiedReplicas,
      missingBackup,
      unhealthyReplicas,
      coveragePercent: eligibleImages === 0 ? 100 : Number(((verifiedReplicas / eligibleImages) * 100).toFixed(1)),
      calculatedAt: new Date().toISOString(),
    };
  }

  async failedItems(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    requestObject(request ?? {}, []);
    const items = await this.backups.listFailedItems();
    return {
      items: items.map((item) => ({
        jobId: item.jobId || '',
        ...(item.policyId ? { policyId: item.policyId } : {}),
        imageId: item.imageId,
        label: item.originalFileName || item.entityId || item.imageId,
        sourceProviderConfigId: item.sourceProviderConfigId,
        targetProviderConfigId: item.targetProviderConfigId,
        attemptCount: item.attemptCount,
        errorCode: item.errorCode || 'UNKNOWN_ERROR',
        errorMessage: item.errorMessage || 'Backup failed.',
        updatedAt: item.updatedAt.toDate().toISOString(),
      })),
    };
  }
}
