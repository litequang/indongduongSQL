import { Timestamp } from 'firebase-admin/firestore';
import { StorageObjectProviderType } from '../types';

export const IMAGE_REPLICAS_COLLECTION = 'image_replicas';
export const IMAGE_BACKUP_JOBS_COLLECTION = 'image_backup_jobs';
export const IMAGE_BACKUP_ITEMS_COLLECTION = 'items';
export const STORAGE_BACKUP_POLICIES_COLLECTION = 'storage_backup_policies';

export type ReplicaVerification = 'VERIFIED' | 'UNVERIFIED' | 'MISMATCH';
export type ReplicaStatus = 'COPYING' | 'VERIFIED' | 'FAILED' | 'MISSING' | 'RETIRED';
export type BackupJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type BackupItemStatus = 'PENDING' | 'COPYING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type BackupJobType = 'MANUAL' | 'AUTO' | 'BACKFILL';
export type BackupDiscoveryStatus = 'NOT_APPLICABLE' | 'PENDING' | 'DISCOVERING' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
export type IntegrityStatus = 'HEALTHY' | 'MISSING' | 'SIZE_MISMATCH' | 'CHECKSUM_MISMATCH' | 'PROVIDER_ERROR';

export interface CanonicalImageRecord {
  imageId: string;
  providerType: StorageObjectProviderType;
  providerConfigId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
  checksumStatus?: 'NOT_PROVIDED' | 'CLIENT_REPORTED' | 'SERVER_VERIFIED';
  status: 'ACTIVE' | 'DELETED';
  originalFileName?: string;
  entityType?: string;
  entityId?: string;
  parentEntityId?: string;
}

export interface StorageBackupPolicyRecord {
  policyId: string;
  displayName: string;
  enabled: boolean;
  autoBackupNewImages: boolean;
  sourceProviderType: StorageObjectProviderType;
  sourceProviderConfigId: string;
  targetProviderType: StorageObjectProviderType;
  targetProviderConfigId: string;
  activeBackfillJobId?: string;
  lastActivityAt?: Timestamp;
  lastBackfillAt?: Timestamp;
  lastCoverageCheckAt?: Timestamp;
  lastErrorCode?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  updatedBy: string;
}

export interface ImageReplicaRecord {
  replicaId: string;
  imageId: string;
  providerType: StorageObjectProviderType;
  providerConfigId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksum: {
    algorithm: 'SHA256';
    value: string;
    verification: ReplicaVerification;
  };
  status: ReplicaStatus;
  sourceProviderConfigId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  verifiedAt?: Timestamp;
  canonicalStatus?: 'ACTIVE' | 'DELETED';
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdBy: string;
  updatedBy: string;
}

export interface ImageBackupJobRecord {
  jobId: string;
  jobType: BackupJobType;
  policyId?: string;
  sourceProviderConfigId: string;
  targetProviderConfigId: string;
  sourceProviderType?: StorageObjectProviderType;
  targetProviderType?: StorageObjectProviderType;
  status: BackupJobStatus;
  cancelRequested: boolean;
  discoveryStatus: BackupDiscoveryStatus;
  discoveryCursor?: string;
  discoveryRevision: number;
  discoveryAttemptCount: number;
  discoveredItems: number;
  skippedVerifiedItems: number;
  discoveryLeaseOwner?: string;
  discoveryLeaseExpiresAt?: Timestamp;
  totalItems: number;
  pendingItems: number;
  runningItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  createdBy: string;
  createdAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface ImageBackupJobItemRecord {
  jobId?: string;
  policyId?: string;
  imageId: string;
  status: BackupItemStatus;
  attemptCount: number;
  sourceProviderType: StorageObjectProviderType;
  sourceProviderConfigId: string;
  targetProviderType: StorageObjectProviderType;
  targetProviderConfigId: string;
  sourceObjectKey: string;
  targetObjectKey: string;
  contentType: string;
  expectedSizeBytes: number;
  actualSizeBytes?: number;
  expectedSha256?: string;
  actualSha256?: string;
  originalFileName?: string;
  entityType?: string;
  entityId?: string;
  parentEntityId?: string;
  errorCode?: string;
  errorMessage?: string;
  leaseOwner?: string;
  leaseExpiresAt?: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface IntegrityResult {
  status: IntegrityStatus;
  sizeBytes?: number;
  sha256?: string;
  verifiedAt: string;
}

export class BackupOperationError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'BackupOperationError';
  }
}
