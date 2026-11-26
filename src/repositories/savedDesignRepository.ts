import { getFirebaseDb } from '../config/firebase';
import { collection, doc, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { SavedDesign } from '../types';
import { safeLocalStorageGet } from '../utils/storageUtils';
import { safeFirestoreSetDoc } from '../utils/firestoreSafeWrite';

const COLLECTION_NAME = 'saved_designs';

function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (key, value) => (value === undefined ? null : value))
  );
}

export const savedDesignRepository = {
  subscribeDesigns(
    onUpdate: (designs: SavedDesign[]) => void,
    isDemoActive: boolean,
    onError?: (error: unknown) => void,
  ): () => void {
    if (isDemoActive) return () => {};

    const db = getFirebaseDb();
    if (!db) return () => {};

    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('deletedAt', '==', null)
      );

      return onSnapshot(q, (snapshot) => {
        const designs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedDesign));
        const sorted = designs.sort((a, b) => new Date(b.lastPrintedAt || 0).getTime() - new Date(a.lastPrintedAt || 0).getTime());
        onUpdate(sorted);
      }, (error) => onError?.(error));
    } catch (e) {
      onError?.(e);
      return () => {};
    }
  },

  async getDesigns(isDemoActive: boolean): Promise<SavedDesign[]> {
    if (isDemoActive) {
      const saved = safeLocalStorageGet('flexo_saved_designs_demo_v1');
      return saved ? JSON.parse(saved) : [];
    }

    const db = getFirebaseDb();
    if (db) {
      try {
        const q = query(
          collection(db, COLLECTION_NAME),
          where('deletedAt', '==', null)
        );
        const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
        const snap = await Promise.race([getDocs(q), timeoutPromise]);
        
        const designs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedDesign));
        return designs.sort((a, b) => new Date(b.lastPrintedAt || 0).getTime() - new Date(a.lastPrintedAt || 0).getTime());
      } catch (err) {
        throw err;
      }
    }
    throw new Error('Firestore is not configured. Saved designs were not loaded.');
  },

  async saveDesign(design: SavedDesign, isDemoActive: boolean): Promise<void> {
    if (isDemoActive) return;

    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Saved design was not saved.');
    const docRef = doc(db, COLLECTION_NAME, design.id);
    const cleanData = sanitizeForFirestore(design);
    await safeFirestoreSetDoc(docRef, cleanData, { merge: true });
  }
};
