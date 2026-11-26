import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SavedDesign } from '../types';
import { INITIAL_SAVED_DESIGNS } from '../data/initialData';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../utils/storageUtils';
import { useConfig } from './ConfigContext';
import { useAuth } from './AuthContext';
import { savedDesignRepository } from '../repositories/savedDesignRepository';
import { savedDesignService } from '../services/savedDesignService';

export type SavedDesignLoadState = 'NOT_LOADED' | 'LOADING' | 'REMOTE_LOADED' | 'ERROR';

interface SavedDesignContextType {
  savedDesigns: SavedDesign[];
  setSavedDesigns: React.Dispatch<React.SetStateAction<SavedDesign[]>>;
  saveDesignToLibrary: (design: Omit<SavedDesign, 'id' | 'lastPrintedAt' | 'printCount'>) => Promise<void>;
  savedDesignLoadState: SavedDesignLoadState;
}

const SavedDesignContext = createContext<SavedDesignContextType | undefined>(undefined);

export const SavedDesignProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isDemoActive } = useConfig();
  const { firebaseAuthenticated } = useAuth();

  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>(() => {
    if (!isDemoActive) return [];
    const saved = safeLocalStorageGet('flexo_saved_designs_demo_v1');
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SavedDesign[];
        const seenIds = new Set<string>();
        const uniqueList: SavedDesign[] = [];
        parsed.forEach((d, idx) => {
          let uniqueId = d.id;
          if (!uniqueId || seenIds.has(uniqueId)) {
            uniqueId = `des-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 8)}`;
          }
          seenIds.add(uniqueId);
          uniqueList.push({ ...d, id: uniqueId });
        });
        return uniqueList.length > 0 ? uniqueList : INITIAL_SAVED_DESIGNS;
      } catch {
        return INITIAL_SAVED_DESIGNS;
      }
    }
    return INITIAL_SAVED_DESIGNS;
  });
  const [savedDesignLoadState, setSavedDesignLoadState] = useState<SavedDesignLoadState>(isDemoActive ? 'REMOTE_LOADED' : 'NOT_LOADED');

  useEffect(() => {
    if (!isDemoActive) return;
    safeLocalStorageSet('flexo_saved_designs_demo_v1', JSON.stringify(savedDesigns));
  }, [savedDesigns, isDemoActive]);

  useEffect(() => {
    if (isDemoActive) return;

    if (!firebaseAuthenticated) {
      setSavedDesigns([]);
      setSavedDesignLoadState('NOT_LOADED');
      safeLocalStorageRemove('flexo_saved_designs_prod_v1');
      return;
    }

    let isCurrent = true;
    setSavedDesignLoadState('LOADING');
    const applyRemoteDesigns = (remoteDesigns: SavedDesign[]) => {
      if (!isCurrent) return;
      setSavedDesigns(remoteDesigns);
      setSavedDesignLoadState('REMOTE_LOADED');
    };
    const handleRemoteError = (error: unknown) => {
      if (!isCurrent) return;
      console.warn('Unable to load saved designs from Firestore:', error);
      setSavedDesignLoadState('ERROR');
    };

    const unsubDesigns = savedDesignRepository.subscribeDesigns(applyRemoteDesigns, isDemoActive, handleRemoteError);

    void savedDesignRepository.getDesigns(isDemoActive).then(applyRemoteDesigns).catch(handleRemoteError);

    return () => {
      isCurrent = false;
      unsubDesigns();
    };
  }, [isDemoActive, firebaseAuthenticated]);

  const saveDesignToLibrary = useCallback(async (design: Omit<SavedDesign, 'id' | 'lastPrintedAt' | 'printCount'>) => {
    const { nextDesigns, updatedDesign } = savedDesignService.createOrUpdateDesign(design, savedDesigns);
    if (isDemoActive) {
      setSavedDesigns(nextDesigns);
      return;
    }
    if (!firebaseAuthenticated) throw new Error('Firebase business identity is required before saving designs.');
    await savedDesignRepository.saveDesign(updatedDesign, false);
    setSavedDesigns(nextDesigns);
  }, [firebaseAuthenticated, isDemoActive, savedDesigns]);

  return (
    <SavedDesignContext.Provider value={{
      savedDesigns,
      setSavedDesigns,
      saveDesignToLibrary,
      savedDesignLoadState
    }}>
      {children}
    </SavedDesignContext.Provider>
  );
};

export const useSavedDesign = () => {
  const context = useContext(SavedDesignContext);
  if (!context) {
    throw new Error('useSavedDesign must be used within a SavedDesignProvider');
  }
  return context;
};
