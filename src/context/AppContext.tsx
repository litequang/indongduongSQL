import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import {
  User,
  ProductionOrder,
  ProductionStatus,
  PlateStatus,
  NotificationItem,
  SavedDesign,
  WorkshopSettings,
  FinishingType,
  UserRole,
  TimelineEvent,
  CancellationRequest,
  AppConfig
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_ORDERS,
  INITIAL_SAVED_DESIGNS,
  INITIAL_SETTINGS
} from '../data/initialData';
import { DEFAULT_APP_CONFIG, APP_VERSION } from '../config/appConfig';
import { isFirebaseConfigured } from '../config/firebase';
import { productionOrderRepository } from '../repositories/productionOrderRepository';
import { localProductionDraftRepository } from '../repositories/localProductionDraftRepository';
import { userRepository } from '../repositories/userRepository';
import { workflowService } from '../services/workflowService';
import { salesOrderWorkflowService } from '../services/salesOrderWorkflowService';
import { soundManager } from '../utils/soundUtils';
import { formatDayMonthYear, getTodayFormatted } from '../utils/dateUtils';
import { AuthProvider } from './AuthContext';
import { NotificationProvider } from './NotificationContext';
import { SavedDesignProvider } from './SavedDesignContext';
import { ProductionProvider, useProduction } from './ProductionContext';
import { useConfig, ConfigProvider } from './ConfigContext';
import { useAuth } from './AuthContext';
import { useNotification } from './NotificationContext';
import { useSavedDesign } from './SavedDesignContext';
import { canToggleUrgent, setGlobalAppConfig } from '../permissions';
import { buildUrgentOrderUpdate } from '../services/urgentOrderService';
import { applyDynamicAppIcon } from '../utils/iconSync';
import { safeLocalStorageSet as writeLocalStorage, safeLocalStorageGet, safeLocalStorageRemove } from '../utils/storageUtils';
import { imageStorageService, PreparedImage } from '../services/imageStorageService';
import { getEffectiveUiUser } from '../utils/developerDemoPreview';
import { workflowCallableService } from '../services/workflowCallableService';

interface AppContextType {
  currentUser: User;
  // The verified Firebase business profile. Never replaced by a Demo preview.
  realAuthenticatedUser: User | null;
  setCurrentUser: (user: User) => void;
  users: User[];
  orders: ProductionOrder[];
  savedDesigns: SavedDesign[];
  notifications: NotificationItem[];
  settings: WorkshopSettings;
  updateSettings: (newSettings: Partial<WorkshopSettings>) => void;
  
  // App Config & Architecture Multi-instance state
  appConfig: AppConfig;
  updateAppConfig: (newConfig: Partial<AppConfig>) => Promise<void>;
  isFirebaseOnline: boolean;
  firebaseAuthenticated: boolean;
  appVersion: string;
  
  // Navigation & Filtering state
  activeTab: string;
  setActiveTab: (tab: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterPaper: string;
  setFilterPaper: (paper: string) => void;
  filterPrinter: string;
  setFilterPrinter: (printer: string) => void;
  filterTime: string;
  setFilterTime: (time: string) => void;
  
  // Connection & Sync state
  isOnline: boolean;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  
  // Modals state
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  selectedOrder: ProductionOrder | null;
  setSelectedOrder: (order: ProductionOrder | null) => void;
  isLibraryModalOpen: boolean;
  setIsLibraryModalOpen: (open: boolean) => void;
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (open: boolean) => void;
  isInstallModalOpen: boolean;
  setIsInstallModalOpen: (open: boolean) => void;
  isUserManagementModalOpen: boolean;
  setIsUserManagementModalOpen: (open: boolean) => void;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  isCustomerImportModalOpen: boolean;
  setIsCustomerImportModalOpen: (open: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  isSessionLocked: boolean;
  setIsSessionLocked: (locked: boolean) => void;
  isPersonalDemoActive: boolean;
  setIsPersonalDemoActive: (active: boolean) => void;
  previewRole: UserRole;
  setPreviewRole: (role: UserRole) => void;
  isRolePreviewActive: boolean;
  isDeveloperDemoPreviewReady: boolean;
  logout: () => Promise<void>;
  previewImage: string | null;
  setPreviewImage: (img: string | null) => void;
  prefilledOrderData: Partial<ProductionOrder> | null;
  setPrefilledOrderData: (data: Partial<ProductionOrder> | null) => void;

  // Batch Multi-Selection for Designers / Admins / Developers
  selectedOrderIds: string[];
  toggleSelectOrder: (orderId: string) => void;
  selectAllOrders: (orderIds: string[]) => void;
  clearSelectedOrders: () => void;
  isOrderSelected: (orderId: string) => boolean;

  // Actions
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<void>;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  loginWithPin: (userId: string, pin: string) => boolean;
  createOrder: (orderData: Omit<ProductionOrder, 'id' | 'code' | 'createdAt' | 'status' | 'timeline' | 'issues' | 'comments'>, options?: { isDraft?: boolean; localImages?: Record<string, PreparedImage | undefined> }) => Promise<ProductionOrder>;
  dispatchOrder: (orderId: string, options?: { markPlateAsSent?: boolean }) => Promise<void>;
  dispatchMultipleOrders: (orderIds: string[], options?: { markPlateAsSent?: boolean }) => Promise<void>;
  markPlatesReadyBatch: (orderIds: string[], status?: PlateStatus) => Promise<void>;
  deleteDraftOrder: (orderId: string) => Promise<void>;
  deleteMultipleDraftOrders: (orderIds: string[]) => Promise<void>;
  deleteOrder: (orderId: string) => Promise<void>;
  deleteMultipleOrders: (orderIds: string[]) => Promise<void>;
  deleteAllOrders: () => Promise<void>;
  reassignPrintersBatch: (orderIds: string[], newPrinterId: string, newPrinterName?: string) => Promise<void>;
  reviseProductionInstruction: (orderId: string, instructionRaw: string) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  acknowledgeProductionRevision: (orderId: string) => Promise<void>;
  updatePlateStatus: (orderId: string, status: PlateStatus, plateNote?: string) => Promise<void>;
  reportMissingPlate: (orderId: string) => Promise<void>;
  reportMissingOrDamagedPlate: (orderId: string, reason?: string) => Promise<void>;
  reissueNewPlate: (orderId: string, newPlateDate?: string) => Promise<void>;
  confirmPlateReceived: (orderId: string) => Promise<void>;
  startPrinting: (orderId: string) => Promise<void>;
  startPrintingDirect: (orderId: string) => Promise<void>;
  finishPrinting: (orderId: string, actualSheets: number, spoilage?: number, note?: string, imageUrl?: string) => Promise<void>;
  requestCancelOrder: (orderId: string, reason: string) => Promise<void>;
  respondCancelOrder: (orderId: string, accept: boolean, responseReason?: string) => Promise<void>;
  handoffToFinishing: (orderId: string, finisherId: string, types: FinishingType[], note?: string) => Promise<void>;
  startFinishing: (orderId: string) => Promise<void>;
  completeFinishing: (orderId: string) => Promise<void>;
  reportIssue: (orderId: string, type: string, message: string, imageUrl?: string, recipientUserIds?: string[], recipientRoles?: UserRole[], urgent?: boolean) => Promise<void>;
  resolveIssue: (orderId: string, issueId: string) => Promise<void>;
  cancelIssue: (orderId: string, issueId: string) => Promise<void>;
  addComment: (orderId: string, message: string, imageUrl?: string) => Promise<void>;
  duplicateOrder: (order: ProductionOrder) => void;
  toggleUrgentOrder: (orderId: string, isUrgent?: boolean, reason?: string) => Promise<void>;
  updateFinishingNote: (orderId: string, finishingNote: string) => Promise<void>;
  saveDesignToLibrary: (design: Omit<SavedDesign, 'id' | 'lastPrintedAt' | 'printCount'>) => void;
  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: () => void;
  resetDemoData: () => void;
  
  // Storage & Sandbox Separation Mode
  isDemoActive: boolean;
  
  // PWA State
  isAppInstalled: boolean;

  // History Pagination
  isLoadingHistory: boolean;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;
  searchHistoryByCode: (code: string) => Promise<void>;

  // Quick metrics
  unreadNotifsCount: number;
  urgentOrdersCount: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const STORAGE_KEYS_PROD = {
  ORDERS: 'flexo_orders_prod_v1',
  USERS: 'flexo_users_prod_v1',
  CURRENT_USER: 'flexo_current_user_prod_v1',
  SAVED_DESIGNS: 'flexo_saved_designs_prod_v1',
  NOTIFICATIONS: 'flexo_notifications_prod_v1',
  SETTINGS: 'flexo_settings_prod_v1',
};

export const STORAGE_KEYS_DEMO = {
  ORDERS: 'flexo_orders_demo_v1',
  USERS: 'flexo_users_demo_v1',
  CURRENT_USER: 'flexo_current_user_demo_v1',
  SAVED_DESIGNS: 'flexo_saved_designs_demo_v1',
  NOTIFICATIONS: 'flexo_notifications_demo_v1',
  SETTINGS: 'flexo_settings_demo_v1',
};

const AUTH_SESSION_KEY = 'flexo_auth_session_v1';

export const AppProviderInner: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { appConfig, setSettings, updateAppConfig, settings, updateSettings, isDemoActive, isPersonalDemoActive, setIsPersonalDemoActive, previewRole, setPreviewRole, isDeveloperDemoPreviewReady } = useConfig();
  const {
    currentUser: authenticatedCurrentUser,
    setCurrentUser: setAuthenticatedCurrentUser,
    users,
    setUsers,
    addUser,
    updateUser,
    deleteUser,
    loginWithPin,
    logout: logoutFromAuth,
    isLoginModalOpen,
    setIsLoginModalOpen,
    firebaseAuthenticated,
    firebaseProfile,
    isSessionLocked,
    setIsSessionLocked,
  } = useAuth();
  const { notifications, setNotifications, unreadNotifsCount, addNotification, markNotificationRead, markAllNotificationsRead } = useNotification();
  const { savedDesigns, setSavedDesigns, saveDesignToLibrary } = useSavedDesign();
  const { orders, setOrders, isLoadingHistory, hasMoreHistory, loadMoreHistory, searchHistoryByCode } = useProduction();

  const isProduction = appConfig.system.deploymentMode === 'PRODUCTION';
  const isRolePreviewActive = !isDemoActive && isPersonalDemoActive && firebaseProfile?.role === 'DEVELOPER';
  const currentUser = React.useMemo(
    () => getEffectiveUiUser(authenticatedCurrentUser, users, isRolePreviewActive, previewRole),
    [authenticatedCurrentUser, isRolePreviewActive, previewRole, users],
  );
  const setCurrentUser = useCallback((user: User) => {
    if (isRolePreviewActive) {
      // Legacy demo switchers now select only an effective UI role. They never
      // replace the verified Firebase business identity.
      setPreviewRole(user.role);
      return;
    }
    setAuthenticatedCurrentUser(user);
  }, [isRolePreviewActive, setAuthenticatedCurrentUser, setPreviewRole]);
  const logout = useCallback(async () => {
    // Clear synchronously so a different user can never inherit a preview,
    // even if Firebase's sign-out observer arrives a moment later.
    setIsPersonalDemoActive(false);
    await logoutFromAuth();
  }, [logoutFromAuth, setIsPersonalDemoActive]);

  // SDK configuration is not a synchronized/authorized Firebase connection.
  const isFirebaseOnline = isFirebaseConfigured() && firebaseAuthenticated;

  // Production order cache is written exclusively by the repository after a
  // Firestore acknowledgement or realtime snapshot. This prevents optimistic
  // AppContext state from becoming a durable-looking local success.
  const safeLocalStorageSet = useCallback((key: string, value: string): boolean => {
    if (!isDemoActive && key === STORAGE_KEYS_PROD.ORDERS) return false;
    return writeLocalStorage(key, value);
  }, [isDemoActive]);

  // Network Online/Offline state tracking
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isAppInstalled, setIsAppInstalled] = useState<boolean>(false);
  const syncSessionRef = useRef(0);

  useEffect(() => {
    // Invalidate any in-flight read when the verified business session changes.
    syncSessionRef.current += 1;
    if (!firebaseAuthenticated) setIsSyncing(false);
  }, [firebaseAuthenticated]);

  React.useEffect(() => {
    // Check if the app is running in standalone mode (PWA installed)
    const checkInstalled = () => {
      if (typeof window === 'undefined') return;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true;
      setIsAppInstalled(isStandalone);
    };
    checkInstalled();
    
    if (typeof window !== 'undefined') {
      window.matchMedia('(display-mode: standalone)').addEventListener('change', checkInstalled);
      return () => {
        window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkInstalled);
      };
    }
  }, []);

  
  
  
  
  
  
  const syncNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (isDemoActive) return;
    if (!firebaseAuthenticated) return;
    const syncSession = syncSessionRef.current;
    setIsSyncing(true);
    try {
      // ProductionContext owns the Firestore order feed through onSnapshot.
      // A one-shot read here can resolve after a newer snapshot and overwrite
      // the latest production state in a second browser session.
      //
      // Fetch users only; order state remains snapshot-authoritative.
      const remoteUsers = await userRepository.getUsers();
      if (syncSession !== syncSessionRef.current) return;
      if (remoteUsers && remoteUsers.length > 0) {
        setUsers(remoteUsers);
        safeLocalStorageSet(STORAGE_KEYS_PROD.USERS, JSON.stringify(remoteUsers));
      }

      // Settings are loaded and subscribed by ConfigProvider after the same
      // verified identity. Keeping ownership there prevents a second path from
      // overwriting the build-enforced deployment mode.
    } catch (err) {
      if (syncSession === syncSessionRef.current) console.warn('Sync failed:', err);
    } finally {
      setTimeout(() => {
        if (syncSession === syncSessionRef.current) setIsSyncing(false);
      }, 600);
    }
  }, [firebaseAuthenticated, isDemoActive, safeLocalStorageSet]);

  // Listen to Online & Offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow]);

  // The initial post-login sync is deliberately triggered only after the
  // Firebase identity and business profile have been resolved.
  useEffect(() => {
    if (isDemoActive || !firebaseAuthenticated) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    void syncNow();
  }, [firebaseAuthenticated, isDemoActive, syncNow]);

  
  
  
  
  // UI States
  const [activeTab, setActiveTab] = useState<string>('all'); // all, my_work, unaccepted, waiting_plate, waiting_print, printing, finishing, completed, issue
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterPaper, setFilterPaper] = useState<string>('ALL');
  const [filterPrinter, setFilterPrinter] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<string>('ALL'); // ALL, TODAY, YESTERDAY, THIS_WEEK

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isUserManagementModalOpen, setIsUserManagementModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isCustomerImportModalOpen, setIsCustomerImportModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [prefilledOrderData, setPrefilledOrderData] = useState<Partial<ProductionOrder> | null>(null);

  // Batch Multi-Selection State for Designers/Admins/Sales
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const toggleSelectOrder = (orderId: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const selectAllOrders = (orderIds: string[]) => {
    setSelectedOrderIds(orderIds);
  };

  const clearSelectedOrders = () => {
    setSelectedOrderIds([]);
  };

  const isOrderSelected = (orderId: string) => {
    return selectedOrderIds.includes(orderId);
  };

  // Sync users to storage
  
  
  
  
  
  
  
  
  
  
  // Browser cache cross-tab sync is demo-only. Production synchronization is
  // the Firestore onSnapshot listener in ProductionContext.
  useEffect(() => {
    if (!isDemoActive) return;
    if (typeof window === 'undefined' || !window.BroadcastChannel) return;
    const channel = new BroadcastChannel('flexo_sync_channel');
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'SYNC_ORDERS') {
        const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
        const saved = safeLocalStorageGet(key);
        if (saved) setOrders(JSON.parse(saved));
      }
    };

    return () => {
      channel.close();
    };
  }, [isDemoActive]);

  const broadcastChange = useCallback(() => {
    if (!isDemoActive) return;
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('flexo_sync_channel');
      channel.postMessage({ type: 'SYNC_ORDERS' });
      channel.close();
    }
  }, [isDemoActive]);

  
  
  // Generate next Order Code (e.g. LIN-0220)
  const generateNextCode = (): string => {
    const numbers = orders
      .map(o => {
        const match = o.code.match(/LIN-(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    const max = numbers.length > 0 ? Math.max(...numbers) : 197;
    const next = max + 1;
    return `LIN-${next.toString().padStart(4, '0')}`;
  };

  const persistOrderOrRollback = async (updatedOrder: ProductionOrder, previousOrders: ProductionOrder[]): Promise<boolean> => {
    try {
      await productionOrderRepository.saveOrder(updatedOrder, isDemoActive);
      return true;
    } catch (error: any) {
      setOrders(previousOrders);
      if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(previousOrders));
      alert(error?.message || 'Firestore chưa xác nhận thao tác. Giao diện đã được khôi phục.');
      return false;
    }
  };

  // 1. CREATE ORDER (Creates as DRAFT by default so designer can batch or recombine)
  const createOrder = async (
    orderData: Omit<ProductionOrder, 'id' | 'code' | 'createdAt' | 'status' | 'timeline' | 'issues' | 'comments'>,
    options?: { isDraft?: boolean; localImages?: Record<string, PreparedImage | undefined> }
  ): Promise<ProductionOrder> => {
    const isDraft = options?.isDraft ?? true; // Default to DRAFT
    const now = new Date();
    const id = 'order-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const code = isDraft && !isDemoActive
      ? `NHAP-${Date.now().toString(36).toUpperCase()}`
      : (await productionOrderRepository.getNextOrderCode(1, isDemoActive))[0];

    const todayStr = formatDayMonthYear(now);
    const assignedPlateDate = orderData.plateDate || (orderData.plateType === 'NEW' ? todayStr : (orderData.originalPlateDate || todayStr));
    const assignedOriginalPlateDate = orderData.originalPlateDate || assignedPlateDate;

    const initialTimeline: TimelineEvent[] = [
      {
        id: 'tl-' + Date.now(),
        time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
        author: orderData.createdByName || currentUser.name,
        content: isDraft
          ? `Đã tạo lệnh in tạm #${code} (${orderData.totalSheets.toLocaleString('vi-VN')} tờ ${orderData.paperType} ${orderData.paperGsm}) - [Lưu nháp / Chưa gửi thợ in]`
          : `Đã tạo & gửi lệnh in #${code} (${orderData.totalSheets.toLocaleString('vi-VN')} tờ ${orderData.paperType} ${orderData.paperGsm})`,
        type: isDraft ? ('draft' as const) : ('create' as const)
      }
    ];

    if (isDraft && !isDemoActive) {
      const localDraft: ProductionOrder = {
        ...orderData,
        items: orderData.items,
        id,
        code,
        clientDraftId: id,
        plateDate: assignedPlateDate,
        originalPlateDate: assignedOriginalPlateDate,
        status: 'DRAFT',
        hasBlockingIssue: false,
        issues: [],
        comments: [],
        timeline: initialTimeline,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        draftSync: { localRevision: 1, backupRevision: 0, backupStatus: 'PENDING' },
      };

      // Render immediately. IndexedDB is the authoritative write and has no
      // Firebase/Storage dependency; backup is deliberately fire-and-forget.
      setOrders((current) => [localDraft, ...current.filter((order) => order.id !== id)]);
      try {
        await localProductionDraftRepository.save(localDraft, options?.localImages);
      } catch (error) {
        setOrders((current) => current.filter((order) => order.id !== id));
        throw error;
      }

      void (async () => {
        let backupOrder: ProductionOrder = { ...localDraft, draftSync: { ...localDraft.draftSync!, backupStatus: 'BACKING_UP' } };
        try {
          await localProductionDraftRepository.updateOrder(backupOrder);
          backupOrder = {
            ...backupOrder,
            // Draft creation stays local-first: Blobs remain exclusively in
            // IndexedDB and are uploaded only during official send.
            items: backupOrder.items.map((item) => ({ ...item, imageUrl: item.image?.downloadUrl || '' })),
            draftSync: { localRevision: 1, backupRevision: 1, backupStatus: 'BACKED_UP' },
          };
          await productionOrderRepository.saveDraftBackup(backupOrder);
          await localProductionDraftRepository.updateOrder(backupOrder);
        } catch (error) {
          const failed = {
            ...backupOrder,
            draftSync: {
              ...backupOrder.draftSync!,
              backupStatus: 'FAILED' as const,
              lastBackupError: error instanceof Error ? error.message : 'Draft backup failed.',
            },
          };
          await localProductionDraftRepository.updateOrder(failed).catch(() => undefined);
        }
      })();
      return localDraft;
    }

    const uploadedImages: Array<{ storagePath: string }> = [];
    const persistedItems = [];
    try {
      for (const item of orderData.items) {
        const localImage = options?.localImages?.[item.id];
        if (localImage && !isDemoActive) {
          const storedImage = await imageStorageService.uploadProductionOrderItem(id, item.id, localImage, currentUser.id);
          uploadedImages.push(storedImage);
          persistedItems.push({ ...item, imageUrl: storedImage.downloadUrl, image: storedImage });
        } else if (!isDemoActive && (!item.image?.storagePath || imageStorageService.isDataImage(item.imageUrl))) {
          // Production records may contain only a Storage-backed reference.
          // Legacy data URLs and arbitrary remote URLs are never copied into
          // Firestore; a fresh Storage upload is required instead.
          persistedItems.push({ ...item, imageUrl: '', image: undefined });
        } else {
          persistedItems.push(item);
        }
      }
    } catch (error) {
      await imageStorageService.cleanupImages(uploadedImages);
      throw error;
    }

    const newOrder: ProductionOrder = {
      ...orderData,
      items: persistedItems,
      printImages: orderData.printImages?.map((printImage) => {
        const persisted = persistedItems.find((item) => item.id === printImage.id);
        return persisted ? { ...printImage, imageUrl: persisted.imageUrl || undefined, image: persisted.image } : printImage;
      }),
      id,
      code,
      plateDate: assignedPlateDate,
      originalPlateDate: assignedOriginalPlateDate,
      status: isDraft ? 'DRAFT' : 'WAITING_ACCEPTANCE',
      productionRevision: 1,
      printerAcknowledgedRevision: 0,
      hasBlockingIssue: false,
      issues: [],
      comments: [],
      timeline: initialTimeline,
      createdAt: now.toISOString()
    };

    // Production is pessimistic: do not present the order as saved until Firestore confirms it.
    try {
      await productionOrderRepository.saveOrder(newOrder, isDemoActive);
    } catch (error) {
      // Storage and Firestore have no shared transaction. Registered uploads
      // stay recoverable by their stable idempotency keys; only unregistered
      // legacy artifacts are eligible for immediate cleanup here.
      await imageStorageService.cleanupImages(uploadedImages);
      throw error;
    }
    setOrders(prev => [newOrder, ...prev]);
    broadcastChange();

    // Auto save designs to library
    orderData.items.forEach(item => {
      if (item.imageUrl) {
        saveDesignToLibrary({
          imageUrl: item.imageUrl,
          image: item.image,
          customerId: item.customerId,
          customerName: item.customerName || 'Khách hàng',
          productName: item.productName || `Túi ${orderData.paperType} ${orderData.paperWidth}x${orderData.paperHeight}`,
          tags: item.tags,
          bagSize: `${orderData.paperWidth} × ${orderData.paperHeight} cm`,
          paperType: orderData.paperType,
          paperGsm: orderData.paperGsm,
          color: item.color || orderData.color,
          plateReference: orderData.plateNote || (orderData.plateType === 'OLD' ? 'Kẽm cũ' : 'Kẽm mới')
        });
      }
    });

    // Notify printer ONLY if not draft
    if (!isDraft) {
      addNotification({
        targetRole: 'PRINTER',
        orderId: id,
        orderCode: code,
        title: `🔔 Lệnh in mới: #${code}`,
        message: `${orderData.createdByName} giao lệnh ${orderData.totalSheets.toLocaleString('vi-VN')} tờ ${orderData.paperType} cho ${orderData.printerName}`,
        type: 'new_order'
      });

      if (orderData.plateStatus === 'NOT_SENT') {
        addNotification({
          targetRole: 'DESIGNER',
          orderId: id,
          orderCode: code,
          title: `🔴 CHƯA GỬI KẼM #${code}`,
          message: `Lệnh #${code} cần gửi kẽm cho nhà kẽm ngay!`,
          type: 'warning'
        });
      }
    }

    return newOrder;
  };

  const sendLocalDraft = async (orderId: string): Promise<ProductionOrder> => {
    const record = await localProductionDraftRepository.get(orderId);
    if (!record) throw new Error('Không tìm thấy bản nháp cục bộ trên thiết bị này.');
    if (!record.order.printerId) throw new Error('Chưa chọn thợ in');
    const printer = users.find((user) => user.id === record.order.printerId && user.active && user.role === 'PRINTER');
    if (!printer) throw new Error('Thợ in được chọn không còn hoạt động.');

    const persistedItems = [];
    const uploadedImages: Array<{ storagePath: string }> = [];
    for (const item of record.order.items) {
      if (item.image?.storagePath) {
        persistedItems.push({ ...item, imageUrl: item.image.downloadUrl });
        continue;
      }
      const stored = record.images[item.id];
      if (!stored) {
        persistedItems.push({ ...item, imageUrl: '' });
        continue;
      }
      const prepared: PreparedImage = {
        ...stored,
        previewUrl: item.imageUrl,
        // Persisted with the Blob in IndexedDB, so retries reuse the same
        // runtime idempotency key instead of creating an unrelated upload.
        fileName: stored.fileName,
      };
      const uploaded = await imageStorageService.uploadProductionOrderItem(orderId, item.id, prepared, currentUser.id);
      uploadedImages.push(uploaded);
      persistedItems.push({ ...item, imageUrl: uploaded.downloadUrl, image: uploaded });
    }

    const [officialCode] = await productionOrderRepository.getNextOrderCode(1, false);
    const { draftSync: _draftSync, ...draftWithoutSync } = record.order;
    const now = new Date().toISOString();
    const official: ProductionOrder = {
      ...draftWithoutSync,
      code: officialCode,
      items: persistedItems,
      status: 'WAITING_ACCEPTANCE',
      printerId: printer.id,
      printerName: printer.name,
      productionRevision: Math.max(1, record.order.productionRevision || 1),
      printerAcknowledgedRevision: 0,
      updatedAt: now,
      timeline: [...record.order.timeline, {
        id: `tl-${Date.now()}-dispatch`,
        time: now,
        author: currentUser.name,
        content: `${currentUser.name} gửi lệnh #${officialCode} sang sản xuất`,
        type: 'dispatch',
      }],
    };
    const dispatched = await productionOrderRepository.createOfficialFromDraft(official);
    if (!dispatched.created) await imageStorageService.cleanupImages(uploadedImages);
    await localProductionDraftRepository.remove(orderId);
    // Keep cleanup inside this draft's serialized send. A fire-and-forget
    // Firestore delete can occupy the single safe-write slot and make the next
    // valid item in the same batch fail as temporarily unavailable.
    await productionOrderRepository.deleteDraftBackup(orderId).catch(() => undefined);
    return dispatched.order;
  };

  // 1.1 DISPATCH SINGLE DRAFT ORDER TO PRINTER
  const dispatchOrder = async (orderId: string, options?: { markPlateAsSent?: boolean }) => {
    const previousOrders = orders;
    const now = new Date();
    let dispatchedOrder: ProductionOrder | null = null;
    const markPlate = options?.markPlateAsSent ?? false;

    // Plate delivery is server-authoritative in production.  The former UI
    // path attempted to write SENT alongside the dispatch, which Firestore
    // rules correctly reject.  Read the post-call document in the transaction
    // so the subsequent status write cannot overwrite its new plate state.
    if (!isDemoActive) {
      const localDraft = orders.find((order) => order.id === orderId && order.status === 'DRAFT' && order.clientDraftId);
      if (localDraft) {
        const official = await sendLocalDraft(orderId);
        setOrders((current) => [official, ...current.filter((order) => order.id !== orderId)]);
        setSelectedOrderIds((current) => current.filter((id) => id !== orderId));
        broadcastChange();
        return;
      }
      if (markPlate) await workflowCallableService.sendPlate(orderId);
      const updated = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
        if (order.status !== 'DRAFT') throw new Error('Only a draft production order can be dispatched.');
        return {
          ...order,
          status: 'WAITING_ACCEPTANCE' as ProductionStatus,
          timeline: [...order.timeline, {
            id: `tl-${Date.now()}`,
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: markPlate
              ? `${currentUser.name} marked the plate sent and dispatched #${order.code} to ${order.printerName}`
              : `${currentUser.name} dispatched #${order.code} to ${order.printerName}`,
            type: 'dispatch' as const,
          }],
        };
      }, false);
      if (!updated) throw new Error('The production order was not dispatched.');
      setOrders((current) => current.map((order) => order.id === orderId ? updated : order));
      if (selectedOrder?.id === orderId) setSelectedOrder(updated);
      broadcastChange();
      return;
    }

    let updatedOrderObj: ProductionOrder | null = null;
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;

      const updatedTimeline = [
        ...o.timeline,
        {
          id: 'tl-' + Date.now(),
          time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
          author: currentUser.name,
          content: markPlate
            ? `${currentUser.name} đã đánh dấu ĐÃ RA KẼM và phát lệnh in #${o.code} cho thợ in @${o.printerName}`
            : `${currentUser.name} đã phát lệnh in #${o.code} cho thợ in @${o.printerName}`,
          type: 'dispatch' as const
        }
      ];

      const res: ProductionOrder = {
        ...o,
        status: 'WAITING_ACCEPTANCE' as ProductionStatus,
        plateStatus: markPlate ? ('SENT' as PlateStatus) : o.plateStatus,
        timeline: updatedTimeline
      };
      dispatchedOrder = res;
      updatedOrderObj = res;
      return res;
    }));

    if (updatedOrderObj && !await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;

    if (dispatchedOrder) {
      const order = dispatchedOrder as ProductionOrder;
      addNotification({
        targetRole: 'PRINTER',
        orderId: order.id,
        orderCode: order.code,
        title: markPlate ? `🔔 Lệnh in mới (ĐÃ RA KẼM): #${order.code}` : `🔔 Lệnh in mới: #${order.code}`,
        message: `${currentUser.name} giao lệnh ${order.totalSheets.toLocaleString('vi-VN')} tờ ${order.paperType} cho ${order.printerName}`,
        type: 'new_order'
      });

      if (!markPlate && order.plateStatus === 'NOT_SENT') {
        addNotification({
          targetRole: 'DESIGNER',
          orderId: order.id,
          orderCode: order.code,
          title: `🔴 CHƯA GỬI KẼM #${order.code}`,
          message: `Lệnh #${order.code} chưa gửi kẽm cho nhà kẽm!`,
          type: 'warning'
        });
      }
    }

    setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    broadcastChange();
  };

  // 1.2 DISPATCH MULTIPLE DRAFT ORDERS IN BULK
  const dispatchMultipleOrders = async (orderIds: string[], options?: { markPlateAsSent?: boolean }) => {
    if (orderIds.length === 0) return;
    const previousOrders = orders;
    const now = new Date();
    const dispatchedList: ProductionOrder[] = [];
    const updatedOrdersList: ProductionOrder[] = [];
    const markPlate = options?.markPlateAsSent ?? false;

    if (!isDemoActive) {
      const results: PromiseSettledResult<ProductionOrder | null>[] = [];
      // FirestoreWriteProtector intentionally permits one acknowledged write
      // at a time. Dispatch sequentially so valid drafts do not reject each
      // other as temporarily unavailable during one batch action.
      for (const orderId of orderIds) {
        try {
          const localDraft = orders.find((order) => order.id === orderId && order.status === 'DRAFT' && order.clientDraftId);
          let value: ProductionOrder | null;
          if (localDraft) {
            value = await sendLocalDraft(orderId);
          } else {
            if (markPlate) await workflowCallableService.sendPlate(orderId);
            value = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
              if (order.status !== 'DRAFT') throw new Error(`Order ${order.code} is no longer a draft.`);
              return {
                ...order,
                status: 'WAITING_ACCEPTANCE' as ProductionStatus,
                timeline: [...order.timeline, {
                  id: `tl-${Date.now()}-${order.id}`,
                  time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
                  author: currentUser.name,
                  content: markPlate ? `${currentUser.name} sent the plate and dispatched #${order.code}` : `${currentUser.name} dispatched #${order.code}`,
                  type: 'dispatch' as const,
                }],
              };
            }, false);
          }
          results.push({ status: 'fulfilled', value });
        } catch (reason) {
          results.push({ status: 'rejected', reason });
        }
      }
      const updated = results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : []);
      const succeededIds = new Set(updated.map((order) => order.id));
      setOrders((current) => [
        ...updated,
        ...current.filter((order) => !succeededIds.has(order.id)),
      ]);
      setSelectedOrderIds((current) => current.filter((id) => !succeededIds.has(id)));
      const failed = results.length - updated.length;
      if (failed > 0) {
        const details = results.flatMap((result, index) => result.status === 'rejected'
          ? [`${orders.find(order => order.id === orderIds[index])?.code || orderIds[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
          : []);
        alert(`${updated.length} đã gửi\n${failed} chưa gửi${details.length ? `\n\n${details.join('\n')}` : ''}`);
      }
      broadcastChange();
      return;
    }

    setOrders(prev => {
      const next = prev.map(o => {
        if (!orderIds.includes(o.id) || o.status !== 'DRAFT') return o;

        const updatedTimeline = [
          ...o.timeline,
          {
            id: 'tl-' + Date.now() + '-' + o.id,
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: markPlate
              ? `${currentUser.name} đã đánh dấu ĐÃ RA KẼM và phát lệnh in hàng loạt cho thợ in @${o.printerName}`
              : `${currentUser.name} đã phát lệnh in hàng loạt cho thợ in @${o.printerName}`,
            type: 'dispatch' as const
          }
        ];

        const updated: ProductionOrder = {
          ...o,
          status: 'WAITING_ACCEPTANCE' as ProductionStatus,
          plateStatus: markPlate ? ('SENT' as PlateStatus) : o.plateStatus,
          timeline: updatedTimeline,
          updatedAt: now.toISOString()
        };
        dispatchedList.push(updated);
        updatedOrdersList.push(updated);
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    for (const order of updatedOrdersList) {
      // dispatch
    }
    try {
      await productionOrderRepository.saveOrdersBatch(updatedOrdersList, isDemoActive);
    } catch (error: any) {
      setOrders(previousOrders);
      if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(previousOrders));
      alert(error?.message || 'Firestore did not confirm the batch dispatch. Changes were reverted.');
      return;
    }

    dispatchedList.forEach(order => {
      addNotification({
        targetRole: 'PRINTER',
        orderId: order.id,
        orderCode: order.code,
        title: markPlate ? `🔔 Lệnh in mới (ĐÃ RA KẼM): #${order.code}` : `🔔 Lệnh in mới: #${order.code}`,
        message: `${currentUser.name} giao lệnh ${order.totalSheets.toLocaleString('vi-VN')} tờ cho ${order.printerName}`,
        type: 'new_order'
      });
    });

    clearSelectedOrders();
    broadcastChange();
  };

  // 1.2b MARK PLATES READY IN BATCH (Đánh dấu đã ra kẽm hàng loạt)
  const markPlatesReadyBatch = async (orderIds: string[], status: PlateStatus = 'SENT') => {
    if (orderIds.length === 0) return;
    if (!isDemoActive) {
      if (status !== 'SENT' && status !== 'RECEIVED') throw new Error('Production batch plate updates support only SENT or RECEIVED.');
      await Promise.all(orderIds.map((orderId) => status === 'SENT'
        ? workflowCallableService.sendPlate(orderId)
        : workflowCallableService.receivePlate(orderId)));
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    const updatedOrdersList: ProductionOrder[] = [];
    setOrders(prev => {
      const next = prev.map(o => {
        if (!orderIds.includes(o.id)) return o;
        const updated: ProductionOrder = {
          ...o,
          plateStatus: status,
          timeline: [
            ...o.timeline,
            {
              id: 'tl-' + Date.now() + '-' + o.id,
              time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
              author: currentUser.name,
              content: `${currentUser.name} đánh dấu tình trạng kẽm: ${status === 'SENT' ? 'Đã ra kẽm' : status === 'RECEIVED' ? 'Đã nhận kẽm' : 'Dùng kẽm cũ'}`,
              type: 'plate' as const
            }
          ],
          updatedAt: now.toISOString()
        };
        updatedOrdersList.push(updated);
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });
    try {
      await productionOrderRepository.saveOrdersBatch(updatedOrdersList, isDemoActive);
    } catch (error: any) {
      setOrders(previousOrders);
      if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(previousOrders));
      alert(error?.message || 'Firestore did not confirm the plate update. Changes were reverted.');
      return;
    }
    broadcastChange();
  };

  // 1.3 DELETE DRAFT OR SPECIFIC ORDER
  const deleteDraftOrder = async (orderId: string) => {
    await deleteOrder(orderId);
  };

  const deleteOrder = async (orderId: string) => {
    const localDraft = orders.find(order => order.id === orderId && Boolean(order.clientDraftId));
    if (localDraft && !isDemoActive) {
      try {
        await localProductionDraftRepository.remove(orderId);
        void productionOrderRepository.deleteDraftBackup(orderId).catch(() => undefined);
      } catch (error: any) {
        alert(error?.message || 'Khong the xoa ban nhap tren thiet bi nay.');
        return;
      }
      setOrders(prev => prev.filter(order => order.id !== orderId));
      setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
      return;
    }
    try {
      await productionOrderRepository.deleteOrder(orderId, false, isDemoActive);
    } catch (error: any) {
      alert(error?.message || 'Firestore did not confirm the deletion. No local change was made.');
      return;
    }
    setOrders(prev => {
      const next = prev.filter(o => o.id !== orderId);
      if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(next));
      return next;
    });
    setSelectedOrderIds(prev => prev.filter(id => id !== orderId));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(null);
    }
    broadcastChange();
  };

  // 1.4 DELETE MULTIPLE ORDERS IN BULK
  const deleteMultipleDraftOrders = async (orderIds: string[]) => {
    await deleteMultipleOrders(orderIds);
  };

  const deleteMultipleOrders = async (orderIds: string[]) => {
    if (!orderIds || orderIds.length === 0) return;
    const localIds = !isDemoActive
      ? orderIds.filter(id => orders.some(order => order.id === id && Boolean(order.clientDraftId)))
      : [];
    const officialIds = orderIds.filter(id => !localIds.includes(id));
    try {
      await Promise.all(localIds.map(id => localProductionDraftRepository.remove(id)));
      if (officialIds.length > 0) {
        await productionOrderRepository.deleteOrdersBatch(officialIds, isDemoActive);
      }
      localIds.forEach(id => void productionOrderRepository.deleteDraftBackup(id).catch(() => undefined));
    } catch (error: any) {
      alert(error?.message || 'Firestore did not confirm the batch deletion. No local change was made.');
      return;
    }
    setOrders(prev => {
      const next = prev.filter(o => !orderIds.includes(o.id));
      if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(next));
      return next;
    });
    setSelectedOrderIds(prev => prev.filter(id => !orderIds.includes(id)));
    if (selectedOrder && orderIds.includes(selectedOrder.id)) {
      setSelectedOrder(null);
    }
    broadcastChange();
    soundManager.playSuccess();
  };

  // 1.4.1 PURGE ALL ORDERS (Dành cho Developer / Admin xóa sạch dữ liệu cũ trước khi lên sóng)
  const deleteAllOrders = async () => {
    try {
      await productionOrderRepository.deleteAllOrders(isDemoActive);
    } catch (error: any) {
      alert(error?.message || 'Firestore did not confirm the deletion. No local change was made.');
      return;
    }
    setOrders([]);
    setSelectedOrderIds([]);
    setSelectedOrder(null);
    if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify([]));
    broadcastChange();
    soundManager.playSuccess();
  };

  // 1.5 REASSIGN PRINTER FOR BATCH OF ORDERS
  const reassignPrintersBatch = async (orderIds: string[], newPrinterId: string, customPrinterName?: string) => {
    if (!isDemoActive) {
      const targetUser = users.find(user => user.id === newPrinterId && user.role === 'PRINTER' && user.active);
      if (!targetUser) throw new Error('Thợ in được chọn không còn hoạt động.');
      const localDraftIds = orderIds.filter(id => orders.some(order => order.id === id && Boolean(order.clientDraftId)));
      for (const id of localDraftIds) {
        const record = await localProductionDraftRepository.get(id);
        if (!record) continue;
        await localProductionDraftRepository.updateOrder({
          ...record.order,
          printerId: targetUser.id,
          printerName: customPrinterName || targetUser.name,
          updatedAt: new Date().toISOString(),
          draftSync: record.order.draftSync ? {
            ...record.order.draftSync,
            localRevision: record.order.draftSync.localRevision + 1,
            backupStatus: 'PENDING',
          } : undefined,
        });
      }
      const officialIds = orderIds.filter(id => !localDraftIds.includes(id));
      const results = await Promise.allSettled(officialIds.map(id => workflowCallableService.reviseProductionOrder(id, { printerId: newPrinterId })));
      await syncNow();
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length > 0) alert(`Không thể đổi thợ cho ${failures.length}/${officialIds.length} lệnh (chỉ được đổi trước khi in).`);
      return;
    }
    const previousOrders = orders;
    const targetUser = users.find(u => u.id === newPrinterId);
    const pName = customPrinterName || targetUser?.name || 'Thợ in';
    const now = new Date();
    const updatedOrdersList: ProductionOrder[] = [];
    setOrders(prev => {
      const next = prev.map(o => {
        if (!orderIds.includes(o.id)) return o;
        const updated: ProductionOrder = {
          ...o,
          printerId: newPrinterId,
          printerName: pName,
          updatedAt: now.toISOString()
        };
        updatedOrdersList.push(updated);
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });
    try {
      await productionOrderRepository.saveOrdersBatch(updatedOrdersList, isDemoActive);
    } catch (error: any) {
      setOrders(previousOrders);
      if (isDemoActive) safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(previousOrders));
      alert(error?.message || 'Firestore did not confirm the printer reassignment. Changes were reverted.');
      return;
    }
    broadcastChange();
  };

  const reviseProductionInstruction = async (orderId: string, instructionRaw: string) => {
    const normalized = instructionRaw.trim();
    if (!normalized) throw new Error('Hướng dẫn sản xuất không được để trống.');
    const localDraft = orders.find(order => order.id === orderId && Boolean(order.clientDraftId));
    if (localDraft && !isDemoActive) {
      const record = await localProductionDraftRepository.get(orderId);
      if (!record) throw new Error('Không tìm thấy bản nháp trên thiết bị này.');
      const revision = Math.max(1, record.order.productionRevision || 1) + 1;
      await localProductionDraftRepository.updateOrder({
        ...record.order,
        instructionRaw: normalized,
        productionRevision: revision,
        updatedAt: new Date().toISOString(),
        draftSync: record.order.draftSync ? {
          ...record.order.draftSync,
          localRevision: record.order.draftSync.localRevision + 1,
          backupStatus: 'PENDING',
        } : undefined,
      });
      return;
    }
    if (!isDemoActive) {
      await workflowCallableService.reviseProductionOrder(orderId, { instructionRaw: normalized });
      await syncNow();
      return;
    }
    const previousOrders = orders;
    const target = orders.find(order => order.id === orderId);
    if (!target || !['DRAFT', 'WAITING_ACCEPTANCE', 'ACCEPTED', 'WAITING_PRINT'].includes(target.status)) {
      throw new Error('Hướng dẫn đã khóa sau khi bắt đầu in.');
    }
    const updated: ProductionOrder = {
      ...target,
      instructionRaw: normalized,
      productionRevision: Math.max(1, target.productionRevision || 1) + 1,
      updatedAt: new Date().toISOString(),
    };
    setOrders(current => current.map(order => order.id === orderId ? updated : order));
    await persistOrderOrRollback(updated, previousOrders);
  };

  // 2. ACCEPT ORDER (Thợ xác nhận đã nhận lệnh)
  const acceptOrder = async (orderId: string) => {
    try {
      const updatedOrderObj = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
        if (order.status !== 'WAITING_ACCEPTANCE') {
            throw new Error("Lệnh này đã được nhận hoặc cập nhật. Trạng thái không còn hợp lệ.");
        }
        if (order.printerId && order.printerId !== currentUser.id && currentUser.role === 'PRINTER') {
            throw new Error("Lệnh này đã được giao cho thợ khác!");
        }

        const now = new Date();
        const newStatus: ProductionStatus = 'ACCEPTED';

        const updatedTimeline = [
          ...order.timeline,
          {
            id: 'tl-' + Date.now(),
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: `${currentUser.name} đã xác nhận nhận lệnh in`,
            type: 'accept' as const
          }
        ];

        return {
          ...order,
          status: newStatus,
          acceptedAt: now.toISOString(),
          printerAcknowledgedRevision: Math.max(1, order.productionRevision || 1),
          timeline: updatedTimeline
        };
      }, isDemoActive);

      if (updatedOrderObj) {
        setOrders(prev => {
            const next = prev.map(o => o.id === orderId ? updatedOrderObj : o);
            const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
            safeLocalStorageSet(key, JSON.stringify(next));
            return next;
        });
        
        addNotification({
          targetRole: 'DESIGNER',
          orderId,
          orderCode: updatedOrderObj.code,
          title: `✅ ${currentUser.name} đã nhận lệnh`,
          message: `Thợ in đã xác nhận nhận lệnh #${updatedOrderObj.code}`,
          type: 'accepted'
        });

        broadcastChange();
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(updatedOrderObj);
        }
      }
    } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
    }
  };

  const acknowledgeProductionRevision = async (orderId: string) => {
    try {
      const updatedOrder = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
        if (!['WAITING_ACCEPTANCE', 'ACCEPTED', 'WAITING_PRINT'].includes(order.status)) {
          throw new Error('Chi co the xac nhan huong dan truoc khi bat dau in.');
        }
        if (currentUser.role === 'PRINTER' && order.printerId !== currentUser.id) {
          throw new Error('Lenh nay duoc giao cho tho in khac.');
        }
        const revision = Math.max(1, order.productionRevision || 1);
        const now = new Date();
        return {
          ...order,
          printerAcknowledgedRevision: revision,
          updatedAt: now.toISOString(),
          timeline: [...order.timeline, {
            id: `tl-${Date.now()}-revision-ack`,
            time: now.toISOString(),
            author: currentUser.name,
            content: `${currentUser.name} da xac nhan huong dan san xuat phien ban ${revision}`,
            type: 'accept' as const,
          }],
        };
      }, isDemoActive);
      setOrders(previous => previous.map(order => order.id === orderId ? updatedOrder : order));
      if (selectedOrder?.id === orderId) setSelectedOrder(updatedOrder);
    } catch (error: any) {
      alert(error?.message || 'Khong the xac nhan phien ban huong dan.');
    }
  };

  // 3. UPDATE PLATE STATUS (Gửi kẽm / Nhận kẽm)
  const updatePlateStatus = async (orderId: string, status: PlateStatus, plateNote?: string) => {
    if (!isDemoActive) {
      if (status === 'SENT') {
        await workflowCallableService.sendPlate(orderId, plateNote);
      } else if (status === 'RECEIVED') {
        await workflowCallableService.receivePlate(orderId);
      } else {
        throw new Error('Production plate transitions must use an approved workflow action.');
      }
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    let updatedOrderObj: ProductionOrder | null = null;
    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;

        const timelineText = status === 'SENT'
          ? `Đã gửi kẽm sang nhà kẽm${plateNote ? ` (${plateNote})` : ''}`
          : status === 'RECEIVED'
          ? `Kẽm đã về xưởng, sẵn sàng lên máy in`
          : `Cập nhật trạng thái kẽm: ${status}`;

        const updatedTimeline = [
          ...o.timeline,
          {
            id: 'tl-' + Date.now(),
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: timelineText,
            type: 'plate' as const
          }
        ];

        let newStatus = o.status;
        if (status === 'RECEIVED' && o.status === 'ACCEPTED') {
          newStatus = 'WAITING_PRINT';
        }

        const updated: ProductionOrder = {
          ...o,
          plateStatus: status,
          plateNote: plateNote !== undefined ? plateNote : o.plateNote,
          plateSentAt: status === 'SENT' ? now.toISOString() : o.plateSentAt,
          plateReceivedAt: status === 'RECEIVED' ? now.toISOString() : o.plateReceivedAt,
          status: newStatus,
          timeline: updatedTimeline,
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }

    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      if (status === 'SENT') {
        addNotification({
          targetRole: 'PRINTER',
          orderId,
          orderCode: targetOrder.code,
          title: `🟡 Đã gửi kẽm #${targetOrder.code}`,
          message: `${currentUser.name} đã xác nhận gửi kẽm sang xưởng kẽm.`,
          type: 'plate_sent'
        });
      } else if (status === 'RECEIVED') {
        addNotification({
          targetRole: 'PRINTER',
          orderId,
          orderCode: targetOrder.code,
          title: `🟢 Kẽm đã về xưởng #${targetOrder.code}`,
          message: `Kẽm lệnh #${targetOrder.code} đã có, có thể bắt đầu in!`,
          type: 'plate_received'
        });
      }
    }

    broadcastChange();
  };

  // PLATE QUICK ACTIONS FOR PRINTER (Gộp chung báo chưa có kẽm mới & không còn/hỏng kẽm cũ)
  const reportMissingPlate = async (orderId: string) => {
    if (!isDemoActive) {
      await workflowCallableService.reportBrokenPlate(orderId);
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    let updatedOrderObj: ProductionOrder | null = null;
    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;

        const isOld = o.plateType === 'OLD' || o.isReprint || o.originalPlateDate;
        const plateDateStr = o.originalPlateDate || o.plateDate || '';
        const plateLabel = isOld ? `Kẽm cũ (ngày ${plateDateStr || 'cũ'}) không còn / chưa có` : 'Chưa có kẽm tại máy';

        const updatedTimeline: TimelineEvent[] = [
          ...o.timeline,
          {
            id: 'tl-' + Date.now(),
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: `⚠️ ${currentUser.name} (Thợ in) báo: ${plateLabel} – Cần thiết kế kiểm tra & ra lại kẽm!`,
            type: 'plate'
          }
        ];

        const updated: ProductionOrder = {
          ...o,
          plateStatus: isOld ? 'PLATE_DAMAGED' : 'NOT_SENT',
          timeline: updatedTimeline,
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }

    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      const isOld = targetOrder.plateType === 'OLD' || targetOrder.isReprint || targetOrder.originalPlateDate;
      
      // 1. Gửi thông báo đến Designer tạo lệnh này
      if (targetOrder.createdBy) {
        addNotification({
          userId: targetOrder.createdBy,
          orderId,
          orderCode: targetOrder.code,
          title: `⚠️ THỢ BÁO CHƯA CÓ KẼM #${targetOrder.code}`,
          message: `${currentUser.name} kiểm tra không thấy kẽm ${isOld ? '(không còn kẽm cũ)' : ''} tại máy in. Vui lòng kiểm tra & ra lại kẽm cho thợ in!`,
          type: 'plate_missing'
        });
      } else {
        addNotification({
          targetRole: 'DESIGNER',
          orderId,
          orderCode: targetOrder.code,
          title: `⚠️ THỢ BÁO CHƯA CÓ KẼM #${targetOrder.code}`,
          message: `${currentUser.name} kiểm tra không thấy kẽm ${isOld ? '(không còn kẽm cũ)' : ''} tại máy in. Vui lòng kiểm tra & ra lại kẽm cho thợ in!`,
          type: 'plate_missing'
        });
      }

      // 2. Gửi thông báo đến toàn thể Sale
      addNotification({
        targetRole: 'SALE',
        orderId,
        orderCode: targetOrder.code,
        title: `⚠️ CẢNH BÁO TIẾN ĐỘ #${targetOrder.code}`,
        message: `Lệnh #${targetOrder.code} chưa có kẽm tại máy. Thợ in đang chờ ra kẽm!`,
        type: 'warning'
      });

      // 3. Gửi thông báo đến Admin xưởng
      addNotification({
        targetRole: 'ADMIN',
        orderId,
        orderCode: targetOrder.code,
        title: `⚠️ BÁO CHƯA CÓ KẼM #${targetOrder.code}`,
        message: `${currentUser.name} báo lệnh #${targetOrder.code} chưa có kẽm tại máy in.`,
        type: 'plate_missing'
      });

      soundManager.playAlert();
    }

    broadcastChange();
  };

  const confirmPlateReceived = async (orderId: string) => {
    if (!isDemoActive) {
      await workflowCallableService.receivePlate(orderId);
      await syncNow();
      broadcastChange();
      return;
    }
    await updatePlateStatus(orderId, 'RECEIVED');
  };

  // Báo mất/hỏng kẽm cũ -> Cần thiết kế ra lại kẽm (dùng chung logic với reportMissingPlate)
  const reportMissingOrDamagedPlate = async (orderId: string, reason?: string) => {
    void reason;
    await reportMissingPlate(orderId);
  };

  // Thiết kế xác nhận đã ra lại kẽm mới
  const reissueNewPlate = async (orderId: string, newPlateDate?: string) => {
    if (!isDemoActive) {
      await workflowCallableService.reissuePlate(orderId, newPlateDate);
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    const todayStr = newPlateDate || formatDayMonthYear(now);
    let updatedOrderObj: ProductionOrder | null = null;

    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;

        const updatedTimeline: TimelineEvent[] = [
          ...o.timeline,
          {
            id: 'tl-' + Date.now(),
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: `✨ Thiết kế đã ra lại kẽm mới (ngày ${todayStr}) cho lệnh #${o.code}`,
            type: 'plate'
          }
        ];

        const updated: ProductionOrder = {
          ...o,
          plateType: 'NEW',
          plateStatus: 'SENT',
          plateDate: todayStr,
          originalPlateDate: todayStr, // Cập nhật mốc ngày kẽm mới thành ngày hôm nay!
          plateNote: `Đã ra lại kẽm mới ngày ${todayStr}`,
          plateSentAt: now.toISOString(),
          timeline: updatedTimeline,
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }

    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      addNotification({
        targetRole: 'PRINTER',
        orderId,
        orderCode: targetOrder.code,
        title: `🟡 ĐÃ RA LẠI KẼM MỚI #${targetOrder.code}`,
        message: `${currentUser.name} đã ra lại kẽm mới ngày ${todayStr}. Đang gửi kẽm sang xưởng in!`,
        type: 'plate_reissued'
      });
      soundManager.playDing();
    }

    broadcastChange();
  };

  // 4. START PRINTING DIRECT (Đã có kẽm hoặc lên máy in luôn)
  const startPrintingDirect = async (orderId: string) => {
    try {
        const updatedOrderObj = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
            if (order.status !== 'WAITING_PRINT' && order.status !== 'ACCEPTED') {
                throw new Error("Lệnh này không ở trạng thái sẵn sàng in (có thể đã bắt đầu hoặc bị hủy).");
            }
            if (order.printerId && order.printerId !== currentUser.id && currentUser.role === 'PRINTER') {
                throw new Error("Lệnh này đã được giao cho thợ khác!");
            }
            if (order.cancellationRequest?.status === 'PENDING') {
                throw new Error('Phải xử lý yêu cầu hủy đang chờ trước khi bắt đầu in.');
            }
            const revision = Math.max(1, order.productionRevision || 1);
            if ((order.printerAcknowledgedRevision || 0) < revision) {
                throw new Error('Thợ in phải xác nhận hướng dẫn sản xuất mới nhất trước khi bắt đầu in.');
            }

            const now = new Date();
            const updatedTimeline: TimelineEvent[] = [
              ...order.timeline,
              {
                id: 'tl-' + Date.now(),
                time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
                author: currentUser.name,
                content: `Bắt đầu in theo hướng dẫn sản xuất phiên bản ${revision}`,
                type: 'start_print'
              }
            ];

            return {
              ...order,
              status: 'PRINTING',
              printingStartedAt: now.toISOString(),
              timeline: updatedTimeline
            };
        }, isDemoActive);

        if (updatedOrderObj) {
            setOrders(prev => {
                const next = prev.map(o => o.id === orderId ? updatedOrderObj : o);
                const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
                safeLocalStorageSet(key, JSON.stringify(next));
                return next;
            });

            addNotification({
              orderId,
              orderCode: updatedOrderObj.code,
              title: `🔵 Đang in #${updatedOrderObj.code}`,
              message: `${currentUser.name} đã bắt đầu in theo hướng dẫn sản xuất đã xác nhận.`,
              type: 'printing'
            });

            broadcastChange();
            if (selectedOrder && selectedOrder.id === orderId) {
                setSelectedOrder(updatedOrderObj);
            }
        }
    } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
    }
  };

  // 4. START PRINTING
  const startPrinting = async (orderId: string) => {
    await startPrintingDirect(orderId);
  };

  // 5. FINISH PRINTING (Nhập số lượng thực tế, hao hỏng)
  const finishPrinting = async (orderId: string, actualSheets: number, spoilage?: number, note?: string, imageUrl?: string) => {
    if (!isDemoActive) {
      try {
        await workflowCallableService.completeProductionPrint(orderId, note);
        await syncNow();
        broadcastChange();
      } catch (error: any) {
        alert(error?.message || 'Không thể xác nhận in xong.');
      }
      return;
    }
    // There is no current production UI that uploads print evidence through
    // imageStorageService. Do not persist arbitrary URL/data-string input.
    const persistedImageUrl = isDemoActive && !imageStorageService.isDataImage(imageUrl) ? imageUrl : undefined;
    try {
        const updatedOrderObj = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
            if (order.status !== 'PRINTING') {
                throw new Error("Lệnh này không ở trạng thái đang in, không thể hoàn thành.");
            }
            if (order.printerId && order.printerId !== currentUser.id && currentUser.role === 'PRINTER') {
                throw new Error("Lệnh này đã được giao cho thợ khác!");
            }

            const now = new Date();
            const confirmedInstruction = order.instructionRaw || `${order.totalSheets.toLocaleString('vi-VN')} tờ ${order.paperType} ${order.paperGsm}`;
            const updatedTimeline = [
              ...order.timeline,
              {
                id: 'tl-' + Date.now(),
                time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
                author: currentUser.name,
                content: `${currentUser.name} xác nhận in xong: ${confirmedInstruction}`,
                type: 'print_done' as const
              }
            ];

            return {
              ...order,
              status: 'PRINTED',
              actualPrintedSheets: undefined,
              spoilageSheets: undefined,
              printedNote: note,
              printedImageUrl: persistedImageUrl,
              printingCompletedAt: now.toISOString(),
              timeline: updatedTimeline
            };
        }, isDemoActive);

        if (updatedOrderObj) {
            setOrders(prev => {
                const next = prev.map(o => o.id === orderId ? updatedOrderObj : o);
                const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
                safeLocalStorageSet(key, JSON.stringify(next));
                return next;
            });

            addNotification({
              orderId,
              orderCode: updatedOrderObj.code,
              title: `🟢 In xong #${updatedOrderObj.code}`,
              message: `${currentUser.name} đã xác nhận in xong theo hướng dẫn gốc.`,
              type: 'printed'
            });

            broadcastChange();
        }
    } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
    }
  };

  // 5.1 CANCEL WORKFLOW (Yêu cầu hủy từ Thiết Kế/Sale -> Thợ in/Gia công xác nhận)
  const requestCancelOrder = async (orderId: string, reason: string) => {
    if (!isDemoActive) {
      try {
        await workflowCallableService.requestProductionCancellation(orderId, reason);
        await syncNow();
        broadcastChange();
      } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
      }
      return;
    }
    try {
        const updatedOrderObj = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
            if (!['WAITING_ACCEPTANCE', 'WAITING_PLATE', 'ACCEPTED', 'WAITING_PRINT'].includes(order.status)) {
                throw new Error('Chỉ có thể yêu cầu hủy trước khi bắt đầu in.');
            }
            if (order.cancellationRequest?.status === 'PENDING') {
                throw new Error("Đã có yêu cầu hủy đang chờ duyệt.");
            }
            
            const now = new Date();
            const cancellationRequest: CancellationRequest = {
              requestedBy: currentUser.id,
              requestedByName: currentUser.name,
              requestedRole: currentUser.role,
              requestedAt: now.toISOString(),
              reason: reason.trim() || 'Khách đổi ý / Tạm dừng sản xuất',
              status: 'PENDING'
            };

            const updatedTimeline: TimelineEvent[] = [
              ...order.timeline,
              {
                id: 'tl-' + Date.now(),
                time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
                author: currentUser.name,
                content: `🚨 BÁO HỦY LỆNH: "${reason.trim() || 'Tạm dừng lệnh'}" (Chờ thợ in xác nhận)`,
                type: 'cancel_request'
              }
            ];

            return {
              ...order,
              status: order.status,
              cancellationRequest,
              timeline: updatedTimeline
            };
        }, isDemoActive);

        if (updatedOrderObj) {
            setOrders(prev => {
                const next = prev.map(o => o.id === orderId ? updatedOrderObj : o);
                const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
                safeLocalStorageSet(key, JSON.stringify(next));
                return next;
            });

            {
              const targetUserId = updatedOrderObj.printerId;
              
              if (targetUserId) {
                 addNotification({
                  userId: targetUserId,
                  orderId,
                  orderCode: updatedOrderObj.code,
                  title: `🚨 YÊU CẦU HỦY TRƯỚC KHI IN #${updatedOrderObj.code}`,
                  message: `${currentUser.name} yêu cầu dừng: "${reason}". Xác nhận đã dừng ngay!`,
                  type: 'cancel_requested',
                  priority: 'CRITICAL',
                  actionRequired: true
                });
              } else {
                 addNotification({
                  targetRole: 'PRINTER',
                  orderId,
                  orderCode: updatedOrderObj.code,
                  title: `🚨 YÊU CẦU HỦY TRƯỚC KHI IN #${updatedOrderObj.code}`,
                  message: `${currentUser.name} yêu cầu dừng: "${reason}". Xác nhận đã dừng ngay!`,
                  type: 'cancel_requested',
                  priority: 'CRITICAL',
                  actionRequired: true
                });
              }
            }

            soundManager.playAlert();
            broadcastChange();
        }
    } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
    }
  };

  const respondCancelOrder = async (orderId: string, accept: boolean, responseReason?: string) => {
    if (!isDemoActive) {
      try {
        await workflowCallableService.respondProductionCancellation(orderId, accept, responseReason);
        await syncNow();
        broadcastChange();
      } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
      }
      return;
    }
    try {
        const updatedOrderObj = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
            if (order.cancellationRequest?.status !== 'PENDING') {
                throw new Error("Không có yêu cầu hủy nào đang chờ duyệt.");
            }
            if (currentUser.role !== 'PRINTER' || order.printerId !== currentUser.id) {
                throw new Error('Chỉ thợ in được phân công mới có thể xử lý yêu cầu hủy.');
            }

            const now = new Date();
            const currentReq = order.cancellationRequest || {
              requestedBy: 'unknown',
              requestedByName: 'Thiết kế',
              requestedRole: 'DESIGNER' as UserRole,
              requestedAt: now.toISOString(),
              reason: 'Yêu cầu hủy',
              status: 'PENDING' as const
            };

            const updatedReq: CancellationRequest = {
              ...currentReq,
              status: accept ? 'ACCEPTED' : 'REJECTED',
              respondedBy: currentUser.id,
              respondedByName: currentUser.name,
              respondedAt: now.toISOString(),
              responseReason: responseReason || (accept ? 'Đã dừng kịp thời, đồng ý hủy lệnh' : 'Không thể hủy vì đã làm xong/đang chạy dở dang')
            };

            const updatedTimeline: TimelineEvent[] = [
              ...order.timeline,
              {
                id: 'tl-' + Date.now(),
                time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
                author: currentUser.name,
                content: accept 
                  ? `✅ ${currentUser.name} ĐÃ XÁC NHẬN DỪNG & HỦY: ${responseReason || 'Dừng kịp thời'}`
                  : `⚠️ ${currentUser.name} TỪ CHỐI HỦY: ${responseReason || 'Không thể dừng'}`,
                type: accept ? 'cancel_done' : 'cancel_rejected'
              }
            ];

            return {
              ...order,
              status: accept ? 'CANCELLED' : order.status,
              cancellationRequest: updatedReq,
              timeline: updatedTimeline
            };
        }, isDemoActive);

        if (updatedOrderObj) {
            setOrders(prev => {
                const next = prev.map(o => o.id === orderId ? updatedOrderObj : o);
                const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
                safeLocalStorageSet(key, JSON.stringify(next));
                return next;
            });

            const requesterId = updatedOrderObj.cancellationRequest?.requestedBy;

            if (accept) {
              const notificationContent = {
                orderId,
                orderCode: updatedOrderObj.code,
                title: `✅ ĐÃ HỦY THÀNH CÔNG LỆNH #${updatedOrderObj.code}`,
                message: `${currentUser.name} đã xác nhận dừng & hủy lệnh.`,
                type: 'cancel_accepted' as const,
                priority: 'NORMAL' as const
              };
              
              if (requesterId) {
                addNotification({ ...notificationContent, userId: requesterId });
              } else {
                addNotification({ ...notificationContent, targetRole: 'DESIGNER' });
              }

              soundManager.playDing();
              
              if (updatedOrderObj.items.some(i => i.salesOrderId && i.salesOrderItemId)) {
                salesOrderWorkflowService.handleProductionOrderCancelled(updatedOrderObj).catch(err => {
                  console.error('Failed to update sales order items', err);
                });
              }
            } else {
              const notificationContent = {
                orderId,
                orderCode: updatedOrderObj.code,
                title: `⚠️ KHÔNG THỂ HỦY LỆNH #${updatedOrderObj.code}`,
                message: `${currentUser.name} phản hồi: "${responseReason || 'Không thể dừng'}".`,
                type: 'cancel_rejected' as const,
                priority: 'URGENT' as const
              };
              
              if (requesterId) {
                addNotification({ ...notificationContent, userId: requesterId });
              } else {
                addNotification({ ...notificationContent, targetRole: 'DESIGNER' });
              }
              soundManager.playAlert();
            }

            broadcastChange();
        }
    } catch (err: any) {
        alert(err.message || 'Lỗi xử lý giao dịch. Vui lòng tải lại trang.');
    }
  };

  // 6. HANDOFF TO FINISHING
  const handoffToFinishing = async (orderId: string, finisherId: string, types: FinishingType[], note?: string) => {
    if (!isDemoActive) {
      await workflowCallableService.handoffToFinishing(orderId, finisherId, types, note);
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    const finisherUser = users.find(u => u.id === finisherId) || users.find(u => u.role === 'FINISHER');
    const finisherName = finisherUser ? finisherUser.name : 'Tổ Gia Công';
    let updatedOrderObj: ProductionOrder | null = null;

    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;

        const updatedTimeline = [
          ...o.timeline,
          {
            id: 'tl-' + Date.now(),
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: `Chuyển ${finisherName} gia công: ${types.join(', ')}`,
            type: 'other' as const
          }
        ];

        const updated: ProductionOrder = {
          ...o,
          status: 'FINISHING',
          finishing: {
            id: 'fin-' + Date.now(),
            finisherId,
            finisherName,
            types,
            status: 'PENDING',
            note,
            assignedAt: now.toISOString()
          },
          timeline: updatedTimeline,
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }

    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      addNotification({
        targetRole: 'FINISHER',
        orderId,
        orderCode: targetOrder.code,
        title: `🟣 Có việc gia công mới #${targetOrder.code}`,
        message: `Lệnh #${targetOrder.code} in xong, cần ${types.join(', ')}`,
        type: 'finishing'
      });
    }

    broadcastChange();
  };

  // 7. FINISHING WORKFLOW
  const startFinishing = async (orderId: string) => {
    if (!isDemoActive) {
      await workflowCallableService.startFinishing(orderId);
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    let updatedOrderObj: ProductionOrder | null = null;

    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;
        const updated: ProductionOrder = {
          ...o,
          status: 'FINISHING',
          finishing: o.finishing ? {
            ...o.finishing,
            status: 'IN_PROGRESS',
            startedAt: now.toISOString()
          } : undefined,
          timeline: [
            ...o.timeline,
            {
              id: 'tl-' + Date.now(),
              time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
              author: currentUser.name,
              content: `${currentUser.name} bắt đầu gia công`,
              type: 'finish_start' as const
            }
          ],
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }
    broadcastChange();
  };

  const completeFinishing = async (orderId: string) => {
    if (!isDemoActive) {
      await workflowCallableService.completeFinishing(orderId);
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    const now = new Date();
    let updatedOrderObj: ProductionOrder | null = null;

    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;
        const updated: ProductionOrder = {
          ...o,
          status: 'COMPLETED',
          completedAt: now.toISOString(),
          finishing: o.finishing ? {
            ...o.finishing,
            status: 'COMPLETED',
            completedAt: now.toISOString()
          } : undefined,
          timeline: [
            ...o.timeline,
            {
              id: 'tl-' + Date.now(),
              time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
              author: currentUser.name,
              content: `Hoàn thành gia công 100% – Xuất xưởng thành công!`,
              type: 'finish_done' as const
            }
          ],
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }

    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      addNotification({
        orderId,
        orderCode: targetOrder.code,
        title: `🎉 Hoàn thành đơn #${targetOrder.code}`,
        message: `Đơn hàng #${targetOrder.code} đã in và gia công hoàn tất!`,
        type: 'completed'
      });
      
      // Handle SalesOrder integration
      if (updatedOrderObj && updatedOrderObj.items.some(i => i.salesOrderId && i.salesOrderItemId)) {
        salesOrderWorkflowService.handleProductionOrderCompleted(updatedOrderObj!).catch(err => {
          console.error('Failed to update sales order items on production order completion', err);
        });
      }
    }

    broadcastChange();
  };

  // 8. REPORT ISSUE (Báo vấn đề nhanh)
  const reportIssue = async (orderId: string, type: string, message: string, imageUrl?: string, recipientUserIds: string[] = [], recipientRoles: UserRole[] = [], urgent = false) => {
    if (!isDemoActive) {
      await workflowCallableService.reportProductionIssue(orderId, type, message, recipientUserIds, recipientRoles, urgent);
      await syncNow();
      broadcastChange();
      return;
    }
    const persistedImageUrl = isDemoActive && !imageStorageService.isDataImage(imageUrl) ? imageUrl : undefined;
    try {
      const updatedOrderObj = await productionOrderRepository.runOrderTransaction(orderId, async (order) => {
        if ((order.status === 'COMPLETED' || order.status === 'CANCELLED') && type !== 'Ghi nhận vấn đề sau hoàn thành (Hậu kiểm)' && type !== 'Báo thiếu số lượng / thất thoát') {
           throw new Error("Lệnh này đã kết thúc, không thể báo sự cố sản xuất.");
        }
        
        const now = new Date();
        const issueId = 'iss-' + Date.now();
        
        const newIssue = {
          id: issueId,
          type,
          message,
          imageUrl: persistedImageUrl,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
          recipientUserIds,
          recipientRoles,
          priority: urgent ? 'URGENT' as const : 'NORMAL' as const,
          isBlocking: false,
          status: 'OPEN' as const,
          createdAt: now.toISOString()
        };

        const updatedTimeline = [
          ...order.timeline,
          {
            id: 'tl-' + Date.now(),
            time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
            author: currentUser.name,
            content: `Báo sự cố: [${type}] ${message}`,
            type: 'issue' as const
          }
        ];

        return {
          ...order,
          issues: [newIssue, ...(order.issues || [])],
          timeline: updatedTimeline,
          updatedAt: now.toISOString()
        };
      }, isDemoActive);

      if (updatedOrderObj) {
        setOrders(prev => {
          const next = prev.map(o => o.id === orderId ? updatedOrderObj : o);
          const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
          safeLocalStorageSet(key, JSON.stringify(next));
          return next;
        });

        // 1. Thông báo đến Designer đã tạo lệnh sản xuất này
        if (updatedOrderObj.createdBy) {
          addNotification({
            userId: updatedOrderObj.createdBy,
            orderId,
            orderCode: updatedOrderObj.code,
            title: `🔴 SỰ CỐ LỆNH BẠN TẠO: #${updatedOrderObj.code}`,
            message: `${currentUser.name} báo sự cố [${type}]: ${message}. Vui lòng kiểm tra lại file/kẽm!`,
            type: 'issue'
          });
        } else {
          addNotification({
            targetRole: 'DESIGNER',
            orderId,
            orderCode: updatedOrderObj.code,
            title: `🔴 BÁO SỰ CỐ: #${updatedOrderObj.code}`,
            message: `${currentUser.name} báo: [${type}] ${message}`,
            type: 'issue'
          });
        }

        // 2. Thông báo đến toàn thể nhân viên Sale để kịp thời trao đổi với khách
        addNotification({
          targetRole: 'SALE',
          orderId,
          orderCode: updatedOrderObj.code,
          title: `⚠️ CẢNH BÁO TIẾN ĐỘ #${updatedOrderObj.code}`,
          message: `Lệnh #${updatedOrderObj.code} gặp sự cố [${type}]: ${message}. Bộ phận Sale lưu ý tiến độ khi trao đổi với khách!`,
          type: 'issue'
        });

        // 3. Thông báo đến Admin / Quản lý xưởng để xử lý nguyên liệu / máy móc
        addNotification({
          targetRole: 'ADMIN',
          orderId,
          orderCode: updatedOrderObj.code,
          title: `🚨 SỰ CỐ XƯỞNG #${updatedOrderObj.code}`,
          message: `${currentUser.name} báo sự cố [${type}]: ${message}. Cần kiểm tra nguyên liệu / máy móc!`,
          type: 'issue'
        });

        soundManager.playAlert();
        broadcastChange();
      }
    } catch (err: any) {
       alert(err.message || 'Lỗi gửi cảnh báo. Vui lòng thử lại.');
    }
  };

  // 9. RESOLVE ISSUE
  const resolveIssue = async (orderId: string, issueId: string) => {
    if (!isDemoActive) {
      await workflowCallableService.resolveProductionIssue(orderId, issueId);
      await syncNow();
      broadcastChange();
      return;
    }
    const previousOrders = orders;
    let updatedOrderObj: ProductionOrder | null = null;
    const now = new Date();

    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;
        const updatedIssues = o.issues.map(iss => iss.id === issueId ? { ...iss, status: 'RESOLVED' as const, resolvedAt: now.toISOString() } : iss);
        const updated: ProductionOrder = {
          ...o,
          hasBlockingIssue: false,
          issues: updatedIssues,
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;
    }
    broadcastChange();
  };

  const cancelIssue = async (orderId: string, issueId: string) => {
    if (!isDemoActive) {
      await workflowCallableService.cancelProductionIssue(orderId, issueId);
      await syncNow();
      broadcastChange();
      return;
    }
    const now = new Date().toISOString();
    const previousOrders = orders;
    const target = orders.find(order => order.id === orderId);
    const issue = target?.issues.find(candidate => candidate.id === issueId);
    if (!issue || issue.createdBy !== currentUser.id) {
      alert('Chi nguoi bao moi co the huy su co nay.');
      return;
    }
    const updated = target && {
      ...target,
      hasBlockingIssue: false,
      issues: target.issues.map(candidate => candidate.id === issueId
        ? { ...candidate, status: 'CANCELLED' as const, cancelledBy: currentUser.id, cancelledByName: currentUser.name, cancelledAt: now }
        : candidate),
      updatedAt: now,
    };
    if (!updated) return;
    setOrders(current => current.map(order => order.id === orderId ? updated : order));
    if (!await persistOrderOrRollback(updated, previousOrders)) return;
    broadcastChange();
  };

  // 10. COMMENT (Zalo-like interactive chat on order)
  const addComment = async (orderId: string, message: string, imageUrl?: string) => {
    const persistedImageUrl = isDemoActive && !imageStorageService.isDataImage(imageUrl) ? imageUrl : undefined;
    const previousOrders = orders;
    const now = new Date();
    let updatedOrderObj: ProductionOrder | null = null;

    setOrders(prev => {
      const next = prev.map(o => {
        if (o.id !== orderId) return o;

        const newComment = {
          id: 'c-' + Date.now(),
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          message,
          imageUrl: persistedImageUrl,
          createdAt: now.toISOString()
        };

        const updated: ProductionOrder = {
          ...o,
          comments: [...o.comments, newComment],
          updatedAt: now.toISOString()
        };
        updatedOrderObj = updated;
        return updated;
      });
      const key = isDemoActive ? STORAGE_KEYS_DEMO.ORDERS : STORAGE_KEYS_PROD.ORDERS;
      safeLocalStorageSet(key, JSON.stringify(next));
      return next;
    });

    if (updatedOrderObj) {
      if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;

      let targetRole: 'PRINTER' | 'FINISHER' | null = null;
      if (['WAITING_ACCEPTANCE', 'PRINTING'].includes(updatedOrderObj.status)) {
        targetRole = 'PRINTER';
      } else if (['PRINTED', 'FINISHING'].includes(updatedOrderObj.status)) {
        targetRole = 'FINISHER';
      }

      if (targetRole && currentUser.role !== targetRole) {
        addNotification({
          targetRole,
          orderId,
          orderCode: updatedOrderObj.code,
          title: `💬 Bình luận mới #${updatedOrderObj.code}`,
          message: `${currentUser.name} bình luận: ${message}`,
          type: 'info'
        });
        soundManager.playAlert();
      }
    }
    broadcastChange();
  };

  // 11. IN LẠI / DUPLICATE ORDER (Chỉ dành cho Thiết kế & Quản lý)
  const duplicateOrder = (order: ProductionOrder) => {
    if (currentUser.role !== 'DESIGNER' && currentUser.role !== 'ADMIN') {
      return;
    }

    // Kế thừa ngày kẽm gốc:
    // Lệnh gốc tạo ngày 12/2/2025 -> originalPlateDate = 12/02/2025
    // Lệnh in lại ngày 12/6/2025 -> kế thừa originalPlateDate = 12/02/2025
    // Lệnh in lại tiếp từ lệnh 12/6/2025 -> vẫn nhận 12/02/2025
    // Nếu lệnh trước đó báo hỏng kẽm và ra lại kẽm -> originalPlateDate đã được cập nhật thành ngày mới!
    const inheritedPlateDate = order.originalPlateDate || order.plateDate || formatDayMonthYear(order.createdAt);
    const prodName = order.productName || order.items[0]?.productName || order.items[0]?.customerName || '';

    setPrefilledOrderData({
      productName: prodName,
      paperType: order.paperType,
      paperGsm: order.paperGsm,
      paperWidth: order.paperWidth,
      paperHeight: order.paperHeight,
      totalSheets: order.totalSheets,
      color: order.color,
      note: `In lại từ #${order.code}` + (order.note ? ` - ${order.note}` : ''),
      plateType: 'OLD',
      plateStatus: 'OLD_PLATE',
      plateDate: inheritedPlateDate,
      originalPlateDate: inheritedPlateDate,
      plateNote: `In lại kẽm cũ ngày ${inheritedPlateDate}`,
      printerId: order.printerId,
      printerName: order.printerName,
      isReprint: true,
      reprintFromCode: order.code,
      reprintFromDate: formatDayMonthYear(order.createdAt),
      items: order.items.map(item => ({
        ...item,
        id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        oldPlateReference: `Kẽm cũ ngày ${inheritedPlateDate}`
      }))
    });
    setIsCreateModalOpen(true);
  };

  // 12. TOGGLE ĐƠN CẦN GẤP / ƯU TIÊN IN (Dành cho Sale, Thiết Kế & Quản lý)
  const toggleUrgentOrder = async (orderId: string, isUrgentState?: boolean, reason?: string) => {
    if (!canToggleUrgent(currentUser, appConfig)) {
      throw new Error('You do not have permission to change urgent order status.');
    }
    const previousOrders = orders;
    const now = new Date();
    const currentOrder = orders.find((order) => order.id === orderId);
    if (!currentOrder) return;
    const newUrgentVal = isUrgentState !== undefined ? isUrgentState : !currentOrder.isUrgent;
    const targetOrderCode = currentOrder.code;
    // Do not derive the Firestore payload from a React state-updater callback:
    // React may schedule that callback after this function has already decided
    // whether to persist. Build it synchronously, then render optimistically.
    const updatedOrderObj = buildUrgentOrderUpdate(currentOrder, currentUser, newUrgentVal, reason, now);
    setOrders((current) => current.map((order) => order.id === orderId ? updatedOrderObj : order));

    if (!await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;

    if (newUrgentVal) {
      let targetRole: UserRole = 'PRINTER';
      let targetLabel = 'thợ in';
      
      const targetOrder = orders.find(o => o.id === orderId);
      if (targetOrder && ['PRINTED', 'FINISHING'].includes(targetOrder.status)) {
        targetRole = 'FINISHER';
        targetLabel = 'tổ gia công';
      }

      addNotification({
        targetRole,
        orderId,
        orderCode: targetOrderCode,
        title: `🔥 ĐƠN CẦN GẤP #${targetOrderCode}`,
        message: `${currentUser.name} (${currentUser.role === 'SALE' ? 'Sale' : currentUser.role === 'DESIGNER' ? 'Thiết kế' : 'Quản lý'}) báo: Đơn hàng cần gấp, ${targetLabel} vui lòng ưu tiên xử lý trước!`,
        type: 'urgent'
      });
      soundManager.playAlert();
    }

    broadcastChange();
  };

  // 13. UPDATE GHI CHÚ GIA CÔNG (Sale, Thiết Kế & Quản lý ghi chú cho tổ gia công)
  const updateFinishingNote = async (orderId: string, finishingNoteText: string) => {
    const previousOrders = orders;
    const now = new Date();
    let targetOrderCode = '';
    let updatedOrderObj: ProductionOrder | null = null;

    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o;
      targetOrderCode = o.code;

      const roleTitle = currentUser.role === 'SALE' ? 'Sale' : currentUser.role === 'DESIGNER' ? 'Thiết kế' : 'Quản lý';
      const updatedTimeline: TimelineEvent[] = [
        ...o.timeline,
        {
          id: 'tl-' + Date.now(),
          time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} – ${now.getDate()}/${now.getMonth() + 1}`,
          author: currentUser.name,
          content: `✂️ ${currentUser.name} (${roleTitle}) ghi chú gia công: "${finishingNoteText.trim()}"`,
          type: 'other' as const
        }
      ];

      const updated: ProductionOrder = {
        ...o,
        finishingNote: finishingNoteText.trim() || undefined,
        timeline: updatedTimeline,
        updatedAt: now.toISOString()
      };
      updatedOrderObj = updated;
      return updated;
    }));

    if (!updatedOrderObj || !await persistOrderOrRollback(updatedOrderObj, previousOrders)) return;

    if (finishingNoteText.trim()) {
      addNotification({
        targetRole: 'FINISHER',
        orderId,
        orderCode: targetOrderCode,
        title: `✂️ Ghi chú gia công #${targetOrderCode}`,
        message: `${currentUser.name}: ${finishingNoteText.trim()}`,
        type: 'finishing'
      });
    }

    broadcastChange();
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder(prev => prev ? { ...prev, finishingNote: finishingNoteText.trim() || undefined } : null);
    }
  };

  // 14. SAVE DESIGN TO LIBRARY
  
  // Notifications
  
  
  // Reset to initial demo data (Isolated strictly to Demo Sandbox)
  const resetDemoData = () => {
    if (!isDemoActive) {
      alert('🔒 BẢO VỆ DỮ LIỆU ONLINE XƯỞNG:\n\n' +
        'Hệ thống đang hoạt động ở Chế độ Online Thực tế.\n' +
        'Toàn bộ đơn hàng và lịch sử sản xuất của xưởng được bảo vệ an toàn 100% trên Cloud Firestore, không thể bị xóa đè.\n\n' +
        '👉 Nếu bạn muốn thử nghiệm tính năng với dữ liệu mẫu và đặt lại tùy ý, vui lòng chuyển sang "Chế độ Demo Sandbox".'
      );
      return;
    }

    // Safely wipe and re-initialize ONLY Demo Sandbox storage
    setOrders(INITIAL_ORDERS);
    setSavedDesigns(INITIAL_SAVED_DESIGNS);
    setSettings(INITIAL_SETTINGS);
    setNotifications([]);
    try {
      safeLocalStorageSet(STORAGE_KEYS_DEMO.ORDERS, JSON.stringify(INITIAL_ORDERS));
      safeLocalStorageSet(STORAGE_KEYS_DEMO.SAVED_DESIGNS, JSON.stringify(INITIAL_SAVED_DESIGNS));
      safeLocalStorageSet(STORAGE_KEYS_DEMO.SETTINGS, JSON.stringify(INITIAL_SETTINGS));
      safeLocalStorageSet(STORAGE_KEYS_DEMO.NOTIFICATIONS, JSON.stringify([]));
    } catch (e) {
      console.warn('Reset demo error:', e);
    }
    broadcastChange();
    soundManager.playSuccess();
  };

  // Counters
  // unreadNotifsCount destructured above
  const timeoutMs = (appConfig.workflow.printerAcceptanceTimeoutMinutes || 30) * 60 * 1000;
  const urgentOrdersCount = orders.filter(o => 
    o.isUrgent ||
    
    o.plateStatus === 'NOT_SENT' || 
    (o.status === 'WAITING_ACCEPTANCE' && (new Date().getTime() - new Date(o.createdAt).getTime()) > timeoutMs)
  ).length;

  return (
    <AppContext.Provider
      value={{
        currentUser,
        realAuthenticatedUser: firebaseProfile,
        setCurrentUser,
        users,
        orders,
        savedDesigns,
        notifications,
        settings,
        updateSettings,
        appConfig,
        updateAppConfig,
        isFirebaseOnline,
        firebaseAuthenticated,
        isOnline,
        isSyncing,
        syncNow,
        appVersion: APP_VERSION,
        activeTab,
        setActiveTab,
        searchQuery,
        setSearchQuery,
        filterPaper,
        setFilterPaper,
        filterPrinter,
        setFilterPrinter,
        filterTime,
        setFilterTime,
        isCreateModalOpen,
        setIsCreateModalOpen,
        selectedOrder,
        setSelectedOrder,
        isLibraryModalOpen,
        setIsLibraryModalOpen,
        isSettingsModalOpen,
        setIsSettingsModalOpen,
        isInstallModalOpen,
        setIsInstallModalOpen,
        isUserManagementModalOpen,
        setIsUserManagementModalOpen,
        isProfileModalOpen,
        setIsProfileModalOpen,
        isCustomerImportModalOpen,
        setIsCustomerImportModalOpen,
        isLoginModalOpen,
        setIsLoginModalOpen,
        isSessionLocked,
        setIsSessionLocked,
        isPersonalDemoActive,
        setIsPersonalDemoActive,
        previewRole,
        setPreviewRole,
        isRolePreviewActive,
        isDeveloperDemoPreviewReady,
        isDemoActive,
        isLoadingHistory,
        hasMoreHistory,
        loadMoreHistory,
        searchHistoryByCode,
        logout,
        previewImage,
        setPreviewImage,
        prefilledOrderData,
        setPrefilledOrderData,
        selectedOrderIds,
        toggleSelectOrder,
        selectAllOrders,
        clearSelectedOrders,
        isOrderSelected,
        addUser,
        updateUser,
        deleteUser,
        loginWithPin,
        createOrder,
        dispatchOrder,
        dispatchMultipleOrders,
        markPlatesReadyBatch,
        deleteDraftOrder,
        deleteMultipleDraftOrders,
        deleteOrder,
        deleteMultipleOrders,
        deleteAllOrders,
        reassignPrintersBatch,
        reviseProductionInstruction,
        acceptOrder,
        acknowledgeProductionRevision,
        updatePlateStatus,
        reportMissingPlate,
        reportMissingOrDamagedPlate,
        reissueNewPlate,
        confirmPlateReceived,
        startPrinting,
        startPrintingDirect,
        finishPrinting,
        requestCancelOrder,
        respondCancelOrder,
        handoffToFinishing,
        startFinishing,
        completeFinishing,
        reportIssue,
        resolveIssue,
        cancelIssue,
        addComment,
        duplicateOrder,
        toggleUrgentOrder,
        updateFinishingNote,
        saveDesignToLibrary,
        markNotificationRead,
        markAllNotificationsRead,
        resetDemoData,
        isAppInstalled,
        unreadNotifsCount,
        urgentOrdersCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};


export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <ConfigProvider>
        <NotificationProvider>
          <SavedDesignProvider>
            <ProductionProvider>
              <AppProviderInner>
                {children}
              </AppProviderInner>
            </ProductionProvider>
          </SavedDesignProvider>
        </NotificationProvider>
      </ConfigProvider>
    </AuthProvider>
  );
};
