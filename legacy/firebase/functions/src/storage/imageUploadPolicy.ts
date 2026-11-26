import { createHash } from 'node:crypto';
import { UserRole } from '../types';
import { WorkflowActor } from '../workflows/workflowAuth';
import { StorageAdminError } from './storageAdminError';

export const DIRECT_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const DIRECT_UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const DIRECT_UPLOAD_OPERATION_TTL_SECONDS = 30 * 60;

export const DIRECT_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type DirectImageContentType = (typeof DIRECT_IMAGE_CONTENT_TYPES)[number];

export type DirectImageEntityType =
  | 'PRODUCTION_ORDER_ITEM'
  | 'SALES_ORDER_ITEM'
  | 'USER_AVATAR'
  | 'COMPANY_LOGO';

export interface DirectImageRelationship {
  entityType: DirectImageEntityType;
  entityId: string;
  parentEntityId?: string;
}

export interface PrepareImageUploadInput {
  idempotencyKey: string;
  originalFileName: string;
  contentType: DirectImageContentType;
  size: number;
  clientReportedSha256?: string;
  relationship: DirectImageRelationship;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', `${field} must be an object.`, { reason: 'INVALID_INPUT' });
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) {
    throw new StorageAdminError('invalid-argument', `${field} contains an unsupported field.`, { reason: 'INVALID_INPUT' });
  }
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new StorageAdminError('invalid-argument', `${field} is required.`, { reason: 'INVALID_INPUT' });
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new StorageAdminError('invalid-argument', `${field} is invalid.`, { reason: 'INVALID_INPUT' });
  }
  return normalized;
}

function requireSafeId(value: unknown, field: string): string {
  const id = requireText(value, field, 128);
  if (!SAFE_ID.test(id)) {
    throw new StorageAdminError('invalid-argument', `${field} is invalid.`, { reason: 'INVALID_INPUT' });
  }
  return id;
}

function parseRelationship(value: unknown): DirectImageRelationship {
  const relationship = requireObject(value, 'Relationship');
  assertOnlyKeys(relationship, ['entityType', 'entityId', 'parentEntityId'], 'Relationship');
  const allowed: readonly DirectImageEntityType[] = [
    'PRODUCTION_ORDER_ITEM', 'SALES_ORDER_ITEM', 'USER_AVATAR', 'COMPANY_LOGO',
  ];
  if (typeof relationship.entityType !== 'string' || !allowed.includes(relationship.entityType as DirectImageEntityType)) {
    throw new StorageAdminError('invalid-argument', 'Image relationship type is invalid.', { reason: 'INVALID_INPUT' });
  }
  const entityType = relationship.entityType as DirectImageEntityType;
  const entityId = requireSafeId(relationship.entityId, 'Entity ID');
  const needsParent = entityType === 'PRODUCTION_ORDER_ITEM' || entityType === 'SALES_ORDER_ITEM';
  const parentEntityId = needsParent
    ? requireSafeId(relationship.parentEntityId, 'Parent entity ID')
    : undefined;
  if (!needsParent && relationship.parentEntityId !== undefined) {
    throw new StorageAdminError('invalid-argument', 'This image relationship does not accept a parent entity ID.', { reason: 'INVALID_INPUT' });
  }
  if (entityType === 'COMPANY_LOGO' && entityId !== 'company') {
    throw new StorageAdminError('invalid-argument', 'Company logo entity ID must be company.', { reason: 'INVALID_INPUT' });
  }
  return { entityType, entityId, ...(parentEntityId ? { parentEntityId } : {}) };
}

export function validatePrepareImageUpload(value: unknown): PrepareImageUploadInput {
  const data = requireObject(value, 'Request');
  assertOnlyKeys(data, [
    'idempotencyKey', 'originalFileName', 'contentType', 'size',
    'clientReportedSha256', 'relationship',
  ], 'Request');
  const contentType = data.contentType;
  if (typeof contentType !== 'string' || !(DIRECT_IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new StorageAdminError('invalid-argument', 'Image content type is unsupported.', { reason: 'UNSUPPORTED_CONTENT_TYPE' });
  }
  if (!Number.isInteger(data.size) || (data.size as number) <= 0) {
    throw new StorageAdminError('invalid-argument', 'Image byte size is invalid.', { reason: 'INVALID_INPUT' });
  }
  if ((data.size as number) > DIRECT_IMAGE_UPLOAD_MAX_BYTES) {
    throw new StorageAdminError('invalid-argument', 'Image exceeds the 5 MiB upload limit.', { reason: 'FILE_TOO_LARGE' });
  }
  let clientReportedSha256: string | undefined;
  if (data.clientReportedSha256 !== undefined) {
    if (typeof data.clientReportedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.clientReportedSha256)) {
      throw new StorageAdminError('invalid-argument', 'Client SHA-256 must be 64 hexadecimal characters.', { reason: 'INVALID_INPUT' });
    }
    clientReportedSha256 = data.clientReportedSha256.toLowerCase();
  }
  return {
    idempotencyKey: requireText(data.idempotencyKey, 'Idempotency key', 200),
    originalFileName: requireText(data.originalFileName, 'Original filename', 255),
    contentType: contentType as DirectImageContentType,
    size: data.size as number,
    ...(clientReportedSha256 ? { clientReportedSha256 } : {}),
    relationship: parseRelationship(data.relationship),
  };
}

export function assertImageUploadAccess(actor: WorkflowActor, relationship: DirectImageRelationship): void {
  const roleSets: Record<Exclude<DirectImageEntityType, 'USER_AVATAR'>, readonly UserRole[]> = {
    PRODUCTION_ORDER_ITEM: ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'SALE'],
    SALES_ORDER_ITEM: ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE'],
    COMPANY_LOGO: ['DEVELOPER', 'ADMIN'],
  };
  const allowed = relationship.entityType === 'USER_AVATAR'
    ? relationship.entityId === actor.businessUserId || ['DEVELOPER', 'ADMIN'].includes(actor.role)
    : roleSets[relationship.entityType].includes(actor.role);
  if (!allowed) {
    throw new StorageAdminError('permission-denied', 'You are not allowed to upload an image for this relationship.', { reason: 'UNAUTHORIZED' });
  }
}

export function directUploadOperationId(businessUserId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${businessUserId}\n${idempotencyKey}`, 'utf8').digest('hex');
}

export function directUploadRequestFingerprint(input: PrepareImageUploadInput): string {
  return createHash('sha256').update(JSON.stringify({
    originalFileName: input.originalFileName,
    contentType: input.contentType,
    size: input.size,
    clientReportedSha256: input.clientReportedSha256 || null,
    relationship: input.relationship,
  }), 'utf8').digest('hex');
}

function extensionFor(contentType: DirectImageContentType): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

export function directUploadObjectKey(relationship: DirectImageRelationship, imageId: string, contentType: DirectImageContentType): string {
  requireSafeId(imageId, 'Image ID');
  const filename = `${imageId}.${extensionFor(contentType)}`;
  if (relationship.entityType === 'PRODUCTION_ORDER_ITEM') {
    return `production-orders/${relationship.parentEntityId}/items/${relationship.entityId}/${filename}`;
  }
  if (relationship.entityType === 'SALES_ORDER_ITEM') {
    return `sales-orders/${relationship.parentEntityId}/items/${relationship.entityId}/images/${filename}`;
  }
  if (relationship.entityType === 'USER_AVATAR') return `avatars/${relationship.entityId}/${filename}`;
  return `settings/company-logo/${filename}`;
}

export function directUploadStagingObjectKey(operationId: string, imageId: string, contentType: DirectImageContentType): string {
  if (!/^[a-f0-9]{64}$/.test(operationId)) {
    throw new StorageAdminError('invalid-argument', 'Upload operation ID is invalid.', { reason: 'INVALID_INPUT' });
  }
  requireSafeId(imageId, 'Image ID');
  return `system/uploads/${operationId}/${imageId}.${extensionFor(contentType)}`;
}
