import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { ImageRegistryRecord } from '../storage/types';
import { safeFirestoreSetDoc, safeFirestoreUpdateDoc } from '../utils/firestoreSafeWrite';

export const IMAGE_REGISTRY_COLLECTION = 'image_registry';

function requireDb() {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firestore chưa được cấu hình cho Image Registry.');
  return db;
}

export const imageRegistryRepository = {
  async create(record: ImageRegistryRecord): Promise<void> {
    await safeFirestoreSetDoc(doc(requireDb(), IMAGE_REGISTRY_COLLECTION, record.imageId), record);
  },

  async getById(imageId: string): Promise<ImageRegistryRecord | null> {
    const snapshot = await getDoc(doc(requireDb(), IMAGE_REGISTRY_COLLECTION, imageId));
    return snapshot.exists() ? snapshot.data() as ImageRegistryRecord : null;
  },

  async markDeleted(imageId: string): Promise<void> {
    const deletedAt = new Date().toISOString();
    await safeFirestoreUpdateDoc(doc(requireDb(), IMAGE_REGISTRY_COLLECTION, imageId), {
      status: 'DELETED',
      deletedAt,
      updatedAt: deletedAt,
    });
  },
};
