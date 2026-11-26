import { createHash } from 'node:crypto';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { addWorkflowAudit } from '../../workflows/workflowAudit';
import { WorkflowActor } from '../../workflows/workflowAuth';
import { StorageAdminError } from '../storageAdminError';
import {
  BackupItemStatus,
  BackupDiscoveryStatus,
  BackupJobType,
  BackupJobStatus,
  CanonicalImageRecord,
  IMAGE_BACKUP_ITEMS_COLLECTION,
  IMAGE_BACKUP_JOBS_COLLECTION,
  IMAGE_REPLICAS_COLLECTION,
  STORAGE_BACKUP_POLICIES_COLLECTION,
  ImageBackupJobItemRecord,
  ImageBackupJobRecord,
  ImageReplicaRecord,
  StorageBackupPolicyRecord,
} from './types';

const MAX_ATTEMPTS = 3;
const RETRYABLE_ERROR_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT', 'TEMPORARY_PROVIDER_ERROR', 'DESTINATION_RACE']);
const SHA256 = /^[a-f0-9]{64}$/;
// Longer than the scoped 300-second transfer callable timeout, so a second
// invocation cannot reclaim work while the first invocation is still alive.
const LEASE_MILLIS = 6 * 60 * 1000;

function timestamp(value: unknown, field: string): Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new StorageAdminError('failed-precondition', `Backup ${field} timestamp is invalid.`);
  }
  return value;
}

function optionalTimestamp(value: unknown): Timestamp | undefined {
  return value instanceof Timestamp ? value : undefined;
}

function parseJob(jobId: string, data: FirebaseFirestore.DocumentData): ImageBackupJobRecord {
  const statuses: readonly BackupJobStatus[] = ['PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'];
  const jobTypes: readonly BackupJobType[] = ['MANUAL', 'AUTO', 'BACKFILL'];
  const discoveryStatuses: readonly BackupDiscoveryStatus[] = ['NOT_APPLICABLE', 'PENDING', 'DISCOVERING', 'COMPLETE', 'FAILED', 'CANCELLED'];
  const jobType: BackupJobType = jobTypes.includes(data.jobType) ? data.jobType : 'MANUAL';
  const discoveryStatus: BackupDiscoveryStatus = discoveryStatuses.includes(data.discoveryStatus)
    ? data.discoveryStatus
    : 'NOT_APPLICABLE';
  if (
    data.jobId !== jobId || !statuses.includes(data.status) ||
    typeof data.sourceProviderConfigId !== 'string' || typeof data.targetProviderConfigId !== 'string' ||
    typeof data.cancelRequested !== 'boolean' || typeof data.createdBy !== 'string' ||
    (jobType !== 'MANUAL' && (
      !['R2', 'FIREBASE_STORAGE'].includes(data.sourceProviderType) ||
      !['R2', 'FIREBASE_STORAGE'].includes(data.targetProviderType)
    ))
  ) {
    throw new StorageAdminError('failed-precondition', 'Backup job record is invalid.');
  }
  return {
    jobId,
    jobType,
    ...(typeof data.policyId === 'string' ? { policyId: data.policyId } : {}),
    sourceProviderConfigId: data.sourceProviderConfigId,
    targetProviderConfigId: data.targetProviderConfigId,
    ...(['R2', 'FIREBASE_STORAGE'].includes(data.sourceProviderType) ? { sourceProviderType: data.sourceProviderType } : {}),
    ...(['R2', 'FIREBASE_STORAGE'].includes(data.targetProviderType) ? { targetProviderType: data.targetProviderType } : {}),
    status: data.status,
    cancelRequested: data.cancelRequested,
    discoveryStatus,
    ...(typeof data.discoveryCursor === 'string' ? { discoveryCursor: data.discoveryCursor } : {}),
    discoveryRevision: Number.isSafeInteger(data.discoveryRevision) ? Number(data.discoveryRevision) : 0,
    discoveryAttemptCount: Number.isSafeInteger(data.discoveryAttemptCount) ? Number(data.discoveryAttemptCount) : 0,
    discoveredItems: Number.isSafeInteger(data.discoveredItems) ? Number(data.discoveredItems) : 0,
    skippedVerifiedItems: Number.isSafeInteger(data.skippedVerifiedItems) ? Number(data.skippedVerifiedItems) : 0,
    ...(typeof data.discoveryLeaseOwner === 'string' ? { discoveryLeaseOwner: data.discoveryLeaseOwner } : {}),
    ...(optionalTimestamp(data.discoveryLeaseExpiresAt)
      ? { discoveryLeaseExpiresAt: optionalTimestamp(data.discoveryLeaseExpiresAt) }
      : {}),
    totalItems: Number(data.totalItems),
    pendingItems: Number(data.pendingItems),
    runningItems: Number(data.runningItems),
    completedItems: Number(data.completedItems),
    failedItems: Number(data.failedItems),
    skippedItems: Number(data.skippedItems),
    createdBy: data.createdBy,
    createdAt: timestamp(data.createdAt, 'createdAt'),
    startedAt: optionalTimestamp(data.startedAt),
    completedAt: optionalTimestamp(data.completedAt),
    updatedAt: timestamp(data.updatedAt, 'updatedAt'),
  };
}

function parseItem(imageId: string, data: FirebaseFirestore.DocumentData): ImageBackupJobItemRecord {
  const statuses: readonly BackupItemStatus[] = ['PENDING', 'COPYING', 'VERIFYING', 'COMPLETED', 'FAILED', 'SKIPPED'];
  if (
    data.imageId !== imageId || !statuses.includes(data.status) ||
    !['R2', 'FIREBASE_STORAGE'].includes(data.sourceProviderType) ||
    !['R2', 'FIREBASE_STORAGE'].includes(data.targetProviderType) ||
    typeof data.sourceProviderConfigId !== 'string' || typeof data.targetProviderConfigId !== 'string' ||
    typeof data.sourceObjectKey !== 'string' || typeof data.targetObjectKey !== 'string' ||
    typeof data.contentType !== 'string' || !Number.isSafeInteger(data.expectedSizeBytes)
  ) {
    throw new StorageAdminError('failed-precondition', 'Backup job item record is invalid.');
  }
  return {
    ...(typeof data.jobId === 'string' ? { jobId: data.jobId } : {}),
    ...(typeof data.policyId === 'string' ? { policyId: data.policyId } : {}),
    imageId,
    status: data.status,
    attemptCount: Number(data.attemptCount) || 0,
    sourceProviderType: data.sourceProviderType,
    sourceProviderConfigId: data.sourceProviderConfigId,
    targetProviderType: data.targetProviderType,
    targetProviderConfigId: data.targetProviderConfigId,
    sourceObjectKey: data.sourceObjectKey,
    targetObjectKey: data.targetObjectKey,
    contentType: data.contentType,
    expectedSizeBytes: Number(data.expectedSizeBytes),
    ...(Number.isSafeInteger(data.actualSizeBytes) ? { actualSizeBytes: Number(data.actualSizeBytes) } : {}),
    ...(typeof data.expectedSha256 === 'string' ? { expectedSha256: data.expectedSha256 } : {}),
    ...(typeof data.actualSha256 === 'string' ? { actualSha256: data.actualSha256 } : {}),
    ...(typeof data.originalFileName === 'string' ? { originalFileName: data.originalFileName } : {}),
    ...(typeof data.entityType === 'string' ? { entityType: data.entityType } : {}),
    ...(typeof data.entityId === 'string' ? { entityId: data.entityId } : {}),
    ...(typeof data.parentEntityId === 'string' ? { parentEntityId: data.parentEntityId } : {}),
    ...(typeof data.errorCode === 'string' ? { errorCode: data.errorCode } : {}),
    ...(typeof data.errorMessage === 'string' ? { errorMessage: data.errorMessage } : {}),
    ...(typeof data.leaseOwner === 'string' ? { leaseOwner: data.leaseOwner } : {}),
    ...(optionalTimestamp(data.leaseExpiresAt) ? { leaseExpiresAt: optionalTimestamp(data.leaseExpiresAt) } : {}),
    ...(optionalTimestamp(data.startedAt) ? { startedAt: optionalTimestamp(data.startedAt) } : {}),
    ...(optionalTimestamp(data.completedAt) ? { completedAt: optionalTimestamp(data.completedAt) } : {}),
    updatedAt: timestamp(data.updatedAt, 'item updatedAt'),
  };
}

function parseReplica(replicaId: string, data: FirebaseFirestore.DocumentData): ImageReplicaRecord {
  if (
    data.replicaId !== replicaId || typeof data.imageId !== 'string' ||
    !['R2', 'FIREBASE_STORAGE'].includes(data.providerType) || typeof data.providerConfigId !== 'string' ||
    typeof data.objectKey !== 'string' || typeof data.contentType !== 'string' ||
    !Number.isSafeInteger(data.sizeBytes) || data.sizeBytes < 0 || !data.checksum || data.checksum.algorithm !== 'SHA256' ||
    typeof data.checksum.value !== 'string' || !SHA256.test(data.checksum.value) ||
    !['VERIFIED', 'UNVERIFIED', 'MISMATCH'].includes(data.checksum.verification) ||
    !['COPYING', 'VERIFIED', 'FAILED', 'MISSING', 'RETIRED'].includes(data.status) ||
    typeof data.sourceProviderConfigId !== 'string' || typeof data.createdBy !== 'string' || typeof data.updatedBy !== 'string'
  ) {
    throw new StorageAdminError('failed-precondition', 'Image replica record is invalid.');
  }
  return {
    replicaId,
    imageId: data.imageId,
    providerType: data.providerType,
    providerConfigId: data.providerConfigId,
    objectKey: data.objectKey,
    contentType: data.contentType,
    sizeBytes: Number(data.sizeBytes),
    checksum: {
      algorithm: 'SHA256',
      value: data.checksum.value,
      verification: data.checksum.verification,
    },
    status: data.status,
    sourceProviderConfigId: data.sourceProviderConfigId,
    createdAt: timestamp(data.createdAt, 'replica createdAt'),
    updatedAt: timestamp(data.updatedAt, 'replica updatedAt'),
    verifiedAt: optionalTimestamp(data.verifiedAt),
    ...(['ACTIVE', 'DELETED'].includes(data.canonicalStatus) ? { canonicalStatus: data.canonicalStatus } : {}),
    ...(typeof data.lastErrorCode === 'string' ? { lastErrorCode: data.lastErrorCode } : {}),
    ...(typeof data.lastErrorMessage === 'string' ? { lastErrorMessage: data.lastErrorMessage } : {}),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

function deriveJobState(job: ImageBackupJobRecord, items: ImageBackupJobItemRecord[]): ImageBackupJobRecord {
  const count = (status: BackupItemStatus) => items.filter((item) => item.status === status).length;
  const pendingItems = count('PENDING');
  const runningItems = count('COPYING') + count('VERIFYING');
  const completedItems = count('COMPLETED');
  const failedItems = count('FAILED');
  const skippedItems = count('SKIPPED');
  let status: BackupJobStatus;
  const discoveryActive = job.jobType === 'BACKFILL' && ['PENDING', 'DISCOVERING'].includes(job.discoveryStatus);
  if (job.cancelRequested && runningItems === 0) status = 'CANCELLED';
  else if (discoveryActive) status = job.startedAt ? 'RUNNING' : 'PENDING';
  else if (pendingItems || runningItems) status = job.startedAt ? 'RUNNING' : 'PENDING';
  else if (completedItems === items.length) status = 'COMPLETED';
  else if (completedItems > 0) status = 'PARTIAL';
  else status = 'FAILED';
  return {
    ...job,
    status,
    totalItems: items.length,
    pendingItems,
    runningItems,
    completedItems,
    failedItems,
    skippedItems,
  };
}

function progressStatus(job: ImageBackupJobRecord, counts: {
  totalItems: number;
  pendingItems: number;
  runningItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
}): BackupJobStatus {
  const discoveryActive = job.jobType === 'BACKFILL' && ['PENDING', 'DISCOVERING'].includes(job.discoveryStatus);
  if (job.cancelRequested && counts.runningItems === 0 && counts.pendingItems === 0) return 'CANCELLED';
  if (discoveryActive || counts.pendingItems > 0 || counts.runningItems > 0) {
    return job.startedAt ? 'RUNNING' : 'PENDING';
  }
  if (job.jobType === 'BACKFILL' && job.discoveryStatus === 'FAILED') {
    return counts.completedItems > 0 ? 'PARTIAL' : 'FAILED';
  }
  if (counts.totalItems === 0 || counts.completedItems === counts.totalItems) return 'COMPLETED';
  if (counts.completedItems > 0) return 'PARTIAL';
  return 'FAILED';
}

function transitionCounts(
  job: ImageBackupJobRecord,
  from: BackupItemStatus,
  to: BackupItemStatus,
): ImageBackupJobRecord {
  const bucket = (status: BackupItemStatus): keyof Pick<ImageBackupJobRecord,
    'pendingItems' | 'runningItems' | 'completedItems' | 'failedItems' | 'skippedItems'> => {
    if (status === 'PENDING') return 'pendingItems';
    if (status === 'COPYING' || status === 'VERIFYING') return 'runningItems';
    if (status === 'COMPLETED') return 'completedItems';
    if (status === 'FAILED') return 'failedItems';
    return 'skippedItems';
  };
  const next = { ...job };
  const fromBucket = bucket(from);
  const toBucket = bucket(to);
  if (fromBucket !== toBucket) {
    next[fromBucket] = Math.max(0, next[fromBucket] - 1);
    next[toBucket] += 1;
  }
  next.status = progressStatus(next, next);
  return next;
}

function jobProgressUpdate(job: ImageBackupJobRecord) {
  const settled = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(job.status);
  return {
    status: job.status,
    totalItems: job.totalItems,
    pendingItems: job.pendingItems,
    runningItems: job.runningItems,
    completedItems: job.completedItems,
    failedItems: job.failedItems,
    skippedItems: job.skippedItems,
    updatedAt: FieldValue.serverTimestamp(),
    ...(settled
      ? { completedAt: job.completedAt || FieldValue.serverTimestamp() }
      : { completedAt: FieldValue.delete() }),
  };
}

export function imageReplicaId(imageId: string, providerConfigId: string): string {
  return createHash('sha256').update(`${imageId}\0${providerConfigId}`).digest('hex');
}

export function automaticBackupJobId(policyId: string, imageId: string): string {
  return createHash('sha256').update(`auto\0${policyId}\0${imageId}`).digest('hex');
}

export class ImageBackupRepository {
  constructor(private readonly db: Firestore) {}

  private jobRef(jobId: string) {
    return this.db.collection(IMAGE_BACKUP_JOBS_COLLECTION).doc(jobId);
  }

  private itemRef(jobId: string, imageId: string) {
    return this.jobRef(jobId).collection(IMAGE_BACKUP_ITEMS_COLLECTION).doc(imageId);
  }

  private itemsQuery(jobId: string) {
    return this.jobRef(jobId).collection(IMAGE_BACKUP_ITEMS_COLLECTION);
  }

  replicaRef(replicaId: string) {
    return this.db.collection(IMAGE_REPLICAS_COLLECTION).doc(replicaId);
  }

  async createJob(jobId: string, images: CanonicalImageRecord[], target: {
    providerConfigId: string;
    providerType: 'R2' | 'FIREBASE_STORAGE';
  }, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    const now = FieldValue.serverTimestamp();
    batch.create(this.jobRef(jobId), {
      jobId,
      jobType: 'MANUAL',
      sourceProviderConfigId: images[0].providerConfigId,
      targetProviderConfigId: target.providerConfigId,
      sourceProviderType: images[0].providerType,
      targetProviderType: target.providerType,
      status: 'PENDING',
      cancelRequested: false,
      discoveryStatus: 'NOT_APPLICABLE',
      discoveryRevision: 0,
      discoveryAttemptCount: 0,
      discoveredItems: images.length,
      skippedVerifiedItems: 0,
      totalItems: images.length,
      pendingItems: images.length,
      runningItems: 0,
      completedItems: 0,
      failedItems: 0,
      skippedItems: 0,
      createdBy: actor.businessUserId,
      createdAt: now,
      updatedAt: now,
    });
    for (const image of images) {
      batch.create(this.itemRef(jobId, image.imageId), {
        jobId,
        imageId: image.imageId,
        status: 'PENDING',
        attemptCount: 0,
        sourceProviderType: image.providerType,
        sourceProviderConfigId: image.providerConfigId,
        targetProviderType: target.providerType,
        targetProviderConfigId: target.providerConfigId,
        sourceObjectKey: image.objectKey,
        targetObjectKey: image.objectKey,
        contentType: image.contentType,
        expectedSizeBytes: image.sizeBytes,
        ...(image.checksumStatus === 'SERVER_VERIFIED' && image.sha256 ? { expectedSha256: image.sha256 } : {}),
        ...(image.originalFileName ? { originalFileName: image.originalFileName } : {}),
        ...(image.entityType ? { entityType: image.entityType } : {}),
        ...(image.entityId ? { entityId: image.entityId } : {}),
        ...(image.parentEntityId ? { parentEntityId: image.parentEntityId } : {}),
        updatedAt: now,
      });
    }
    addWorkflowAudit(this.db, batch, actor, {
      action: 'BACKUP_JOB_CREATED',
      targetType: 'IMAGE_BACKUP_JOB',
      targetId: jobId,
      targetState: 'PENDING',
      extra: { targetProviderConfigId: target.providerConfigId, totalItems: images.length },
    });
    await batch.commit();
  }

  async enqueueAutomatic(
    policy: StorageBackupPolicyRecord,
    image: CanonicalImageRecord,
    actor: WorkflowActor,
  ): Promise<string | null> {
    const jobId = automaticBackupJobId(policy.policyId, image.imageId);
    const replicaId = imageReplicaId(image.imageId, policy.targetProviderConfigId);
    return this.db.runTransaction(async (transaction) => {
      const [jobSnapshot, replicaSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(this.replicaRef(replicaId)),
      ]);
      if (jobSnapshot.exists) return jobId;
      if (replicaSnapshot.exists) {
        const replica = parseReplica(replicaId, replicaSnapshot.data() || {});
        if (
          replica.imageId !== image.imageId ||
          replica.providerType !== policy.targetProviderType ||
          replica.providerConfigId !== policy.targetProviderConfigId ||
          replica.sourceProviderConfigId !== policy.sourceProviderConfigId ||
          replica.objectKey !== image.objectKey ||
          replica.contentType !== image.contentType ||
          replica.sizeBytes !== image.sizeBytes
        ) {
          throw new StorageAdminError('failed-precondition', 'Replica identity conflicts with its deterministic ID.', {
            reason: 'REPLICA_ID_CONFLICT',
          });
        }
        if (
          replica.status === 'VERIFIED' &&
          replica.checksum.verification === 'VERIFIED' &&
          (image.checksumStatus !== 'SERVER_VERIFIED' || !image.sha256 || replica.checksum.value === image.sha256)
        ) return null;
      }
      const now = FieldValue.serverTimestamp();
      transaction.create(this.jobRef(jobId), {
        jobId,
        jobType: 'AUTO',
        policyId: policy.policyId,
        sourceProviderConfigId: policy.sourceProviderConfigId,
        targetProviderConfigId: policy.targetProviderConfigId,
        sourceProviderType: policy.sourceProviderType,
        targetProviderType: policy.targetProviderType,
        status: 'PENDING',
        cancelRequested: false,
        discoveryStatus: 'NOT_APPLICABLE',
        discoveryRevision: 0,
        discoveryAttemptCount: 0,
        discoveredItems: 1,
        skippedVerifiedItems: 0,
        totalItems: 1,
        pendingItems: 1,
        runningItems: 0,
        completedItems: 0,
        failedItems: 0,
        skippedItems: 0,
        createdBy: actor.businessUserId,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(this.itemRef(jobId, image.imageId), {
        jobId,
        policyId: policy.policyId,
        imageId: image.imageId,
        status: 'PENDING',
        attemptCount: 0,
        sourceProviderType: image.providerType,
        sourceProviderConfigId: image.providerConfigId,
        targetProviderType: policy.targetProviderType,
        targetProviderConfigId: policy.targetProviderConfigId,
        sourceObjectKey: image.objectKey,
        targetObjectKey: image.objectKey,
        contentType: image.contentType,
        expectedSizeBytes: image.sizeBytes,
        ...(image.checksumStatus === 'SERVER_VERIFIED' && image.sha256 ? { expectedSha256: image.sha256 } : {}),
        ...(image.originalFileName ? { originalFileName: image.originalFileName } : {}),
        ...(image.entityType ? { entityType: image.entityType } : {}),
        ...(image.entityId ? { entityId: image.entityId } : {}),
        ...(image.parentEntityId ? { parentEntityId: image.parentEntityId } : {}),
        updatedAt: now,
      });
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'BACKUP_AUTO_ENQUEUED',
        targetType: 'IMAGE_BACKUP_JOB',
        targetId: jobId,
        targetState: 'PENDING',
        extra: { policyId: policy.policyId, imageId: image.imageId },
      });
      return jobId;
    });
  }

  async createBackfillJob(
    jobId: string,
    policy: StorageBackupPolicyRecord,
    actor: WorkflowActor,
  ): Promise<string> {
    return this.db.runTransaction(async (transaction) => {
      const policyRef = this.db.collection(STORAGE_BACKUP_POLICIES_COLLECTION).doc(policy.policyId);
      const policySnapshot = await transaction.get(policyRef);
      if (!policySnapshot.exists) throw new StorageAdminError('not-found', 'Backup policy was not found.');
      if (
        policySnapshot.get('enabled') !== true ||
        policySnapshot.get('sourceProviderConfigId') !== policy.sourceProviderConfigId ||
        policySnapshot.get('targetProviderConfigId') !== policy.targetProviderConfigId
      ) {
        throw new StorageAdminError('aborted', 'Backup policy changed while the backfill was being created.', {
          reason: 'POLICY_CHANGED',
        });
      }
      const activeJobId = policySnapshot.get('activeBackfillJobId');
      if (typeof activeJobId === 'string') {
        const activeSnapshot = await transaction.get(this.jobRef(activeJobId));
        if (activeSnapshot.exists) {
          const active = parseJob(activeJobId, activeSnapshot.data() || {});
          if (!['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(active.status)) return activeJobId;
        }
      }
      const now = FieldValue.serverTimestamp();
      transaction.create(this.jobRef(jobId), {
        jobId,
        jobType: 'BACKFILL',
        policyId: policy.policyId,
        sourceProviderConfigId: policy.sourceProviderConfigId,
        targetProviderConfigId: policy.targetProviderConfigId,
        sourceProviderType: policy.sourceProviderType,
        targetProviderType: policy.targetProviderType,
        status: 'PENDING',
        cancelRequested: false,
        discoveryStatus: 'PENDING',
        discoveryRevision: 0,
        discoveryAttemptCount: 0,
        discoveredItems: 0,
        skippedVerifiedItems: 0,
        totalItems: 0,
        pendingItems: 0,
        runningItems: 0,
        completedItems: 0,
        failedItems: 0,
        skippedItems: 0,
        createdBy: actor.businessUserId,
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(policyRef, {
        activeBackfillJobId: jobId,
        lastBackfillAt: now,
        lastActivityAt: now,
        updatedAt: now,
        updatedBy: actor.businessUserId,
      });
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'BACKUP_BACKFILL_STARTED',
        targetType: 'IMAGE_BACKUP_JOB',
        targetId: jobId,
        targetState: 'PENDING',
        extra: { policyId: policy.policyId },
      });
      return jobId;
    });
  }

  async getJobRecord(jobId: string): Promise<ImageBackupJobRecord> {
    const snapshot = await this.jobRef(jobId).get();
    if (!snapshot.exists) throw new StorageAdminError('not-found', 'Backup job was not found.');
    return parseJob(jobId, snapshot.data() || {});
  }

  async claimSpecific(
    jobId: string,
    imageId: string,
    leaseOwner: string,
    actor: WorkflowActor,
  ): Promise<{ state: 'CLAIMED'; item: ImageBackupJobItemRecord } | { state: 'BUSY' | 'DONE' }> {
    return this.db.runTransaction(async (transaction) => {
      const [jobSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(this.itemRef(jobId, imageId)),
      ]);
      if (!jobSnapshot.exists || !itemSnapshot.exists) return { state: 'DONE' };
      const job = parseJob(jobId, jobSnapshot.data() || {});
      const item = parseItem(imageId, itemSnapshot.data() || {});
      if (['COMPLETED', 'FAILED', 'SKIPPED'].includes(item.status)) return { state: 'DONE' };
      const active = ['COPYING', 'VERIFYING'].includes(item.status);
      const expired = active && (item.leaseExpiresAt?.toMillis() || 0) <= Date.now();
      if (job.cancelRequested) {
        if (active && !expired) return { state: 'BUSY' };
        const nextJob = transitionCounts(job, item.status, 'SKIPPED');
        transaction.update(itemSnapshot.ref, {
          status: 'SKIPPED',
          errorCode: 'JOB_CANCELLED',
          errorMessage: 'Backup job was cancelled before this item could continue.',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          leaseOwner: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
        });
        transaction.update(jobSnapshot.ref, jobProgressUpdate(nextJob));
        return { state: 'DONE' };
      }
      if (active && !expired) return { state: 'BUSY' };
      if (active && expired && item.attemptCount >= MAX_ATTEMPTS) {
        const nextJob = transitionCounts(job, item.status, 'FAILED');
        transaction.update(itemSnapshot.ref, {
          status: 'FAILED',
          errorCode: 'MAX_ATTEMPTS_EXCEEDED',
          errorMessage: 'Backup item lease expired after the maximum attempt count.',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          leaseOwner: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
        });
        transaction.update(jobSnapshot.ref, jobProgressUpdate(nextJob));
        addWorkflowAudit(this.db, transaction, actor, {
          action: 'BACKUP_ITEM_FAILED',
          targetType: 'IMAGE_BACKUP_ITEM',
          targetId: `${jobId}:${imageId}`,
          targetState: 'FAILED',
          reason: 'MAX_ATTEMPTS_EXCEEDED',
        });
        return { state: 'DONE' };
      }
      if (item.status !== 'PENDING' && !expired) return { state: 'DONE' };
      const leaseExpiresAt = Timestamp.fromMillis(Date.now() + LEASE_MILLIS);
      const startedAt = item.startedAt || Timestamp.now();
      const claimed: ImageBackupJobItemRecord = {
        ...item,
        status: 'COPYING',
        attemptCount: item.attemptCount + 1,
        leaseOwner,
        leaseExpiresAt,
        startedAt,
      };
      transaction.update(itemSnapshot.ref, {
        status: 'COPYING',
        attemptCount: claimed.attemptCount,
        leaseOwner,
        leaseExpiresAt,
        startedAt,
        updatedAt: FieldValue.serverTimestamp(),
        errorCode: FieldValue.delete(),
        errorMessage: FieldValue.delete(),
      });
      const baseJob = { ...job, startedAt: job.startedAt || Timestamp.now() };
      const nextJob = transitionCounts(baseJob, item.status, 'COPYING');
      transaction.update(jobSnapshot.ref, {
        ...jobProgressUpdate(nextJob),
        startedAt: job.startedAt || FieldValue.serverTimestamp(),
      });
      return { state: 'CLAIMED', item: claimed };
    });
  }

  async claimDiscovery(
    jobId: string,
    leaseOwner: string,
  ): Promise<{ state: 'CLAIMED'; job: ImageBackupJobRecord } | { state: 'BUSY' | 'WAITING' | 'DONE' }> {
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.jobRef(jobId));
      if (!snapshot.exists) return { state: 'DONE' };
      const job = parseJob(jobId, snapshot.data() || {});
      if (job.jobType !== 'BACKFILL' || job.cancelRequested ||
          !['PENDING', 'DISCOVERING'].includes(job.discoveryStatus)) return { state: 'DONE' };
      if (job.pendingItems > 0 || job.runningItems > 0) return { state: 'WAITING' };
      if (job.discoveryLeaseOwner && (job.discoveryLeaseExpiresAt?.toMillis() || 0) > Date.now()) {
        return { state: 'BUSY' };
      }
      if (job.discoveryLeaseOwner && job.discoveryAttemptCount >= MAX_ATTEMPTS) {
        const failedJob: ImageBackupJobRecord = {
          ...job,
          discoveryStatus: 'FAILED',
          discoveryLeaseOwner: undefined,
          discoveryLeaseExpiresAt: undefined,
        };
        failedJob.status = progressStatus(failedJob, failedJob);
        transaction.update(snapshot.ref, {
          discoveryStatus: 'FAILED',
          discoveryErrorCode: 'MAX_ATTEMPTS_EXCEEDED',
          discoveryLeaseOwner: FieldValue.delete(),
          discoveryLeaseExpiresAt: FieldValue.delete(),
          status: failedJob.status,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { state: 'DONE' };
      }
      const claimed: ImageBackupJobRecord = {
        ...job,
        status: 'RUNNING',
        discoveryStatus: 'DISCOVERING',
        discoveryAttemptCount: job.discoveryAttemptCount + 1,
        discoveryLeaseOwner: leaseOwner,
        discoveryLeaseExpiresAt: Timestamp.fromMillis(Date.now() + LEASE_MILLIS),
        startedAt: job.startedAt || Timestamp.now(),
      };
      transaction.update(snapshot.ref, {
        status: 'RUNNING',
        discoveryStatus: 'DISCOVERING',
        discoveryAttemptCount: claimed.discoveryAttemptCount,
        discoveryLeaseOwner: claimed.discoveryLeaseOwner,
        discoveryLeaseExpiresAt: claimed.discoveryLeaseExpiresAt,
        startedAt: job.startedAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { state: 'CLAIMED', job: claimed };
    });
  }

  async appendDiscoveryPage(input: {
    job: ImageBackupJobRecord;
    leaseOwner: string;
    images: CanonicalImageRecord[];
    verifiedReplicaIds: string[];
    pageCandidateCount: number;
    skippedVerifiedCount: number;
    nextCursor?: string;
    complete: boolean;
    actor: WorkflowActor;
  }): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const jobRef = this.jobRef(input.job.jobId);
      const jobSnapshot = await transaction.get(jobRef);
      if (!jobSnapshot.exists) return;
      const job = parseJob(input.job.jobId, jobSnapshot.data() || {});
      if (job.cancelRequested || job.discoveryLeaseOwner !== input.leaseOwner ||
          job.discoveryCursor !== input.job.discoveryCursor) return;
      if (!job.targetProviderType) {
        throw new StorageAdminError('failed-precondition', 'Backfill target provider type is missing.');
      }
      const itemRefs = input.images.map((image) => this.itemRef(job.jobId, image.imageId));
      const itemSnapshots = itemRefs.length ? await transaction.getAll(...itemRefs) : [];
      const newImages = input.images.filter((_, index) => !itemSnapshots[index].exists);
      const now = FieldValue.serverTimestamp();
      for (const image of newImages) {
        transaction.create(this.itemRef(job.jobId, image.imageId), {
          jobId: job.jobId,
          ...(job.policyId ? { policyId: job.policyId } : {}),
          imageId: image.imageId,
          status: 'PENDING',
          attemptCount: 0,
          sourceProviderType: image.providerType,
          sourceProviderConfigId: image.providerConfigId,
          targetProviderType: job.targetProviderType,
          targetProviderConfigId: job.targetProviderConfigId,
          sourceObjectKey: image.objectKey,
          targetObjectKey: image.objectKey,
          contentType: image.contentType,
          expectedSizeBytes: image.sizeBytes,
          ...(image.checksumStatus === 'SERVER_VERIFIED' && image.sha256 ? { expectedSha256: image.sha256 } : {}),
          ...(image.originalFileName ? { originalFileName: image.originalFileName } : {}),
          ...(image.entityType ? { entityType: image.entityType } : {}),
          ...(image.entityId ? { entityId: image.entityId } : {}),
          ...(image.parentEntityId ? { parentEntityId: image.parentEntityId } : {}),
          updatedAt: now,
        });
      }
      for (const replicaId of input.verifiedReplicaIds) {
        transaction.update(this.replicaRef(replicaId), {
          canonicalStatus: 'ACTIVE',
          updatedAt: now,
          updatedBy: input.actor.businessUserId,
        });
      }
      const nextJob: ImageBackupJobRecord = {
        ...job,
        discoveryStatus: input.complete ? 'COMPLETE' : 'DISCOVERING',
        ...(input.nextCursor ? { discoveryCursor: input.nextCursor } : {}),
        discoveryRevision: job.discoveryRevision + 1,
        discoveryAttemptCount: 0,
        discoveredItems: job.discoveredItems + input.pageCandidateCount,
        skippedVerifiedItems: job.skippedVerifiedItems + input.skippedVerifiedCount,
        totalItems: job.totalItems + newImages.length,
        pendingItems: job.pendingItems + newImages.length,
        discoveryLeaseOwner: undefined,
        discoveryLeaseExpiresAt: undefined,
      };
      nextJob.status = progressStatus(nextJob, nextJob);
      transaction.update(jobRef, {
        discoveryStatus: nextJob.discoveryStatus,
        ...(input.nextCursor ? { discoveryCursor: input.nextCursor } : {}),
        discoveryRevision: nextJob.discoveryRevision,
        discoveryAttemptCount: nextJob.discoveryAttemptCount,
        discoveredItems: nextJob.discoveredItems,
        skippedVerifiedItems: nextJob.skippedVerifiedItems,
        totalItems: nextJob.totalItems,
        pendingItems: nextJob.pendingItems,
        status: nextJob.status,
        updatedAt: now,
        discoveryLeaseOwner: FieldValue.delete(),
        discoveryLeaseExpiresAt: FieldValue.delete(),
        ...(input.complete && ['COMPLETED', 'PARTIAL', 'FAILED'].includes(nextJob.status)
          ? { completedAt: now }
          : {}),
      });
      if (input.complete) {
        addWorkflowAudit(this.db, transaction, input.actor, {
          action: 'BACKUP_BACKFILL_DISCOVERY_COMPLETED',
          targetType: 'IMAGE_BACKUP_JOB',
          targetId: job.jobId,
          targetState: nextJob.status,
          extra: {
            policyId: job.policyId || '',
            discoveredItems: nextJob.discoveredItems,
            backupItems: nextJob.totalItems,
          },
        });
      }
    });
  }

  async failDiscovery(jobId: string, leaseOwner: string, errorCode: string): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.jobRef(jobId));
      if (!snapshot.exists) return;
      const job = parseJob(jobId, snapshot.data() || {});
      if (job.discoveryLeaseOwner !== leaseOwner) return;
      const failedJob: ImageBackupJobRecord = { ...job, discoveryStatus: 'FAILED' };
      const nextStatus = progressStatus(failedJob, failedJob);
      transaction.update(snapshot.ref, {
        discoveryStatus: 'FAILED',
        status: nextStatus,
        discoveryErrorCode: errorCode,
        discoveryLeaseOwner: FieldValue.delete(),
        discoveryLeaseExpiresAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(job.pendingItems || job.runningItems ? {} : { completedAt: FieldValue.serverTimestamp() }),
      });
    });
  }

  async retryDiscovery(jobId: string, leaseOwner: string, errorCode: string): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.jobRef(jobId));
      if (!snapshot.exists) return;
      const job = parseJob(jobId, snapshot.data() || {});
      if (job.discoveryLeaseOwner !== leaseOwner) return;
      const exhausted = job.discoveryAttemptCount >= MAX_ATTEMPTS;
      const nextJob: ImageBackupJobRecord = {
        ...job,
        discoveryStatus: exhausted ? 'FAILED' : 'PENDING',
        discoveryRevision: job.discoveryRevision + 1,
        discoveryLeaseOwner: undefined,
        discoveryLeaseExpiresAt: undefined,
      };
      nextJob.status = progressStatus(nextJob, nextJob);
      transaction.update(snapshot.ref, {
        discoveryStatus: nextJob.discoveryStatus,
        discoveryRevision: nextJob.discoveryRevision,
        discoveryErrorCode: errorCode,
        discoveryLeaseOwner: FieldValue.delete(),
        discoveryLeaseExpiresAt: FieldValue.delete(),
        status: nextJob.status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(exhausted ? { completedAt: FieldValue.serverTimestamp() } : { completedAt: FieldValue.delete() }),
      });
    });
  }

  async getJob(jobId: string): Promise<{ job: ImageBackupJobRecord; items: ImageBackupJobItemRecord[] }> {
    const [jobSnapshot, itemSnapshot] = await Promise.all([
      this.jobRef(jobId).get(),
      this.jobRef(jobId).collection(IMAGE_BACKUP_ITEMS_COLLECTION).orderBy('updatedAt', 'desc').limit(100).get(),
    ]);
    if (!jobSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job was not found.');
    return {
      job: parseJob(jobId, jobSnapshot.data() || {}),
      items: itemSnapshot.docs.map((document) => parseItem(document.id, document.data())),
    };
  }

  async listJobs(limit = 25): Promise<ImageBackupJobRecord[]> {
    const snapshot = await this.db.collection(IMAGE_BACKUP_JOBS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => parseJob(document.id, document.data()));
  }

  async claim(jobId: string, leaseOwner: string, actor: WorkflowActor): Promise<ImageBackupJobItemRecord | null> {
    return this.db.runTransaction(async (transaction) => {
      const [jobSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(this.itemsQuery(jobId)),
      ]);
      if (!jobSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job was not found.');
      const storedJob = parseJob(jobId, jobSnapshot.data() || {});
      const items = itemSnapshot.docs.map((document) => parseItem(document.id, document.data()));
      const nowMillis = Date.now();
      const exhaustedIds = new Set(items.filter((item) =>
        ['COPYING', 'VERIFYING'].includes(item.status) &&
        (item.leaseExpiresAt?.toMillis() || 0) <= nowMillis &&
        item.attemptCount >= MAX_ATTEMPTS
      ).map((item) => item.imageId));
      const availableItems = items.map((item): ImageBackupJobItemRecord => exhaustedIds.has(item.imageId)
        ? {
          ...item,
          status: 'FAILED',
          errorCode: 'MAX_ATTEMPTS_EXCEEDED',
          errorMessage: 'Backup item lease expired after the maximum attempt count.',
          completedAt: Timestamp.now(),
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
        }
        : item);
      for (const imageId of exhaustedIds) {
        transaction.update(this.itemRef(jobId, imageId), {
          status: 'FAILED',
          errorCode: 'MAX_ATTEMPTS_EXCEEDED',
          errorMessage: 'Backup item lease expired after the maximum attempt count.',
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          leaseOwner: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
        });
        addWorkflowAudit(this.db, transaction, actor, {
          action: 'BACKUP_ITEM_FAILED',
          targetType: 'IMAGE_BACKUP_ITEM',
          targetId: `${jobId}:${imageId}`,
          targetState: 'FAILED',
          reason: 'MAX_ATTEMPTS_EXCEEDED',
        });
      }
      const job = deriveJobState(storedJob, availableItems);
      if (job.cancelRequested || ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(job.status)) {
        transaction.update(jobSnapshot.ref, jobProgressUpdate(job));
        return null;
      }
      const item = availableItems
        .filter((candidate) => candidate.attemptCount < MAX_ATTEMPTS && (
          candidate.status === 'PENDING' ||
          (['COPYING', 'VERIFYING'].includes(candidate.status) &&
            (candidate.leaseExpiresAt?.toMillis() || 0) <= nowMillis)
        ))
        .sort((left, right) => left.imageId.localeCompare(right.imageId))[0];
      if (!item) {
        transaction.update(jobSnapshot.ref, jobProgressUpdate(job));
        return null;
      }
      const leaseExpiresAt = Timestamp.fromMillis(Date.now() + LEASE_MILLIS);
      const startedAt = item.startedAt || Timestamp.now();
      const claimed: ImageBackupJobItemRecord = {
        ...item,
        status: 'COPYING',
        attemptCount: item.attemptCount + 1,
        leaseOwner,
        leaseExpiresAt,
        startedAt,
      };
      transaction.update(this.itemRef(jobId, item.imageId), {
        status: claimed.status,
        attemptCount: claimed.attemptCount,
        leaseOwner,
        leaseExpiresAt,
        startedAt,
        updatedAt: FieldValue.serverTimestamp(),
        errorCode: FieldValue.delete(),
        errorMessage: FieldValue.delete(),
      });
      const nextJob = deriveJobState(
        { ...job, startedAt: job.startedAt || Timestamp.now() },
        availableItems.map((candidate) => candidate.imageId === claimed.imageId ? claimed : candidate),
      );
      transaction.update(jobSnapshot.ref, {
        ...jobProgressUpdate(nextJob),
        startedAt: job.startedAt || FieldValue.serverTimestamp(),
      });
      return claimed;
    });
  }

  async markVerifying(jobId: string, imageId: string, leaseOwner: string): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(this.itemRef(jobId, imageId));
      if (!snapshot.exists) throw new StorageAdminError('not-found', 'Backup job item was not found.');
      const item = parseItem(imageId, snapshot.data() || {});
      if (item.status !== 'COPYING' || item.leaseOwner !== leaseOwner) {
        throw new StorageAdminError('aborted', 'Backup item lease was lost.', { reason: 'LEASE_CONFLICT' });
      }
      transaction.update(snapshot.ref, { status: 'VERIFYING', updatedAt: FieldValue.serverTimestamp() });
    });
  }

  async complete(
    jobId: string,
    item: ImageBackupJobItemRecord,
    leaseOwner: string,
    result: { sizeBytes: number; sha256: string },
    actor: WorkflowActor,
  ): Promise<ImageReplicaRecord> {
    const replicaId = imageReplicaId(item.imageId, item.targetProviderConfigId);
    await this.db.runTransaction(async (transaction) => {
      const [jobSnapshot, itemSnapshot, replicaSnapshot, canonicalSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(this.itemRef(jobId, item.imageId)),
        transaction.get(this.replicaRef(replicaId)),
        transaction.get(this.db.collection('image_registry').doc(item.imageId)),
      ]);
      if (!jobSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job was not found.');
      const canonical = canonicalSnapshot.data() || {};
      if (
        !canonicalSnapshot.exists || canonical.status !== 'ACTIVE' ||
        canonical.providerConfigId !== item.sourceProviderConfigId ||
        canonical.providerType !== item.sourceProviderType || canonical.objectKey !== item.sourceObjectKey ||
        canonical.contentType !== item.contentType || canonical.size !== item.expectedSizeBytes
      ) {
        throw new StorageAdminError('failed-precondition', 'Canonical image changed before backup completion.', {
          reason: 'SOURCE_CHANGED',
        });
      }
      const job = parseJob(jobId, jobSnapshot.data() || {});
      if (!itemSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job item was not found.');
      const current = parseItem(item.imageId, itemSnapshot.data() || {});
      if (!['COPYING', 'VERIFYING'].includes(current.status) || current.leaseOwner !== leaseOwner) {
        throw new StorageAdminError('aborted', 'Backup item lease was lost.', { reason: 'LEASE_CONFLICT' });
      }
      const existingReplica = replicaSnapshot.exists
        ? parseReplica(replicaSnapshot.id, replicaSnapshot.data() || {})
        : undefined;
      if (existingReplica && (
        existingReplica.imageId !== item.imageId ||
        existingReplica.providerConfigId !== item.targetProviderConfigId ||
        existingReplica.providerType !== item.targetProviderType ||
        existingReplica.objectKey !== item.targetObjectKey
      )) {
        throw new StorageAdminError('failed-precondition', 'Replica identity conflicts with its deterministic ID.', {
          reason: 'REPLICA_ID_CONFLICT',
        });
      }
      const completed: ImageBackupJobItemRecord = {
        ...current,
        status: 'COMPLETED',
        actualSizeBytes: result.sizeBytes,
        actualSha256: result.sha256,
        completedAt: Timestamp.now(),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      };
      transaction.update(this.itemRef(jobId, item.imageId), {
        status: 'COMPLETED',
        actualSizeBytes: result.sizeBytes,
        actualSha256: result.sha256,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        leaseOwner: FieldValue.delete(),
        leaseExpiresAt: FieldValue.delete(),
        errorCode: FieldValue.delete(),
        errorMessage: FieldValue.delete(),
      });
      const nextJob = transitionCounts(job, current.status, completed.status);
      transaction.update(jobSnapshot.ref, jobProgressUpdate(nextJob));
      transaction.set(this.replicaRef(replicaId), {
        replicaId,
        imageId: item.imageId,
        providerType: item.targetProviderType,
        providerConfigId: item.targetProviderConfigId,
        objectKey: item.targetObjectKey,
        contentType: item.contentType,
        sizeBytes: result.sizeBytes,
        checksum: { algorithm: 'SHA256', value: result.sha256, verification: 'VERIFIED' },
        status: 'VERIFIED',
        canonicalStatus: 'ACTIVE',
        sourceProviderConfigId: item.sourceProviderConfigId,
        createdAt: existingReplica?.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        verifiedAt: FieldValue.serverTimestamp(),
        createdBy: existingReplica?.createdBy || actor.businessUserId,
        updatedBy: actor.businessUserId,
        lastErrorCode: FieldValue.delete(),
        lastErrorMessage: FieldValue.delete(),
      }, { merge: true });
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'BACKUP_ITEM_COMPLETED',
        targetType: 'IMAGE_REPLICA',
        targetId: replicaId,
        targetState: 'VERIFIED',
        extra: { jobId, imageId: item.imageId, providerConfigId: item.targetProviderConfigId },
      });
    });
    return this.getReplica(replicaId);
  }

  async fail(
    jobId: string,
    item: ImageBackupJobItemRecord,
    leaseOwner: string,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
    actor: WorkflowActor,
  ): Promise<void> {
    const replicaId = imageReplicaId(item.imageId, item.targetProviderConfigId);
    await this.db.runTransaction(async (transaction) => {
      const [jobSnapshot, itemSnapshot, replicaSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(this.itemRef(jobId, item.imageId)),
        transaction.get(this.replicaRef(replicaId)),
      ]);
      if (!jobSnapshot.exists) return;
      const job = parseJob(jobId, jobSnapshot.data() || {});
      if (!itemSnapshot.exists) return;
      const current = parseItem(item.imageId, itemSnapshot.data() || {});
      if (!['COPYING', 'VERIFYING'].includes(current.status) || current.leaseOwner !== leaseOwner) return;
      const nextStatus = job.cancelRequested
        ? 'SKIPPED'
        : retryable && current.attemptCount < MAX_ATTEMPTS ? 'PENDING' : 'FAILED';
      const storedErrorCode = job.cancelRequested
        ? 'JOB_CANCELLED'
        : retryable && current.attemptCount >= MAX_ATTEMPTS ? 'MAX_ATTEMPTS_EXCEEDED' : errorCode;
      const storedErrorMessage = job.cancelRequested
        ? 'Backup job was cancelled while this item was running.'
        : errorMessage;
      const failed: ImageBackupJobItemRecord = {
        ...current,
        status: nextStatus,
        errorCode: storedErrorCode,
        errorMessage: storedErrorMessage,
        ...(['FAILED', 'SKIPPED'].includes(nextStatus) ? { completedAt: Timestamp.now() } : { completedAt: undefined }),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      };
      transaction.update(this.itemRef(jobId, item.imageId), {
        status: nextStatus,
        errorCode: storedErrorCode,
        errorMessage: storedErrorMessage,
        updatedAt: FieldValue.serverTimestamp(),
        ...(['FAILED', 'SKIPPED'].includes(nextStatus)
          ? { completedAt: FieldValue.serverTimestamp() }
          : { completedAt: FieldValue.delete() }),
        leaseOwner: FieldValue.delete(),
        leaseExpiresAt: FieldValue.delete(),
      });
      const nextJob = transitionCounts(job, current.status, failed.status);
      transaction.update(jobSnapshot.ref, jobProgressUpdate(nextJob));
      const destinationIntegrityFailed = errorCode === 'DESTINATION_CHECKSUM_MISMATCH' ||
        (errorCode === 'SOURCE_CHECKSUM_MISMATCH' && current.status === 'VERIFYING');
      if (destinationIntegrityFailed && replicaSnapshot.exists) {
        const replica = parseReplica(replicaId, replicaSnapshot.data() || {});
        if (
          replica.imageId === item.imageId && replica.providerConfigId === item.targetProviderConfigId &&
          replica.providerType === item.targetProviderType && replica.objectKey === item.targetObjectKey
        ) {
          transaction.update(replicaSnapshot.ref, {
            status: 'FAILED',
            checksum: {
              algorithm: 'SHA256',
              value: replica.checksum.value,
              verification: 'MISMATCH',
            },
            lastErrorCode: errorCode,
            lastErrorMessage: errorMessage,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: actor.businessUserId,
          });
          addWorkflowAudit(this.db, transaction, actor, {
            action: 'IMAGE_REPLICA_INVALIDATED',
            targetType: 'IMAGE_REPLICA',
            targetId: replicaId,
            sourceState: replica.status,
            targetState: 'FAILED',
            reason: errorCode,
          });
        }
      }
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'BACKUP_ITEM_FAILED',
        targetType: 'IMAGE_BACKUP_ITEM',
        targetId: `${jobId}:${item.imageId}`,
        targetState: nextStatus,
        reason: storedErrorCode,
        extra: { jobId, imageId: item.imageId, attemptCount: current.attemptCount, retryable },
      });
    });
  }

  async cancel(jobId: string, actor: WorkflowActor): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const activeItemsQuery = this.itemsQuery(jobId)
        .where('status', 'in', ['PENDING', 'COPYING', 'VERIFYING'])
        .limit(100);
      const [jobSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(activeItemsQuery),
      ]);
      if (!jobSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job was not found.');
      const job = parseJob(jobId, jobSnapshot.data() || {});
      const items = itemSnapshot.docs.map((document) => parseItem(document.id, document.data()));
      if (job.status === 'CANCELLED') return;
      if (['COMPLETED', 'PARTIAL', 'FAILED'].includes(job.status)) {
        throw new StorageAdminError('failed-precondition', 'This backup job is already settled.');
      }
      const nowMillis = Date.now();
      const shouldSkip = (item: ImageBackupJobItemRecord) => item.status === 'PENDING' || (
        ['COPYING', 'VERIFYING'].includes(item.status) &&
        (item.leaseExpiresAt?.toMillis() || 0) <= nowMillis
      );
      const skippedItems = items.filter(shouldSkip);
      if (job.cancelRequested && skippedItems.length === 0) return;
      let nextJob: ImageBackupJobRecord = {
        ...job,
        cancelRequested: true,
        discoveryStatus: job.jobType === 'BACKFILL' ? 'CANCELLED' : job.discoveryStatus,
        discoveryLeaseOwner: undefined,
        discoveryLeaseExpiresAt: undefined,
      };
      for (const item of items) {
        if (shouldSkip(item)) {
          transaction.update(this.itemRef(jobId, item.imageId), {
            status: 'SKIPPED',
            errorCode: 'JOB_CANCELLED',
            errorMessage: item.status === 'PENDING'
              ? 'Backup job was cancelled before this item started.'
              : 'Backup job was cancelled after this item lease expired.',
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            leaseOwner: FieldValue.delete(),
            leaseExpiresAt: FieldValue.delete(),
          });
          nextJob = transitionCounts(nextJob, item.status, 'SKIPPED');
        }
      }
      nextJob.status = progressStatus(nextJob, nextJob);
      transaction.update(jobSnapshot.ref, {
        cancelRequested: true,
        discoveryStatus: nextJob.discoveryStatus,
        discoveryLeaseOwner: FieldValue.delete(),
        discoveryLeaseExpiresAt: FieldValue.delete(),
        ...jobProgressUpdate(nextJob),
      });
      addWorkflowAudit(this.db, transaction, actor, {
        action: job.cancelRequested ? 'BACKUP_JOB_CANCEL_RECONCILED' : 'BACKUP_JOB_CANCELLED',
        targetType: 'IMAGE_BACKUP_JOB',
        targetId: jobId,
        targetState: nextJob.status,
        extra: { skippedItems: skippedItems.length },
      });
      if (job.jobType === 'BACKFILL') {
        addWorkflowAudit(this.db, transaction, actor, {
          action: 'BACKUP_BACKFILL_CANCELLED',
          targetType: 'IMAGE_BACKUP_JOB',
          targetId: jobId,
          targetState: nextJob.status,
          extra: { policyId: job.policyId || '' },
        });
      }
    });
  }

  async retryItem(jobId: string, imageId: string, actor: WorkflowActor): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const [jobSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(this.jobRef(jobId)),
        transaction.get(this.itemRef(jobId, imageId)),
      ]);
      if (!jobSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job item was not found.');
      const job = parseJob(jobId, jobSnapshot.data() || {});
      if (!itemSnapshot.exists) throw new StorageAdminError('not-found', 'Backup job item was not found.');
      const item = parseItem(imageId, itemSnapshot.data() || {});
      if (job.cancelRequested) throw new StorageAdminError('failed-precondition', 'A cancelled backup job cannot be retried.');
      if (item.status !== 'FAILED') throw new StorageAdminError('failed-precondition', 'Only failed backup items can be retried.');
      if (!item.errorCode || !RETRYABLE_ERROR_CODES.has(item.errorCode)) {
        throw new StorageAdminError('failed-precondition', 'This backup failure is terminal; create a new job after resolving its cause.');
      }
      if (item.attemptCount >= MAX_ATTEMPTS) {
        throw new StorageAdminError('failed-precondition', 'Backup item reached the maximum attempt count.', { reason: 'MAX_ATTEMPTS_EXCEEDED' });
      }
      transaction.update(this.itemRef(jobId, imageId), {
        status: 'PENDING',
        errorCode: FieldValue.delete(),
        errorMessage: FieldValue.delete(),
        completedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const nextJob = transitionCounts(job, item.status, 'PENDING');
      transaction.update(jobSnapshot.ref, jobProgressUpdate(nextJob));
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'BACKUP_ITEM_RETRIED',
        targetType: 'IMAGE_BACKUP_ITEM',
        targetId: `${jobId}:${imageId}`,
        sourceState: 'FAILED',
        targetState: 'PENDING',
        extra: { jobId, imageId, attemptCount: item.attemptCount },
      });
    });
  }

  async getReplica(replicaId: string): Promise<ImageReplicaRecord> {
    const snapshot = await this.replicaRef(replicaId).get();
    if (!snapshot.exists) throw new StorageAdminError('not-found', 'Image replica was not found.');
    return parseReplica(replicaId, snapshot.data() || {});
  }

  async listReplicas(imageId?: string): Promise<ImageReplicaRecord[]> {
    const collection = this.db.collection(IMAGE_REPLICAS_COLLECTION);
    const snapshot = imageId
      ? await collection.where('imageId', '==', imageId).get()
      : await collection.orderBy('updatedAt', 'desc').limit(100).get();
    return snapshot.docs
      .map((document) => parseReplica(document.id, document.data()))
      .sort((left, right) => right.updatedAt.toMillis() - left.updatedAt.toMillis());
  }

  async listFailedItems(limit = 30): Promise<ImageBackupJobItemRecord[]> {
    const snapshot = await this.db.collectionGroup(IMAGE_BACKUP_ITEMS_COLLECTION)
      .where('status', '==', 'FAILED')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((document) => {
      const item = parseItem(document.id, document.data());
      const jobId = item.jobId || document.ref.parent.parent?.id;
      return { ...item, ...(jobId ? { jobId } : {}) };
    });
  }

  async updateReplicaVerification(
    replica: ImageReplicaRecord,
    result: { status: 'VERIFIED' | 'MISSING' | 'FAILED'; verification: 'VERIFIED' | 'UNVERIFIED' | 'MISMATCH'; sizeBytes?: number; sha256?: string; errorCode?: string },
    actor: WorkflowActor,
  ): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const reference = this.replicaRef(replica.replicaId);
      const [snapshot, canonicalSnapshot] = await Promise.all([
        transaction.get(reference),
        transaction.get(this.db.collection('image_registry').doc(replica.imageId)),
      ]);
      if (!snapshot.exists) throw new StorageAdminError('not-found', 'Image replica was not found.');
      const current = parseReplica(replica.replicaId, snapshot.data() || {});
      if (
        current.imageId !== replica.imageId || current.providerConfigId !== replica.providerConfigId ||
        current.providerType !== replica.providerType || current.objectKey !== replica.objectKey ||
        current.checksum.value !== replica.checksum.value
      ) {
        throw new StorageAdminError('aborted', 'Image replica changed during verification.', {
          reason: 'REPLICA_CHANGED',
        });
      }
      transaction.update(reference, {
        status: result.status,
        ...(['ACTIVE', 'DELETED'].includes(canonicalSnapshot.get('status'))
          ? { canonicalStatus: canonicalSnapshot.get('status') }
          : {}),
        checksum: {
          algorithm: 'SHA256',
          // The expected verified checksum is immutable across a failed check;
          // otherwise corrupt bytes could become the new truth on the next run.
          value: current.checksum.value,
          verification: result.verification,
        },
        ...(result.sizeBytes === undefined ? {} : { lastActualSizeBytes: result.sizeBytes }),
        ...(result.sha256 ? { lastActualSha256: result.sha256 } : {}),
        verifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.businessUserId,
        ...(result.errorCode
          ? { lastErrorCode: result.errorCode, lastErrorMessage: result.errorCode }
          : { lastErrorCode: FieldValue.delete(), lastErrorMessage: FieldValue.delete() }),
      });
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'IMAGE_REPLICA_VERIFIED',
        targetType: 'IMAGE_REPLICA',
        targetId: replica.replicaId,
        targetState: result.status,
        ...(result.errorCode ? { reason: result.errorCode } : {}),
      });
    });
  }

  async completeRestore(actor: WorkflowActor, image: CanonicalImageRecord): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const canonicalRef = this.db.collection('image_registry').doc(image.imageId);
      const snapshot = await transaction.get(canonicalRef);
      const current = snapshot.data() || {};
      if (
        !snapshot.exists || current.status !== 'ACTIVE' ||
        current.providerConfigId !== image.providerConfigId || current.providerType !== image.providerType ||
        current.objectKey !== image.objectKey || current.contentType !== image.contentType ||
        current.size !== image.sizeBytes
      ) {
        throw new StorageAdminError('failed-precondition', 'Canonical image changed during restore.', {
          reason: 'SOURCE_CHANGED',
        });
      }
      addWorkflowAudit(this.db, transaction, actor, {
        action: 'IMAGE_RESTORE_COMPLETED',
        targetType: 'IMAGE_RESTORE',
        targetId: image.imageId,
        targetState: 'COMPLETED',
      });
    });
  }

  async auditRestore(actor: WorkflowActor, action: string, imageId: string, state: string, reason?: string): Promise<void> {
    const batch = this.db.batch();
    addWorkflowAudit(this.db, batch, actor, {
      action,
      targetType: 'IMAGE_RESTORE',
      targetId: imageId,
      targetState: state,
      ...(reason ? { reason } : {}),
    });
    await batch.commit();
  }

}
