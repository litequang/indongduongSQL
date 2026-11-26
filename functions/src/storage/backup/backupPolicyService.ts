import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { requireWorkflowActor, WorkflowActor } from '../../workflows/workflowAuth';
import { StorageAdminError } from '../storageAdminError';
import { StorageObjectProviderType } from '../types';
import { StorageTransferProviderFactory } from './transferProviderFactory';
import { BackupPolicyRepository } from './backupPolicyRepository';
import { StorageBackupPolicyRecord } from './types';

const ID = /^[A-Za-z0-9_-]{1,128}$/;

function requestObject(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StorageAdminError('invalid-argument', 'A backup policy request object is required.');
  }
  const data = value as Record<string, unknown>;
  const unexpected = Object.keys(data).find((key) => !allowed.includes(key));
  if (unexpected) throw new StorageAdminError('invalid-argument', `Unexpected field: ${unexpected}.`);
  return data;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new StorageAdminError('invalid-argument', `${field} is invalid.`);
  }
  return value;
}

function displayName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new StorageAdminError('invalid-argument', 'Policy display name must be between 1 and 100 characters.');
  }
  return value.trim();
}

function iso(value?: Timestamp): string | undefined {
  return value?.toDate().toISOString();
}

export function serializeBackupPolicy(policy: StorageBackupPolicyRecord) {
  return {
    policyId: policy.policyId,
    displayName: policy.displayName,
    enabled: policy.enabled,
    autoBackupNewImages: policy.autoBackupNewImages,
    sourceProviderType: policy.sourceProviderType,
    sourceProviderConfigId: policy.sourceProviderConfigId,
    targetProviderType: policy.targetProviderType,
    targetProviderConfigId: policy.targetProviderConfigId,
    ...(policy.activeBackfillJobId ? { activeBackfillJobId: policy.activeBackfillJobId } : {}),
    ...(policy.lastActivityAt ? { lastActivityAt: iso(policy.lastActivityAt) } : {}),
    ...(policy.lastBackfillAt ? { lastBackfillAt: iso(policy.lastBackfillAt) } : {}),
    ...(policy.lastCoverageCheckAt ? { lastCoverageCheckAt: iso(policy.lastCoverageCheckAt) } : {}),
    ...(policy.lastErrorCode ? { lastErrorCode: policy.lastErrorCode } : {}),
    createdAt: iso(policy.createdAt),
    updatedAt: iso(policy.updatedAt),
  };
}

export class BackupPolicyService {
  constructor(
    private readonly db: Firestore,
    private readonly policies: BackupPolicyRepository,
    private readonly providers: StorageTransferProviderFactory,
  ) {}

  private requireDeveloper(firebaseUid: string | undefined): Promise<WorkflowActor> {
    return requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER']);
  }

  private async providerPair(sourceProviderConfigId: string, targetProviderConfigId: string): Promise<{
    sourceProviderType: StorageObjectProviderType;
    targetProviderType: StorageObjectProviderType;
  }> {
    if (sourceProviderConfigId === targetProviderConfigId) {
      throw new StorageAdminError('invalid-argument', 'Backup source and target providers must be different.');
    }
    const [source, target] = await Promise.all([
      this.providers.resolve(sourceProviderConfigId, { forNewBackup: false }),
      this.providers.resolve(targetProviderConfigId, { forNewBackup: true }),
    ]);
    return { sourceProviderType: source.providerType, targetProviderType: target.providerType };
  }

  async create(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = requestObject(request, ['displayName', 'sourceProviderConfigId', 'targetProviderConfigId', 'autoBackupNewImages']);
    const sourceProviderConfigId = identifier(data.sourceProviderConfigId, 'sourceProviderConfigId');
    const targetProviderConfigId = identifier(data.targetProviderConfigId, 'targetProviderConfigId');
    if (typeof data.autoBackupNewImages !== 'boolean') {
      throw new StorageAdminError('invalid-argument', 'autoBackupNewImages must be a boolean.');
    }
    const pair = await this.providerPair(sourceProviderConfigId, targetProviderConfigId);
    const policyId = randomUUID();
    await this.policies.create({
      policyId,
      displayName: displayName(data.displayName),
      autoBackupNewImages: data.autoBackupNewImages,
      sourceProviderConfigId,
      targetProviderConfigId,
      ...pair,
    }, actor);
    return { policy: serializeBackupPolicy(await this.policies.get(policyId)) };
  }

  async update(firebaseUid: string | undefined, request: unknown) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = requestObject(request, ['policyId', 'displayName', 'sourceProviderConfigId', 'targetProviderConfigId', 'autoBackupNewImages']);
    const policyId = identifier(data.policyId, 'policyId');
    const sourceProviderConfigId = identifier(data.sourceProviderConfigId, 'sourceProviderConfigId');
    const targetProviderConfigId = identifier(data.targetProviderConfigId, 'targetProviderConfigId');
    if (typeof data.autoBackupNewImages !== 'boolean') {
      throw new StorageAdminError('invalid-argument', 'autoBackupNewImages must be a boolean.');
    }
    const pair = await this.providerPair(sourceProviderConfigId, targetProviderConfigId);
    await this.policies.update(policyId, {
      displayName: displayName(data.displayName),
      autoBackupNewImages: data.autoBackupNewImages,
      sourceProviderConfigId,
      targetProviderConfigId,
      ...pair,
    }, actor);
    return { policy: serializeBackupPolicy(await this.policies.get(policyId)) };
  }

  async setEnabled(firebaseUid: string | undefined, request: unknown, enabled: boolean) {
    const actor = await this.requireDeveloper(firebaseUid);
    const data = requestObject(request, ['policyId']);
    const policyId = identifier(data.policyId, 'policyId');
    if (enabled) {
      const policy = await this.policies.get(policyId);
      await this.providerPair(policy.sourceProviderConfigId, policy.targetProviderConfigId);
    }
    await this.policies.setEnabled(policyId, enabled, actor);
    return { policy: serializeBackupPolicy(await this.policies.get(policyId)) };
  }

  async list(firebaseUid: string | undefined, request: unknown) {
    await this.requireDeveloper(firebaseUid);
    requestObject(request ?? {}, []);
    return { policies: (await this.policies.list()).map(serializeBackupPolicy) };
  }
}
