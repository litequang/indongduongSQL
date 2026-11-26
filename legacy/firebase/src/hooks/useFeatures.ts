import { useConfig } from '../context/ConfigContext';
import { FeatureModule } from '../services/featureService';

export const useFeatures = () => {
  const { appConfig } = useConfig();

  const isEnabled = (feature: FeatureModule): boolean => {
    if (!appConfig?.features) return false;
    // Core features are considered always enabled for safety if undefined
    if (feature === 'production' && appConfig.features.production === undefined) return true;
    if (feature === 'finishing' && appConfig.features.finishing === undefined) return true;
    
    return !!appConfig.features[feature as keyof typeof appConfig.features];
  };

  return {
    isEnabled,
    features: appConfig?.features || {},
  };
};
