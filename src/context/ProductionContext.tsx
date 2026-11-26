import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { ProductionOrder, ProductionStatus, PlateStatus } from '../types';
import { INITIAL_ORDERS } from '../data/initialData';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../utils/storageUtils';
import { productionOrderRepository } from '../repositories/productionOrderRepository';
import { localProductionDraftRepository } from '../repositories/localProductionDraftRepository';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';

interface ProductionContextType {
  orders: ProductionOrder[];
  setOrders: React.Dispatch<React.SetStateAction<ProductionOrder[]>>;
  
  // History Pagination
  isLoadingHistory: boolean;
  hasMoreHistory: boolean;
  loadMoreHistory: () => Promise<void>;
  searchHistoryByCode: (code: string) => Promise<void>;
}

const ProductionContext = createContext<ProductionContextType | undefined>(undefined);

export const ProductionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isDemoActive } = useConfig();
  const { firebaseAuthenticated, firebaseProfile } = useAuth();
  
  const [orders, setOrders] = useState<ProductionOrder[]>(() => {
    if (isDemoActive) {
      const saved = safeLocalStorageGet('flexo_orders_demo_v1');
      if (!saved) return INITIAL_ORDERS;
      try {
        const parsed = JSON.parse(saved) as ProductionOrder[];
        return Array.isArray(parsed) ? parsed.filter(o => !o.deletedAt) : INITIAL_ORDERS;
      } catch {
        return INITIAL_ORDERS;
      }
    }
    // Production waits for a Firestore read/snapshot. Cached orders are never
    // promoted into in-memory business state before Firestore confirms them.
    return [];
  });

  const historyCursorRef = useRef<any>(null);
  const officialOrdersRef = useRef<ProductionOrder[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  const loadMoreHistory = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory || isDemoActive || !firebaseAuthenticated) return;
    setIsLoadingHistory(true);
    try {
      const res = await productionOrderRepository.getHistoryOrders(historyCursorRef.current, 50);
      if (res.orders.length > 0) {
        setOrders(prev => {
          const map = new Map<string, ProductionOrder>();
          prev.forEach(o => map.set(o.id, o));
          res.orders.forEach(o => map.set(o.id, o));
          return Array.from(map.values()).sort((a,b) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
        });
      }
      historyCursorRef.current = res.lastDoc;
      if (!res.lastDoc || res.orders.length < 50) {
        setHasMoreHistory(false);
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isLoadingHistory, hasMoreHistory, isDemoActive, firebaseAuthenticated]);

  const searchHistoryByCode = useCallback(async (code: string) => {
    if (!code.trim() || isDemoActive || !firebaseAuthenticated) return;
    setIsLoadingHistory(true);
    try {
      const results = await productionOrderRepository.searchHistoryByCode(code);
      if (results.length > 0) {
        setOrders(prev => {
          const map = new Map<string, ProductionOrder>();
          prev.forEach(o => map.set(o.id, o));
          results.forEach(o => map.set(o.id, o));
          return Array.from(map.values()).sort((a,b) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
        });
      }
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isDemoActive, firebaseAuthenticated]);

  useEffect(() => {
    if (isDemoActive) safeLocalStorageSet('flexo_orders_demo_v1', JSON.stringify(orders));
  }, [orders, isDemoActive]);

  useEffect(() => {
    if (isDemoActive || !firebaseAuthenticated) return;
    let active = true;
    const mergeLocalDrafts = async () => {
      try {
        let drafts = await localProductionDraftRepository.list();
        if (firebaseProfile?.id) {
          const backups = await productionOrderRepository.getDraftBackups(firebaseProfile.id);
          const knownIds = new Set([...drafts, ...officialOrdersRef.current].map(order => order.id));
          for (const backup of backups) {
            if (knownIds.has(backup.id)) continue;
            await localProductionDraftRepository.save({
              ...backup,
              clientDraftId: backup.clientDraftId || backup.id,
              draftSync: {
                localRevision: backup.draftSync?.localRevision || backup.draftSync?.backupRevision || 1,
                backupRevision: backup.draftSync?.backupRevision || 1,
                backupStatus: 'BACKED_UP',
              },
            });
            knownIds.add(backup.id);
          }
          drafts = await localProductionDraftRepository.list();
        }
        if (active) setOrders([...drafts, ...officialOrdersRef.current]);
      } catch (error) {
        console.warn('Local production drafts could not be loaded:', error);
      }
    };
    void mergeLocalDrafts();
    const unsubscribe = localProductionDraftRepository.subscribe(() => void mergeLocalDrafts());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isDemoActive, firebaseAuthenticated, firebaseProfile?.id]);

  useEffect(() => {
    if (isDemoActive) return;
    if (!firebaseAuthenticated) {
      setOrders([]);
      historyCursorRef.current = null;
      setHasMoreHistory(true);
      safeLocalStorageRemove('flexo_orders_prod_v1');
      return;
    }

    let isCurrent = true;
    const unsubOrders = productionOrderRepository.subscribeActiveOrders((realtimeOrders) => {
      officialOrdersRef.current = realtimeOrders;
      if (isCurrent) {
        void localProductionDraftRepository.list().then((drafts) => {
          // IndexedDB is asynchronous. A delayed merge from an earlier
          // Firestore snapshot must never overwrite a newer realtime update
          // (for example, an urgent flag just cleared in another session).
          if (isCurrent) setOrders([...drafts, ...officialOrdersRef.current]);
        }).catch((error) => console.warn('Local production drafts could not be merged:', error));
      }
    }, (error) => console.warn('Production realtime listener failed:', error));

    return () => {
      isCurrent = false;
      officialOrdersRef.current = [];
      unsubOrders();
    };
  }, [isDemoActive, firebaseAuthenticated]);

  return (
    <ProductionContext.Provider value={{
      orders, setOrders,
      isLoadingHistory, hasMoreHistory, loadMoreHistory, searchHistoryByCode
    }}>
      {children}
    </ProductionContext.Provider>
  );
};

export const useProduction = () => {
  const context = useContext(ProductionContext);
  if (!context) {
    throw new Error('useProduction must be used within a ProductionProvider');
  }
  return context;
};
