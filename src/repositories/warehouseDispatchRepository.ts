import { collection, doc, getDocs, getDoc, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { WarehouseDispatch, WarehouseDispatchItem } from '../types';
import { safeFirestoreDeleteDoc, safeFirestoreSetDoc, safeFirestoreUpdateDoc } from '../utils/firestoreSafeWrite';

const COLLECTION_NAME = 'warehouse_dispatches';
const ITEMS_COLLECTION_NAME = 'warehouse_dispatch_items';

export const warehouseDispatchRepository = {
  create: async (dispatch: WarehouseDispatch): Promise<WarehouseDispatch> => {
    const docRef = doc(collection(getFirebaseDb()!, COLLECTION_NAME));
    const newDoc = { ...dispatch, id: docRef.id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  createWithId: async (id: string, dispatch: WarehouseDispatch): Promise<WarehouseDispatch> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    const newDoc = { ...dispatch, id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  getById: async (id: string): Promise<WarehouseDispatch | null> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as WarehouseDispatch;
    }
    return null;
  },

  update: async (id: string, data: Partial<WarehouseDispatch>): Promise<void> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    await safeFirestoreUpdateDoc(docRef, data);
  },

  delete: async (id: string): Promise<void> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    await safeFirestoreDeleteDoc(docRef);
  },

  getAll: async (pageSize = 50, lastDocRef?: any): Promise<{ dispatches: WarehouseDispatch[], lastDoc: any }> => {
    let q = query(collection(getFirebaseDb()!, COLLECTION_NAME), orderBy('createdAt', 'desc'), limit(pageSize));
    if (lastDocRef) {
      q = query(collection(getFirebaseDb()!, COLLECTION_NAME), orderBy('createdAt', 'desc'), startAfter(lastDocRef), limit(pageSize));
    }
    const snapshot = await getDocs(q);
    const dispatches = snapshot.docs.map(doc => doc.data() as WarehouseDispatch);
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    return { dispatches, lastDoc };
  },

  getBySalesOrderId: async (salesOrderId: string): Promise<WarehouseDispatch[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), where('salesOrderId', '==', salesOrderId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as WarehouseDispatch);
  },

  getByCustomerId: async (customerId: string): Promise<WarehouseDispatch[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), where('customerId', '==', customerId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as WarehouseDispatch);
  },

  // ITEMS
  createItem: async (item: WarehouseDispatchItem): Promise<WarehouseDispatchItem> => {
    const docRef = doc(collection(getFirebaseDb()!, ITEMS_COLLECTION_NAME));
    const newDoc = { ...item, id: docRef.id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  createItemWithId: async (id: string, item: WarehouseDispatchItem): Promise<WarehouseDispatchItem> => {
    const docRef = doc(getFirebaseDb()!, ITEMS_COLLECTION_NAME, id);
    const newDoc = { ...item, id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  getItemsByDispatchId: async (dispatchId: string): Promise<WarehouseDispatchItem[]> => {
    const q = query(collection(getFirebaseDb()!, ITEMS_COLLECTION_NAME), where('dispatchId', '==', dispatchId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as WarehouseDispatchItem);
  },
  
  deleteItem: async (id: string): Promise<void> => {
    const docRef = doc(getFirebaseDb()!, ITEMS_COLLECTION_NAME, id);
    await safeFirestoreDeleteDoc(docRef);
  },
};
