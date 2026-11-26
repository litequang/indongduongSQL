import { StorageAdminError } from '../storageAdminError';
import { CanonicalImageRecord } from './types';

const SHA256 = /^[a-f0-9]{64}$/;

export function parseCanonicalImage(imageId: string, data: FirebaseFirestore.DocumentData): CanonicalImageRecord {
  if (
    data.imageId !== imageId || !['R2', 'FIREBASE_STORAGE'].includes(data.providerType) ||
    typeof data.providerConfigId !== 'string' || typeof data.objectKey !== 'string' ||
    typeof data.contentType !== 'string' || !Number.isSafeInteger(data.size) || data.size < 0 ||
    !['ACTIVE', 'DELETED'].includes(data.status)
  ) {
    throw new StorageAdminError('failed-precondition', 'Canonical image registry record is invalid.');
  }
  return {
    imageId,
    providerType: data.providerType,
    providerConfigId: data.providerConfigId,
    objectKey: data.objectKey,
    contentType: data.contentType,
    sizeBytes: Number(data.size),
    ...(typeof data.sha256 === 'string' && SHA256.test(data.sha256) ? { sha256: data.sha256 } : {}),
    ...(['NOT_PROVIDED', 'CLIENT_REPORTED', 'SERVER_VERIFIED'].includes(data.checksumStatus)
      ? { checksumStatus: data.checksumStatus }
      : {}),
    status: data.status,
    ...(typeof data.originalFileName === 'string' ? { originalFileName: data.originalFileName } : {}),
    ...(typeof data.entityType === 'string' ? { entityType: data.entityType } : {}),
    ...(typeof data.entityId === 'string' ? { entityId: data.entityId } : {}),
    ...(typeof data.parentEntityId === 'string' ? { parentEntityId: data.parentEntityId } : {}),
  };
}
