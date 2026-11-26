import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { UserRole, USER_ROLES } from '../types';
import { requireWorkflowActor } from '../workflows/workflowAuth';
import { assertImageUploadAccess, DirectImageRelationship } from './imageUploadPolicy';
import { BackendStorageProviderFactory } from './providerFactory';
import { StorageAdminError } from './storageAdminError';

const READ_URL_TTL_SECONDS = 5 * 60;
const IMAGE_ID = /^[A-Za-z0-9_-]{1,128}$/;
// Mirrors current storage.rules read roles. WAREHOUSE remains the documented
// pre-existing omission and is intentionally not broadened by this feature.
const IMAGE_READ_ROLES: readonly UserRole[] = USER_ROLES.filter((role) => role !== 'WAREHOUSE');

interface RegistryImage {
  imageId: string;
  providerType: 'FIREBASE_STORAGE' | 'R2';
  providerConfigId: string;
  objectKey: string;
  status: 'ACTIVE' | 'DELETED';
  relationship: DirectImageRelationship;
}

function imageIdFromRequest(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'An image request object is required.');
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== 'imageId') || typeof data.imageId !== 'string' || !IMAGE_ID.test(data.imageId)) {
    throw new StorageAdminError('invalid-argument', 'Image ID is invalid.');
  }
  return data.imageId;
}

function parseRegistry(imageId: string, data: FirebaseFirestore.DocumentData): RegistryImage {
  const entityTypes = ['PRODUCTION_ORDER_ITEM', 'SALES_ORDER_ITEM', 'USER_AVATAR', 'COMPANY_LOGO'] as const;
  if (
    data.imageId !== imageId || !['FIREBASE_STORAGE', 'R2'].includes(data.providerType) ||
    typeof data.providerConfigId !== 'string' || typeof data.objectKey !== 'string' ||
    !['ACTIVE', 'DELETED'].includes(data.status) || !entityTypes.includes(data.entityType) ||
    typeof data.entityId !== 'string' || !IMAGE_ID.test(data.entityId) ||
    (['PRODUCTION_ORDER_ITEM', 'SALES_ORDER_ITEM'].includes(data.entityType) &&
      (typeof data.parentEntityId !== 'string' || !IMAGE_ID.test(data.parentEntityId)))
  ) {
    throw new StorageAdminError('failed-precondition', 'Image Registry record is invalid.');
  }
  return {
    imageId,
    providerType: data.providerType,
    providerConfigId: data.providerConfigId,
    objectKey: data.objectKey,
    status: data.status,
    relationship: {
      entityType: data.entityType,
      entityId: data.entityId,
      ...(typeof data.parentEntityId === 'string' ? { parentEntityId: data.parentEntityId } : {}),
    },
  };
}

export class ImageAccessService {
  constructor(
    private readonly db: Firestore,
    private readonly providers: BackendStorageProviderFactory,
  ) {}

  private async load(imageId: string): Promise<RegistryImage> {
    const snapshot = await this.db.collection('image_registry').doc(imageId).get();
    if (!snapshot.exists) throw new StorageAdminError('not-found', 'Image was not found.');
    return parseRegistry(imageId, snapshot.data() || {});
  }

  async resolveReadUrl(firebaseUid: string | undefined, request: unknown): Promise<{
    imageId: string;
    providerType: 'FIREBASE_STORAGE' | 'R2';
    providerConfigId: string;
    objectKey: string;
    url?: string;
    expiresAt?: string;
  }> {
    // Re-resolving the actor against the current Storage read-role set
    // preserves that logical boundary while
    // requiring a valid, ACTIVE relationship record instead of imageId alone.
    await requireWorkflowActor(this.db, firebaseUid, IMAGE_READ_ROLES);
    const image = await this.load(imageIdFromRequest(request));
    if (image.status !== 'ACTIVE') throw new StorageAdminError('not-found', 'Image was not found.');
    if (image.providerType === 'FIREBASE_STORAGE') {
      return {
        imageId: image.imageId,
        providerType: image.providerType,
        providerConfigId: image.providerConfigId,
        objectKey: image.objectKey,
      };
    }
    // Historical reads deliberately ignore enabled. Disable only blocks new
    // uploads; current credentials may still authorize old objects.
    const provider = await this.providers.resolve(image.providerConfigId, { allowDisabled: true });
    const authorization = await provider.createReadAuthorization(image.objectKey, READ_URL_TTL_SECONDS);
    return {
      imageId: image.imageId,
      providerType: image.providerType,
      providerConfigId: image.providerConfigId,
      objectKey: image.objectKey,
      url: authorization.url,
      expiresAt: authorization.expiresAt,
    };
  }

  async retire(firebaseUid: string | undefined, request: unknown): Promise<{ imageId: string; status: 'DELETED' }> {
    const actor = await requireWorkflowActor(this.db, firebaseUid, USER_ROLES);
    const imageId = imageIdFromRequest(request);
    const image = await this.load(imageId);
    assertImageUploadAccess(actor, image.relationship);
    if (image.status === 'DELETED') return { imageId, status: 'DELETED' };
    await this.db.collection('image_registry').doc(imageId).update({
      status: 'DELETED',
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retiredBy: actor.businessUserId,
      retiredAt: Timestamp.now(),
    });
    return { imageId, status: 'DELETED' };
  }
}
