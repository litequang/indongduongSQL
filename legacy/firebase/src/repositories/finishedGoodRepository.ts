import { collection, doc, getDocs, getDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { FinishedGood } from '../types';
import { safeFirestoreDeleteDoc, safeFirestoreSetDoc, safeFirestoreUpdateDoc } from '../utils/firestoreSafeWrite';

const COLLECTION_NAME = 'finished_goods';

export const finishedGoodRepository = {
  create: async (finishedGood: FinishedGood): Promise<FinishedGood> => {
    const docRef = doc(collection(getFirebaseDb()!, COLLECTION_NAME));
    const newDoc = { ...finishedGood, id: docRef.id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  createWithId: async (id: string, finishedGood: FinishedGood): Promise<FinishedGood> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    const newDoc = { ...finishedGood, id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  getById: async (id: string): Promise<FinishedGood | null> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as FinishedGood;
    }
    return null;
  },

  update: async (id: string, data: Partial<FinishedGood>): Promise<void> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    await safeFirestoreUpdateDoc(docRef, data);
  },

  delete: async (id: string): Promise<void> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    await safeFirestoreDeleteDoc(docRef);
  },

  getAll: async (): Promise<FinishedGood[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as FinishedGood);
  },

  subscribe: (onChange: (goods: FinishedGood[]) => void, onError?: (error: Error) => void): (() => void) => {
    const db = getFirebaseDb();
    if (!db) {
      onChange([]);
      return () => undefined;
    }
    return onSnapshot(query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc')), snapshot => {
      onChange(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as FinishedGood));
    }, error => onError?.(error));
  },

  getBySalesOrderId: async (salesOrderId: string): Promise<FinishedGood[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), where('salesOrderId', '==', salesOrderId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as FinishedGood);
  },

  getBySalesOrderItemId: async (salesOrderItemId: string): Promise<FinishedGood[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), where('salesOrderItemId', '==', salesOrderItemId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as FinishedGood);
  }
};
