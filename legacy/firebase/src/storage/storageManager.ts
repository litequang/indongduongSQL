import { imageRegistryRepository } from '../repositories/imageRegistryRepository';
import { buildImageObjectKey, createImageId } from './objectKey';
import { FirebaseStorageProvider } from './providers/FirebaseStorageProvider';
import { sha256Hex } from './sha256';
import {
  ImageRegistryRecord,
  ManagedImageLocator,
  ManagedImageReference,
  ManagedImageUploadRequest,
  StorageProvider,
  StorageProviderConfig,
  StorageProviderHealth,
} from './types';

export const PRIMARY_STORAGE_PROVIDER_CONFIG: StorageProviderConfig = {
  id: 'firebase-primary',
  type: 'FIREBASE_STORAGE',
  enabled: true,
};

export class StorageManager {
  private readonly providers = new Map<string, StorageProvider>();
  private readonly defaultProviderConfigId: string;

  constructor(providers: StorageProvider[], defaultProviderConfigId: string) {
    providers.forEach((provider) => this.providers.set(provider.config.id, provider));
    this.defaultProviderConfigId = defaultProviderConfigId;
  }

  private provider(providerConfigId = this.defaultProviderConfigId, expectedType?: ManagedImageLocator['providerType']): StorageProvider {
    const provider = this.providers.get(providerConfigId);
    if (!provider || !provider.config.enabled) throw new Error(`Storage provider configuration ${providerConfigId} is unavailable.`);
    if (expectedType && provider.config.type !== expectedType) {
      throw new Error(`Storage provider type mismatch for ${providerConfigId}.`);
    }
    return provider;
  }

  async uploadImage(request: ManagedImageUploadRequest): Promise<ManagedImageReference> {
    const imageId = request.imageId || createImageId();
    const provider = this.provider(request.providerConfigId);
    const objectKey = request.objectKey || buildImageObjectKey(request.objectKeySegments, imageId, request.contentType);
    const sha256 = request.sha256 || await sha256Hex(request.data);
    const existing = request.imageId ? await imageRegistryRepository.getById(imageId) : null;
    if (existing?.status === 'ACTIVE') {
      if (existing.providerConfigId !== provider.config.id || existing.objectKey !== objectKey) {
        throw new Error('Image idempotency identity conflicts with an existing registry record.');
      }
      return {
        imageId,
        providerType: existing.providerType,
        providerConfigId: existing.providerConfigId,
        objectKey: existing.objectKey,
        readUrl: await provider.resolve(existing.objectKey),
        sha256: existing.sha256 || sha256,
        createdAt: existing.createdAt,
      };
    }
    const createdAt = new Date().toISOString();
    const uploaded = await provider.upload({
      objectKey,
      data: request.data,
      contentType: request.contentType,
      metadata: { imageId, uploadedBy: request.createdBy, sha256 },
      onProgress: request.onProgress,
    });

    const registryRecord: ImageRegistryRecord = {
      imageId,
      providerType: provider.config.type,
      providerConfigId: provider.config.id,
      objectKey: uploaded.objectKey,
      originalFileName: request.originalFileName,
      contentType: request.contentType,
      size: request.data.size,
      sha256,
      ...(request.width === undefined ? {} : { width: request.width }),
      ...(request.height === undefined ? {} : { height: request.height }),
      createdAt,
      createdBy: request.createdBy,
      status: 'ACTIVE',
      ...request.entity,
    };

    try {
      await imageRegistryRepository.create(registryRecord);
    } catch (error) {
      try {
        await provider.delete(uploaded.objectKey);
      } catch (cleanupError) {
        console.error('Image Registry write failed and uploaded object cleanup also failed.', cleanupError);
      }
      throw error;
    }

    return {
      imageId,
      providerType: provider.config.type,
      providerConfigId: provider.config.id,
      objectKey: uploaded.objectKey,
      readUrl: uploaded.readUrl,
      sha256,
      createdAt,
    };
  }

  async resolveImage(locator: ManagedImageLocator): Promise<string> {
    return this.provider(locator.providerConfigId, locator.providerType).resolve(locator.objectKey);
  }

  async resolveRegisteredImage(imageId: string): Promise<string> {
    const record = await imageRegistryRepository.getById(imageId);
    if (!record || record.status !== 'ACTIVE') throw new Error('Image Registry record is missing or inactive.');
    return this.resolveImage(record);
  }

  async deleteImage(locator: ManagedImageLocator): Promise<void> {
    await this.provider(locator.providerConfigId, locator.providerType).delete(locator.objectKey);
    if (locator.imageId) {
      await imageRegistryRepository.markDeleted(locator.imageId);
    }
  }

  async healthCheck(providerConfigId = this.defaultProviderConfigId): Promise<StorageProviderHealth> {
    return this.provider(providerConfigId).healthCheck();
  }
}

const firebaseStorageProvider = new FirebaseStorageProvider(PRIMARY_STORAGE_PROVIDER_CONFIG);

/** Browser binary adapter registry. Runtime provider choice is issued by the backend transport. */
export const storageManager = new StorageManager(
  [firebaseStorageProvider],
  PRIMARY_STORAGE_PROVIDER_CONFIG.id,
);
