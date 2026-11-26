import { Timestamp } from 'firebase-admin/firestore';
import { Readable } from 'node:stream';

export const BACKEND_STORAGE_PROVIDER_TYPES = ['R2'] as const;
export type BackendStorageProviderType = (typeof BACKEND_STORAGE_PROVIDER_TYPES)[number];

export type StorageProviderHealthStatus =
  | 'NOT_TESTED'
  | 'HEALTHY'
  | 'AUTH_FAILED'
  | 'BUCKET_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_CONFIG'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface StorageProviderConfigRecord {
  providerConfigId: string;
  providerType: BackendStorageProviderType;
  displayName: string;
  accountId: string;
  bucket: string;
  endpoint: string;
  deliveryBaseUrl?: string;
  enabled: boolean;
  priority: number;
  /** Developer-defined routing limit. This is not a provider quota. */
  softLimitBytes?: number;
  credentialSecretRef?: string;
  secretConfigured: boolean;
  healthStatus: StorageProviderHealthStatus;
  lastHealthCheckAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export interface SanitizedStorageProviderConfig {
  providerConfigId: string;
  providerType: BackendStorageProviderType;
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

export interface R2Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ServerStoragePutRequest {
  objectKey: string;
  body: Uint8Array | string;
  contentType: string;
  size: number;
  checksumSha256?: string;
  metadata?: Record<string, string>;
}

export interface ServerStorageObjectMetadata {
  objectKey: string;
  size: number;
  contentType?: string;
  metadata: Record<string, string>;
  providerChecksumSha256?: string;
  etag?: string;
}

export interface ServerStorageUploadAuthorization {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export type StorageObjectProviderType = BackendStorageProviderType | 'FIREBASE_STORAGE';

export interface ServerStorageStreamWriteRequest {
  objectKey: string;
  body: Readable;
  contentType: string;
  size: number;
  metadata: Record<string, string>;
  ifAbsent: boolean;
}

/** Backend-only streaming contract used by backup/restore. */
export interface ServerStorageTransferProvider {
  readonly providerConfigId: string;
  readonly providerType: StorageObjectProviderType;
  head(objectKey: string): Promise<ServerStorageObjectMetadata | null>;
  createReadStream(objectKey: string): Promise<Readable>;
  writeFromStream(request: ServerStorageStreamWriteRequest): Promise<void>;
}

export interface PinnedR2ProviderConfig {
  providerConfigId: string;
  providerType: 'R2';
  bucket: string;
  endpoint: string;
  credentialSecretRef: string;
}

export interface ServerStorageProvider extends ServerStorageTransferProvider {
  readonly providerConfigId: string;
  readonly providerType: BackendStorageProviderType;
  put(request: ServerStoragePutRequest): Promise<void>;
  delete(objectKey: string): Promise<void>;
  copy(request: {
    sourceObjectKey: string;
    destinationObjectKey: string;
    sourceEtag?: string;
    contentType: string;
    metadata: Record<string, string>;
  }): Promise<void>;
  head(objectKey: string): Promise<ServerStorageObjectMetadata | null>;
  exists(objectKey: string): Promise<boolean>;
  createUploadAuthorization(request: {
    objectKey: string;
    contentType: string;
    metadata: Record<string, string>;
    expiresInSeconds: number;
  }): Promise<ServerStorageUploadAuthorization>;
  createReadAuthorization(objectKey: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: string }>;
  testConnection(): Promise<{
    status: StorageProviderHealthStatus;
    message: string;
  }>;
}

export interface CreateStorageProviderConfigInput {
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
}

export type UpdateStorageProviderConfigInput = Partial<Pick<
  CreateStorageProviderConfigInput,
  'displayName' | 'accountId' | 'bucket' | 'endpoint' | 'deliveryBaseUrl' | 'priority' | 'softLimitBytes'
>> & { providerConfigId: string };

export type StorageRuntimeStrategy = 'MANUAL' | 'AUTOMATIC';

export interface StorageRuntimeConfigRecord {
  strategy: StorageRuntimeStrategy;
  activeProviderConfigId: string;
  automaticThresholdPercent: number;
  firebaseFallbackEnabled: boolean;
  updatedAt?: Timestamp;
  updatedBy?: string;
}
