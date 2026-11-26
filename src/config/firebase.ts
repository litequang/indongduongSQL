import { initializeApp, getApps, getApp, FirebaseApp, deleteApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  getDoc,
  setLogLevel,
  terminate
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage, FirebaseStorage } from 'firebase/storage';
import { connectAuthEmulator, getAuth, Auth } from 'firebase/auth';
import { safeFirestoreSetDoc } from '../utils/firestoreSafeWrite';

try {
  setLogLevel('silent');
} catch {
  // Firebase SDK versions without log-level support are still usable.
}

const isDemoBuild = import.meta.env.VITE_DEPLOYMENT_MODE === 'DEMO';

/**
 * Production Firebase configuration is immutable browser build configuration.
 * A workstation-local setting can only be used by an explicitly built DEMO
 * instance; it must never redirect a production client to another project.
 */
export const getActiveFirebaseConfig = () => {
  let customConfig: Record<string, string> = {};
  if (isDemoBuild && typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem('flexo_custom_firebase_config_v1');
      if (saved) customConfig = JSON.parse(saved);
    } catch {
      // Invalid demo-only configuration is ignored.
    }
  }

  return {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || customConfig.apiKey || '').trim(),
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || customConfig.authDomain || '').trim(),
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || customConfig.projectId || '').trim(),
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || customConfig.storageBucket || '').trim(),
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || customConfig.messagingSenderId || '').trim(),
    appId: (import.meta.env.VITE_FIREBASE_APP_ID || customConfig.appId || '').trim(),
  };
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let lastConfigHash = '';
let storageEmulatorConnected = false;
let firestoreEmulatorConnected = false;
let authEmulatorConnected = false;

export const isFirebaseConfigured = (): boolean => {
  const config = getActiveFirebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.apiKey.length > 5 && config.projectId.length > 2);
};

export const getFirebaseApp = (): FirebaseApp | null => {
  if (!isFirebaseConfigured()) return null;
  const config = getActiveFirebaseConfig();
  const currentHash = `${config.projectId}_${config.apiKey.slice(-6)}`;

  if (app && lastConfigHash !== currentHash) {
    void deleteApp(app).catch(() => undefined);
    app = null;
    db = null;
    storage = null;
    storageEmulatorConnected = false;
    auth = null;
    firestoreEmulatorConnected = false;
    authEmulatorConnected = false;
  }

  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config);
    lastConfigHash = currentHash;
  }
  return app;
};

export const getFirebaseDb = (): Firestore | null => {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!db) {
    try {
      db = initializeFirestore(firebaseApp, {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
      });
    } catch {
      db = getFirestore(firebaseApp);
    }
  }
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !firestoreEmulatorConnected) {
    const host = import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
    const port = Number(import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || '8080');
    connectFirestoreEmulator(db, host, port);
    firestoreEmulatorConnected = true;
  }
  return db;
};

export const getFirebaseStorage = (): FirebaseStorage | null => {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!storage) storage = getStorage(firebaseApp);
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !storageEmulatorConnected) {
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    storageEmulatorConnected = true;
  }
  return storage;
};

export const getFirebaseAuth = (): Auth | null => {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  if (!auth) auth = getAuth(firebaseApp);
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !authEmulatorConnected) {
    const host = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1';
    const port = Number(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT || '9099');
    connectAuthEmulator(auth, `http://${host}:${port}`, { disableWarnings: true });
    authEmulatorConnected = true;
  }
  return auth;
};

export interface FirebaseHealthResult {
  success: boolean;
  message: string;
  pingMs?: number;
  projectId?: string;
  network: 'ONLINE' | 'OFFLINE' | 'NOT_TESTED';
  firebaseAuth: 'AUTHENTICATED' | 'NOT_AUTHENTICATED' | 'NOT_TESTED';
  firestoreRead: 'VERIFIED' | 'FAILED' | 'NOT_TESTED';
  firestoreWrite: 'VERIFIED' | 'FAILED' | 'NOT_AUTHORIZED_FOR_HEALTH_CHECK' | 'NOT_TESTED';
}

/**
 * Verifies Firebase Auth and a Rules-protected Firestore read for every
 * provisioned role. Only administrators write `_system_health/ping`; a
 * printer must never need generic health-document write permission to prove
 * the cloud connection is usable.
 */
export const testFirebaseConnection = async (timeoutMs = 7000): Promise<FirebaseHealthResult> => {
  const network = typeof navigator === 'undefined' || navigator.onLine ? 'ONLINE' : 'OFFLINE';
  if (!isFirebaseConfigured()) {
    return {
      success: false,
      message: 'FIREBASE INITIALIZED: NO. Missing Project ID or API key in the production build configuration.',
      network,
      firebaseAuth: 'NOT_TESTED',
      firestoreRead: 'NOT_TESTED',
      firestoreWrite: 'NOT_TESTED',
    };
  }

  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth?.currentUser) {
    return {
      success: false,
      message: 'FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: NO | FIRESTORE READ: NOT TESTED | FIRESTORE WRITE: NOT TESTED.',
      network,
      firebaseAuth: 'NOT_AUTHENTICATED',
      firestoreRead: 'NOT_TESTED',
      firestoreWrite: 'NOT_TESTED',
    };
  }

  const firestore = getFirebaseDb();
  if (!firestore) {
    return {
      success: false,
      message: 'FIREBASE INITIALIZED: NO. Firestore could not be created.',
      network,
      firebaseAuth: 'AUTHENTICATED',
      firestoreRead: 'NOT_TESTED',
      firestoreWrite: 'NOT_TESTED',
    };
  }

  const runHealthCheck = async (): Promise<FirebaseHealthResult> => {
    const start = performance.now();
    // Refresh the auth token so this is a real Auth + Rules verification.
    await firebaseAuth.currentUser!.getIdToken(true);

    // This is the same identity document the production authorization path
    // uses. A successful read verifies both Firestore reachability and Rules.
    const identityRef = doc(firestore, 'auth_identities', firebaseAuth.currentUser!.uid);
    let identitySnapshot;
    try {
      identitySnapshot = await getDoc(identityRef);
    } catch (error: any) {
      const detail = String(error?.message || error);
      return {
        success: false,
        message: `FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: FAILED. ${detail}`,
        network,
        firebaseAuth: 'AUTHENTICATED',
        firestoreRead: 'FAILED',
        firestoreWrite: 'NOT_TESTED',
      };
    }

    if (!identitySnapshot.exists()) {
      return {
        success: false,
        message: 'FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: FAILED (identity mapping not found).',
        network,
        firebaseAuth: 'AUTHENTICATED',
        firestoreRead: 'FAILED',
        firestoreWrite: 'NOT_TESTED',
      };
    }

    const identity = identitySnapshot.data() as { role?: unknown; active?: unknown };
    if (identity.active !== true) {
      return {
        success: false,
        message: 'FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: FAILED (identity is inactive).',
        network,
        firebaseAuth: 'AUTHENTICATED',
        firestoreRead: 'FAILED',
        firestoreWrite: 'NOT_TESTED',
      };
    }

    const role = String(identity.role || '');
    if (!['DEVELOPER', 'ADMIN'].includes(role)) {
      return {
        success: true,
        message: 'FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: VERIFIED | FIRESTORE WRITE: NOT TESTED (this role is not authorized to write the admin health document).',
        network,
        firebaseAuth: 'AUTHENTICATED',
        firestoreRead: 'VERIFIED',
        firestoreWrite: 'NOT_AUTHORIZED_FOR_HEALTH_CHECK',
        projectId: getActiveFirebaseConfig().projectId,
      };
    }

    try {
      const testRef = doc(firestore, '_system_health', 'ping');
      await safeFirestoreSetDoc(testRef, {
        lastPing: new Date().toISOString(),
        app: 'Flexo Workshop'
      }, { merge: true });
      const snap = await getDoc(testRef);
      if (!snap.exists()) throw new Error('Health document was not returned after write.');

      const pingMs = Math.round(performance.now() - start);
      return {
        success: true,
        message: `FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: VERIFIED | FIRESTORE WRITE: VERIFIED (${pingMs}ms).`,
        pingMs,
        projectId: getActiveFirebaseConfig().projectId,
        network,
        firebaseAuth: 'AUTHENTICATED',
        firestoreRead: 'VERIFIED',
        firestoreWrite: 'VERIFIED',
      };
    } catch (error: any) {
      const detail = String(error?.message || error);
      return {
        success: false,
        message: `FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: VERIFIED | FIRESTORE WRITE: FAILED. ${detail}`,
        network,
        firebaseAuth: 'AUTHENTICATED',
        firestoreRead: 'VERIFIED',
        firestoreWrite: 'FAILED',
      };
    }
  };

  try {
    return await Promise.race([
      runHealthCheck(),
      new Promise<FirebaseHealthResult>((_, reject) => {
        setTimeout(() => reject(new Error(`Health check exceeded ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } catch (err: any) {
    const detail = String(err?.message || err);
    return {
      success: false,
      message: `FIREBASE INITIALIZED: YES | FIREBASE AUTHENTICATED: YES | FIRESTORE READ: FAILED | FIRESTORE WRITE: NOT TESTED. ${detail}`,
      network,
      firebaseAuth: 'AUTHENTICATED',
      firestoreRead: 'FAILED',
      firestoreWrite: 'NOT_TESTED',
    };
  }
};

/** Kept for compatibility with existing diagnostics; never called during normal operation. */
export const terminateFirebaseConnection = async (): Promise<void> => {
  if (db) await terminate(db);
};
