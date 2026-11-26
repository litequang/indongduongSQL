import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';
import { FinishingTask } from '../types';

function timestampToIso(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === 'string' ? value : undefined;
}

export const finishingTaskRepository = {
  async getAll(): Promise<FinishingTask[]> {
    const db = getFirebaseDb();
    if (!db) return [];
    const snapshot = await getDocs(query(collection(db, 'finishing_tasks'), orderBy('createdAt', 'desc')));
    return snapshot.docs.map(document => {
      const data = document.data();
      return {
        ...data,
        id: document.id,
        createdAt: timestampToIso(data.createdAt) || new Date(0).toISOString(),
        updatedAt: timestampToIso(data.updatedAt),
        claimedAt: timestampToIso(data.claimedAt),
        completedAt: timestampToIso(data.completedAt),
      } as FinishingTask;
    });
  },

  subscribe(onChange: (tasks: FinishingTask[]) => void, onError?: (error: Error) => void): () => void {
    const db = getFirebaseDb();
    if (!db) {
      onChange([]);
      return () => undefined;
    }
    return onSnapshot(query(collection(db, 'finishing_tasks'), orderBy('createdAt', 'desc')), snapshot => {
      onChange(snapshot.docs.map(document => {
        const data = document.data();
        return {
          ...data,
          id: document.id,
          createdAt: timestampToIso(data.createdAt) || new Date(0).toISOString(),
          updatedAt: timestampToIso(data.updatedAt),
          claimedAt: timestampToIso(data.claimedAt),
          completedAt: timestampToIso(data.completedAt),
        } as FinishingTask;
      }));
    }, error => onError?.(error));
  },
};
