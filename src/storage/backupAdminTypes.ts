export type BackupJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
export type BackupItemStatus = 'PENDING' | 'COPYING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type BackupJobType = 'MANUAL' | 'AUTO' | 'BACKFILL';
export type BackupDiscoveryStatus = 'NOT_APPLICABLE' | 'PENDING' | 'DISCOVERING' | 'COMPLETE' | 'FAILED' | 'CANCELLED';
export type IntegrityStatus = 'HEALTHY' | 'MISSING' | 'SIZE_MISMATCH' | 'CHECKSUM_MISMATCH' | 'PROVIDER_ERROR';

export interface ImageBackupJobSummary {
  jobId: string;
  jobType: BackupJobType;
  policyId?: string;
  sourceProviderConfigId: string;
  targetProviderConfigId: string;
  status: BackupJobStatus;
  cancelRequested: boolean;
  discoveryStatus: BackupDiscoveryStatus;
  discoveredItems: number;
  skippedVerifiedItems: number;
  totalItems: number;
  pendingItems: number;
  runningItems: number;
  completedItems: number;
  failedItems: number;
  skippedItems: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ImageBackupJobItem {
  imageId: string;
  jobId?: string;
  policyId?: string;
  status: BackupItemStatus;
  attemptCount: number;
  sourceProviderConfigId: string;
  targetProviderConfigId: string;
  sourceObjectKey: string;
  targetObjectKey: string;
  expectedSizeBytes: number;
  actualSizeBytes?: number;
  actualSha256?: string;
  errorCode?: string;
  errorMessage?: string;
  originalFileName?: string;
  entityType?: string;
  entityId?: string;
}

export interface ImageBackupJobDetail {
  job: ImageBackupJobSummary;
  items: ImageBackupJobItem[];
}

export interface ImageReplicaSummary {
  replicaId: string;
  imageId: string;
  providerType: 'R2' | 'FIREBASE_STORAGE';
  providerConfigId: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksum: { algorithm: 'SHA256'; value: string; verification: 'VERIFIED' | 'UNVERIFIED' | 'MISMATCH' };
  status: 'COPYING' | 'VERIFIED' | 'FAILED' | 'MISSING' | 'RETIRED';
  sourceProviderConfigId: string;
  updatedAt: string;
  verifiedAt?: string;
  lastErrorCode?: string;
}

export interface ImageIntegrityResult {
  status: IntegrityStatus;
  sizeBytes?: number;
  sha256?: string;
  verifiedAt: string;
}

export interface BackupPolicySummary {
  policyId: string;
  displayName: string;
  enabled: boolean;
  autoBackupNewImages: boolean;
  sourceProviderType: 'R2' | 'FIREBASE_STORAGE';
  sourceProviderConfigId: string;
  targetProviderType: 'R2' | 'FIREBASE_STORAGE';
  targetProviderConfigId: string;
  activeBackfillJobId?: string;
  lastActivityAt?: string;
  lastBackfillAt?: string;
  lastCoverageCheckAt?: string;
  lastErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupCoverageSummary {
  policyId: string;
  eligibleImages: number;
  verifiedReplicas: number;
  missingBackup: number;
  unhealthyReplicas: number;
  coveragePercent: number;
  calculatedAt: string;
}

export interface FailedBackupItemSummary {
  jobId: string;
  policyId?: string;
  imageId: string;
  label: string;
  sourceProviderConfigId: string;
  targetProviderConfigId: string;
  attemptCount: number;
  errorCode: string;
  errorMessage: string;
  updatedAt: string;
}
