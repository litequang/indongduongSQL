import { ProductionOrder } from '../types';
import { INITIAL_ORDERS } from '../data/initialData';
import { getFirebaseDb } from '../config/firebase';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  Transaction,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/storageUtils';
import { safeFirestoreBatchCommit, safeFirestoreDeleteDoc, safeFirestoreRunTransaction, safeFirestoreSetDoc, safeFirestoreUpdateDoc } from '../utils/firestoreSafeWrite';
import { sanitizeForFirestore } from '../utils/firestoreSerialization';
import { changedTopLevelFields } from '../utils/firestoreDocumentDiff';

const PROD_STORAGE_KEY = 'flexo_orders_prod_v1';
const DEMO_STORAGE_KEY = 'flexo_orders_demo_v1';

export { sanitizeForFirestore } from '../utils/firestoreSerialization';

function sortOrders(orders: ProductionOrder[]): ProductionOrder[] {
  return [...orders].filter((order) => !order.deletedAt).sort((a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

function readDemoOrders(): ProductionOrder[] {
  try {
    const cached = safeLocalStorageGet(DEMO_STORAGE_KEY);
    if (cached) return sortOrders(JSON.parse(cached) as ProductionOrder[]);
  } catch {
    // Demo may use bundled sample data.
  }
  return INITIAL_ORDERS;
}

function updateCacheAfterConfirmedWrite(order: ProductionOrder): void {
  try {
    const current = JSON.parse(safeLocalStorageGet(PROD_STORAGE_KEY) || '[]') as ProductionOrder[];
    safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(sortOrders([...current.filter((item) => item.id !== order.id), order])));
  } catch {
    // A listener/read will refresh this non-authoritative cache.
  }
}

export const productionOrderRepository = {
  async getNextOrderCode(count = 1, isDemo = false): Promise<string[]> {
    if (isDemo) {
      const max = readDemoOrders().reduce((highest, order) => {
        const number = Number(order.code?.match(/^LIN-(\d+)$/i)?.[1] || 0);
        return Math.max(highest, number);
      }, 197);
      return Array.from({ length: count }, (_, index) => `LIN-${(max + index + 1).toString().padStart(4, '0')}`);
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Order number was not reserved.');
    const counterRef = doc(db, 'counters', 'orders');
    return safeFirestoreRunTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(counterRef);
      let value = Number(snapshot.data()?.value || 197);
      const codes: string[] = [];
      for (let index = 0; index < count; index += 1) {
        value += 1;
        codes.push(`LIN-${value.toString().padStart(4, '0')}`);
      }
      transaction.set(counterRef, { value }, { merge: true });
      return codes;
    });
  },

  getStorageKey(isDemo = false): string {
    return isDemo ? DEMO_STORAGE_KEY : PROD_STORAGE_KEY;
  },

  /** Realtime Firestore snapshots are the only production order feed. */
  subscribeActiveOrders(onUpdate: (orders: ProductionOrder[]) => void, onError?: (err: unknown) => void): () => void {
    const db = getFirebaseDb();
    if (!db) {
      onError?.(new Error('Firestore is not configured.'));
      return () => undefined;
    }
    const orders = collection(db, 'orders');
    const activeQuery = query(orders, where('status', 'in', [
      'DRAFT', 'WAITING_ACCEPTANCE', 'ACCEPTED', 'WAITING_PLATE', 'WAITING_PRINT',
      'PRINTING', 'PRINTED', 'FINISHING'
    ]));
    const recentTerminalQuery = query(
      orders,
      where('status', 'in', ['COMPLETED', 'CANCELLED']),
      where('createdAt', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    );

    let active: ProductionOrder[] = [];
    let terminal: ProductionOrder[] = [];
    let activeLoaded = false;
    let terminalLoaded = false;
    const emit = () => {
      if (!activeLoaded || !terminalLoaded) return;
      const confirmed = sortOrders([...active, ...terminal]);
      safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(confirmed));
      onUpdate(confirmed);
    };

    const unsubscribeActive = onSnapshot(activeQuery, (snapshot) => {
      active = snapshot.docs.map((entry) => entry.data() as ProductionOrder);
      activeLoaded = true;
      emit();
    }, (error) => onError?.(error));
    const unsubscribeTerminal = onSnapshot(recentTerminalQuery, (snapshot) => {
      terminal = snapshot.docs.map((entry) => entry.data() as ProductionOrder);
      terminalLoaded = true;
      emit();
    }, (error) => onError?.(error));
    return () => {
      unsubscribeActive();
      unsubscribeTerminal();
    };
  },

  async getHistoryOrders(lastDoc?: QueryDocumentSnapshot<DocumentData>, pageSize = 50): Promise<{ orders: ProductionOrder[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured.');
    let historyQuery = query(
      collection(db, 'orders'),
      where('status', 'in', ['COMPLETED', 'CANCELLED']),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    if (lastDoc) historyQuery = query(historyQuery, startAfter(lastDoc));
    const snapshot = await getDocs(historyQuery);
    return {
      orders: sortOrders(snapshot.docs.map((entry) => entry.data() as ProductionOrder)),
      lastDoc: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null
    };
  },

  async searchHistoryByCode(code: string): Promise<ProductionOrder[]> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured.');
    const snapshot = await getDocs(query(collection(db, 'orders'), where('code', '==', code.trim().toUpperCase()), limit(5)));
    return sortOrders(snapshot.docs.map((entry) => entry.data() as ProductionOrder));
  },

  async getOrders(isDemo = false): Promise<ProductionOrder[]> {
    if (isDemo) return readDemoOrders();
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Orders were not loaded.');
    const snapshot = await getDocs(collection(db, 'orders'));
    const orders = sortOrders(snapshot.docs.map((entry) => entry.data() as ProductionOrder));
    // This cache can only reflect an acknowledged Firestore read.
    safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(orders));
    return orders;
  },

  async saveOrder(order: ProductionOrder, isDemo = false): Promise<void> {
    const savedOrder: ProductionOrder = { ...order, updatedAt: new Date().toISOString() };
    if (isDemo) {
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(sortOrders([...readDemoOrders().filter((item) => item.id !== order.id), savedOrder])));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Order was not saved.');
    const orderRef = doc(db, 'orders', order.id);
    await safeFirestoreRunTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) {
        transaction.set(orderRef, sanitizeForFirestore(savedOrder));
        return;
      }

      const changed = changedTopLevelFields(snapshot.data() as ProductionOrder, savedOrder);
      if (Object.keys(changed).length) {
        transaction.update(orderRef, sanitizeForFirestore(changed));
      }
    });
    updateCacheAfterConfirmedWrite(savedOrder);
  },

  async createOfficialFromDraft(order: ProductionOrder): Promise<{ order: ProductionOrder; created: boolean }> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Draft dispatch was not saved.');
    const orderRef = doc(db, 'orders', order.id);
    const result = await safeFirestoreRunTransaction(db, async transaction => {
      const existing = await transaction.get(orderRef);
      if (existing.exists()) return { order: existing.data() as ProductionOrder, created: false };
      transaction.set(orderRef, sanitizeForFirestore(order));
      return { order, created: true };
    });
    updateCacheAfterConfirmedWrite(result.order);
    return result;
  },

  async saveDraftBackup(order: ProductionOrder): Promise<void> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Draft backup was skipped.');
    const backup = sanitizeForFirestore({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        imageUrl: item.image?.downloadUrl || '',
      })),
      updatedAt: new Date().toISOString(),
    });
    await safeFirestoreSetDoc(doc(db, 'production_draft_backups', order.id), backup, { merge: true });
  },

  async deleteDraftBackup(orderId: string): Promise<void> {
    const db = getFirebaseDb();
    if (!db) return;
    await safeFirestoreDeleteDoc(doc(db, 'production_draft_backups', orderId));
  },

  async getDraftBackups(createdBy: string): Promise<ProductionOrder[]> {
    const db = getFirebaseDb();
    if (!db || !createdBy) return [];
    const snapshot = await getDocs(query(collection(db, 'production_draft_backups'), where('createdBy', '==', createdBy)));
    return sortOrders(snapshot.docs.map(entry => entry.data() as ProductionOrder));
  },

  async runOrderTransaction(
    orderId: string,
    updateFn: (order: ProductionOrder, transaction: Transaction, docRef: unknown) => Promise<ProductionOrder | null>,
    isDemo = false
  ): Promise<ProductionOrder | null> {
    if (isDemo) {
      const order = readDemoOrders().find((item) => item.id === orderId);
      if (!order) throw new Error('Order not found in demo mode.');
      const transaction = { get: async () => ({ exists: () => true, data: () => order }), set: () => undefined, update: () => undefined } as unknown as Transaction;
      const updated = await updateFn(order, transaction, null);
      if (updated) await this.saveOrder(updated, true);
      return updated;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Order was not updated.');
    const orderRef = doc(db, 'orders', orderId);
    const result = await safeFirestoreRunTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) throw new Error(`Order ${orderId} does not exist.`);
      const existing = snapshot.data() as ProductionOrder;
      const updated = await updateFn(existing, transaction, orderRef);
      if (!updated) return updated;

      const committed = { ...updated, updatedAt: new Date().toISOString() };
      const changed = changedTopLevelFields(existing, committed);
      if (Object.keys(changed).length) {
        transaction.update(orderRef, sanitizeForFirestore(changed));
      }
      return committed;
    });
    if (result) updateCacheAfterConfirmedWrite(result);
    return result;
  },

  async saveOrdersBatch(ordersToSave: ProductionOrder[], isDemo = false): Promise<void> {
    if (!ordersToSave.length) return;
    if (isDemo) {
      const merged = new Map(readDemoOrders().map((item) => [item.id, item]));
      ordersToSave.forEach((order) => merged.set(order.id, { ...order, updatedAt: new Date().toISOString() }));
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(sortOrders([...merged.values()])));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Orders were not saved.');
    const batch = writeBatch(db);
    const confirmed = ordersToSave.map((order) => ({ ...order, updatedAt: new Date().toISOString() }));
    confirmed.forEach((order) => batch.set(doc(db, 'orders', order.id), sanitizeForFirestore(order), { merge: true }));
    await safeFirestoreBatchCommit(batch);
    confirmed.forEach(updateCacheAfterConfirmedWrite);
  },

  async deleteOrder(orderId: string, hardDelete = false, isDemo = false): Promise<void> {
    if (isDemo) {
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(readDemoOrders().filter((order) => order.id !== orderId)));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Order was not deleted.');
    const ref = doc(db, 'orders', orderId);
    if (hardDelete) await safeFirestoreDeleteDoc(ref);
    else await safeFirestoreUpdateDoc(ref, { deletedAt: new Date().toISOString() });
    try {
      const current = JSON.parse(safeLocalStorageGet(PROD_STORAGE_KEY) || '[]') as ProductionOrder[];
      safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(current.filter((order) => order.id !== orderId)));
    } catch {
      // Snapshot will refresh the cache.
    }
  },

  async deleteOrdersBatch(orderIds: string[], isDemo = false): Promise<void> {
    if (!orderIds.length) return;
    if (isDemo) {
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(readDemoOrders().filter((order) => !orderIds.includes(order.id))));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Orders were not deleted.');
    const batch = writeBatch(db);
    orderIds.forEach((id) => batch.set(doc(db, 'orders', id), { deletedAt: new Date().toISOString() }, { merge: true }));
    await safeFirestoreBatchCommit(batch);
    try {
      const current = JSON.parse(safeLocalStorageGet(PROD_STORAGE_KEY) || '[]') as ProductionOrder[];
      safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(current.filter((order) => !orderIds.includes(order.id))));
    } catch {
      // Snapshot will refresh the cache.
    }
  },

  async deleteAllOrders(isDemo = false): Promise<void> {
    if (isDemo) {
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify([]));
      return;
    }
    throw new Error('Bulk deletion is disabled in production. Use an audited administrator procedure instead.');
  },

  resetDemoOrders(): ProductionOrder[] {
    safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(INITIAL_ORDERS));
    return INITIAL_ORDERS;
  },

  async restoreSampleOrders(): Promise<ProductionOrder[]> {
    throw new Error('Sample orders cannot be restored into production Firestore.');
  }
};
