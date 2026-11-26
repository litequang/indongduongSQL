import { DocumentData, FieldValue, Firestore, Timestamp, UpdateData } from 'firebase-admin/firestore';
import { addWorkflowAudit } from '../workflows/workflowAudit';
import { WorkflowActor } from '../workflows/workflowAuth';
import { StorageAdminError } from './storageAdminError';
import {
  CreateStorageProviderConfigInput,
  SanitizedStorageProviderConfig,
  StorageProviderConfigRecord,
  StorageProviderHealthStatus,
  UpdateStorageProviderConfigInput,
} from './types';

export const STORAGE_PROVIDER_CONFIG_COLLECTION = 'storage_provider_configs';
const HEALTH_STATUSES: readonly StorageProviderHealthStatus[] = [
  'NOT_TESTED', 'HEALTHY', 'AUTH_FAILED', 'BUCKET_NOT_FOUND',
  'PERMISSION_DENIED', 'INVALID_CONFIG', 'NETWORK_ERROR', 'UNKNOWN_ERROR',
];

function requireTimestamp(value: unknown, field: string): Timestamp {
  if (!(value instanceof Timestamp)) {
    throw new StorageAdminError('failed-precondition', `Storage provider ${field} metadata is invalid.`);
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function parseRecord(providerConfigId: string, data: FirebaseFirestore.DocumentData): StorageProviderConfigRecord {
  if (
    data.providerConfigId !== providerConfigId || data.providerType !== 'R2' ||
    typeof data.displayName !== 'string' || typeof data.accountId !== 'string' ||
    typeof data.bucket !== 'string' || typeof data.endpoint !== 'string' ||
    typeof data.enabled !== 'boolean' || !Number.isInteger(data.priority) ||
    typeof data.secretConfigured !== 'boolean' || !HEALTH_STATUSES.includes(data.healthStatus) ||
    typeof data.createdBy !== 'string' || typeof data.updatedBy !== 'string'
  ) {
    throw new StorageAdminError('failed-precondition', 'Storage provider configuration is invalid.');
  }
  return {
    providerConfigId,
    providerType: 'R2',
    displayName: data.displayName,
    accountId: data.accountId,
    bucket: data.bucket,
    endpoint: data.endpoint,
    deliveryBaseUrl: optionalText(data.deliveryBaseUrl),
    enabled: data.enabled,
    priority: data.priority,
    softLimitBytes: Number.isSafeInteger(data.softLimitBytes) && data.softLimitBytes > 0
      ? data.softLimitBytes
      : undefined,
    credentialSecretRef: optionalText(data.credentialSecretRef),
    secretConfigured: data.secretConfigured,
    healthStatus: data.healthStatus as StorageProviderHealthStatus,
    lastHealthCheckAt: data.lastHealthCheckAt instanceof Timestamp ? data.lastHealthCheckAt : undefined,
    createdAt: requireTimestamp(data.createdAt, 'createdAt'),
    updatedAt: requireTimestamp(data.updatedAt, 'updatedAt'),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

export function sanitizeProviderConfig(record: StorageProviderConfigRecord): SanitizedStorageProviderConfig {
  return {
    providerConfigId: record.providerConfigId,
    providerType: record.providerType,
    displayName: record.displayName,
    accountId: record.accountId,
    bucket: record.bucket,
    endpoint: record.endpoint,
    ...(record.deliveryBaseUrl ? { deliveryBaseUrl: record.deliveryBaseUrl } : {}),
    enabled: record.enabled,
    priority: record.priority,
    ...(record.softLimitBytes ? { softLimitBytes: record.softLimitBytes } : {}),
    credentialsConfigured: record.secretConfigured && Boolean(record.credentialSecretRef),
    healthStatus: record.healthStatus,
    ...(record.lastHealthCheckAt ? { lastHealthCheckAt: record.lastHealthCheckAt.toDate().toISOString() } : {}),
    createdAt: record.createdAt.toDate().toISOString(),
    updatedAt: record.updatedAt.toDate().toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

export class StorageProviderConfigRepository {
  constructor(private readonly db: Firestore) {}

  private ref(providerConfigId: string) {
    return this.db.collection(STORAGE_PROVIDER_CONFIG_COLLECTION).doc(providerConfigId);
  }

  async get(providerConfigId: string): Promise<StorageProviderConfigRecord> {
    const snapshot = await this.ref(providerConfigId).get();
    if (!snapshot.exists) throw new StorageAdminError('not-found', 'Storage provider configuration was not found.');
    return parseRecord(providerConfigId, snapshot.data() || {});
  }

  async list(): Promise<StorageProviderConfigRecord[]> {
    const snapshot = await this.db.collection(STORAGE_PROVIDER_CONFIG_COLLECTION).get();
    return snapshot.docs
      .map((document) => parseRecord(document.id, document.data()))
      .sort((left, right) => left.priority - right.priority || left.providerConfigId.localeCompare(right.providerConfigId));
  }

  async create(input: CreateStorageProviderConfigInput, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    const ref = this.ref(input.providerConfigId);
    const { deliveryBaseUrl, softLimitBytes, ...requiredInput } = input;
    batch.create(ref, {
      ...requiredInput,
      ...(deliveryBaseUrl ? { deliveryBaseUrl } : {}),
      ...(softLimitBytes ? { softLimitBytes } : {}),
      secretConfigured: false,
      healthStatus: 'NOT_TESTED',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: actor.businessUserId,
      updatedBy: actor.businessUserId,
    });
    addWorkflowAudit(this.db, batch, actor, {
      action: 'STORAGE_PROVIDER_CONFIG_CREATED',
      targetType: 'STORAGE_PROVIDER_CONFIG',
      targetId: input.providerConfigId,
      targetState: input.enabled ? 'ENABLED' : 'DISABLED',
      extra: { providerType: input.providerType },
    });
    try {
      await batch.commit();
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      if (code === 6 || String(code || '').includes('already-exists')) {
        throw new StorageAdminError('already-exists', 'Storage provider configuration ID already exists.');
      }
      throw error;
    }
  }

  async update(input: UpdateStorageProviderConfigInput, actor: WorkflowActor): Promise<void> {
    const { providerConfigId, ...changes } = input;
    const batch = this.db.batch();
    const ref = this.ref(providerConfigId);
    const connectionFields = ['accountId', 'bucket', 'endpoint', 'deliveryBaseUrl'];
    const resetsHealth = Object.keys(changes).some((field) => connectionFields.includes(field));
    const update: UpdateData<DocumentData> = {
      ...changes,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.businessUserId,
      ...(resetsHealth ? {
        healthStatus: 'NOT_TESTED',
        lastHealthCheckAt: FieldValue.delete(),
      } : {}),
    };
    if (Object.prototype.hasOwnProperty.call(changes, 'deliveryBaseUrl') && !changes.deliveryBaseUrl) {
      update.deliveryBaseUrl = FieldValue.delete();
    }
    if (Object.prototype.hasOwnProperty.call(changes, 'softLimitBytes') && !changes.softLimitBytes) {
      update.softLimitBytes = FieldValue.delete();
    }
    batch.update(ref, update);
    addWorkflowAudit(this.db, batch, actor, {
      action: 'STORAGE_PROVIDER_CONFIG_UPDATED',
      targetType: 'STORAGE_PROVIDER_CONFIG',
      targetId: providerConfigId,
      extra: { changedFields: Object.keys(changes).sort() },
    });
    await batch.commit();
  }

  async setCredentialReference(providerConfigId: string, credentialSecretRef: string, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    batch.update(this.ref(providerConfigId), {
      credentialSecretRef,
      secretConfigured: true,
      healthStatus: 'NOT_TESTED',
      lastHealthCheckAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.businessUserId,
    });
    addWorkflowAudit(this.db, batch, actor, {
      action: 'STORAGE_PROVIDER_CREDENTIALS_REPLACED',
      targetType: 'STORAGE_PROVIDER_CONFIG',
      targetId: providerConfigId,
    });
    await batch.commit();
  }

  async disable(providerConfigId: string, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    batch.update(this.ref(providerConfigId), {
      enabled: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.businessUserId,
    });
    addWorkflowAudit(this.db, batch, actor, {
      action: 'STORAGE_PROVIDER_CONFIG_DISABLED',
      targetType: 'STORAGE_PROVIDER_CONFIG',
      targetId: providerConfigId,
      targetState: 'DISABLED',
    });
    await batch.commit();
  }

  async enable(providerConfigId: string, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    batch.update(this.ref(providerConfigId), {
      enabled: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.businessUserId,
    });
    addWorkflowAudit(this.db, batch, actor, {
      action: 'STORAGE_PROVIDER_CONFIG_ENABLED',
      targetType: 'STORAGE_PROVIDER_CONFIG',
      targetId: providerConfigId,
      targetState: 'ENABLED',
    });
    await batch.commit();
  }

  async recordHealth(providerConfigId: string, status: StorageProviderHealthStatus, actor: WorkflowActor): Promise<void> {
    const batch = this.db.batch();
    batch.update(this.ref(providerConfigId), {
      healthStatus: status,
      lastHealthCheckAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.businessUserId,
    });
    addWorkflowAudit(this.db, batch, actor, {
      action: 'STORAGE_PROVIDER_CONNECTION_TESTED',
      targetType: 'STORAGE_PROVIDER_CONFIG',
      targetId: providerConfigId,
      targetState: status,
    });
    await batch.commit();
  }
}
