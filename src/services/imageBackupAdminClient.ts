import { httpsCallable } from 'firebase/functions';
import { getRegionalFunctions } from './firebaseFunctionsClient';
import {
  BackupItemStatus,
  BackupDiscoveryStatus,
  BackupJobType,
  BackupJobStatus,
  BackupCoverageSummary,
  BackupPolicySummary,
  FailedBackupItemSummary,
  ImageBackupJobDetail,
  ImageBackupJobItem,
  ImageBackupJobSummary,
  ImageIntegrityResult,
  ImageReplicaSummary,
  IntegrityStatus,
} from '../storage/backupAdminTypes';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function adminError(error: unknown): Error {
  const source = record(error);
  const code = text(source.code).replace(/^functions\//, '');
  const details = record(source.details);
  const reason = text(details.reason);
  const messages: Record<string, string> = {
    PROVIDER_DISABLED: 'Provider đích đang bị tắt; không thể bắt đầu backup mới.',
    POLICY_CHANGED: 'Policy đã thay đổi; hãy tải lại trạng thái.',
    DESTINATION_EXISTS: 'Ảnh canonical vẫn còn tồn tại; 15F không ghi đè.',
    DESTINATION_CHECKSUM_MISMATCH: 'Object đích đã tồn tại nhưng checksum khác.',
    SOURCE_CHECKSUM_MISMATCH: 'Checksum byte nguồn không khớp.',
    REPLICA_NOT_VERIFIED: 'Replica chưa ở trạng thái VERIFIED.',
    MAX_ATTEMPTS_EXCEEDED: 'Item đã đạt giới hạn 3 lần thử.',
  };
  return new Error(messages[reason] || text(source.message) || `Không thể hoàn tất thao tác backup (${code || 'unknown'}).`);
}

async function call<TRequest extends object, TResponse>(name: string, data: TRequest, timeout = 30000): Promise<TResponse> {
  try {
    return (await httpsCallable<TRequest, TResponse>(getRegionalFunctions(), name, { timeout })(data)).data;
  } catch (error) {
    throw adminError(error);
  }
}

function job(value: unknown): ImageBackupJobSummary {
  const data = record(value);
  return {
    jobId: text(data.jobId),
    jobType: (text(data.jobType) || 'MANUAL') as BackupJobType,
    ...(text(data.policyId) ? { policyId: text(data.policyId) } : {}),
    sourceProviderConfigId: text(data.sourceProviderConfigId),
    targetProviderConfigId: text(data.targetProviderConfigId),
    status: text(data.status) as BackupJobStatus,
    cancelRequested: data.cancelRequested === true,
    discoveryStatus: (text(data.discoveryStatus) || 'NOT_APPLICABLE') as BackupDiscoveryStatus,
    discoveredItems: number(data.discoveredItems),
    skippedVerifiedItems: number(data.skippedVerifiedItems),
    totalItems: number(data.totalItems),
    pendingItems: number(data.pendingItems),
    runningItems: number(data.runningItems),
    completedItems: number(data.completedItems),
    failedItems: number(data.failedItems),
    skippedItems: number(data.skippedItems),
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
    ...(text(data.completedAt) ? { completedAt: text(data.completedAt) } : {}),
  };
}

function item(value: unknown): ImageBackupJobItem {
  const data = record(value);
  return {
    imageId: text(data.imageId),
    ...(text(data.jobId) ? { jobId: text(data.jobId) } : {}),
    ...(text(data.policyId) ? { policyId: text(data.policyId) } : {}),
    status: text(data.status) as BackupItemStatus,
    attemptCount: number(data.attemptCount),
    sourceProviderConfigId: text(data.sourceProviderConfigId),
    targetProviderConfigId: text(data.targetProviderConfigId),
    sourceObjectKey: text(data.sourceObjectKey),
    targetObjectKey: text(data.targetObjectKey),
    expectedSizeBytes: number(data.expectedSizeBytes),
    ...(typeof data.actualSizeBytes === 'number' ? { actualSizeBytes: data.actualSizeBytes } : {}),
    ...(text(data.actualSha256) ? { actualSha256: text(data.actualSha256) } : {}),
    ...(text(data.errorCode) ? { errorCode: text(data.errorCode) } : {}),
    ...(text(data.errorMessage) ? { errorMessage: text(data.errorMessage) } : {}),
    ...(text(data.originalFileName) ? { originalFileName: text(data.originalFileName) } : {}),
    ...(text(data.entityType) ? { entityType: text(data.entityType) } : {}),
    ...(text(data.entityId) ? { entityId: text(data.entityId) } : {}),
  };
}

function detail(value: unknown): ImageBackupJobDetail {
  const data = record(value);
  return { job: job(data.job), items: Array.isArray(data.items) ? data.items.map(item) : [] };
}

function replica(value: unknown): ImageReplicaSummary {
  const data = record(value);
  const checksum = record(data.checksum);
  return {
    replicaId: text(data.replicaId),
    imageId: text(data.imageId),
    providerType: data.providerType === 'FIREBASE_STORAGE' ? 'FIREBASE_STORAGE' : 'R2',
    providerConfigId: text(data.providerConfigId),
    objectKey: text(data.objectKey),
    contentType: text(data.contentType),
    sizeBytes: number(data.sizeBytes),
    checksum: {
      algorithm: 'SHA256',
      value: text(checksum.value),
      verification: text(checksum.verification) as ImageReplicaSummary['checksum']['verification'],
    },
    status: text(data.status) as ImageReplicaSummary['status'],
    sourceProviderConfigId: text(data.sourceProviderConfigId),
    updatedAt: text(data.updatedAt),
    ...(text(data.verifiedAt) ? { verifiedAt: text(data.verifiedAt) } : {}),
    ...(text(data.lastErrorCode) ? { lastErrorCode: text(data.lastErrorCode) } : {}),
  };
}

function integrity(value: unknown): ImageIntegrityResult {
  const data = record(value);
  return {
    status: text(data.status) as IntegrityStatus,
    ...(typeof data.sizeBytes === 'number' ? { sizeBytes: data.sizeBytes } : {}),
    ...(text(data.sha256) ? { sha256: text(data.sha256) } : {}),
    verifiedAt: text(data.verifiedAt),
  };
}

function policy(value: unknown): BackupPolicySummary {
  const data = record(value);
  return {
    policyId: text(data.policyId),
    displayName: text(data.displayName),
    enabled: data.enabled === true,
    autoBackupNewImages: data.autoBackupNewImages === true,
    sourceProviderType: data.sourceProviderType === 'FIREBASE_STORAGE' ? 'FIREBASE_STORAGE' : 'R2',
    sourceProviderConfigId: text(data.sourceProviderConfigId),
    targetProviderType: data.targetProviderType === 'FIREBASE_STORAGE' ? 'FIREBASE_STORAGE' : 'R2',
    targetProviderConfigId: text(data.targetProviderConfigId),
    ...(text(data.activeBackfillJobId) ? { activeBackfillJobId: text(data.activeBackfillJobId) } : {}),
    ...(text(data.lastActivityAt) ? { lastActivityAt: text(data.lastActivityAt) } : {}),
    ...(text(data.lastBackfillAt) ? { lastBackfillAt: text(data.lastBackfillAt) } : {}),
    ...(text(data.lastCoverageCheckAt) ? { lastCoverageCheckAt: text(data.lastCoverageCheckAt) } : {}),
    ...(text(data.lastErrorCode) ? { lastErrorCode: text(data.lastErrorCode) } : {}),
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
  };
}

function coverage(value: unknown): BackupCoverageSummary {
  const data = record(value);
  return {
    policyId: text(data.policyId),
    eligibleImages: number(data.eligibleImages),
    verifiedReplicas: number(data.verifiedReplicas),
    missingBackup: number(data.missingBackup),
    unhealthyReplicas: number(data.unhealthyReplicas),
    coveragePercent: number(data.coveragePercent),
    calculatedAt: text(data.calculatedAt),
  };
}

function failedItem(value: unknown): FailedBackupItemSummary {
  const data = record(value);
  return {
    jobId: text(data.jobId),
    ...(text(data.policyId) ? { policyId: text(data.policyId) } : {}),
    imageId: text(data.imageId),
    label: text(data.label) || text(data.imageId),
    sourceProviderConfigId: text(data.sourceProviderConfigId),
    targetProviderConfigId: text(data.targetProviderConfigId),
    attemptCount: number(data.attemptCount),
    errorCode: text(data.errorCode),
    errorMessage: text(data.errorMessage),
    updatedAt: text(data.updatedAt),
  };
}

export const imageBackupAdminClient = {
  async policies(): Promise<BackupPolicySummary[]> {
    const response = record(await call('listBackupPolicies', {}));
    return Array.isArray(response.policies) ? response.policies.map(policy) : [];
  },
  async createPolicy(input: {
    displayName: string;
    sourceProviderConfigId: string;
    targetProviderConfigId: string;
    autoBackupNewImages: boolean;
  }): Promise<BackupPolicySummary> {
    const response = record(await call('createBackupPolicy', input));
    return policy(response.policy);
  },
  async updatePolicy(input: {
    policyId: string;
    displayName: string;
    sourceProviderConfigId: string;
    targetProviderConfigId: string;
    autoBackupNewImages: boolean;
  }): Promise<BackupPolicySummary> {
    const response = record(await call('updateBackupPolicy', input));
    return policy(response.policy);
  },
  async setPolicyEnabled(policyId: string, enabled: boolean): Promise<BackupPolicySummary> {
    const response = record(await call(enabled ? 'enableBackupPolicy' : 'disableBackupPolicy', { policyId }));
    return policy(response.policy);
  },
  async coverage(policyId: string): Promise<BackupCoverageSummary> {
    return coverage(await call('getBackupCoverage', { policyId }));
  },
  async startBackfill(policyId: string): Promise<string> {
    const response = record(await call('createBackupBackfillJob', { policyId }));
    return text(response.jobId);
  },
  async failedItems(): Promise<FailedBackupItemSummary[]> {
    const response = record(await call('listFailedBackupItems', {}));
    return Array.isArray(response.items) ? response.items.map(failedItem) : [];
  },
  async create(imageId: string, targetProviderConfigId: string): Promise<ImageBackupJobDetail> {
    return detail(await call('createImageBackupJob', { imageIds: [imageId], targetProviderConfigId }));
  },
  async get(jobId: string): Promise<ImageBackupJobDetail> {
    return detail(await call('getImageBackupJob', { jobId }));
  },
  async list(): Promise<ImageBackupJobSummary[]> {
    const response = record(await call('listImageBackupJobs', {}));
    return Array.isArray(response.jobs) ? response.jobs.map(job) : [];
  },
  async runStep(jobId: string): Promise<ImageBackupJobDetail> {
    return detail(await call('runImageBackupJobStep', { jobId }, 300000));
  },
  async retry(jobId: string, imageId: string): Promise<ImageBackupJobDetail> {
    return detail(await call('retryImageBackupJobItem', { jobId, imageId }));
  },
  async cancel(jobId: string): Promise<ImageBackupJobDetail> {
    return detail(await call('cancelImageBackupJob', { jobId }));
  },
  async replicas(imageId?: string): Promise<ImageReplicaSummary[]> {
    const response = record(await call('listImageReplicas', imageId ? { imageId } : {}));
    return Array.isArray(response.replicas) ? response.replicas.map(replica) : [];
  },
  async verifyReplica(replicaId: string): Promise<ImageIntegrityResult> {
    const response = record(await call('verifyImageReplica', { replicaId }, 300000));
    return integrity(response.result);
  },
  async verifyCanonical(imageId: string): Promise<ImageIntegrityResult> {
    const response = record(await call('verifyCanonicalImage', { imageId }, 300000));
    return integrity(response.result);
  },
  async restore(imageId: string, replicaId: string, confirmation: string): Promise<ImageIntegrityResult> {
    const response = record(await call('restoreImageFromReplica', { imageId, replicaId, confirmation }, 300000));
    return integrity(response.result);
  },
};
