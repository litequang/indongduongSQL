import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebaseStorage } from '../../config/firebase';
import {
  StorageProvider,
  StorageProviderConfig,
  StorageProviderHealth,
  StorageProviderUploadRequest,
  StorageProviderUploadResult,
} from '../types';

export class FirebaseStorageProvider implements StorageProvider {
  readonly config: StorageProviderConfig;

  constructor(config: StorageProviderConfig) {
    if (config.type !== 'FIREBASE_STORAGE') {
      throw new Error(`FirebaseStorageProvider cannot use provider type ${config.type}.`);
    }
    this.config = config;
  }

  private requireStorage() {
    if (!this.config.enabled) throw new Error(`Storage provider ${this.config.id} is disabled.`);
    const storage = getFirebaseStorage();
    if (!storage) throw new Error('Firebase Storage chưa được cấu hình. Ảnh chưa được lưu.');
    return storage;
  }

  async upload(request: StorageProviderUploadRequest): Promise<StorageProviderUploadResult> {
    const uploadRef = ref(this.requireStorage(), request.objectKey);
    const task = uploadBytesResumable(uploadRef, request.data, {
      contentType: request.contentType,
      customMetadata: request.metadata,
    });
    await new Promise<void>((resolve, reject) => {
      task.on('state_changed', (snapshot) => {
        const totalBytes = snapshot.totalBytes || request.data.size;
        request.onProgress?.({
          transferredBytes: snapshot.bytesTransferred,
          totalBytes,
          percent: totalBytes ? Math.round((snapshot.bytesTransferred / totalBytes) * 100) : 0,
        });
      }, reject, resolve);
    });
    return { objectKey: request.objectKey, readUrl: await getDownloadURL(uploadRef) };
  }

  async delete(objectKey: string): Promise<void> {
    try {
      await deleteObject(ref(this.requireStorage(), objectKey));
    } catch (error) {
      // Deletion is idempotent so a registry tombstone can still be completed.
      if (String((error as { code?: unknown })?.code || '') !== 'storage/object-not-found') throw error;
    }
  }

  async resolve(objectKey: string): Promise<string> {
    return getDownloadURL(ref(this.requireStorage(), objectKey));
  }

  async healthCheck(): Promise<StorageProviderHealth> {
    try {
      this.requireStorage();
      return {
        ok: true,
        providerConfigId: this.config.id,
        providerType: this.config.type,
        message: 'Firebase Storage adapter is configured.',
      };
    } catch (error) {
      return {
        ok: false,
        providerConfigId: this.config.id,
        providerType: this.config.type,
        message: (error as Error)?.message || 'Firebase Storage adapter is unavailable.',
      };
    }
  }
}
