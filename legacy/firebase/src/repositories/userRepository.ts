import { User } from '../types';
import { INITIAL_USERS } from '../data/initialData';
import { getFirebaseDb } from '../config/firebase';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/storageUtils';
import { safeFirestoreDeleteDoc, safeFirestoreSetDoc } from '../utils/firestoreSafeWrite';

const PROD_STORAGE_KEY = 'flexo_users_prod_v1';
const DEMO_STORAGE_KEY = 'flexo_users_demo_v1';

function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, value) => value === undefined ? null : value));
}

/** Browser PINs are not permitted in Firestore production user profiles. */
function toFirestoreUser(user: User): Omit<User, 'pin' | 'firebaseUid'> {
  const { pin: _pin, firebaseUid: _firebaseUid, ...profile } = user;
  return profile;
}

function parseUserDoc(id: string, data: Partial<User>): User {
  return {
    id: data.id || id,
    legacyUserId: data.legacyUserId || data.id || id,
    name: data.name || 'Workshop user',
    email: data.email || '',
    role: data.role || 'PRINTER',
    avatar: data.avatar || '',
    avatarImage: data.avatarImage,
    phone: data.phone || '',
    username: data.username || '',
    // Never read a legacy Firestore pin into the client auth model.
    pin: '',
    active: data.active !== false,
    machineAssigned: data.machineAssigned,
    deletedAt: data.deletedAt,
    updatedAt: data.updatedAt,
    createdAt: data.createdAt,
  };
}

function readDemoUsers(): User[] {
  try {
    const cached = safeLocalStorageGet(DEMO_STORAGE_KEY);
    if (cached) return (JSON.parse(cached) as User[]).filter((user) => !user.deletedAt && user.active !== false);
  } catch {
    // Demo falls back to supplied samples only.
  }
  return INITIAL_USERS;
}

export const userRepository = {
  getStorageKey(isDemo = false): string {
    return isDemo ? DEMO_STORAGE_KEY : PROD_STORAGE_KEY;
  },

  subscribeUsers(onUpdate: (users: User[]) => void, onError?: (err: unknown) => void): () => void {
    const db = getFirebaseDb();
    if (!db) {
      onError?.(new Error('Firestore is not configured.'));
      return () => undefined;
    }
    return onSnapshot(collection(db, 'users'), (snapshot) => {
      const users = snapshot.docs
        .map((entry) => parseUserDoc(entry.id, entry.data() as Partial<User>))
        .filter((user) => !user.deletedAt && user.active !== false);
      // Cache only a Firestore-confirmed snapshot.
      safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(users));
      onUpdate(users);
    }, (error) => onError?.(error));
  },

  async getUsers(isDemo = false): Promise<User[]> {
    if (isDemo) return readDemoUsers();
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured.');
    const snapshot = await getDocs(collection(db, 'users'));
    const users = snapshot.docs
      .map((entry) => parseUserDoc(entry.id, entry.data() as Partial<User>))
      .filter((user) => !user.deletedAt && user.active !== false);
    safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(users));
    return users;
  },

  async saveUser(user: User, isDemo = false): Promise<void> {
    const updatedUser = { ...user, active: user.active !== false, updatedAt: new Date().toISOString() };
    if (isDemo) {
      const current = readDemoUsers();
      const next = [...current.filter((item) => item.id !== updatedUser.id), updatedUser];
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(next));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. User was not saved.');
    await safeFirestoreSetDoc(doc(db, 'users', updatedUser.id), sanitizeForFirestore(toFirestoreUser(updatedUser)), { merge: true });
    const current = (() => {
      try { return JSON.parse(safeLocalStorageGet(PROD_STORAGE_KEY) || '[]') as User[]; } catch { return []; }
    })();
    safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify([...current.filter((item) => item.id !== updatedUser.id), updatedUser]));
  },

  async updateUser(userId: string, updates: Partial<User>, isDemo = false): Promise<void> {
    const safeUpdates = Object.fromEntries(Object.entries(updates).filter(([key, value]) => value !== undefined && key !== 'pin' && key !== 'firebaseUid')) as Partial<User>;
    if (isDemo) {
      const next = readDemoUsers().map((user) => user.id === userId ? { ...user, ...safeUpdates, updatedAt: new Date().toISOString() } : user);
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(next));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. User was not updated.');
    await safeFirestoreSetDoc(doc(db, 'users', userId), sanitizeForFirestore({ ...safeUpdates, updatedAt: new Date().toISOString() }), { merge: true });
    try {
      const current = JSON.parse(safeLocalStorageGet(PROD_STORAGE_KEY) || '[]') as User[];
      safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(current.map((user) => user.id === userId ? { ...user, ...safeUpdates } : user)));
    } catch {
      // Cache refresh is non-authoritative and may be retried from Firestore.
    }
  },

  async deleteUser(userId: string, soft = true, isDemo = false): Promise<void> {
    if (isDemo) {
      safeLocalStorageSet(DEMO_STORAGE_KEY, JSON.stringify(readDemoUsers().filter((user) => user.id !== userId)));
      return;
    }
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. User was not deleted.');
    const ref = doc(db, 'users', userId);
    if (soft) {
      await safeFirestoreSetDoc(ref, { active: false, deletedAt: new Date().toISOString() }, { merge: true });
    } else {
      await safeFirestoreDeleteDoc(ref);
    }
    try {
      const current = JSON.parse(safeLocalStorageGet(PROD_STORAGE_KEY) || '[]') as User[];
      safeLocalStorageSet(PROD_STORAGE_KEY, JSON.stringify(current.filter((user) => user.id !== userId)));
    } catch {
      // Cache refresh is non-authoritative and may be retried from Firestore.
    }
  }
};
