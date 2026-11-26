import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  DIRECT_IMAGE_UPLOAD_MAX_BYTES,
  DirectImageContentType,
  DirectImageRelationship,
} from './imageUploadPolicy';
import { StorageAdminError } from './storageAdminError';
import { PinnedR2ProviderConfig } from './types';

export const STORAGE_UPLOAD_OPERATION_COLLECTION = 'storage_upload_operations';

export type StorageUploadOperationStatus = 'PENDING' | 'FINALIZING' | 'FAILED' | 'EXPIRED' | 'FINALIZED';
export type StorageUploadFailureCode =
  | 'AUTHORIZATION_FAILED'
  | 'OBJECT_NOT_FOUND'
  | 'SIZE_MISMATCH'
  | 'CONTENT_TYPE_MISMATCH'
  | 'METADATA_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'FINALIZE_FAILED';

const OPERATION_STATUSES: readonly StorageUploadOperationStatus[] = [
  'PENDING', 'FINALIZING', 'FAILED', 'EXPIRED', 'FINALIZED',
];
const FAILURE_CODES: readonly StorageUploadFailureCode[] = [
  'AUTHORIZATION_FAILED', 'OBJECT_NOT_FOUND', 'SIZE_MISMATCH',
  'CONTENT_TYPE_MISMATCH', 'METADATA_MISMATCH', 'CHECKSUM_MISMATCH',
  'FINALIZE_FAILED',
];

export interface StorageUploadOperationRecord {
  operationId: string;
  imageId: string;
  requestFingerprint: string;
  actorBusinessUserId: string;
  actorRole: string;
  relationship: DirectImageRelationship;
  provider: PinnedR2ProviderConfig;
  uploadObjectKey: string;
  objectKey: string;
  originalFileName: string;
  contentType: DirectImageContentType;
  expectedSize: number;
  clientReportedSha256?: string;
  status: StorageUploadOperationStatus;
  failureCode?: StorageUploadFailureCode;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  finalizedAt?: Timestamp;
  finalizeToken?: string;
  finalizeLockExpiresAt?: Timestamp;
}

export type NewStorageUploadOperation = Omit<
  StorageUploadOperationRecord,
  'status' | 'failureCode' | 'expiresAt' | 'createdAt' | 'updatedAt' | 'finalizedAt' | 'finalizeToken' | 'finalizeLockExpiresAt'
>;

function parseRelationship(value: unknown): DirectImageRelationship {
  const data = value as Partial<DirectImageRelationship> | undefined;
  const entityTypes: readonly DirectImageRelationship['entityType'][] = [
    'PRODUCTION_ORDER_ITEM', 'SALES_ORDER_ITEM', 'USER_AVATAR', 'COMPANY_LOGO',
  ];
  if (
    !data || !entityTypes.includes(data.entityType as DirectImageRelationship['entityType']) ||
    typeof data.entityId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.entityId) ||
    (['PRODUCTION_ORDER_ITEM', 'SALES_ORDER_ITEM'].includes(String(data.entityType)) &&
      (typeof data.parentEntityId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.parentEntityId))) ||
    (!['PRODUCTION_ORDER_ITEM', 'SALES_ORDER_ITEM'].includes(String(data.entityType)) &&
      data.parentEntityId !== undefined) ||
    (data.entityType === 'COMPANY_LOGO' && data.entityId !== 'company')
  ) {
    throw new StorageAdminError('failed-precondition', 'Upload operation relationship is invalid.');
  }
  return {
    entityType: data.entityType as DirectImageRelationship['entityType'],
    entityId: data.entityId,
    ...(typeof data.parentEntityId === 'string' ? { parentEntityId: data.parentEntityId } : {}),
  };
}

function parseProvider(value: unknown): PinnedR2ProviderConfig {
  const data = value as Partial<PinnedR2ProviderConfig> | undefined;
  if (
    !data || data.providerType !== 'R2' || typeof data.providerConfigId !== 'string' ||
    typeof data.bucket !== 'string' || typeof data.endpoint !== 'string' ||
    typeof data.credentialSecretRef !== 'string'
  ) {
    throw new StorageAdminError('failed-precondition', 'Upload operation provider snapshot is invalid.');
  }
  return data as PinnedR2ProviderConfig;
}

function parseOperation(operationId: string, data: FirebaseFirestore.DocumentData): StorageUploadOperationRecord {
  if (
    data.operationId !== operationId || typeof data.imageId !== 'string' ||
    typeof data.requestFingerprint !== 'string' || typeof data.actorBusinessUserId !== 'string' ||
    typeof data.actorRole !== 'string' || typeof data.uploadObjectKey !== 'string' || typeof data.objectKey !== 'string' ||
    typeof data.originalFileName !== 'string' ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(data.contentType) ||
    !Number.isInteger(data.expectedSize) || data.expectedSize <= 0 ||
    data.expectedSize > DIRECT_IMAGE_UPLOAD_MAX_BYTES ||
    (data.clientReportedSha256 !== undefined &&
      (typeof data.clientReportedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.clientReportedSha256))) ||
    !OPERATION_STATUSES.includes(data.status) ||
    (data.failureCode !== undefined && !FAILURE_CODES.includes(data.failureCode)) ||
    !(data.expiresAt instanceof Timestamp) || !(data.createdAt instanceof Timestamp) ||
    !(data.updatedAt instanceof Timestamp)
  ) {
    throw new StorageAdminError('failed-precondition', 'Upload operation metadata is invalid.');
  }
  return {
    operationId,
    imageId: data.imageId,
    requestFingerprint: data.requestFingerprint,
    actorBusinessUserId: data.actorBusinessUserId,
    actorRole: data.actorRole,
    relationship: parseRelationship(data.relationship),
    provider: parseProvider(data.provider),
    uploadObjectKey: data.uploadObjectKey,
    objectKey: data.objectKey,
    originalFileName: data.originalFileName,
    contentType: data.contentType as DirectImageContentType,
    expectedSize: data.expectedSize,
    clientReportedSha256: typeof data.clientReportedSha256 === 'string' ? data.clientReportedSha256 : undefined,
    status: data.status as StorageUploadOperationStatus,
    failureCode: typeof data.failureCode === 'string' ? data.failureCode as StorageUploadFailureCode : undefined,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    finalizedAt: data.finalizedAt instanceof Timestamp ? data.finalizedAt : undefined,
    finalizeToken: typeof data.finalizeToken === 'string' ? data.finalizeToken : undefined,
    finalizeLockExpiresAt: data.finalizeLockExpiresAt instanceof Timestamp ? data.finalizeLockExpiresAt : undefined,
  };
}

export class StorageUploadOperationRepository {
  constructor(private readonly db: Firestore) {}

  private ref(operationId: string) {
    return this.db.collection(STORAGE_UPLOAD_OPERATION_COLLECTION).doc(operationId);
  }

  async get(operationId: string): Promise<StorageUploadOperationRecord | null> {
    const snapshot = await this.ref(operationId).get();
    return snapshot.exists ? parseOperation(operationId, snapshot.data() || {}) : null;
  }

  async createOrRenew(candidate: NewStorageUploadOperation, expiresAt: Timestamp): Promise<StorageUploadOperationRecord> {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.ref(candidate.operationId);
      const snapshot = await transaction.get(ref);
      const now = Timestamp.now();
      if (snapshot.exists) {
        const existing = parseOperation(candidate.operationId, snapshot.data() || {});
        if (existing.actorBusinessUserId !== candidate.actorBusinessUserId) {
          throw new StorageAdminError('not-found', 'Upload operation was not found.', { reason: 'UPLOAD_OPERATION_NOT_FOUND' });
        }
        if (existing.requestFingerprint !== candidate.requestFingerprint) {
          throw new StorageAdminError('already-exists', 'Idempotency key is already associated with different image metadata.', { reason: 'INVALID_INPUT' });
        }
        if (existing.status === 'FINALIZED') return existing;
        if (
          existing.status === 'FINALIZING' && existing.finalizeLockExpiresAt &&
          existing.finalizeLockExpiresAt.toMillis() > now.toMillis()
        ) return existing;
        transaction.update(ref, {
          status: 'PENDING',
          expiresAt,
          updatedAt: now,
          failureCode: FieldValue.delete(),
          finalizeToken: FieldValue.delete(),
          finalizeLockExpiresAt: FieldValue.delete(),
        });
        return { ...existing, status: 'PENDING', expiresAt, updatedAt: now, failureCode: undefined };
      }
      const created: StorageUploadOperationRecord = {
        ...candidate,
        status: 'PENDING',
        expiresAt,
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(ref, created);
      return created;
    });
  }

  async claimFinalize(operationId: string, actorBusinessUserId: string, finalizeToken: string, lockExpiresAt: Timestamp): Promise<
    | { result: 'CLAIMED'; operation: StorageUploadOperationRecord }
    | { result: 'ALREADY_FINALIZED'; operation: StorageUploadOperationRecord }
    | { result: 'IN_PROGRESS'; operation: StorageUploadOperationRecord }
    | { result: 'EXPIRED'; operation: StorageUploadOperationRecord }
  > {
    return this.db.runTransaction(async (transaction) => {
      const ref = this.ref(operationId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new StorageAdminError('not-found', 'Upload operation was not found.', { reason: 'UPLOAD_OPERATION_NOT_FOUND' });
      const operation = parseOperation(operationId, snapshot.data() || {});
      if (operation.actorBusinessUserId !== actorBusinessUserId) {
        throw new StorageAdminError('not-found', 'Upload operation was not found.', { reason: 'UPLOAD_OPERATION_NOT_FOUND' });
      }
      if (operation.status === 'FINALIZED') return { result: 'ALREADY_FINALIZED', operation } as const;
      const now = Timestamp.now();
      if (operation.expiresAt.toMillis() <= now.toMillis()) {
        transaction.update(ref, { status: 'EXPIRED', updatedAt: now });
        return { result: 'EXPIRED', operation: { ...operation, status: 'EXPIRED', updatedAt: now } } as const;
      }
      if (
        operation.status === 'FINALIZING' && operation.finalizeLockExpiresAt &&
        operation.finalizeLockExpiresAt.toMillis() > now.toMillis()
      ) return { result: 'IN_PROGRESS', operation } as const;
      transaction.update(ref, {
        status: 'FINALIZING',
        finalizeToken,
        finalizeLockExpiresAt: lockExpiresAt,
        updatedAt: now,
        failureCode: FieldValue.delete(),
      });
      return {
        result: 'CLAIMED',
        operation: { ...operation, status: 'FINALIZING', finalizeToken, finalizeLockExpiresAt: lockExpiresAt, updatedAt: now },
      } as const;
    });
  }

  async markFailure(operationId: string, failureCode: StorageUploadFailureCode, finalizeToken?: string): Promise<void> {
    await this.db.runTransaction(async (transaction) => {
      const ref = this.ref(operationId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      const operation = parseOperation(operationId, snapshot.data() || {});
      if (operation.status === 'FINALIZED') return;
      if (operation.status === 'FINALIZING' && operation.finalizeToken !== finalizeToken) return;
      transaction.update(ref, {
        status: 'FAILED',
        failureCode,
        updatedAt: Timestamp.now(),
        finalizeToken: FieldValue.delete(),
        finalizeLockExpiresAt: FieldValue.delete(),
      });
    });
  }

  async finalize(operationId: string, finalizeToken: string, registryRecord: Record<string, unknown>): Promise<'FINALIZED' | 'ALREADY_FINALIZED' | 'EXPIRED'> {
    return this.db.runTransaction(async (transaction) => {
      const operationRef = this.ref(operationId);
      const operationSnapshot = await transaction.get(operationRef);
      if (!operationSnapshot.exists) {
        throw new StorageAdminError('not-found', 'Upload operation was not found.', { reason: 'UPLOAD_OPERATION_NOT_FOUND' });
      }
      const operation = parseOperation(operationId, operationSnapshot.data() || {});
      const registryRef = this.db.collection('image_registry').doc(operation.imageId);
      const registrySnapshot = await transaction.get(registryRef);
      if (operation.status === 'FINALIZED') {
        if (!registrySnapshot.exists) throw new StorageAdminError('failed-precondition', 'Finalized image registry record is missing.', { reason: 'FINALIZE_FAILED' });
        return 'ALREADY_FINALIZED';
      }
      if (operation.status !== 'FINALIZING' || operation.finalizeToken !== finalizeToken) {
        throw new StorageAdminError('aborted', 'Upload finalization ownership was lost. Retry the operation.', { reason: 'FINALIZE_FAILED' });
      }
      if (operation.expiresAt.toMillis() <= Date.now()) {
        transaction.update(operationRef, { status: 'EXPIRED', updatedAt: Timestamp.now() });
        return 'EXPIRED';
      }
      if (registrySnapshot.exists) {
        const existing = registrySnapshot.data() || {};
        if (
          existing.imageId !== operation.imageId || existing.providerConfigId !== operation.provider.providerConfigId ||
          existing.objectKey !== operation.objectKey || existing.uploadOperationId !== operation.operationId ||
          existing.status !== 'ACTIVE'
        ) {
          throw new StorageAdminError('failed-precondition', 'Image registry identity conflicts with this upload operation.', { reason: 'FINALIZE_FAILED' });
        }
      } else {
        transaction.create(registryRef, registryRecord);
      }
      transaction.update(operationRef, {
        status: 'FINALIZED',
        finalizedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        failureCode: FieldValue.delete(),
        finalizeToken: FieldValue.delete(),
        finalizeLockExpiresAt: FieldValue.delete(),
      });
      return 'FINALIZED';
    });
  }
}
