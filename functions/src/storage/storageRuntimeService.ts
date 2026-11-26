import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { addWorkflowAudit } from '../workflows/workflowAudit';
import { requireWorkflowActor, WorkflowActor } from '../workflows/workflowAuth';
import { StorageProviderConfigRepository } from './providerConfigRepository';
import { StorageAdminError } from './storageAdminError';
import { StorageProviderConfigRecord, StorageRuntimeConfigRecord, StorageRuntimeStrategy } from './types';
import { validateProviderConfigId } from './validation';

export const STORAGE_RUNTIME_COLLECTION = 'storage_runtime';
export const STORAGE_RUNTIME_DOCUMENT = 'config';
export const FIREBASE_PRIMARY_PROVIDER_CONFIG_ID = 'firebase-primary';
const DEFAULT_THRESHOLD_PERCENT = 90;
const ELIGIBLE_HEALTH = 'HEALTHY';

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

export interface RuntimeUploadPlan {
  strategy: StorageRuntimeStrategy;
  r2Candidates: StorageProviderConfigRecord[];
  allowFirebase: boolean;
}

function requestObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A runtime storage request object is required.');
  }
  return value as Record<string, unknown>;
}

function onlyKeys(data: Record<string, unknown>, allowed: readonly string[]): void {
  const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
  if (unexpected) throw new StorageAdminError('invalid-argument', `Unexpected field: ${unexpected}.`);
}

function parseRuntime(snapshot: FirebaseFirestore.DocumentSnapshot): StorageRuntimeConfigRecord {
  if (!snapshot.exists) {
    return {
      strategy: 'MANUAL',
      activeProviderConfigId: FIREBASE_PRIMARY_PROVIDER_CONFIG_ID,
      automaticThresholdPercent: DEFAULT_THRESHOLD_PERCENT,
      firebaseFallbackEnabled: true,
    };
  }
  const data = snapshot.data() || {};
  if (
    !['MANUAL', 'AUTOMATIC'].includes(data.strategy) ||
    typeof data.activeProviderConfigId !== 'string' || !data.activeProviderConfigId ||
    !Number.isInteger(data.automaticThresholdPercent) ||
    data.automaticThresholdPercent < 1 || data.automaticThresholdPercent > 100 ||
    typeof data.firebaseFallbackEnabled !== 'boolean'
  ) {
    throw new StorageAdminError('failed-precondition', 'Runtime storage configuration is invalid.');
  }
  return {
    strategy: data.strategy as StorageRuntimeStrategy,
    activeProviderConfigId: data.activeProviderConfigId,
    automaticThresholdPercent: data.automaticThresholdPercent,
    firebaseFallbackEnabled: data.firebaseFallbackEnabled,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : undefined,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
  };
}

function serializeRuntime(config: StorageRuntimeConfigRecord) {
  return {
    strategy: config.strategy,
    activeProviderConfigId: config.activeProviderConfigId,
    automaticThresholdPercent: config.automaticThresholdPercent,
    firebaseFallbackEnabled: config.firebaseFallbackEnabled,
    ...(config.updatedAt ? { updatedAt: config.updatedAt.toDate().toISOString() } : {}),
    ...(config.updatedBy ? { updatedBy: config.updatedBy } : {}),
  };
}

export class StorageRuntimeService {
  constructor(
    private readonly db: Firestore,
    private readonly configs: StorageProviderConfigRepository,
  ) {}

  private ref() {
    return this.db.collection(STORAGE_RUNTIME_COLLECTION).doc(STORAGE_RUNTIME_DOCUMENT);
  }

  private requireDeveloper(firebaseUid: string | undefined): Promise<WorkflowActor> {
    return requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER']);
  }

  private async read(): Promise<StorageRuntimeConfigRecord> {
    return parseRuntime(await this.ref().get());
  }

  private baseEligibility(config: StorageProviderConfigRecord): string[] {
    const reasons: string[] = [];
    if (!config.enabled) reasons.push('DISABLED');
    if (!config.secretConfigured || !config.credentialSecretRef) reasons.push('CREDENTIALS_NOT_CONFIGURED');
    if (config.healthStatus !== ELIGIBLE_HEALTH) reasons.push(`HEALTH_${config.healthStatus}`);
    return reasons;
  }

  private async trackedUsage(providerConfigId: string): Promise<number> {
    const snapshot = await this.db.collection('image_registry')
      .where('providerConfigId', '==', providerConfigId)
      .where('status', '==', 'ACTIVE')
      .select('size')
      .get();
    return snapshot.docs.reduce((total, document) => {
      const data = document.data();
      return Number.isSafeInteger(data.size) && data.size > 0
        ? total + Number(data.size)
        : total;
    }, 0);
  }

  private async statusForR2(
    config: StorageProviderConfigRecord,
    thresholdPercent: number,
  ): Promise<StorageProviderRuntimeStatus> {
    const trackedUsageBytes = await this.trackedUsage(config.providerConfigId);
    const reasons = this.baseEligibility(config);
    const usagePercent = config.softLimitBytes
      ? (trackedUsageBytes / config.softLimitBytes) * 100
      : undefined;
    if (usagePercent !== undefined && usagePercent >= thresholdPercent) reasons.push('TRACKED_USAGE_THRESHOLD_REACHED');
    return {
      providerConfigId: config.providerConfigId,
      providerType: 'R2',
      trackedUsageBytes,
      ...(config.softLimitBytes ? { softLimitBytes: config.softLimitBytes } : {}),
      ...(usagePercent === undefined ? {} : { usagePercent }),
      enabled: config.enabled,
      acceptsNewUploads: reasons.length === 0,
      eligibilityReasons: reasons,
      priority: config.priority,
    };
  }

  async getAdmin(firebaseUid: string | undefined, request: unknown): Promise<{ config: ReturnType<typeof serializeRuntime> }> {
    await this.requireDeveloper(firebaseUid);
    const data = request === undefined || request === null ? {} : requestObject(request);
    onlyKeys(data, []);
    return { config: serializeRuntime(await this.read()) };
  }

  async updateAdmin(firebaseUid: string | undefined, request: unknown): Promise<{ config: ReturnType<typeof serializeRuntime> }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = requestObject(request);
    onlyKeys(data, ['strategy', 'automaticThresholdPercent', 'firebaseFallbackEnabled']);
    if (!Object.keys(data).length) throw new StorageAdminError('invalid-argument', 'At least one runtime field is required.');
    const current = await this.read();
    const strategy = data.strategy === undefined ? current.strategy : data.strategy;
    if (!['MANUAL', 'AUTOMATIC'].includes(String(strategy))) {
      throw new StorageAdminError('invalid-argument', 'Storage strategy must be MANUAL or AUTOMATIC.');
    }
    const threshold = data.automaticThresholdPercent === undefined
      ? current.automaticThresholdPercent
      : data.automaticThresholdPercent;
    if (!Number.isInteger(threshold) || Number(threshold) < 1 || Number(threshold) > 100) {
      throw new StorageAdminError('invalid-argument', 'Automatic threshold must be a whole percentage from 1 to 100.');
    }
    const fallback = data.firebaseFallbackEnabled === undefined
      ? current.firebaseFallbackEnabled
      : data.firebaseFallbackEnabled;
    if (typeof fallback !== 'boolean') {
      throw new StorageAdminError('invalid-argument', 'Firebase fallback flag must be true or false.');
    }
    if (strategy === 'MANUAL' && current.activeProviderConfigId !== FIREBASE_PRIMARY_PROVIDER_CONFIG_ID) {
      const active = await this.configs.get(current.activeProviderConfigId);
      if (this.baseEligibility(active).length) {
        throw new StorageAdminError('failed-precondition', 'Select an eligible manual provider before switching to MANUAL.');
      }
    }
    await this.write({
      ...current,
      strategy: strategy as StorageRuntimeStrategy,
      automaticThresholdPercent: Number(threshold),
      firebaseFallbackEnabled: fallback,
    }, actor, 'STORAGE_RUNTIME_CONFIG_UPDATED');
    return { config: serializeRuntime(await this.read()) };
  }

  async setManualActive(firebaseUid: string | undefined, request: unknown): Promise<{ config: ReturnType<typeof serializeRuntime> }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = requestObject(request);
    onlyKeys(data, ['providerConfigId']);
    const rawId = typeof data.providerConfigId === 'string' ? data.providerConfigId.trim() : '';
    const providerConfigId = rawId === FIREBASE_PRIMARY_PROVIDER_CONFIG_ID
      ? rawId
      : validateProviderConfigId(rawId);
    if (providerConfigId !== FIREBASE_PRIMARY_PROVIDER_CONFIG_ID) {
      const config = await this.configs.get(providerConfigId);
      const reasons = this.baseEligibility(config);
      if (reasons.length) {
        throw new StorageAdminError('failed-precondition', 'Only an enabled, credentialed, HEALTHY provider can be selected for manual uploads.', { reasons });
      }
    }
    const current = await this.read();
    await this.write({ ...current, activeProviderConfigId: providerConfigId }, actor, 'STORAGE_MANUAL_ACTIVE_PROVIDER_SET');
    return { config: serializeRuntime(await this.read()) };
  }

  async listStatuses(firebaseUid: string | undefined, request: unknown): Promise<{
    config: ReturnType<typeof serializeRuntime>;
    providers: StorageProviderRuntimeStatus[];
  }> {
    await this.requireDeveloper(firebaseUid);
    const data = request === undefined || request === null ? {} : requestObject(request);
    onlyKeys(data, []);
    const runtime = await this.read();
    const configs = await this.configs.list();
    const r2Statuses = await Promise.all(configs.map((config) =>
      this.statusForR2(config, runtime.automaticThresholdPercent)));
    const firebaseUsage = await this.trackedUsage(FIREBASE_PRIMARY_PROVIDER_CONFIG_ID);
    return {
      config: serializeRuntime(runtime),
      providers: [{
        providerConfigId: FIREBASE_PRIMARY_PROVIDER_CONFIG_ID,
        providerType: 'FIREBASE_STORAGE',
        trackedUsageBytes: firebaseUsage,
        enabled: true,
        acceptsNewUploads: true,
        eligibilityReasons: [],
      }, ...r2Statuses],
    };
  }

  async planForNewUpload(): Promise<RuntimeUploadPlan> {
    const runtime = await this.read();
    if (runtime.strategy === 'MANUAL') {
      if (runtime.activeProviderConfigId === FIREBASE_PRIMARY_PROVIDER_CONFIG_ID) {
        return { strategy: 'MANUAL', r2Candidates: [], allowFirebase: true };
      }
      const selected = await this.configs.get(runtime.activeProviderConfigId);
      const reasons = this.baseEligibility(selected);
      if (reasons.length) {
        throw new StorageAdminError('unavailable', 'The manually selected storage provider is not eligible for new uploads.', { reason: 'PROVIDER_UNAVAILABLE' });
      }
      return { strategy: 'MANUAL', r2Candidates: [selected], allowFirebase: false };
    }

    const ordered = await this.configs.list();
    const statuses = await Promise.all(ordered.map((config) =>
      this.statusForR2(config, runtime.automaticThresholdPercent)));
    const statusById = new Map(statuses.map((status) => [status.providerConfigId, status]));
    return {
      strategy: 'AUTOMATIC',
      r2Candidates: ordered.filter((config) => statusById.get(config.providerConfigId)?.acceptsNewUploads),
      allowFirebase: runtime.firebaseFallbackEnabled,
    };
  }

  private async write(config: StorageRuntimeConfigRecord, actor: WorkflowActor, action: string): Promise<void> {
    const batch = this.db.batch();
    batch.set(this.ref(), {
      strategy: config.strategy,
      activeProviderConfigId: config.activeProviderConfigId,
      automaticThresholdPercent: config.automaticThresholdPercent,
      firebaseFallbackEnabled: config.firebaseFallbackEnabled,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.businessUserId,
    }, { merge: true });
    addWorkflowAudit(this.db, batch, actor, {
      action,
      targetType: 'STORAGE_RUNTIME_CONFIG',
      targetId: STORAGE_RUNTIME_DOCUMENT,
      targetState: config.strategy,
      extra: {
        activeProviderConfigId: config.activeProviderConfigId,
        automaticThresholdPercent: config.automaticThresholdPercent,
        firebaseFallbackEnabled: config.firebaseFallbackEnabled,
      },
    });
    await batch.commit();
  }
}
