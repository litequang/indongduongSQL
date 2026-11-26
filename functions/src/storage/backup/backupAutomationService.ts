import { randomUUID } from 'node:crypto';
import { FieldPath, FieldValue, Firestore } from 'firebase-admin/firestore';
import { WorkflowActor, requireWorkflowActor } from '../../workflows/workflowAuth';
import { StorageAdminError } from '../storageAdminError';
import { StorageProviderConfigRepository } from '../providerConfigRepository';
import { StorageTransferProviderFactory } from './transferProviderFactory';
import { BackupPolicyRepository } from './backupPolicyRepository';
import { ImageBackupRepository, imageReplicaId } from './backupRepository';
import { parseCanonicalImage } from './canonicalImage';
import { ImageBackupService } from './imageBackupService';
import { CanonicalImageRecord } from './types';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DISCOVERY_PAGE_SIZE = 25;

export const STORAGE_BACKUP_SYSTEM_ACTOR: WorkflowActor = {
  firebaseUid: 'system:storage-backup',
  businessUserId: 'system:storage-backup',
  role: 'DEVELOPER',
  name: 'Storage Backup Automation',
};

export class BackgroundLeaseBusyError extends Error {
  constructor() {
    super('Background backup lease is still active.');
    this.name = 'BackgroundLeaseBusyError';
  }
}

function requestObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A backup automation request object is required.');
  }
  const data = value as Record<string, unknown>;
  const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
  if (unexpected) throw new StorageAdminError('invalid-argument', `Unexpected field: ${unexpected}.`);
  return data;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new StorageAdminError('invalid-argument', `${field} is invalid.`);
  }
  return value;
}

function safeReason(error: unknown): string {
  if (error instanceof StorageAdminError && typeof error.details?.reason === 'string') return error.details.reason;
  if (error instanceof StorageAdminError && error.code === 'failed-precondition') return 'PROVIDER_INVALID_CONFIG';
  return 'BACKFILL_DISCOVERY_ERROR';
}

export class BackupAutomationService {
  constructor(
    private readonly db: Firestore,
    private readonly policies: BackupPolicyRepository,
    private readonly backups: ImageBackupRepository,
    private readonly providers: StorageTransferProviderFactory,
    private readonly backupService: ImageBackupService,
    private readonly providerConfigs: StorageProviderConfigRepository,
  ) {}

  private async requireEnabledTarget(providerConfigId: string): Promise<void> {
    if (providerConfigId === 'firebase-primary') return;
    const config = await this.providerConfigs.get(providerConfigId);
    if (!config.enabled) {
      throw new StorageAdminError('failed-precondition', 'Backup target provider is disabled.', {
        reason: 'PROVIDER_DISABLED',
      });
    }
  }

  private requireDeveloper(firebaseUid: string | undefined) {
    return requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER']);
  }

  async createBackfill(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = requestObject(request, ['policyId']);
    const policy = await this.policies.get(identifier(data.policyId, 'policyId'));
    if (!policy.enabled) {
      throw new StorageAdminError('failed-precondition', 'Enable the backup policy before starting a backfill.');
    }
    const [source, target] = await Promise.all([
      this.providers.resolve(policy.sourceProviderConfigId, { forNewBackup: false }),
      this.providers.resolve(policy.targetProviderConfigId, { forNewBackup: true }),
    ]);
    if (source.providerType !== policy.sourceProviderType || target.providerType !== policy.targetProviderType) {
      throw new StorageAdminError('failed-precondition', 'Backup policy provider identity is inconsistent.', {
        reason: 'PROVIDER_INVALID_CONFIG',
      });
    }
    const jobId = await this.backups.createBackfillJob(randomUUID(), policy, actor);
    return { jobId };
  }

  async enqueueCanonical(imageId: string, data: FirebaseFirestore.DocumentData): Promise<void> {
    let image: CanonicalImageRecord;
    try {
      image = parseCanonicalImage(imageId, data);
    } catch {
      return;
    }
    if (image.status !== 'ACTIVE') return;
    const policies = await this.policies.listAutoPolicies(image.providerConfigId);
    for (const policy of policies) {
      if (policy.sourceProviderType !== image.providerType) continue;
      try {
        await this.requireEnabledTarget(policy.targetProviderConfigId);
        await this.backups.enqueueAutomatic(policy, image, STORAGE_BACKUP_SYSTEM_ACTOR);
        await this.policies.recordActivity(policy.policyId);
      } catch (error) {
        await this.policies.recordActivity(policy.policyId, safeReason(error)).catch(() => undefined);
      }
    }
  }

  async markCanonicalDeleted(imageId: string): Promise<void> {
    const snapshot = await this.db.collection('image_replicas').where('imageId', '==', imageId).limit(100).get();
    if (snapshot.empty) return;
    const batch = this.db.batch();
    for (const document of snapshot.docs) {
      batch.update(document.ref, {
        canonicalStatus: 'DELETED',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: STORAGE_BACKUP_SYSTEM_ACTOR.businessUserId,
      });
    }
    await batch.commit();
  }

  async processItem(jobId: string, imageId: string, eventId: string): Promise<void> {
    const job = await this.backups.getJobRecord(jobId);
    if (job.jobType === 'MANUAL') return;
    if (job.policyId) {
      const policy = await this.policies.get(job.policyId);
      if (!policy.enabled) {
        await this.backups.cancel(jobId, STORAGE_BACKUP_SYSTEM_ACTOR);
        return;
      }
    }
    const result = await this.backupService.processBackgroundItem(
      jobId,
      imageId,
      `event:${eventId}`,
      STORAGE_BACKUP_SYSTEM_ACTOR,
    );
    if (result === 'BUSY') throw new BackgroundLeaseBusyError();
    if (result === 'PROCESSED' && job.policyId) {
      await this.policies.recordActivity(job.policyId).catch(() => undefined);
    }
  }

  async processDiscovery(jobId: string, eventId: string): Promise<void> {
    const leaseOwner = `event:${eventId}`;
    const claim = await this.backups.claimDiscovery(jobId, leaseOwner);
    if (claim.state === 'BUSY') throw new BackgroundLeaseBusyError();
    if (claim.state !== 'CLAIMED') return;
    const job = claim.job;
    try {
      if (!job.policyId || !job.targetProviderType) {
        throw new StorageAdminError('failed-precondition', 'Backfill job policy metadata is invalid.');
      }
      const policy = await this.policies.get(job.policyId);
      if (!policy.enabled) {
        await this.backups.cancel(jobId, STORAGE_BACKUP_SYSTEM_ACTOR);
        return;
      }
      await this.requireEnabledTarget(job.targetProviderConfigId);
      let query: FirebaseFirestore.Query = this.db.collection('image_registry')
        .where('providerConfigId', '==', job.sourceProviderConfigId)
        .where('status', '==', 'ACTIVE')
        .orderBy(FieldPath.documentId())
        .limit(DISCOVERY_PAGE_SIZE);
      if (job.discoveryCursor) query = query.startAfter(job.discoveryCursor);
      const page = await query.get();
      const images = page.docs.map((document) => parseCanonicalImage(document.id, document.data()));
      const replicaRefs = images.map((image) => this.backups.replicaRef(
        imageReplicaId(image.imageId, job.targetProviderConfigId),
      ));
      const replicaSnapshots = replicaRefs.length ? await this.db.getAll(...replicaRefs) : [];
      const missingImages: CanonicalImageRecord[] = [];
      const verifiedReplicaIds: string[] = [];
      for (let index = 0; index < images.length; index += 1) {
        const image = images[index];
        const snapshot = replicaSnapshots[index];
        const replica = snapshot?.data() || {};
        if (snapshot?.exists && replica.imageId === image.imageId &&
          replica.providerType === job.targetProviderType &&
          replica.providerConfigId === job.targetProviderConfigId &&
          replica.sourceProviderConfigId === job.sourceProviderConfigId &&
          replica.objectKey === image.objectKey && replica.contentType === image.contentType &&
          replica.sizeBytes === image.sizeBytes &&
          replica.status === 'VERIFIED' && replica.checksum?.verification === 'VERIFIED' &&
          typeof replica.checksum?.value === 'string' && SHA256.test(replica.checksum.value) &&
          (image.checksumStatus !== 'SERVER_VERIFIED' || !image.sha256 || replica.checksum.value === image.sha256)) {
          verifiedReplicaIds.push(snapshot.id);
        } else {
          missingImages.push(image);
        }
      }
      await this.backups.appendDiscoveryPage({
        job,
        leaseOwner,
        images: missingImages,
        verifiedReplicaIds,
        pageCandidateCount: images.length,
        skippedVerifiedCount: verifiedReplicaIds.length,
        ...(page.docs.length ? { nextCursor: page.docs[page.docs.length - 1].id } : {}),
        complete: page.docs.length < DISCOVERY_PAGE_SIZE,
        actor: STORAGE_BACKUP_SYSTEM_ACTOR,
      });
      await this.policies.recordActivity(job.policyId).catch(() => undefined);
    } catch (error) {
      const reason = safeReason(error);
      if (error instanceof StorageAdminError) await this.backups.failDiscovery(jobId, leaseOwner, reason);
      else await this.backups.retryDiscovery(jobId, leaseOwner, reason);
      if (job.policyId) await this.policies.recordActivity(job.policyId, reason).catch(() => undefined);
    }
  }
}
