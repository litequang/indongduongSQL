import { collection, doc, getDocs, getDoc, query, where, orderBy } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { Shipment } from '../types';
import { safeFirestoreSetDoc, safeFirestoreUpdateDoc } from '../utils/firestoreSafeWrite';

const COLLECTION_NAME = 'shipments';

export const shipmentRepository = {
  create: async (shipment: Shipment): Promise<Shipment> => {
    const docRef = doc(collection(getFirebaseDb()!, COLLECTION_NAME));
    const newDoc = { ...shipment, id: docRef.id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  createWithId: async (id: string, shipment: Shipment): Promise<Shipment> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    const newDoc = { ...shipment, id };
    await safeFirestoreSetDoc(docRef, newDoc);
    return newDoc;
  },

  getById: async (id: string): Promise<Shipment | null> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as Shipment;
    }
    return null;
  },

  update: async (id: string, data: Partial<Shipment>): Promise<void> => {
    const docRef = doc(getFirebaseDb()!, COLLECTION_NAME, id);
    await safeFirestoreUpdateDoc(docRef, data);
  },

  getAll: async (): Promise<Shipment[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Shipment);
  },

  getByWarehouseDispatchId: async (warehouseDispatchId: string): Promise<Shipment[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), where('warehouseDispatchId', '==', warehouseDispatchId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Shipment);
  },

  getBySalesOrderId: async (salesOrderId: string): Promise<Shipment[]> => {
    const q = query(collection(getFirebaseDb()!, COLLECTION_NAME), where('salesOrderId', '==', salesOrderId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as Shipment);
  }
};
