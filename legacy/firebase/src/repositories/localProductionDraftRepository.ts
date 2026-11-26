import { ProductionOrder } from '../types';
import { PreparedImage } from '../services/imageStorageService';

const DB_NAME = 'flexo-workflow-v2';
const DB_VERSION = 1;
const STORE_NAME = 'production-drafts';

interface StoredDraftImage {
  file: Blob;
  contentType: PreparedImage['contentType'];
  fileName: string;
  originalFileName?: string;
  size: number;
  width: number;
  height: number;
}

export interface LocalProductionDraftRecord {
  order: ProductionOrder;
  images: Record<string, StoredDraftImage>;
}

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable on this device.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'order.id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the local draft database.'));
  });
}

async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = work(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Local draft operation failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Local draft transaction was aborted.'));
    });
  } finally {
    database.close();
  }
}

function revive(record: LocalProductionDraftRecord): LocalProductionDraftRecord {
  const items = record.order.items.map((item) => {
    const stored = record.images[item.id];
    return stored ? { ...item, imageUrl: URL.createObjectURL(stored.file) } : item;
  });
  return { ...record, order: { ...record.order, items } };
}

export const localProductionDraftRepository = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async list(): Promise<ProductionOrder[]> {
    const records = await transact<LocalProductionDraftRecord[]>('readonly', (store) => store.getAll());
    return records.map(revive).map((record) => record.order).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<LocalProductionDraftRecord | null> {
    const record = await transact<LocalProductionDraftRecord | undefined>('readonly', (store) => store.get(id));
    return record ? revive(record) : null;
  },

  async save(order: ProductionOrder, localImages: Record<string, PreparedImage | undefined> = {}): Promise<void> {
    const existing = await transact<LocalProductionDraftRecord | undefined>('readonly', (store) => store.get(order.id));
    const images: Record<string, StoredDraftImage> = { ...(existing?.images || {}) };
    for (const [itemId, image] of Object.entries(localImages)) {
      if (!image) continue;
      images[itemId] = {
        file: image.file,
        contentType: image.contentType,
        fileName: image.fileName,
        originalFileName: image.originalFileName,
        size: image.size,
        width: image.width,
        height: image.height,
      };
    }
    await transact<IDBValidKey>('readwrite', (store) => store.put({ order, images } satisfies LocalProductionDraftRecord));
    notify();
  },

  async updateOrder(order: ProductionOrder): Promise<void> {
    const existing = await transact<LocalProductionDraftRecord | undefined>('readonly', (store) => store.get(order.id));
    if (!existing) throw new Error('Local production draft was not found.');
    await transact<IDBValidKey>('readwrite', (store) => store.put({ ...existing, order }));
    notify();
  },

  async remove(id: string): Promise<void> {
    await transact<undefined>('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
    notify();
  },
};

export function chooseAuthoritativeDraft(local: ProductionOrder | null, backup: ProductionOrder | null): ProductionOrder | null {
  // Once a device has a local copy it is authoritative, even when an older
  // background backup reports a higher/malformed counter. Backups are only a
  // disaster-recovery source for devices with no local record.
  return local || backup;
}
