export const STORAGE_PROVIDER_HEALTH_STATUSES = [
  'NOT_TESTED',
  'HEALTHY',
  'AUTH_FAILED',
  'BUCKET_NOT_FOUND',
  'PERMISSION_DENIED',
  'INVALID_CONFIG',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
] as const;

export type StorageProviderHealthStatus = typeof STORAGE_PROVIDER_HEALTH_STATUSES[number];

/** Sanitized provider metadata returned by Developer-only callable Functions. */
export interface StorageProviderAdminSummary {
  providerConfigId: string;
  providerType: 'R2';
  displayName: string;
  accountId: string;
  bucket: string;
  endpoint: string;
  deliveryBaseUrl?: string;
  enabled: boolean;
  priority: number;
  softLimitBytes?: number;
  credentialsConfigured: boolean;
  healthStatus: StorageProviderHealthStatus;
  lastHealthCheckAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CreateStorageProviderAdminInput {
  providerConfigId: string;
  providerType: 'R2';
  displayName: string;
  accountId: string;
  bucket: string;
  endpoint?: string;
  deliveryBaseUrl?: string;
  /** 15D creates providers disabled; runtime selection belongs to 15E. */
  enabled: false;
  priority: number;
  softLimitBytes?: number;
}

export interface UpdateStorageProviderAdminInput {
  providerConfigId: string;
  displayName?: string;
  accountId?: string;
  bucket?: string;
  endpoint?: string;
  deliveryBaseUrl?: string;
  priority?: number;
  softLimitBytes?: number | null;
}

export type StorageRuntimeStrategy = 'MANUAL' | 'AUTOMATIC';

export interface StorageRuntimeConfig {
  strategy: StorageRuntimeStrategy;
  activeProviderConfigId: string;
  automaticThresholdPercent: number;
  firebaseFallbackEnabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StorageProviderRuntimeStatus {
  providerConfigId: string;
  providerType: 'FIREBASE_STORAGE' | 'R2';
  trackedUsageBytes: number;
  softLimitBytes?: number;
  usagePercent?: number;
  enabled: boolean;
  acceptsNewUploads: boolean;
  eligibilityReasons: string[];
  priority?: number;
}

export interface StorageProviderConnectionResult {
  providerConfigId: string;
  status: StorageProviderHealthStatus;
  message: string;
  testedAt: string;
}
