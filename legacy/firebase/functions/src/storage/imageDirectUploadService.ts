import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { USER_ROLES } from '../types';
import { requireWorkflowActor, WorkflowActor } from '../workflows/workflowAuth';
import {
  assertImageUploadAccess,
  DIRECT_UPLOAD_OPERATION_TTL_SECONDS,
  DIRECT_UPLOAD_URL_TTL_SECONDS,
  directUploadObjectKey,
  directUploadOperationId,
  directUploadRequestFingerprint,
  directUploadStagingObjectKey,
  validatePrepareImageUpload,
} from './imageUploadPolicy';
import { BackendStorageProviderFactory } from './providerFactory';
import { StorageRuntimeService } from './storageRuntimeService';
import { StorageAdminError } from './storageAdminError';
import { ServerStorageObjectMetadata, ServerStorageProvider } from './types';
import {
  NewStorageUploadOperation,
  StorageUploadFailureCode,
  StorageUploadOperationRecord,
  StorageUploadOperationRepository,
} from './uploadOperationRepository';

type ChecksumStatus = 'NOT_PROVIDED' | 'CLIENT_REPORTED' | 'SERVER_VERIFIED';
const FINALIZE_LOCK_TTL_MS = 2 * 60 * 1000;

export interface FinalizedDirectImage {
  imageId: string;
  providerType: 'R2';
  providerConfigId: string;
  objectKey: string;
  originalFileName: string;
  contentType: string;
  size: number;
  sha256?: string;
  checksumStatus: ChecksumStatus;
  createdAt: string;
  createdBy: string;
  status: 'ACTIVE';
  entityType: string;
  entityId: string;
  parentEntityId?: string;
}

function operationCandidate(operation: StorageUploadOperationRecord): NewStorageUploadOperation {
  return {
    operationId: operation.operationId,
    imageId: operation.imageId,
    requestFingerprint: operation.requestFingerprint,
    actorBusinessUserId: operation.actorBusinessUserId,
    actorRole: operation.actorRole,
    relationship: operation.relationship,
    provider: operation.provider,
    uploadObjectKey: operation.uploadObjectKey,
    objectKey: operation.objectKey,
    originalFileName: operation.originalFileName,
    contentType: operation.contentType,
    expectedSize: operation.expectedSize,
    ...(operation.clientReportedSha256 ? { clientReportedSha256: operation.clientReportedSha256 } : {}),
  };
}

function metadataFor(operation: Pick<StorageUploadOperationRecord, 'operationId' | 'imageId' | 'expectedSize' | 'clientReportedSha256'>): Record<string, string> {
  return {
    'operation-id': operation.operationId,
    'image-id': operation.imageId,
    'expected-size': String(operation.expectedSize),
    ...(operation.clientReportedSha256 ? { 'client-sha256': operation.clientReportedSha256 } : {}),
  };
}

function normalizeContentType(value: string | undefined): string {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function providerChecksumHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.length === 32 ? bytes.toString('hex') : undefined;
  } catch {
    return undefined;
  }
}

function validateFinalizeRequest(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A finalize request object is required.', { reason: 'INVALID_INPUT' });
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== 'operationId')) {
    throw new StorageAdminError('invalid-argument', 'Finalize request contains an unsupported field.', { reason: 'INVALID_INPUT' });
  }
  if (typeof data.operationId !== 'string' || !/^[a-f0-9]{64}$/.test(data.operationId)) {
    throw new StorageAdminError('invalid-argument', 'Upload operation ID is invalid.', { reason: 'INVALID_INPUT' });
  }
  return data.operationId;
}

export class ImageDirectUploadService {
  constructor(
    private readonly db: Firestore,
    private readonly providers: BackendStorageProviderFactory,
    private readonly operations: StorageUploadOperationRepository,
    private readonly runtime: StorageRuntimeService,
  ) {}

  private requireActor(firebaseUid: string | undefined): Promise<WorkflowActor> {
    return requireWorkflowActor(this.db, firebaseUid, USER_ROLES);
  }

  private assertOperationOwner(actor: WorkflowActor, operation: StorageUploadOperationRecord): void {
    if (operation.actorBusinessUserId !== actor.businessUserId) {
      throw new StorageAdminError('not-found', 'Upload operation was not found.', { reason: 'UPLOAD_OPERATION_NOT_FOUND' });
    }
    assertImageUploadAccess(actor, operation.relationship);
  }

  private expiresAt(): Timestamp {
    return Timestamp.fromMillis(Date.now() + DIRECT_UPLOAD_OPERATION_TTL_SECONDS * 1000);
  }

  async prepare(firebaseUid: string | undefined, request: unknown): Promise<{
    transport: 'R2' | 'FIREBASE_STORAGE';
    providerConfigId: string;
    operationId: string;
    imageId: string;
    objectKey: string;
    status: 'READY' | 'PENDING' | 'FINALIZED';
    operationExpiresAt?: string;
    upload?: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
    image?: FinalizedDirectImage;
  }> {
    const actor = await this.requireActor(firebaseUid);
    const input = validatePrepareImageUpload(request);
    assertImageUploadAccess(actor, input.relationship);
    const operationId = directUploadOperationId(actor.businessUserId, input.idempotencyKey);
    const requestFingerprint = directUploadRequestFingerprint(input);
    const existing = await this.operations.get(operationId);

    let provider: ServerStorageProvider | undefined;
    let operation: StorageUploadOperationRecord | undefined;
    if (existing) {
      this.assertOperationOwner(actor, existing);
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new StorageAdminError('already-exists', 'Idempotency key is already associated with different image metadata.', { reason: 'INVALID_INPUT' });
      }
      if (existing.status === 'FINALIZED') {
        return {
          transport: 'R2',
          providerConfigId: existing.provider.providerConfigId,
          operationId,
          imageId: existing.imageId,
          objectKey: existing.objectKey,
          status: 'FINALIZED',
          operationExpiresAt: existing.expiresAt.toDate().toISOString(),
          image: await this.readFinalizedImage(existing),
        };
      }
      // Existing operations never switch providers. Disabled providers may be
      // finalized, but cannot receive a fresh PUT authorization.
      operation = await this.operations.createOrRenew(operationCandidate(existing), this.expiresAt());
      provider = await this.providers.resolvePinned(existing.provider, { requireCurrentlyEnabled: true });
    } else {
      // Firebase uploads do not need a server upload-operation document. Their
      // deterministic imageId is the operation hash, so a retry remains pinned
      // to Firebase even if runtime strategy changed after the first success.
      const firebaseRegistry = await this.db.collection('image_registry').doc(operationId).get();
      if (firebaseRegistry.exists) {
        const data = firebaseRegistry.data() || {};
        const expectedObjectKey = directUploadObjectKey(input.relationship, operationId, input.contentType);
        const relationshipMatches = data.entityType === input.relationship.entityType &&
          data.entityId === input.relationship.entityId &&
          (data.parentEntityId || undefined) === (input.relationship.parentEntityId || undefined);
        if (
          data.imageId !== operationId || data.providerType !== 'FIREBASE_STORAGE' ||
          data.providerConfigId !== 'firebase-primary' || data.objectKey !== expectedObjectKey ||
          data.status !== 'ACTIVE' || data.createdBy !== actor.businessUserId ||
          data.contentType !== input.contentType || data.size !== input.size ||
          (input.clientReportedSha256 && data.sha256 !== input.clientReportedSha256) ||
          !relationshipMatches
        ) {
          throw new StorageAdminError('already-exists', 'Idempotency key is already associated with different image metadata.', { reason: 'INVALID_INPUT' });
        }
        return {
          transport: 'FIREBASE_STORAGE',
          providerConfigId: 'firebase-primary',
          operationId,
          imageId: operationId,
          objectKey: expectedObjectKey,
          status: 'READY',
        };
      }
      const plan = await this.runtime.planForNewUpload();
      const imageId = randomUUID();
      for (const selected of plan.r2Candidates) {
        if (!selected.credentialSecretRef) continue;
        const candidate: NewStorageUploadOperation = {
          operationId,
          imageId,
          requestFingerprint,
          actorBusinessUserId: actor.businessUserId,
          actorRole: actor.role,
          relationship: input.relationship,
          provider: {
            providerConfigId: selected.providerConfigId,
            providerType: 'R2',
            bucket: selected.bucket,
            endpoint: selected.endpoint,
            credentialSecretRef: selected.credentialSecretRef,
          },
          uploadObjectKey: directUploadStagingObjectKey(operationId, imageId, input.contentType),
          objectKey: directUploadObjectKey(input.relationship, imageId, input.contentType),
          originalFileName: input.originalFileName,
          contentType: input.contentType,
          expectedSize: input.size,
          ...(input.clientReportedSha256 ? { clientReportedSha256: input.clientReportedSha256 } : {}),
        };
        let candidateProvider: ServerStorageProvider;
        let candidateUpload: Awaited<ReturnType<ServerStorageProvider['createUploadAuthorization']>>;
        try {
          // Authorization is created before the operation is committed. This is
          // the only point where AUTOMATIC may advance to the next provider.
          candidateProvider = await this.providers.resolvePinned(candidate.provider, { requireCurrentlyEnabled: true });
          candidateUpload = await candidateProvider.createUploadAuthorization({
            objectKey: candidate.uploadObjectKey,
            contentType: candidate.contentType,
            metadata: metadataFor(candidate),
            expiresInSeconds: DIRECT_UPLOAD_URL_TTL_SECONDS,
          });
        } catch {
          logger.warn('Storage runtime skipped a provider before issuing an upload operation', {
            providerConfigId: selected.providerConfigId,
            providerType: selected.providerType,
            strategy: plan.strategy,
            operation: 'PRESIGN_PUT',
          });
          if (plan.strategy === 'MANUAL') break;
          continue;
        }
        operation = await this.operations.createOrRenew(candidate, this.expiresAt());
        if (operation.status === 'FINALIZED') {
          return {
            transport: 'R2',
            providerConfigId: operation.provider.providerConfigId,
            operationId,
            imageId: operation.imageId,
            objectKey: operation.objectKey,
            status: 'FINALIZED',
            operationExpiresAt: operation.expiresAt.toDate().toISOString(),
            image: await this.readFinalizedImage(operation),
          };
        }
        // A concurrent request may have committed the same idempotency key.
        // Its provider pin wins; never redirect that operation.
        if (operation.provider.providerConfigId !== candidate.provider.providerConfigId) {
          provider = await this.providers.resolvePinned(operation.provider, { requireCurrentlyEnabled: true });
          break;
        }
        return {
          transport: 'R2',
          providerConfigId: operation.provider.providerConfigId,
          operationId,
          imageId: operation.imageId,
          objectKey: operation.objectKey,
          status: 'PENDING',
          operationExpiresAt: operation.expiresAt.toDate().toISOString(),
          upload: candidateUpload,
        };
      }
      if (!operation && plan.allowFirebase) {
        const firebaseImageId = operationId;
        return {
          transport: 'FIREBASE_STORAGE',
          providerConfigId: 'firebase-primary',
          operationId,
          imageId: firebaseImageId,
          objectKey: directUploadObjectKey(input.relationship, firebaseImageId, input.contentType),
          status: 'READY',
        };
      }
      if (!operation) {
        throw new StorageAdminError('unavailable', 'No eligible storage provider could issue an image upload.', { reason: 'PROVIDER_UNAVAILABLE' });
      }
    }

    if (!operation || !provider) {
      throw new StorageAdminError('unavailable', 'The pinned storage provider is unavailable.', { reason: 'PROVIDER_UNAVAILABLE' });
    }
    if (operation.status === 'FINALIZED') {
      return {
        transport: 'R2',
        providerConfigId: operation.provider.providerConfigId,
        operationId,
        imageId: operation.imageId,
        objectKey: operation.objectKey,
        status: 'FINALIZED',
        operationExpiresAt: operation.expiresAt.toDate().toISOString(),
        image: await this.readFinalizedImage(operation),
      };
    }
    if (operation.status === 'FINALIZING') {
      throw new StorageAdminError('aborted', 'Image upload is currently being finalized.', { reason: 'FINALIZE_IN_PROGRESS' });
    }

    try {
      const upload = await provider.createUploadAuthorization({
        objectKey: operation.uploadObjectKey,
        contentType: operation.contentType,
        metadata: metadataFor(operation),
        expiresInSeconds: DIRECT_UPLOAD_URL_TTL_SECONDS,
      });
      return {
        transport: 'R2',
        providerConfigId: operation.provider.providerConfigId,
        operationId,
        imageId: operation.imageId,
        objectKey: operation.objectKey,
        status: 'PENDING',
        operationExpiresAt: operation.expiresAt.toDate().toISOString(),
        upload,
      };
    } catch (error) {
      await this.operations.markFailure(operation.operationId, 'AUTHORIZATION_FAILED');
      logger.error('Direct image upload authorization could not be created', {
        operationId: operation.operationId,
        providerConfigId: operation.provider.providerConfigId,
        providerType: operation.provider.providerType,
        operation: 'PRESIGN_PUT',
      });
      throw new StorageAdminError('unavailable', 'Image upload authorization could not be created.', { reason: 'PROVIDER_UNAVAILABLE' });
    }
  }

  async finalize(firebaseUid: string | undefined, request: unknown): Promise<{
    operationId: string;
    status: 'FINALIZED';
    image: FinalizedDirectImage;
  }> {
    const actor = await this.requireActor(firebaseUid);
    const operationId = validateFinalizeRequest(request);
    const operation = await this.operations.get(operationId);
    if (!operation) throw new StorageAdminError('not-found', 'Upload operation was not found.', { reason: 'UPLOAD_OPERATION_NOT_FOUND' });
    this.assertOperationOwner(actor, operation);
    const finalizeToken = randomUUID();
    const claim = await this.operations.claimFinalize(
      operationId,
      actor.businessUserId,
      finalizeToken,
      Timestamp.fromMillis(Date.now() + FINALIZE_LOCK_TTL_MS),
    );
    if (claim.result === 'ALREADY_FINALIZED') {
      const image = await this.readFinalizedImage(claim.operation);
      await this.cleanupStaging(claim.operation);
      return { operationId, status: 'FINALIZED', image };
    }
    if (claim.result === 'IN_PROGRESS') {
      throw new StorageAdminError('aborted', 'Image upload is already being finalized.', { reason: 'FINALIZE_IN_PROGRESS' });
    }
    if (claim.result === 'EXPIRED') {
      throw new StorageAdminError('deadline-exceeded', 'Upload operation has expired.', { reason: 'UPLOAD_EXPIRED' });
    }
    const claimedOperation = claim.operation;

    const stagingResolution = await (async (): Promise<{
      provider: ServerStorageProvider;
      uploadedObject: ServerStorageObjectMetadata | null;
    }> => {
      try {
        // Finalization uses the immutable provider snapshot and exact secret
        // version. A later config disable/update cannot redirect this operation.
        const provider = await this.providers.resolvePinned(claimedOperation.provider);
        const uploadedObject = await provider.head(claimedOperation.uploadObjectKey);
        return { provider, uploadedObject };
      } catch {
        return this.fail(operationId, 'FINALIZE_FAILED', 'unavailable', 'The uploaded object could not be verified.', 'FINALIZE_FAILED', finalizeToken);
      }
    })();
    const provider = stagingResolution.provider;
    if (!stagingResolution.uploadedObject) {
      return this.fail(operationId, 'OBJECT_NOT_FOUND', 'failed-precondition', 'Uploaded object was not found.', 'OBJECT_NOT_FOUND', finalizeToken);
    }
    const uploadedObject = stagingResolution.uploadedObject;
    if (uploadedObject.size !== claimedOperation.expectedSize) {
      return this.fail(operationId, 'SIZE_MISMATCH', 'failed-precondition', 'Uploaded object size does not match the authorization.', 'SIZE_MISMATCH', finalizeToken);
    }
    if (normalizeContentType(uploadedObject.contentType) !== claimedOperation.contentType) {
      return this.fail(operationId, 'CONTENT_TYPE_MISMATCH', 'failed-precondition', 'Uploaded object content type does not match the authorization.', 'CONTENT_TYPE_MISMATCH', finalizeToken);
    }
    const expectedMetadata = metadataFor(claimedOperation);
    const sourceEtag = uploadedObject.etag;
    if (Object.entries(expectedMetadata).some(([key, value]) => uploadedObject.metadata[key] !== value) || !sourceEtag) {
      return this.fail(operationId, 'METADATA_MISMATCH', 'failed-precondition', 'Uploaded object metadata does not match the authorization.', 'FINALIZE_FAILED', finalizeToken);
    }

    const providerSha256 = providerChecksumHex(uploadedObject.providerChecksumSha256);
    if (providerSha256 && claimedOperation.clientReportedSha256 && providerSha256 !== claimedOperation.clientReportedSha256) {
      return this.fail(operationId, 'CHECKSUM_MISMATCH', 'failed-precondition', 'Uploaded object checksum does not match the client report.', 'CHECKSUM_MISMATCH', finalizeToken);
    }
    const sha256 = providerSha256 || claimedOperation.clientReportedSha256;
    const checksumStatus: ChecksumStatus = providerSha256
      ? 'SERVER_VERIFIED'
      : claimedOperation.clientReportedSha256 ? 'CLIENT_REPORTED' : 'NOT_PROVIDED';

    const finalObjectResult = await (async (): Promise<ServerStorageObjectMetadata | null> => {
      try {
        // The browser can only overwrite the staging key. An ETag-conditional,
        // server-side copy publishes the validated bytes to the immutable key.
        await provider.copy({
          sourceObjectKey: claimedOperation.uploadObjectKey,
          destinationObjectKey: claimedOperation.objectKey,
          sourceEtag,
          contentType: claimedOperation.contentType,
          metadata: expectedMetadata,
        });
        const finalObject = await provider.head(claimedOperation.objectKey);
        return finalObject;
      } catch {
        return this.fail(operationId, 'FINALIZE_FAILED', 'unavailable', 'Uploaded object could not be published.', 'FINALIZE_FAILED', finalizeToken);
      }
    })();
    if (!finalObjectResult) {
      return this.fail(operationId, 'FINALIZE_FAILED', 'failed-precondition', 'Published object verification failed.', 'FINALIZE_FAILED', finalizeToken);
    }
    const finalObject = finalObjectResult;
    if (
      finalObject.size !== claimedOperation.expectedSize ||
      normalizeContentType(finalObject.contentType) !== claimedOperation.contentType ||
      Object.entries(expectedMetadata).some(([key, value]) => finalObject.metadata[key] !== value)
    ) {
      return this.fail(operationId, 'FINALIZE_FAILED', 'failed-precondition', 'Published object verification failed.', 'FINALIZE_FAILED', finalizeToken);
    }

    const createdAt = claimedOperation.createdAt.toDate().toISOString();
    const registryRecord: Record<string, unknown> = {
      imageId: claimedOperation.imageId,
      providerType: claimedOperation.provider.providerType,
      providerConfigId: claimedOperation.provider.providerConfigId,
      objectKey: claimedOperation.objectKey,
      originalFileName: claimedOperation.originalFileName,
      contentType: claimedOperation.contentType,
      size: finalObject.size,
      ...(sha256 ? { sha256 } : {}),
      checksumStatus,
      uploadOperationId: claimedOperation.operationId,
      createdAt,
      createdBy: claimedOperation.actorBusinessUserId,
      status: 'ACTIVE',
      ...claimedOperation.relationship,
    };
    const result = await this.operations.finalize(operationId, finalizeToken, registryRecord);
    if (result === 'EXPIRED') {
      throw new StorageAdminError('deadline-exceeded', 'Upload operation has expired.', { reason: 'UPLOAD_EXPIRED' });
    }
    await this.cleanupStaging(claimedOperation, provider);
    return { operationId, status: 'FINALIZED', image: await this.readFinalizedImage(claimedOperation) };
  }

  private async cleanupStaging(
    operation: StorageUploadOperationRecord,
    resolvedProvider?: ServerStorageProvider,
  ): Promise<void> {
    try {
      const provider = resolvedProvider || await this.providers.resolvePinned(operation.provider);
      await provider.delete(operation.uploadObjectKey);
    } catch {
      logger.warn('Finalized direct-upload staging object cleanup failed', {
        operationId: operation.operationId,
        providerConfigId: operation.provider.providerConfigId,
        providerType: operation.provider.providerType,
        operation: 'STAGING_CLEANUP',
      });
    }
  }

  private async fail(
    operationId: string,
    failureCode: StorageUploadFailureCode,
    code: 'failed-precondition' | 'unavailable',
    message: string,
    reason: string,
    finalizeToken?: string,
  ): Promise<never> {
    await this.operations.markFailure(operationId, failureCode, finalizeToken);
    throw new StorageAdminError(code, message, { reason });
  }

  private async readFinalizedImage(operation: StorageUploadOperationRecord): Promise<FinalizedDirectImage> {
    const snapshot = await this.db.collection('image_registry').doc(operation.imageId).get();
    if (!snapshot.exists) {
      throw new StorageAdminError('failed-precondition', 'Finalized image registry record is missing.', { reason: 'FINALIZE_FAILED' });
    }
    const data = snapshot.data() || {};
    const checksumStatuses: readonly ChecksumStatus[] = [
      'NOT_PROVIDED', 'CLIENT_REPORTED', 'SERVER_VERIFIED',
    ];
    if (
      data.imageId !== operation.imageId || data.providerType !== 'R2' ||
      data.providerConfigId !== operation.provider.providerConfigId || data.objectKey !== operation.objectKey ||
      data.status !== 'ACTIVE' || !Number.isInteger(data.size) || data.size <= 0 ||
      !checksumStatuses.includes(data.checksumStatus) ||
      typeof data.createdAt !== 'string' || typeof data.createdBy !== 'string' ||
      typeof data.entityType !== 'string' || typeof data.entityId !== 'string'
    ) {
      throw new StorageAdminError('failed-precondition', 'Finalized image registry record is invalid.', { reason: 'FINALIZE_FAILED' });
    }
    return {
      imageId: data.imageId,
      providerType: 'R2',
      providerConfigId: data.providerConfigId,
      objectKey: data.objectKey,
      originalFileName: String(data.originalFileName || operation.originalFileName),
      contentType: String(data.contentType || operation.contentType),
      size: Number(data.size),
      ...(typeof data.sha256 === 'string' ? { sha256: data.sha256 } : {}),
      checksumStatus: data.checksumStatus,
      createdAt: String(data.createdAt),
      createdBy: String(data.createdBy),
      status: 'ACTIVE',
      entityType: String(data.entityType),
      entityId: String(data.entityId),
      ...(typeof data.parentEntityId === 'string' ? { parentEntityId: data.parentEntityId } : {}),
    };
  }
}
