import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  onSnapshot,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  writeBatch,
  deleteField
} from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { SalesOrder, SalesOrderItem } from '../types';
import { safeFirestoreBatchCommit, safeFirestoreDeleteDoc, safeFirestoreSetDoc, safeFirestoreUpdateDoc } from '../utils/firestoreSafeWrite';

const ORDERS_COLLECTION = 'sales_orders';
const ITEMS_COLLECTION = 'sales_order_items';

const getDbOrThrow = () => {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase DB is not initialized');
  return db;
};

export const salesOrderRepository = {
  createOrderId(): string {
    return doc(collection(getDbOrThrow(), ORDERS_COLLECTION)).id;
  },

  createItemId(): string {
    return doc(collection(getDbOrThrow(), ITEMS_COLLECTION)).id;
  },

  async createWithItems(
    order: Omit<SalesOrder, 'createdAt' | 'updatedAt'>,
    items: Array<Omit<SalesOrderItem, 'createdAt' | 'updatedAt'>>,
  ): Promise<string> {
    const db = getDbOrThrow();
    const batch = writeBatch(db);
    batch.set(doc(db, ORDERS_COLLECTION, order.id), {
      ...order,
      deletedAt: order.deletedAt ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    items.forEach((item) => {
      batch.set(doc(db, ITEMS_COLLECTION, item.id), {
        ...item,
        deletedAt: item.deletedAt ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await safeFirestoreBatchCommit(batch);
    return order.id;
  },
  async create(order: Omit<SalesOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = doc(collection(getDbOrThrow(), ORDERS_COLLECTION));
    const now = new Date().toISOString();
    
    const newOrder: SalesOrder = {
      ...order,
      id: docRef.id,
      deletedAt: order.deletedAt ?? null,
      createdAt: now,
      updatedAt: now
    };
    
    await safeFirestoreSetDoc(docRef, {
      ...newOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return docRef.id;
  },

  async updateOrder(id: string, data: Partial<SalesOrder>): Promise<void> {
    const docRef = doc(getDbOrThrow(), ORDERS_COLLECTION, id);
    await safeFirestoreUpdateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  },

  async update(id: string, data: Partial<SalesOrder>): Promise<void> {
    return this.updateOrder(id, data);
  },

  async getById(id: string): Promise<SalesOrder | null> {
    const docRef = doc(getDbOrThrow(), ORDERS_COLLECTION, id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    
    const data = snapshot.data();
    return {
      ...data,
      id: snapshot.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      confirmedAt: data.confirmedAt?.toDate?.()?.toISOString() || data.confirmedAt,
      completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
      cancelledAt: data.cancelledAt?.toDate?.()?.toISOString() || data.cancelledAt,
    } as SalesOrder;
  },

  async getByCustomer(customerId: string): Promise<SalesOrder[]> {
    const q = query(
      collection(getDbOrThrow(), ORDERS_COLLECTION),
      where('customerId', '==', customerId),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc')
    );
    return this.mapQuerySnapshot(await getDocs(q));
  },

  async getBySale(saleId: string): Promise<SalesOrder[]> {
    const q = query(
      collection(getDbOrThrow(), ORDERS_COLLECTION),
      where('saleId', '==', saleId),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc')
    );
    return this.mapQuerySnapshot(await getDocs(q));
  },

  async getActiveOrders(): Promise<SalesOrder[]> {
    const q = query(
      collection(getDbOrThrow(), ORDERS_COLLECTION),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc')
    );
    const all = await this.mapQuerySnapshot(await getDocs(q));
    return all.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  },

  /** The management list must distinguish a query failure from an empty result. */
  subscribeActiveOrders(onData: (orders: SalesOrder[]) => void, onError: (error: Error) => void): () => void {
    const q = query(
      collection(getDbOrThrow(), ORDERS_COLLECTION),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snapshot) => {
      const orders = this.mapQuerySnapshot(snapshot).filter((order) => order.status !== 'COMPLETED' && order.status !== 'CANCELLED');
      onData(orders);
    }, onError);
  },
  
  async getOrders(options?: { status?: string; limit?: number }): Promise<SalesOrder[]> {
     const q = query(
      collection(getDbOrThrow(), ORDERS_COLLECTION),
      where('deletedAt', '==', null),
      orderBy('createdAt', 'desc')
    );
    let results = await this.mapQuerySnapshot(await getDocs(q));
    if (options?.status) {
      results = results.filter(o => o.status === options.status);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }
    return results;
  },

  async softDelete(id: string): Promise<void> {
    const docRef = doc(getDbOrThrow(), ORDERS_COLLECTION, id);
    await safeFirestoreUpdateDoc(docRef, {
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  },

  async getItemsByOrderId(orderId: string): Promise<SalesOrderItem[]> {
    const q = query(
      collection(getDbOrThrow(), ITEMS_COLLECTION),
      where('salesOrderId', '==', orderId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
      } as SalesOrderItem;
    });
  },

  async getItem(orderId: string, itemId: string): Promise<SalesOrderItem | null> {
    const docRef = doc(getDbOrThrow(), ITEMS_COLLECTION, itemId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists() || docSnap.data().salesOrderId !== orderId) {
      return null;
    }
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
    } as SalesOrderItem;
  },

  async getOrder(id: string): Promise<SalesOrder | null> {
    const docRef = doc(getDbOrThrow(), ORDERS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists() || docSnap.data().deletedAt) {
      return null;
    }
    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
    } as SalesOrder;
  },

  async updateItem(idOrOrderId: string, itemIdOrData: string | Partial<SalesOrderItem>, optionalData?: Partial<SalesOrderItem>): Promise<void> {
    let itemId: string;
    let data: Partial<SalesOrderItem>;

    if (typeof itemIdOrData === 'string') {
      itemId = itemIdOrData;
      data = optionalData!;
    } else {
      itemId = idOrOrderId;
      data = itemIdOrData;
    }

    const docRef = doc(getDbOrThrow(), ITEMS_COLLECTION, itemId);
    // `undefined` is ignored by the configured Firestore client. For the two
    // image-reference fields it instead means the user explicitly removed the
    // image, so delete the fields before the corresponding Storage cleanup.
    const persistedData: Record<string, unknown> = { ...data };
    (['image', 'imageUrl'] as const).forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(data, field) && data[field] === undefined) {
        persistedData[field] = deleteField();
      }
    });
    await safeFirestoreUpdateDoc(docRef, {
      ...persistedData,
      updatedAt: serverTimestamp()
    });
  },

  async createItem(item: Omit<SalesOrderItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = doc(collection(getDbOrThrow(), ITEMS_COLLECTION));
    const now = new Date().toISOString();
    
    const newItem: SalesOrderItem = {
      ...item,
      id: docRef.id,
      deletedAt: item.deletedAt ?? null,
      createdAt: now,
      updatedAt: now
    };
    
    await safeFirestoreSetDoc(docRef, {
      ...newItem,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return docRef.id;
  },

  async createItemWithId(item: Omit<SalesOrderItem, 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = doc(getDbOrThrow(), ITEMS_COLLECTION, item.id);
    await safeFirestoreSetDoc(docRef, {
      ...item,
      deletedAt: item.deletedAt ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return item.id;
  },
  
  async deleteItem(id: string): Promise<void> {
    const docRef = doc(getDbOrThrow(), ITEMS_COLLECTION, id);
    await safeFirestoreDeleteDoc(docRef);
  },

  mapQuerySnapshot(snapshot: any): SalesOrder[] {
    return snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        confirmedAt: data.confirmedAt?.toDate?.()?.toISOString() || data.confirmedAt,
        completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt,
        cancelledAt: data.cancelledAt?.toDate?.()?.toISOString() || data.cancelledAt,
      } as SalesOrder;
    });
  }
};
