export const STORAGE_PROVIDER_TYPES = ['FIREBASE_STORAGE', 'R2'] as const;
export type StorageProviderType = typeof STORAGE_PROVIDER_TYPES[number];

export interface StorageProviderConfig {
  /** Stable configuration instance ID. It is deliberately separate from provider type. */
  id: string;
  type: StorageProviderType;
  enabled: boolean;
}

export type StorageImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface StorageUploadProgress {
  transferredBytes: number;
  totalBytes: number;
  percent: number;
}

export interface StorageProviderUploadRequest {
  objectKey: string;
  data: Blob;
  contentType: StorageImageContentType;
  metadata: Record<string, string>;
  onProgress?: (progress: StorageUploadProgress) => void;
}

export interface StorageProviderUploadResult {
  objectKey: string;
  readUrl: string;
}

export interface StorageProviderHealth {
  ok: boolean;
  providerConfigId: string;
  providerType: StorageProviderType;
  message: string;
}

/** Binary-provider contract. Business modules must not import provider SDKs. */
export interface StorageProvider {
  readonly config: StorageProviderConfig;
  upload(request: StorageProviderUploadRequest): Promise<StorageProviderUploadResult>;
  delete(objectKey: string): Promise<void>;
  resolve(objectKey: string): Promise<string>;
  healthCheck(): Promise<StorageProviderHealth>;
}

export type ImageEntityType =
  | 'PRODUCTION_ORDER_ITEM'
  | 'SALES_ORDER_ITEM'
  | 'USER_AVATAR'
  | 'COMPANY_LOGO';

export interface ImageEntityReference {
  entityType: ImageEntityType;
  entityId: string;
  parentEntityId?: string;
}

export interface ImageRegistryRecord extends ImageEntityReference {
  imageId: string;
  providerType: StorageProviderType;
  providerConfigId: string;
  objectKey: string;
  originalFileName: string;
  contentType: StorageImageContentType;
  size: number;
  /** Present when a client report or provider-verifiable SHA-256 is available. */
  sha256?: string;
  checksumStatus?: 'NOT_PROVIDED' | 'CLIENT_REPORTED' | 'SERVER_VERIFIED';
  uploadOperationId?: string;
  width?: number;
  height?: number;
  createdAt: string;
  createdBy: string;
  status: 'ACTIVE' | 'DELETED';
  updatedAt?: string;
  deletedAt?: string;
}

export interface ManagedImageUploadRequest {
  data: Blob;
  contentType: StorageImageContentType;
  originalFileName: string;
  width?: number;
  height?: number;
  createdBy: string;
  entity: ImageEntityReference;
  objectKeySegments: string[];
  providerConfigId?: string;
  /** Backend-issued stable identity/key used by runtime Firebase selection. */
  imageId?: string;
  objectKey?: string;
  sha256?: string;
  onProgress?: (progress: StorageUploadProgress) => void;
}

export interface ManagedImageReference {
  imageId: string;
  providerType: StorageProviderType;
  providerConfigId: string;
  objectKey: string;
  /** Empty for providers whose read URL must be authorized on demand. */
  readUrl: string;
  sha256: string;
  createdAt: string;
}

export interface ManagedImageLocator {
  imageId?: string;
  providerType?: StorageProviderType;
  providerConfigId?: string;
  objectKey: string;
}
