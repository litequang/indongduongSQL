import { Customer, CustomerImportJob } from '../types';
import { getFirebaseDb } from '../config/firebase';
import { collection, writeBatch, doc, getDocs, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { safeFirestoreBatchCommit, safeFirestoreRunTransaction, safeFirestoreSetDoc } from '../utils/firestoreSafeWrite';

export const customerRepository = {
  async getNextCustomerCode(count: number = 1): Promise<string[]> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Customer code was not reserved.');

    const counterRef = doc(db, 'counters', 'customers');
    return safeFirestoreRunTransaction(db, async (transaction) => {
      const nextCodes: string[] = [];
        const counterDoc = await transaction.get(counterRef);
        let currentVal = 0;
        if (counterDoc.exists()) {
          currentVal = counterDoc.data().value || 0;
        }
        
        for (let i = 0; i < count; i++) {
          currentVal++;
          nextCodes.push(`KH-${currentVal.toString().padStart(6, '0')}`);
        }
        
        transaction.set(counterRef, { value: currentVal }, { merge: true });
        return nextCodes;
    });
  },

  async createCustomer(customer: Customer): Promise<void> {
    const db = getFirebaseDb();
    if (!db) throw new Error("Firebase not initialized");
    const cId = customer.id || doc(collection(db, 'customers')).id;
    await safeFirestoreSetDoc(doc(db, 'customers', cId), { ...customer, id: cId, deletedAt: customer.deletedAt ?? null });
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    const db = getFirebaseDb();
    if (!db) throw new Error("Firebase not initialized");
    await safeFirestoreSetDoc(doc(db, 'customers', id), updates, { merge: true });
  },

  async getCustomers(): Promise<Customer[]> {
    const db = getFirebaseDb();
    if (!db) return [];
    const q = query(collection(db, 'customers'), where('deletedAt', '==', null));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Customer);
  },

  /** Active-customer lists are realtime so a successful create is visible without a reload. */
  subscribeCustomers(onData: (customers: Customer[]) => void, onError: (error: Error) => void): () => void {
    const db = getFirebaseDb();
    if (!db) {
      onError(new Error('Firestore is not configured.'));
      return () => undefined;
    }
    const activeCustomers = query(collection(db, 'customers'), where('deletedAt', '==', null), orderBy('createdAt', 'desc'));
    return onSnapshot(
      activeCustomers,
      (snapshot) => onData(snapshot.docs.map((entry) => entry.data() as Customer)),
      (error) => onError(error),
    );
  },

  async getCustomerById(id: string): Promise<Customer | null> {
    const db = getFirebaseDb();
    if (!db) return null;
    const docSnap = await getDoc(doc(db, 'customers', id));
    return docSnap.exists() ? (docSnap.data() as Customer) : null;
  },

  async importCustomers(
    customers: Customer[], 
    jobInfo: Omit<CustomerImportJob, 'id' | 'createdAt'>
  ): Promise<CustomerImportJob> {
    const db = getFirebaseDb();
    if (!db) throw new Error("Firebase not initialized");
    const batch = writeBatch(db);
    const customersCol = collection(db, 'customers');
    const jobsCol = collection(db, 'customer_import_jobs');
    const jobId = doc(jobsCol).id;
    const now = new Date().toISOString();
    const jobData: CustomerImportJob = {
      ...jobInfo,
      id: jobId,
      createdAt: now
    };
    batch.set(doc(jobsCol, jobId), jobData);

    customers.forEach(c => {
      const cId = c.id || doc(customersCol).id;
      const data = { ...c, id: cId, importJobId: jobId, deletedAt: c.deletedAt ?? null };
      batch.set(doc(customersCol, cId), data, { merge: true });
    });
    
    await safeFirestoreBatchCommit(batch);
    return jobData;
  },

  async findExistingCustomersByPhones(phones: string[]): Promise<Customer[]> {
    const db = getFirebaseDb();
    if (!db) return [];
    if (phones.length === 0) return [];
    try {
      const customersCol = collection(db, 'customers');
      
      const chunks = [];
      for (let i = 0; i < phones.length; i += 10) {
        chunks.push(phones.slice(i, i + 10));
      }
      
      const results: Customer[] = [];
      for (const chunk of chunks) {
        const q = query(customersCol, where('phoneNormalized', 'in', chunk), where('deletedAt', '==', null));
        const snap = await getDocs(q);
        snap.forEach(d => {
          results.push(d.data() as Customer);
        });
      }
      return results;
    } catch (err) {
      console.warn("Failed to find existing customers", err);
      return [];
    }
  },

  async findExistingCustomerByExternalId(externalId: string): Promise<Customer | null> {
    const db = getFirebaseDb();
    if (!db) return null;
    try {
      const q = query(collection(db, 'customers'), where('externalId', '==', externalId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].data() as Customer;
      }
      return null;
    } catch (e) {
      return null;
    }
  }
};
