import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { User, UserRole } from '../types';
import { INITIAL_USERS } from '../data/initialData';
import { userRepository } from '../repositories/userRepository';
import { getFirebaseAuth, getFirebaseDb } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../utils/storageUtils';
import { soundManager } from '../utils/soundUtils';
import { AuthInitializationState, isAuthIdentityRole } from '../utils/authInitializationState';

export interface AuthResolutionError {
  code: 'FIREBASE_UNAVAILABLE' | 'AUTH_IDENTITY_MISSING' | 'AUTH_IDENTITY_INVALID' | 'BUSINESS_USER_MISSING' | 'BUSINESS_USER_INACTIVE' | 'PERMISSION_DENIED' | 'PROFILE_RESOLUTION_FAILED';
  title: string;
  message: string;
}

interface AuthContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  users: User[];
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  loginWithPin: (userId: string, pin: string) => boolean;
  signInWithFirebase: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  firebaseAuthReady: boolean;
  firebaseAuthenticated: boolean;
  firebaseProfile: User | null;
  authInitializationState: AuthInitializationState;
  authResolutionError: AuthResolutionError | null;
  retryFirebaseProfile: () => Promise<void>;
  isSessionLocked: boolean;
  setIsSessionLocked: (locked: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
}

interface AuthIdentity {
  businessUserId: string;
  role: UserRole;
  active: boolean;
}

class FirebaseProfileResolutionError extends Error {
  constructor(
    readonly code: AuthResolutionError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'FirebaseProfileResolutionError';
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEYS_PROD = { USERS: 'flexo_users_prod_v1', CURRENT_USER: 'flexo_current_user_prod_v1' };
const STORAGE_KEYS_DEMO = { USERS: 'flexo_users_demo_v1', CURRENT_USER: 'flexo_current_user_demo_v1' };
const isDemoBuild = import.meta.env.VITE_DEPLOYMENT_MODE === 'DEMO';
const UNAUTHENTICATED_USER: User = {
  id: '',
  legacyUserId: '',
  name: '',
  role: 'PRINTER',
  avatar: '',
  phone: '',
  username: '',
  pin: '',
  active: false,
  createdAt: '',
};

/**
 * Resolves Firebase Auth UID through a server-controlled identity document.
 * Historical business IDs remain unchanged, so createdBy/printer/designer/etc.
 * references continue to point at users/{businessUserId}.
 */
async function loadFirebaseProfile(uid: string): Promise<User> {
  const db = getFirebaseDb();
  if (!db) throw new Error('Firebase is not configured.');

  const identitySnapshot = await getDoc(doc(db, 'auth_identities', uid));
  if (!identitySnapshot.exists()) {
    throw new FirebaseProfileResolutionError(
      'AUTH_IDENTITY_MISSING',
      'Tài khoản Firebase này chưa được cấp hồ sơ nhân sự. Hãy liên hệ quản trị viên để tạo auth_identities/{uid}.',
    );
  }

  const identity = identitySnapshot.data() as Partial<AuthIdentity>;
  if (!identity.active || !identity.businessUserId || !isAuthIdentityRole(identity.role)) {
    throw new FirebaseProfileResolutionError('AUTH_IDENTITY_INVALID', 'Hồ sơ quyền Firebase của tài khoản đã bị vô hiệu hóa hoặc không hợp lệ.');
  }

  const userSnapshot = await getDoc(doc(db, 'users', identity.businessUserId));
  if (!userSnapshot.exists()) {
    throw new FirebaseProfileResolutionError('BUSINESS_USER_MISSING', 'Hồ sơ nhân sự được liên kết với tài khoản này không còn tồn tại.');
  }
  const profile = userSnapshot.data() as Partial<User>;
  if (profile.active === false || profile.deletedAt) {
    throw new FirebaseProfileResolutionError('BUSINESS_USER_INACTIVE', 'Hồ sơ nhân sự này đã bị vô hiệu hóa.');
  }

  return {
    id: identity.businessUserId,
    legacyUserId: identity.businessUserId,
    firebaseUid: uid,
    name: profile.name || 'Workshop user',
    // UI role comes from the identity mapping too; profile.role is display data
    // only and never an authorization source.
    role: identity.role,
    avatar: profile.avatar || '',
    avatarImage: profile.avatarImage,
    phone: profile.phone || '',
    username: profile.username || '',
    machineAssigned: profile.machineAssigned,
    active: true,
    deletedAt: profile.deletedAt,
    updatedAt: profile.updatedAt,
    createdAt: profile.createdAt,
  };
}

function toAuthResolutionError(error: unknown): AuthResolutionError {
  if (error instanceof FirebaseProfileResolutionError) {
    if (error.code === 'FIREBASE_UNAVAILABLE') {
      return {
        code: error.code,
        title: 'Không thể kết nối hệ thống',
        message: 'Không thể kết nối hệ thống. Vui lòng kiểm tra mạng và thử lại.',
      };
    }
    return {
      code: error.code,
      title: 'Tài khoản chưa được cấp quyền sử dụng hệ thống',
      message: 'Tài khoản chưa được cấp quyền sử dụng hệ thống. Vui lòng liên hệ quản trị viên.',
    };
  }

  const firestoreCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  if (firestoreCode === 'permission-denied') {
    return {
      code: 'PERMISSION_DENIED',
      title: 'Tài khoản chưa được cấp quyền sử dụng hệ thống',
      message: 'Tài khoản chưa được cấp quyền sử dụng hệ thống. Vui lòng liên hệ quản trị viên.',
    };
  }

  return {
    code: 'PROFILE_RESOLUTION_FAILED',
    title: 'Đăng nhập chưa thành công',
    message: 'Đăng nhập chưa thành công. Vui lòng thử lại.',
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth must be able to establish the trusted identity before child providers
  // start any protected Firestore readers. Demo/production is a build boundary.
  const isDemoActive = isDemoBuild;
  const isProduction = !isDemoActive;
  const [users, setUsers] = useState<User[]>(() => {
    if (!isDemoActive) return [];
    const saved = safeLocalStorageGet(STORAGE_KEYS_DEMO.USERS);
    try { return saved ? JSON.parse(saved) : INITIAL_USERS; } catch { return INITIAL_USERS; }
  });
  const [currentUser, setCurrentUserState] = useState<User>(() => isDemoActive ? INITIAL_USERS[0] : UNAUTHENTICATED_USER);
  const [authInitializationState, setAuthInitializationState] = useState<AuthInitializationState>(() => isDemoActive ? 'AUTHENTICATED' : 'AUTH_INITIALIZING');
  const [firebaseProfile, setFirebaseProfile] = useState<User | null>(null);
  const [authResolutionError, setAuthResolutionError] = useState<AuthResolutionError | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState<boolean>(isProduction);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const sessionResolutionRef = React.useRef(0);

  const moveToUnauthenticated = useCallback(() => {
    sessionResolutionRef.current += 1;
    setAuthResolutionError(null);
    setFirebaseProfile(null);
    setUsers([]);
    setCurrentUserState(UNAUTHENTICATED_USER);
    setAuthInitializationState('UNAUTHENTICATED');
    setIsSessionLocked(true);
    setIsLoginModalOpen(true);
  }, []);

  const resolveFirebaseProfile = useCallback(async (uid: string): Promise<void> => {
    const resolutionId = ++sessionResolutionRef.current;
    setAuthInitializationState('AUTH_INITIALIZING');
    setAuthResolutionError(null);
    setFirebaseProfile(null);
    setUsers([]);
    setCurrentUserState(UNAUTHENTICATED_USER);
    setIsSessionLocked(true);
    setIsLoginModalOpen(false);

    try {
      const profile = await loadFirebaseProfile(uid);
      if (sessionResolutionRef.current !== resolutionId) return;
      setFirebaseProfile(profile);
      setCurrentUserState(profile);
      setAuthInitializationState('AUTHENTICATED');
      setIsSessionLocked(false);
      setIsLoginModalOpen(false);
    } catch (error) {
      if (sessionResolutionRef.current !== resolutionId) return;
      console.warn('Firebase identity mapping failed:', error);
      setAuthResolutionError(toAuthResolutionError(error));
      // A Firebase session still exists. Keep it intact and surface a
      // provisioning/authorization error instead of falling back to Login.
      setAuthInitializationState('AUTHENTICATED');
      setFirebaseProfile(null);
      setUsers([]);
      setCurrentUserState(UNAUTHENTICATED_USER);
      setIsSessionLocked(true);
      setIsLoginModalOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.USERS, JSON.stringify(users));
  }, [users, isDemoActive]);

  useEffect(() => {
    if (isDemoActive) {
      setAuthInitializationState('AUTHENTICATED');
      setFirebaseProfile(null);
      setAuthResolutionError(null);
      setIsSessionLocked(false);
      setIsLoginModalOpen(false);
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      sessionResolutionRef.current += 1;
      setAuthInitializationState('AUTH_INITIALIZING');
      setAuthResolutionError({
        code: 'FIREBASE_UNAVAILABLE',
        title: 'Firebase chưa sẵn sàng',
        message: 'Không thể khởi tạo Firebase Authentication. Kiểm tra cấu hình ứng dụng rồi tải lại trang.',
      });
      setFirebaseProfile(null);
      setUsers([]);
      setCurrentUserState(UNAUTHENTICATED_USER);
      setIsSessionLocked(true);
      setIsLoginModalOpen(false);
      return;
    }

    let isCurrent = true;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isCurrent) return;
      if (!firebaseUser) {
        moveToUnauthenticated();
        return;
      }
      void resolveFirebaseProfile(firebaseUser.uid);
    });
    return () => {
      isCurrent = false;
      sessionResolutionRef.current += 1;
      unsubscribe();
    };
  }, [isDemoActive, moveToUnauthenticated, resolveFirebaseProfile, setIsSessionLocked]);

  useEffect(() => {
    if (isDemoActive) return;
    if (!firebaseProfile) {
      setUsers([]);
      return;
    }
    let isCurrent = true;
    const applyUsers = (remoteUsers: User[]) => {
      if (isCurrent) setUsers(remoteUsers);
    };
    const unsubscribe = userRepository.subscribeUsers(applyUsers, (error) => {
      console.warn('Unable to subscribe to Firestore users:', error);
    });
    void userRepository.getUsers(false).then(applyUsers).catch((error) => {
      console.warn('Unable to load Firestore users:', error);
    });
    return () => {
      isCurrent = false;
      unsubscribe();
    };
  }, [isDemoActive, firebaseProfile]);

  const setCurrentUser = useCallback((user: User) => {
    if (isProduction) {
      if (!firebaseProfile || user.id !== firebaseProfile.id) {
        console.warn('Rejected client-side user switch without matching Firebase identity.');
        return;
      }
      setCurrentUserState(firebaseProfile);
      return;
    }
    setCurrentUserState(user);
    safeLocalStorageSet(STORAGE_KEYS_DEMO.CURRENT_USER, JSON.stringify(user));
  }, [firebaseProfile, isProduction]);

  const signInWithFirebase = useCallback(async (email: string, password: string): Promise<void> => {
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Firebase Auth is not configured.');
    // Move out of Login before the credential request so a successful Firebase
    // sign-in cannot leave the form visible while the profile is resolving.
    setAuthInitializationState('AUTH_INITIALIZING');
    setAuthResolutionError(null);
    setIsSessionLocked(true);
    setIsLoginModalOpen(false);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // The Auth listener owns identity/profile resolution from this point.
    } catch (error) {
      moveToUnauthenticated();
      throw error;
    }
  }, [moveToUnauthenticated]);

  const loginWithPin = useCallback((userId: string, pin: string): boolean => {
    // Firebase Auth, not a browser PIN, is the only production credential.
    if (isProduction) return false;
    const user = users.find((item) => item.id === userId);
    if (!user || user.pin !== pin) return false;
    setCurrentUser(user);
    setIsSessionLocked(false);
    setIsLoginModalOpen(false);
    soundManager.playSuccess();
    return true;
  }, [isProduction, setCurrentUser, setIsSessionLocked, users]);

  const addUser = useCallback(async (userData: Omit<User, 'id' | 'createdAt'>) => {
    if (isProduction) {
      throw new Error('Production users require a Firebase Auth account and an administrator-created auth_identities mapping.');
    }
    const user: User = { ...userData, id: `u-${Date.now()}`, active: userData.active !== false, createdAt: new Date().toISOString() };
    await userRepository.saveUser(user, true);
    setUsers((previous) => [...previous, user]);
  }, [isProduction]);

  const updateUser = useCallback(async (userId: string, updates: Partial<User>) => {
    if (isProduction && !firebaseProfile) throw new Error('Firebase authentication is required.');
    await userRepository.updateUser(userId, updates, isDemoActive);
    setUsers((previous) => previous.map((user) => user.id === userId ? { ...user, ...updates } : user));
    if (firebaseProfile?.id === userId) {
      setFirebaseProfile((profile) => profile ? { ...profile, ...updates } : profile);
      // Keep the rendered authenticated profile in lockstep with the
      // Firestore-confirmed update so the navbar/avatar changes immediately.
      setCurrentUserState((profile) => profile.id === userId ? { ...profile, ...updates } : profile);
    }
  }, [firebaseProfile, isDemoActive, isProduction]);

  const deleteUser = useCallback(async (userId: string) => {
    if (isProduction && !firebaseProfile) throw new Error('Firebase authentication is required.');
    await userRepository.deleteUser(userId, true, isDemoActive);
    setUsers((previous) => previous.filter((user) => user.id !== userId));
  }, [firebaseProfile, isDemoActive, isProduction]);

  const logout = useCallback(async () => {
    if (isDemoActive) {
      moveToUnauthenticated();
      safeLocalStorageRemove(STORAGE_KEYS_DEMO.CURRENT_USER);
      soundManager.playDing();
      return;
    }
    const auth = getFirebaseAuth();
    if (auth?.currentUser) await signOut(auth);
    if (!auth?.currentUser) moveToUnauthenticated();
    safeLocalStorageRemove(STORAGE_KEYS_PROD.CURRENT_USER);
    safeLocalStorageRemove(STORAGE_KEYS_PROD.USERS);
    safeLocalStorageRemove(STORAGE_KEYS_DEMO.CURRENT_USER);
    soundManager.playDing();
  }, [isDemoActive, moveToUnauthenticated]);

  const retryFirebaseProfile = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) {
      moveToUnauthenticated();
      return;
    }
    await resolveFirebaseProfile(auth.currentUser.uid);
  }, [moveToUnauthenticated, resolveFirebaseProfile]);

  const firebaseAuthReady = authInitializationState !== 'AUTH_INITIALIZING';

  return <AuthContext.Provider value={{
    currentUser, setCurrentUser, users, setUsers, addUser, updateUser, deleteUser, loginWithPin, signInWithFirebase, logout,
    firebaseAuthReady, firebaseAuthenticated: Boolean(firebaseProfile), firebaseProfile,
    authInitializationState, authResolutionError, retryFirebaseProfile,
    isSessionLocked, setIsSessionLocked, isLoginModalOpen, setIsLoginModalOpen,
  }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
