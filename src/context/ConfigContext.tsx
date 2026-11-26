import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AppConfig, UserRole, WorkshopSettings } from '../types';
import { DEFAULT_APP_CONFIG } from '../config/appConfig';
import { settingsRepository } from '../repositories/settingsRepository';
import { INITIAL_SETTINGS } from '../data/initialData';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../utils/storageUtils';
import { setGlobalAppConfig } from '../permissions';
import { applyDynamicAppIcon } from '../utils/iconSync';
import { useAuth } from './AuthContext';
import {
  canUseDeveloperDemoPreview,
  DEVELOPER_DEMO_PREVIEW_STORAGE_KEY,
  parsePersistedDeveloperDemoPreview,
  serializeDeveloperDemoPreview,
} from '../utils/developerDemoPreview';
import { isAuthIdentityRole } from '../utils/authInitializationState';
import { imageStorageService } from '../services/imageStorageService';

export type AppConfigLoadState = 'NOT_LOADED' | 'LOADING' | 'REMOTE_LOADED' | 'ERROR';

interface ConfigContextType {
  appConfig: AppConfig;
  setAppConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  updateAppConfig: (newConfig: Partial<AppConfig>) => Promise<void>;
  
  settings: WorkshopSettings; // Kept for backward compatibility
  setSettings: React.Dispatch<React.SetStateAction<WorkshopSettings>>;
  updateSettings: (newSettings: Partial<WorkshopSettings>) => void;
  
  isDemoActive: boolean;
  isPersonalDemoActive: boolean;
  setIsPersonalDemoActive: (active: boolean) => void;
  previewRole: UserRole;
  setPreviewRole: (role: UserRole) => void;
  isDeveloperDemoPreviewReady: boolean;
  appConfigLoadState: AppConfigLoadState;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);
const BUILD_DEPLOYMENT_MODE: 'DEMO' | 'PRODUCTION' = import.meta.env.VITE_DEPLOYMENT_MODE === 'DEMO' ? 'DEMO' : 'PRODUCTION';

function enforceBuildDeploymentMode(config: AppConfig): AppConfig {
  return {
    ...config,
    system: { ...DEFAULT_APP_CONFIG.system, ...(config.system || {}), deploymentMode: BUILD_DEPLOYMENT_MODE },
  };
}

export const ConfigProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { firebaseAuthenticated, firebaseProfile, authInitializationState } = useAuth();
  // A production session always begins with an explicitly not-loaded default;
  // browser cache must not stand in for an authorized Firestore settings read.
  const [appConfig, setAppConfig] = useState<AppConfig>(() => enforceBuildDeploymentMode(DEFAULT_APP_CONFIG));

  const [isPersonalDemoActive, setIsPersonalDemoActiveState] = useState<boolean>(() => {
    if (BUILD_DEPLOYMENT_MODE === 'PRODUCTION') return false;
    try {
      return safeLocalStorageGet('flexo_personal_demo_active') === 'true';
    } catch {
      return false;
    }
  });

  // A production build cannot be switched into unauthenticated demo mode from
  // localStorage or the settings UI. Developer role preview below is a
  // separate, authenticated UI-only capability; it never changes this value.
  const isDemoActive = BUILD_DEPLOYMENT_MODE === 'DEMO';
  const [previewRole, setPreviewRoleState] = useState<UserRole>('DEVELOPER');
  const [isDeveloperDemoPreviewReady, setIsDeveloperDemoPreviewReady] = useState<boolean>(isDemoActive);

  const [settings, setSettings] = useState<WorkshopSettings>(() => {
    if (!isDemoActive) return INITIAL_SETTINGS;
    const saved = safeLocalStorageGet('flexo_settings_demo_v1');
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });
  const [appConfigLoadState, setAppConfigLoadState] = useState<AppConfigLoadState>(isDemoActive ? 'REMOTE_LOADED' : 'NOT_LOADED');

  const clearDeveloperDemoPreview = useCallback(() => {
    setIsPersonalDemoActiveState(false);
    setPreviewRoleState('DEVELOPER');
    safeLocalStorageRemove(DEVELOPER_DEMO_PREVIEW_STORAGE_KEY);
  }, []);

  // Restore a preview only after Firebase Auth and the trusted business
  // identity have both resolved. The persisted value is bound to the Firebase
  // UID, so a later login by another staff member cannot inherit it.
  useEffect(() => {
    if (isDemoActive) {
      setIsDeveloperDemoPreviewReady(true);
      return;
    }
    if (authInitializationState === 'AUTH_INITIALIZING') {
      setIsDeveloperDemoPreviewReady(false);
      return;
    }
    if (!firebaseAuthenticated || !canUseDeveloperDemoPreview(firebaseProfile)) {
      clearDeveloperDemoPreview();
      setIsDeveloperDemoPreviewReady(true);
      return;
    }

    const restored = parsePersistedDeveloperDemoPreview(
      safeLocalStorageGet(DEVELOPER_DEMO_PREVIEW_STORAGE_KEY),
      firebaseProfile.firebaseUid!,
    );
    if (!restored) {
      setIsPersonalDemoActiveState(false);
      setPreviewRoleState('DEVELOPER');
      setIsDeveloperDemoPreviewReady(true);
      return;
    }
    setPreviewRoleState(restored.previewRole);
    setIsPersonalDemoActiveState(true);
    setIsDeveloperDemoPreviewReady(true);
  }, [authInitializationState, clearDeveloperDemoPreview, firebaseAuthenticated, firebaseProfile, isDemoActive]);

  useEffect(() => {
    if (isDemoActive) return;

    if (!firebaseAuthenticated) {
      // Logout must remove the prior user's protected config from runtime state.
      setAppConfig(enforceBuildDeploymentMode(DEFAULT_APP_CONFIG));
      setSettings(INITIAL_SETTINGS);
      setAppConfigLoadState('NOT_LOADED');
      safeLocalStorageRemove('flexo_instance_app_config_v1');
      safeLocalStorageRemove('flexo_settings_prod_v1');
      return;
    }

    let isCurrent = true;
    setAppConfigLoadState('LOADING');
    const applyRemoteConfig = (cfg: AppConfig) => {
      if (!isCurrent) return;
      const configured = enforceBuildDeploymentMode(cfg);
      setAppConfig(configured);
      setSettings(prev => ({
        ...prev,
        unacceptedWarningMinutes: configured.workflow.printerAcceptanceTimeoutMinutes,
        plateDelayWarningMinutes: configured.workflow.plateWaitingWarningMinutes,
        printDelayWarningMinutes: configured.workflow.printingStuckWarningMinutes,
        soundAlerts: configured.features.soundAlerts,
        autoPlayVoice: configured.features.autoPlayVoice,
      }));
      setAppConfigLoadState('REMOTE_LOADED');
    };
    const handleRemoteError = (error: unknown) => {
      if (!isCurrent) return;
      console.warn('Unable to load production app config from Firestore:', error);
      setAppConfigLoadState('ERROR');
    };

    const unsubConfig = settingsRepository.subscribeAppConfig(applyRemoteConfig, handleRemoteError);

    void settingsRepository.getAppConfig().then(applyRemoteConfig).catch(handleRemoteError);

    return () => {
      isCurrent = false;
      unsubConfig();
    };
  }, [isDemoActive, firebaseAuthenticated]);

  useEffect(() => {
    setGlobalAppConfig(appConfig);
  }, [appConfig]);

  useEffect(() => {
    let active = true;
    void imageStorageService.resolveImageUrl(appConfig.company?.logoImage, appConfig.company?.logoUrl)
      .then((logoUrl) => {
        if (active) applyDynamicAppIcon(logoUrl, appConfig.company?.name, appConfig.company?.shortName);
      })
      .catch(() => {
        if (active) applyDynamicAppIcon(appConfig.company?.logoUrl, appConfig.company?.name, appConfig.company?.shortName);
      });
    return () => { active = false; };
  }, [appConfig.company?.logoImage?.imageId, appConfig.company?.logoUrl, appConfig.company?.name, appConfig.company?.shortName]);

  const updateAppConfig = useCallback(async (newConfig: Partial<AppConfig>) => {
    if (!isDemoActive && !firebaseAuthenticated) {
      throw new Error('Firebase business identity is required before changing settings.');
    }
    const updated: AppConfig = {
      ...appConfig,
      ...newConfig,
      company: { ...appConfig.company, ...(newConfig.company || {}) },
      production: { ...appConfig.production, ...(newConfig.production || {}) },
      workflow: { ...appConfig.workflow, ...(newConfig.workflow || {}) },
      features: { ...appConfig.features, ...(newConfig.features || {}) },
      system: { ...appConfig.system, ...(newConfig.system || {}), deploymentMode: BUILD_DEPLOYMENT_MODE },
      permissions: newConfig.permissions ? {
        roleMatrix: { ...(appConfig.permissions?.roleMatrix || {}), ...(newConfig.permissions.roleMatrix || {}) },
        userOverrides: { ...(appConfig.permissions?.userOverrides || {}), ...(newConfig.permissions.userOverrides || {}) },
        customFeatures: newConfig.permissions.customFeatures || appConfig.permissions?.customFeatures || []
      } : appConfig.permissions,
    };
    
    await settingsRepository.saveAppConfig(updated);
    setAppConfig(updated);
    setGlobalAppConfig(updated);
  }, [appConfig, firebaseAuthenticated, isDemoActive]);

  const updateSettings = useCallback((newSettings: Partial<WorkshopSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      if (isDemoActive) safeLocalStorageSet('flexo_settings_demo_v1', JSON.stringify(updated));
      return updated;
    });
  }, [isDemoActive]);

  const setIsPersonalDemoActive = useCallback((active: boolean) => {
    if (isDemoActive) {
      setIsPersonalDemoActiveState(active);
      try {
        safeLocalStorageSet('flexo_personal_demo_active', active ? 'true' : 'false');
      } catch {
        // ignore
      }
      return;
    }

    if (!canUseDeveloperDemoPreview(firebaseProfile)) {
      clearDeveloperDemoPreview();
      console.warn('Developer role preview is available only to the verified DEVELOPER identity.');
      return;
    }

    setIsPersonalDemoActiveState(active);
    try {
      if (active) {
        safeLocalStorageSet(
          DEVELOPER_DEMO_PREVIEW_STORAGE_KEY,
          serializeDeveloperDemoPreview(firebaseProfile.firebaseUid!, previewRole),
        );
      } else {
        safeLocalStorageRemove(DEVELOPER_DEMO_PREVIEW_STORAGE_KEY);
        setPreviewRoleState('DEVELOPER');
      }
    } catch {
      // ignore
    }
  }, [clearDeveloperDemoPreview, firebaseProfile, isDemoActive, previewRole]);

  const setPreviewRole = useCallback((role: UserRole) => {
    if (!isAuthIdentityRole(role)) return;
    if (!isDemoActive && !canUseDeveloperDemoPreview(firebaseProfile)) {
      clearDeveloperDemoPreview();
      return;
    }
    setPreviewRoleState(role);
    if (!isDemoActive && isPersonalDemoActive) {
      safeLocalStorageSet(
        DEVELOPER_DEMO_PREVIEW_STORAGE_KEY,
        serializeDeveloperDemoPreview(firebaseProfile!.firebaseUid!, role),
      );
    }
  }, [clearDeveloperDemoPreview, firebaseProfile, isDemoActive, isPersonalDemoActive]);

  return (
    <ConfigContext.Provider value={{
      appConfig, setAppConfig, updateAppConfig,
      settings, setSettings, updateSettings,
      isDemoActive,
      isPersonalDemoActive, setIsPersonalDemoActive,
      previewRole, setPreviewRole,
      isDeveloperDemoPreviewReady,
      appConfigLoadState
    }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};
