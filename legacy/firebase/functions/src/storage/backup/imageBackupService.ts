import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { requireWorkflowActor, WorkflowActor } from '../../workflows/workflowAuth';
import { StorageAdminError } from '../storageAdminError';
import { ServerStorageTransferProvider, StorageObjectProviderType } from '../types';
import { digestStream, hashingTransform, StreamDigest } from './checksumStream';
import { ImageBackupRepository } from './backupRepository';
import { parseCanonicalImage } from './canonicalImage';
import { StorageTransferProviderFactory } from './transferProviderFactory';
import {
  BackupOperationError,
  CanonicalImageRecord,
  ImageBackupJobItemRecord,
  ImageBackupJobRecord,
  ImageReplicaRecord,
  IntegrityResult,
} from './types';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_JOB_IMAGES = 20;

function normalizedContentType(value: string | undefined): string {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function objectRequest(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A backup request object is required.');
  }
  const data = value as Record<string, unknown>;
  const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
  if (unexpected) throw new StorageAdminError('invalid-argument', `Unexpected field: ${unexpected}.`);
  return data;
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new StorageAdminError('invalid-argument', `${field} is invalid.`);
  }
  return value;
}

function iso(value?: Timestamp): string | undefined {
  return value?.toDate().toISOString();
}

function serializeJob(job: ImageBackupJobRecord) {
  const {
    createdAt, updatedAt, startedAt, completedAt,
    discoveryLeaseOwner: _discoveryLeaseOwner,
    discoveryLeaseExpiresAt: _discoveryLeaseExpiresAt,
    ...safe
  } = job;
  return {
    ...safe,
    createdAt: createdAt.toDate().toISOString(),
    updatedAt: updatedAt.toDate().toISOString(),
    ...(startedAt ? { startedAt: startedAt.toDate().toISOString() } : {}),
    ...(completedAt ? { completedAt: completedAt.toDate().toISOString() } : {}),
  };
}

function serializeItem(item: ImageBackupJobItemRecord) {
  const { leaseOwner: _leaseOwner, leaseExpiresAt, startedAt, completedAt, updatedAt, ...safe } = item;
  return {
    ...safe,
    ...(leaseExpiresAt ? { leaseExpiresAt: iso(leaseExpiresAt) } : {}),
    ...(startedAt ? { startedAt: iso(startedAt) } : {}),
    ...(completedAt ? { completedAt: iso(completedAt) } : {}),
    updatedAt: iso(updatedAt),
  };
}

function serializeReplica(replica: ImageReplicaRecord) {
  const { createdAt, updatedAt, verifiedAt, ...safe } = replica;
  return {
    ...safe,
    createdAt: createdAt.toDate().toISOString(),
    updatedAt: updatedAt.toDate().toISOString(),
    ...(verifiedAt ? { verifiedAt: verifiedAt.toDate().toISOString() } : {}),
  };
}

function providerFailure(error: unknown): BackupOperationError {
  if (error instanceof BackupOperationError) return error;
  if (error instanceof StorageAdminError) {
    const reason = typeof error.details?.reason === 'string' ? error.details.reason : 'PROVIDER_INVALID_CONFIG';
    return new BackupOperationError(reason, error.message, error.code === 'unavailable');
  }
  const data = error as { name?: unknown; code?: unknown; $metadata?: { httpStatusCode?: number } };
  const name = String(data?.name || '');
  const code = String(data?.code || '');
  const numericCode = Number(data?.code);
  const status = data?.$metadata?.httpStatusCode;
  if (status === 404 || numericCode === 404 || numericCode === 5 || ['NoSuchKey', 'NotFound'].includes(name)) {
    return new BackupOperationError('SOURCE_NOT_FOUND', 'Source object was not found.');
  }
  if (status === 401 || status === 403 || numericCode === 401 || numericCode === 403 ||
      numericCode === 7 || numericCode === 16 ||
      ['AccessDenied', 'Forbidden'].includes(name)) {
    return new BackupOperationError('PERMISSION_DENIED', 'Storage provider denied the operation.');
  }
  if (status === 409 || status === 412 || numericCode === 409 || numericCode === 412) {
    return new BackupOperationError('DESTINATION_RACE', 'Destination changed while the item was running.', true);
  }
  if (status === 408 || status === 429 || numericCode === 408 || numericCode === 429 ||
      [4, 8, 10, 13, 14].includes(numericCode) ||
      (status !== undefined && status >= 500) || (Number.isInteger(numericCode) && numericCode >= 500) ||
      ['TimeoutError', 'NetworkingError', 'ServiceUnavailable', 'SlowDown', 'InternalError'].includes(name) ||
      ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)) {
    return new BackupOperationError('NETWORK_ERROR', 'Storage provider is temporarily unavailable.', true);
  }
  return new BackupOperationError('PROVIDER_ERROR', 'Storage provider operation failed.');
}

export class ImageBackupService {
  constructor(
    private readonly db: Firestore,
    private readonly providers: StorageTransferProviderFactory,
    private readonly repository: ImageBackupRepository,
  ) {}

  private requireDeveloper(firebaseUid: string | undefined): Promise<WorkflowActor> {
    return requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER']);
  }

  private async canonicalImage(imageId: string): Promise<CanonicalImageRecord> {
    const snapshot = await this.db.collection('image_registry').doc(imageId).get();
    if (!snapshot.exists) throw new StorageAdminError('not-found', 'Canonical image was not found.', { reason: 'SOURCE_NOT_FOUND' });
    return parseCanonicalImage(imageId, snapshot.data() || {});
  }

  async createJob(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['imageIds', 'targetProviderConfigId']);
    if (!Array.isArray(data.imageIds) || data.imageIds.length < 1 || data.imageIds.length > MAX_JOB_IMAGES) {
      throw new StorageAdminError('invalid-argument', `Select between 1 and ${MAX_JOB_IMAGES} images.`);
    }
    const imageIds = [...new Set(data.imageIds.map((value) => requiredId(value, 'imageId')))];
    if (imageIds.length !== data.imageIds.length) {
      throw new StorageAdminError('invalid-argument', 'Duplicate image IDs are not allowed.');
    }
    const targetProviderConfigId = requiredId(data.targetProviderConfigId, 'targetProviderConfigId');
    const targetProvider = await this.providers.resolve(targetProviderConfigId, { forNewBackup: true });
    const images = await Promise.all(imageIds.map((imageId) => this.canonicalImage(imageId)));
    if (images.some((image) => image.status !== 'ACTIVE')) {
      throw new StorageAdminError('failed-precondition', 'Only ACTIVE canonical images can be backed up.');
    }
    const sourceProviderConfigId = images[0].providerConfigId;
    if (images.some((image) => image.providerConfigId !== sourceProviderConfigId)) {
      throw new StorageAdminError('invalid-argument', 'A backup job must use one canonical source provider.');
    }
    if (sourceProviderConfigId === targetProviderConfigId) {
      throw new StorageAdminError('invalid-argument', 'Backup source and target providers must be different.');
    }
    const jobId = randomUUID();
    await this.repository.createJob(jobId, images, {
      providerConfigId: targetProvider.providerConfigId,
      providerType: targetProvider.providerType,
    }, actor);
    return this.getJobForActor(jobId);
  }

  async getJob(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['jobId']);
    return this.getJobForActor(requiredId(data.jobId, 'jobId'));
  }

  async listJobs(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    objectRequest(request ?? {}, []);
    return { jobs: (await this.repository.listJobs()).map(serializeJob) };
  }

  async runStep(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['jobId']);
    const jobId = requiredId(data.jobId, 'jobId');
    const job = await this.repository.getJobRecord(jobId);
    if (job.jobType !== 'MANUAL') {
      throw new StorageAdminError('failed-precondition', 'Automatic and backfill jobs are processed only by background workers.');
    }
    const leaseOwner = randomUUID();
    const item = await this.repository.claim(jobId, leaseOwner, actor);
    if (!item) return { processed: false, ...(await this.getJobForActor(jobId)) };
    try {
      const result = await this.backupItem(item, jobId, leaseOwner);
      await this.repository.complete(jobId, item, leaseOwner, result, actor);
    } catch (error) {
      const failure = providerFailure(error);
      await this.repository.fail(jobId, item, leaseOwner, failure.errorCode, failure.message, failure.retryable, actor);
    }
    return { processed: true, ...(await this.getJobForActor(jobId)) };
  }

  async processBackgroundItem(
    jobId: string,
    imageId: string,
    leaseOwner: string,
    actor: WorkflowActor,
  ): Promise<'PROCESSED' | 'BUSY' | 'DONE'> {
    const claim = await this.repository.claimSpecific(jobId, imageId, leaseOwner, actor);
    if (claim.state !== 'CLAIMED') return claim.state;
    try {
      const result = await this.backupItem(claim.item, jobId, leaseOwner);
      await this.repository.complete(jobId, claim.item, leaseOwner, result, actor);
    } catch (error) {
      const failure = providerFailure(error);
      await this.repository.fail(
        jobId,
        claim.item,
        leaseOwner,
        failure.errorCode,
        failure.message,
        failure.retryable,
        actor,
      );
    }
    return 'PROCESSED';
  }

  async retryItem(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['jobId', 'imageId']);
    const jobId = requiredId(data.jobId, 'jobId');
    await this.repository.retryItem(jobId, requiredId(data.imageId, 'imageId'), actor);
    return this.getJobForActor(jobId);
  }

  async cancelJob(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['jobId']);
    const jobId = requiredId(data.jobId, 'jobId');
    await this.repository.cancel(jobId, actor);
    return this.getJobForActor(jobId);
  }

  async listReplicas(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request ?? {}, ['imageId']);
    const imageId = data.imageId === undefined ? undefined : requiredId(data.imageId, 'imageId');
    return { replicas: (await this.repository.listReplicas(imageId)).map(serializeReplica) };
  }

  async verifyReplica(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['replicaId']);
    const replica = await this.repository.getReplica(requiredId(data.replicaId, 'replicaId'));
    const provider = await this.providers.resolve(replica.providerConfigId, { forNewBackup: false });
    if (provider.providerType !== replica.providerType) {
      throw new StorageAdminError('failed-precondition', 'Replica provider identity is inconsistent.', {
        reason: 'PROVIDER_INVALID_CONFIG',
      });
    }
    const result = await this.verifyObject(provider, replica.objectKey, replica.sizeBytes, replica.checksum.value);
    if (result.status === 'HEALTHY') {
      await this.repository.updateReplicaVerification(replica, {
        status: 'VERIFIED', verification: 'VERIFIED', sizeBytes: result.sizeBytes, sha256: result.sha256,
      }, actor);
    } else {
      await this.repository.updateReplicaVerification(replica, {
        status: result.status === 'MISSING' ? 'MISSING' : 'FAILED',
        verification: result.status === 'PROVIDER_ERROR' ? 'UNVERIFIED' : 'MISMATCH',
        ...(result.sizeBytes === undefined ? {} : { sizeBytes: result.sizeBytes }),
        ...(result.sha256 ? { sha256: result.sha256 } : {}),
        errorCode: result.status,
      }, actor);
    }
    return { replicaId: replica.replicaId, result };
  }

  async verifyCanonical(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['imageId']);
    const image = await this.canonicalImage(requiredId(data.imageId, 'imageId'));
    const provider = await this.providers.resolve(image.providerConfigId, { forNewBackup: false });
    if (provider.providerType !== image.providerType) {
      throw new StorageAdminError('failed-precondition', 'Canonical provider identity is inconsistent.', {
        reason: 'PROVIDER_INVALID_CONFIG',
      });
    }
    const trustedChecksum = image.checksumStatus === 'SERVER_VERIFIED' ? image.sha256 : undefined;
    return {
      imageId: image.imageId,
      result: await this.verifyObject(provider, image.objectKey, image.sizeBytes, trustedChecksum),
      checksumProvenance: trustedChecksum ? 'SERVER_VERIFIED' : 'COMPUTED_FOR_THIS_CHECK',
    };
  }

  async restore(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = objectRequest(request, ['imageId', 'replicaId', 'confirmation']);
    const imageId = requiredId(data.imageId, 'imageId');
    const replicaId = requiredId(data.replicaId, 'replicaId');
    if (data.confirmation !== `RESTORE ${imageId}`) {
      throw new StorageAdminError('invalid-argument', `Type RESTORE ${imageId} to confirm.`);
    }
    const [image, replica] = await Promise.all([
      this.canonicalImage(imageId),
      this.repository.getReplica(replicaId),
    ]);
    if (image.status !== 'ACTIVE' || replica.imageId !== imageId ||
        replica.status !== 'VERIFIED' || replica.checksum.verification !== 'VERIFIED' ||
        replica.objectKey !== image.objectKey || replica.sizeBytes !== image.sizeBytes ||
        normalizedContentType(replica.contentType) !== normalizedContentType(image.contentType)) {
      throw new StorageAdminError('failed-precondition', 'Only a VERIFIED replica of this ACTIVE image can be restored.', {
        reason: 'REPLICA_NOT_VERIFIED',
      });
    }
    await this.repository.auditRestore(actor, 'IMAGE_RESTORE_STARTED', imageId, 'RUNNING');
    try {
      const source = await this.providers.resolve(replica.providerConfigId, { forNewBackup: false });
      const destination = await this.providers.resolve(image.providerConfigId, { forNewBackup: false });
      if (source.providerType !== replica.providerType || destination.providerType !== image.providerType) {
        throw new BackupOperationError('PROVIDER_INVALID_CONFIG', 'Resolved provider identity is inconsistent.');
      }
      const sourceCheck = await this.verifyObject(source, replica.objectKey, replica.sizeBytes, replica.checksum.value);
      if (sourceCheck.status !== 'HEALTHY') {
        await this.repository.updateReplicaVerification(replica, {
          status: sourceCheck.status === 'MISSING' ? 'MISSING' : 'FAILED',
          verification: sourceCheck.status === 'PROVIDER_ERROR' ? 'UNVERIFIED' : 'MISMATCH',
          ...(sourceCheck.sizeBytes === undefined ? {} : { sizeBytes: sourceCheck.sizeBytes }),
          ...(sourceCheck.sha256 ? { sha256: sourceCheck.sha256 } : {}),
          errorCode: sourceCheck.status,
        }, actor);
        throw new BackupOperationError('REPLICA_NOT_VERIFIED', 'Replica integrity check failed before restore.');
      }
      const replicaMetadata = await source.head(replica.objectKey);
      if (!replicaMetadata) {
        await this.repository.updateReplicaVerification(replica, {
          status: 'MISSING',
          verification: 'MISMATCH',
          errorCode: 'MISSING',
        }, actor);
        throw new BackupOperationError('SOURCE_METADATA_MISMATCH', 'Replica metadata is invalid for restore.');
      }
      if (normalizedContentType(replicaMetadata.contentType) !== normalizedContentType(replica.contentType)) {
        await this.repository.updateReplicaVerification(replica, {
          status: 'FAILED',
          verification: 'VERIFIED',
          sizeBytes: sourceCheck.sizeBytes,
          sha256: sourceCheck.sha256,
          errorCode: 'SOURCE_METADATA_MISMATCH',
        }, actor);
        throw new BackupOperationError('SOURCE_METADATA_MISMATCH', 'Replica metadata is invalid for restore.');
      }
      if (await destination.head(image.objectKey)) {
        throw new BackupOperationError('DESTINATION_EXISTS', 'Canonical destination already exists.');
      }
      const copied = await this.transfer(source, replica.objectKey, destination, image.objectKey, image.contentType, image.sizeBytes, {
        ...replicaMetadata.metadata,
        'restore-image-id': imageId,
        'restore-replica-id': replicaId,
      });
      if (copied.sizeBytes !== replica.sizeBytes || copied.sha256 !== replica.checksum.value) {
        await this.repository.updateReplicaVerification(replica, {
          status: 'FAILED',
          verification: 'MISMATCH',
          sizeBytes: copied.sizeBytes,
          sha256: copied.sha256,
          errorCode: 'SOURCE_CHECKSUM_MISMATCH',
        }, actor);
        throw new BackupOperationError('SOURCE_CHECKSUM_MISMATCH', 'Replica changed during restore.');
      }
      const restored = await this.verifyObject(destination, image.objectKey, replica.sizeBytes, replica.checksum.value);
      const restoredMetadata = await destination.head(image.objectKey);
      if (restored.status !== 'HEALTHY') {
        throw new BackupOperationError(restored.status, 'Restored canonical object failed integrity verification.');
      }
      if (!restoredMetadata || normalizedContentType(restoredMetadata.contentType) !== normalizedContentType(image.contentType)) {
        throw new BackupOperationError('DESTINATION_CHECKSUM_MISMATCH', 'Restored canonical object metadata is invalid.');
      }
      await this.repository.completeRestore(actor, image);
      return { imageId, replicaId, status: 'COMPLETED', result: restored };
    } catch (error) {
      const failure = providerFailure(error);
      const errorCode = failure.errorCode === 'DESTINATION_RACE' ? 'DESTINATION_EXISTS' : failure.errorCode;
      await this.repository.auditRestore(actor, 'IMAGE_RESTORE_FAILED', imageId, 'FAILED', errorCode);
      throw new StorageAdminError(failure.retryable ? 'unavailable' : 'failed-precondition', failure.message, { reason: errorCode });
    }
  }

  private async getJobForActor(jobId: string) {
    const result = await this.repository.getJob(jobId);
    return { job: serializeJob(result.job), items: result.items.map(serializeItem) };
  }

  private async backupItem(item: ImageBackupJobItemRecord, jobId: string, leaseOwner: string): Promise<StreamDigest> {
    const image = await this.canonicalImage(item.imageId);
    if (
      image.status !== 'ACTIVE' || image.providerConfigId !== item.sourceProviderConfigId ||
      image.providerType !== item.sourceProviderType || image.objectKey !== item.sourceObjectKey ||
      item.targetObjectKey !== image.objectKey || image.sizeBytes !== item.expectedSizeBytes
    ) {
      throw new BackupOperationError('SOURCE_CHANGED', 'Canonical source metadata changed after the job was created.');
    }
    const source = await this.providers.resolve(item.sourceProviderConfigId, { forNewBackup: false });
    const destination = await this.providers.resolve(item.targetProviderConfigId, { forNewBackup: true });
    if (source.providerType !== item.sourceProviderType || destination.providerType !== item.targetProviderType) {
      throw new BackupOperationError('PROVIDER_INVALID_CONFIG', 'Resolved provider type does not match the backup job.');
    }
    const sourceMetadata = await source.head(item.sourceObjectKey);
    if (!sourceMetadata) throw new BackupOperationError('SOURCE_NOT_FOUND', 'Source object was not found.');
    if (sourceMetadata.size !== item.expectedSizeBytes) {
      throw new BackupOperationError('SIZE_MISMATCH', 'Source object size does not match Image Registry.');
    }
    if (normalizedContentType(sourceMetadata.contentType) !== normalizedContentType(item.contentType)) {
      throw new BackupOperationError('SOURCE_METADATA_MISMATCH', 'Source content type does not match Image Registry.');
    }
    const sourceDigest = await digestStream(await source.createReadStream(item.sourceObjectKey));
    if (sourceDigest.sizeBytes !== item.expectedSizeBytes) {
      throw new BackupOperationError('SIZE_MISMATCH', 'Source bytes do not match Image Registry size.');
    }
    if (item.expectedSha256 && sourceDigest.sha256 !== item.expectedSha256) {
      throw new BackupOperationError('SOURCE_CHECKSUM_MISMATCH', 'Source bytes do not match the server-verified checksum.');
    }
    const existing = await destination.head(item.targetObjectKey);
    if (existing) {
      if (normalizedContentType(existing.contentType) !== normalizedContentType(item.contentType)) {
        throw new BackupOperationError('DESTINATION_CHECKSUM_MISMATCH', 'Destination object exists with different metadata.');
      }
      const destinationDigest = await digestStream(await destination.createReadStream(item.targetObjectKey));
      if (destinationDigest.sizeBytes !== sourceDigest.sizeBytes || destinationDigest.sha256 !== sourceDigest.sha256) {
        throw new BackupOperationError('DESTINATION_CHECKSUM_MISMATCH', 'Destination object exists with different bytes.');
      }
      await this.repository.markVerifying(jobId, item.imageId, leaseOwner);
      return destinationDigest;
    }
    const copied = await this.transfer(
      source,
      item.sourceObjectKey,
      destination,
      item.targetObjectKey,
      item.contentType,
      item.expectedSizeBytes,
      {
        ...sourceMetadata.metadata,
        'backup-image-id': item.imageId,
        'backup-source-provider': item.sourceProviderConfigId,
      },
    );
    await this.repository.markVerifying(jobId, item.imageId, leaseOwner);
    if (copied.sizeBytes !== sourceDigest.sizeBytes || copied.sha256 !== sourceDigest.sha256) {
      throw new BackupOperationError('SOURCE_CHECKSUM_MISMATCH', 'Source changed while the backup was transferred.');
    }
    const published = await destination.head(item.targetObjectKey);
    if (!published || normalizedContentType(published.contentType) !== normalizedContentType(item.contentType)) {
      throw new BackupOperationError('DESTINATION_CHECKSUM_MISMATCH', 'Destination object metadata verification failed.');
    }
    const destinationDigest = await digestStream(await destination.createReadStream(item.targetObjectKey));
    if (destinationDigest.sizeBytes !== sourceDigest.sizeBytes || destinationDigest.sha256 !== sourceDigest.sha256) {
      throw new BackupOperationError('DESTINATION_CHECKSUM_MISMATCH', 'Destination verification did not match source bytes.');
    }
    return destinationDigest;
  }

  private async transfer(
    source: ServerStorageTransferProvider,
    sourceObjectKey: string,
    destination: ServerStorageTransferProvider,
    destinationObjectKey: string,
    contentType: string,
    size: number,
    metadata: Record<string, string>,
  ): Promise<StreamDigest> {
    const sourceStream = await source.createReadStream(sourceObjectKey);
    const hashing = hashingTransform();
    const pumping = pipeline(sourceStream, hashing.stream);
    try {
      await Promise.all([
        pumping,
        destination.writeFromStream({
          objectKey: destinationObjectKey,
          body: hashing.stream,
          contentType,
          size,
          metadata,
          ifAbsent: true,
        }),
      ]);
      return hashing.digest();
    } catch (error) {
      sourceStream.destroy();
      hashing.stream.destroy();
      throw error;
    }
  }

  private async verifyObject(
    provider: ServerStorageTransferProvider,
    objectKey: string,
    expectedSize: number,
    expectedSha256?: string,
  ): Promise<IntegrityResult> {
    const verifiedAt = new Date().toISOString();
    try {
      const metadata = await provider.head(objectKey);
      if (!metadata) return { status: 'MISSING', verifiedAt };
      const digest = await digestStream(await provider.createReadStream(objectKey));
      if (metadata.size !== expectedSize || digest.sizeBytes !== expectedSize) {
        return { status: 'SIZE_MISMATCH', sizeBytes: digest.sizeBytes, sha256: digest.sha256, verifiedAt };
      }
      if (expectedSha256 && digest.sha256 !== expectedSha256) {
        return { status: 'CHECKSUM_MISMATCH', sizeBytes: digest.sizeBytes, sha256: digest.sha256, verifiedAt };
      }
      return { status: 'HEALTHY', sizeBytes: digest.sizeBytes, sha256: digest.sha256, verifiedAt };
    } catch {
      return { status: 'PROVIDER_ERROR', verifiedAt };
    }
  }
}
