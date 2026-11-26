import { httpsCallable } from 'firebase/functions';
import { getRegionalFunctions } from './firebaseFunctionsClient';
import {
  CreateStorageProviderAdminInput,
  STORAGE_PROVIDER_HEALTH_STATUSES,
  StorageProviderAdminSummary,
  StorageProviderConnectionResult,
  StorageProviderHealthStatus,
  StorageProviderRuntimeStatus,
  StorageRuntimeConfig,
  UpdateStorageProviderAdminInput,
} from '../storage/adminTypes';

function functionsClient() {
  return getRegionalFunctions();
}

function adminError(error: unknown): Error {
  const code = String((error as { code?: unknown })?.code || '').replace(/^functions\//, '');
  const messages: Record<string, string> = {
    unauthenticated: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
    'permission-denied': 'Bạn không có quyền Developer để quản lý nhà cung cấp lưu trữ.',
    'invalid-argument': 'Cấu hình chưa hợp lệ. Hãy kiểm tra tên, Account ID, bucket, endpoint và độ ưu tiên.',
    'already-exists': 'Mã cấu hình này đã tồn tại. Hãy chọn mã khác.',
    'failed-precondition': 'Cấu hình hoặc credential chưa ở trạng thái phù hợp để thực hiện thao tác.',
    'not-found': 'Không tìm thấy cấu hình lưu trữ này. Hãy tải lại danh sách.',
    unavailable: 'Dịch vụ lưu trữ hoặc Secret Manager đang tạm thời không khả dụng. Vui lòng thử lại.',
    'deadline-exceeded': 'Yêu cầu đã quá thời gian chờ. Vui lòng thử lại.',
    internal: 'Không thể hoàn tất thao tác. Dịch vụ credential/Secret Manager hoặc IAM có thể chưa được cấu hình.',
  };
  return new Error(messages[code] || 'Không thể hoàn tất thao tác quản lý lưu trữ. Vui lòng thử lại.');
}

async function call<TRequest extends object, TResponse>(
  name: string,
  data: TRequest,
  timeout = 20000,
): Promise<TResponse> {
  try {
    const callable = httpsCallable<TRequest, TResponse>(functionsClient(), name, { timeout });
    return (await callable(data)).data;
  } catch (error) {
    throw adminError(error);
  }
}

function healthStatus(value: unknown): StorageProviderHealthStatus {
  return (STORAGE_PROVIDER_HEALTH_STATUSES as readonly unknown[]).includes(value)
    ? value as StorageProviderHealthStatus
    : 'UNKNOWN_ERROR';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeConfig(value: unknown): StorageProviderAdminSummary {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const providerConfigId = text(data.providerConfigId);
  if (!providerConfigId || data.providerType !== 'R2') {
    throw new Error('Phản hồi cấu hình lưu trữ không hợp lệ.');
  }
  return {
    providerConfigId,
    providerType: 'R2',
    displayName: text(data.displayName) || providerConfigId,
    accountId: text(data.accountId),
    bucket: text(data.bucket),
    endpoint: text(data.endpoint),
    ...(text(data.deliveryBaseUrl) ? { deliveryBaseUrl: text(data.deliveryBaseUrl) } : {}),
    enabled: data.enabled === true,
    priority: Number.isInteger(data.priority) ? Number(data.priority) : 100,
    ...(Number.isSafeInteger(data.softLimitBytes) && Number(data.softLimitBytes) > 0
      ? { softLimitBytes: Number(data.softLimitBytes) }
      : {}),
    credentialsConfigured: data.credentialsConfigured === true,
    healthStatus: healthStatus(data.healthStatus),
    ...(text(data.lastHealthCheckAt) ? { lastHealthCheckAt: text(data.lastHealthCheckAt) } : {}),
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
    createdBy: text(data.createdBy),
    updatedBy: text(data.updatedBy),
  };
}

function configResponse(value: unknown): StorageProviderAdminSummary {
  const response = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return normalizeConfig(response.config);
}

function normalizeRuntime(value: unknown): StorageRuntimeConfig {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (!['MANUAL', 'AUTOMATIC'].includes(String(data.strategy)) || !text(data.activeProviderConfigId)) {
    throw new Error('Phản hồi cấu hình runtime lưu trữ không hợp lệ.');
  }
  return {
    strategy: data.strategy as StorageRuntimeConfig['strategy'],
    activeProviderConfigId: text(data.activeProviderConfigId),
    automaticThresholdPercent: Number(data.automaticThresholdPercent),
    firebaseFallbackEnabled: data.firebaseFallbackEnabled === true,
    ...(text(data.updatedAt) ? { updatedAt: text(data.updatedAt) } : {}),
    ...(text(data.updatedBy) ? { updatedBy: text(data.updatedBy) } : {}),
  };
}

function normalizeRuntimeStatus(value: unknown): StorageProviderRuntimeStatus {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    providerConfigId: text(data.providerConfigId),
    providerType: data.providerType === 'R2' ? 'R2' : 'FIREBASE_STORAGE',
    trackedUsageBytes: Number.isSafeInteger(data.trackedUsageBytes) ? Number(data.trackedUsageBytes) : 0,
    ...(Number.isSafeInteger(data.softLimitBytes) ? { softLimitBytes: Number(data.softLimitBytes) } : {}),
    ...(typeof data.usagePercent === 'number' && Number.isFinite(data.usagePercent)
      ? { usagePercent: data.usagePercent }
      : {}),
    enabled: data.enabled === true,
    acceptsNewUploads: data.acceptsNewUploads === true,
    eligibilityReasons: Array.isArray(data.eligibilityReasons)
      ? data.eligibilityReasons.filter((item): item is string => typeof item === 'string')
      : [],
    ...(Number.isInteger(data.priority) ? { priority: Number(data.priority) } : {}),
  };
}

export const storageProviderAdminClient = {
  async list(): Promise<StorageProviderAdminSummary[]> {
    const response = await call<Record<string, never>, { configs?: unknown[] }>('listStorageProviderConfigs', {});
    return Array.isArray(response.configs) ? response.configs.map(normalizeConfig) : [];
  },

  async get(providerConfigId: string): Promise<StorageProviderAdminSummary> {
    return configResponse(await call('getStorageProviderConfig', { providerConfigId }));
  },

  async create(input: CreateStorageProviderAdminInput): Promise<StorageProviderAdminSummary> {
    return configResponse(await call('createStorageProviderConfig', input));
  },

  async update(input: UpdateStorageProviderAdminInput): Promise<StorageProviderAdminSummary> {
    return configResponse(await call('updateStorageProviderConfig', input));
  },

  async setCredentials(providerConfigId: string, accessKeyId: string, secretAccessKey: string): Promise<StorageProviderAdminSummary> {
    return configResponse(await call(
      'setStorageProviderCredentials',
      { providerConfigId, accessKeyId, secretAccessKey },
      30000,
    ));
  },

  async disable(providerConfigId: string): Promise<StorageProviderAdminSummary> {
    return configResponse(await call('disableStorageProviderConfig', { providerConfigId }));
  },

  async enable(providerConfigId: string): Promise<StorageProviderAdminSummary> {
    return configResponse(await call('enableStorageProviderConfig', { providerConfigId }));
  },

  async getRuntime(): Promise<StorageRuntimeConfig> {
    const response = await call<Record<string, never>, { config?: unknown }>('getStorageRuntimeConfig', {});
    return normalizeRuntime(response.config);
  },

  async updateRuntime(input: Partial<Pick<StorageRuntimeConfig, 'strategy' | 'automaticThresholdPercent' | 'firebaseFallbackEnabled'>>): Promise<StorageRuntimeConfig> {
    const response = await call<typeof input, { config?: unknown }>('updateStorageRuntimeConfig', input);
    return normalizeRuntime(response.config);
  },

  async setManualActive(providerConfigId: string): Promise<StorageRuntimeConfig> {
    const response = await call<{ providerConfigId: string }, { config?: unknown }>(
      'setManualActiveStorageProvider',
      { providerConfigId },
    );
    return normalizeRuntime(response.config);
  },

  async listRuntimeStatus(): Promise<{ config: StorageRuntimeConfig; providers: StorageProviderRuntimeStatus[] }> {
    const response = await call<Record<string, never>, { config?: unknown; providers?: unknown[] }>(
      'listStorageProviderRuntimeStatus',
      {},
    );
    return {
      config: normalizeRuntime(response.config),
      providers: Array.isArray(response.providers) ? response.providers.map(normalizeRuntimeStatus) : [],
    };
  },

  async testConnection(providerConfigId: string): Promise<StorageProviderConnectionResult> {
    const response = await call<
      { providerConfigId: string },
      { providerConfigId?: unknown; status?: unknown; message?: unknown; testedAt?: unknown }
    >('testStorageProviderConnection', { providerConfigId }, 30000);
    return {
      providerConfigId: text(response.providerConfigId) || providerConfigId,
      status: healthStatus(response.status),
      message: text(response.message),
      testedAt: text(response.testedAt) || new Date().toISOString(),
    };
  },
};
