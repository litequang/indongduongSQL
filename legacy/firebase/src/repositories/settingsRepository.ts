import { AppConfig } from '../types';
import { DEFAULT_APP_CONFIG } from '../config/appConfig';
import { getFirebaseDb } from '../config/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { safeLocalStorageSet } from '../utils/storageUtils';
import { safeFirestoreSetDoc } from '../utils/firestoreSafeWrite';

const LOCAL_STORAGE_KEY = 'flexo_instance_app_config_v1';

function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => (value === undefined ? null : value))
  );
}

export const settingsRepository = {
  /**
   * Realtime listener for app config changes across all connected devices.
   */
  subscribeAppConfig(
    onUpdate: (config: AppConfig) => void,
    onError?: (err: any) => void
  ): () => void {
    const db = getFirebaseDb();
    if (!db) return () => {};

    try {
      const docRef = doc(db, 'settings', 'app');
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<AppConfig>;
            const merged: AppConfig = {
              ...DEFAULT_APP_CONFIG,
              ...data,
              company: { ...DEFAULT_APP_CONFIG.company, ...(data.company || {}) },
              production: { ...DEFAULT_APP_CONFIG.production, ...(data.production || {}) },
              workflow: { ...DEFAULT_APP_CONFIG.workflow, ...(data.workflow || {}) },
              features: { ...DEFAULT_APP_CONFIG.features, ...(data.features || {}) },
              system: { ...DEFAULT_APP_CONFIG.system, ...(data.system || {}) },
              permissions: data.permissions ? {
                roleMatrix: { ...(DEFAULT_APP_CONFIG.permissions?.roleMatrix || {}), ...(data.permissions.roleMatrix || {}) },
                userOverrides: { ...(DEFAULT_APP_CONFIG.permissions?.userOverrides || {}), ...(data.permissions.userOverrides || {}) },
                customFeatures: data.permissions.customFeatures || DEFAULT_APP_CONFIG.permissions?.customFeatures || []
              } : DEFAULT_APP_CONFIG.permissions,
            };
            safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(merged));
            onUpdate(merged);
          }
        },
        (error) => {
          if (onError) onError(error);
        }
      );
      return unsubscribe;
    } catch (err) {
      return () => {};
    }
  },

  async getAppConfig(): Promise<AppConfig> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. App config was not loaded.');
    const docRef = doc(db, 'settings', 'app');
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore timeout')), 2500)
    );
    const snap = await Promise.race([getDoc(docRef), timeoutPromise]);
    if (!snap.exists()) return DEFAULT_APP_CONFIG;
    const data = snap.data() as Partial<AppConfig>;
    // Merge with defaults to ensure all keys exist after a successful remote read.
    return {
      ...DEFAULT_APP_CONFIG,
      ...data,
      company: { ...DEFAULT_APP_CONFIG.company, ...(data.company || {}) },
      production: { ...DEFAULT_APP_CONFIG.production, ...(data.production || {}) },
      workflow: { ...DEFAULT_APP_CONFIG.workflow, ...(data.workflow || {}) },
      features: { ...DEFAULT_APP_CONFIG.features, ...(data.features || {}) },
      system: { ...DEFAULT_APP_CONFIG.system, ...(data.system || {}) },
      permissions: data.permissions ? {
        roleMatrix: { ...(DEFAULT_APP_CONFIG.permissions?.roleMatrix || {}), ...(data.permissions.roleMatrix || {}) },
        userOverrides: { ...(DEFAULT_APP_CONFIG.permissions?.userOverrides || {}), ...(data.permissions.userOverrides || {}) },
        customFeatures: data.permissions.customFeatures || DEFAULT_APP_CONFIG.permissions?.customFeatures || []
      } : DEFAULT_APP_CONFIG.permissions,
    };
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    const db = getFirebaseDb();
    if (!db) throw new Error('Firestore is not configured. Settings were not saved.');
    const docRef = doc(db, 'settings', 'app');
    const cleanConfig = sanitizeForFirestore({
      ...config,
      updatedAt: new Date().toISOString()
    });
    await safeFirestoreSetDoc(docRef, cleanConfig, { merge: true });
    safeLocalStorageSet(LOCAL_STORAGE_KEY, JSON.stringify(config));
  }
};
