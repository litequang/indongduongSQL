import { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { requireWorkflowActor, WorkflowActor } from '../workflows/workflowAuth';
import { CredentialStoreError, R2CredentialStore, StoredCredentialVersion } from './credentialStore';
import { BackendStorageProviderFactory } from './providerFactory';
import {
  sanitizeProviderConfig,
  StorageProviderConfigRepository,
} from './providerConfigRepository';
import { StorageAdminError } from './storageAdminError';
import { SanitizedStorageProviderConfig, StorageProviderHealthStatus } from './types';
import {
  providerConfigIdFromRequest,
  validateConfigIdRequest,
  validateCreateProviderConfig,
  validateCredentialsRequest,
  validateListRequest,
  validateUpdateProviderConfig,
} from './validation';

const STORAGE_CONFIG_ROLES = ['DEVELOPER'] as const;

function safeStoreCategory(error: unknown): string {
  return error instanceof CredentialStoreError ? error.category : 'UNKNOWN';
}

export class StorageProviderAdminService {
  constructor(
    private readonly db: Firestore,
    private readonly configs: StorageProviderConfigRepository,
    private readonly credentialStore: R2CredentialStore,
    private readonly providerFactory: BackendStorageProviderFactory,
  ) {}

  private requireDeveloper(firebaseUid: string | undefined): Promise<WorkflowActor> {
    return requireWorkflowActor(this.db, firebaseUid, STORAGE_CONFIG_ROLES);
  }

  async create(firebaseUid: string | undefined, request: unknown): Promise<{ config: SanitizedStorageProviderConfig }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const input = validateCreateProviderConfig(request);
    await this.configs.create(input, actor);
    return { config: sanitizeProviderConfig(await this.configs.get(input.providerConfigId)) };
  }

  async update(firebaseUid: string | undefined, request: unknown): Promise<{ config: SanitizedStorageProviderConfig }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const providerConfigId = providerConfigIdFromRequest(request);
    const current = await this.configs.get(providerConfigId);
    const input = validateUpdateProviderConfig(request, current.accountId);
    await this.configs.update(input, actor);
    return { config: sanitizeProviderConfig(await this.configs.get(providerConfigId)) };
  }

  async setCredentials(firebaseUid: string | undefined, request: unknown): Promise<{ config: SanitizedStorageProviderConfig }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const { providerConfigId, credentials } = validateCredentialsRequest(request);
    await this.configs.get(providerConfigId);

    let storedVersion: StoredCredentialVersion;
    try {
      storedVersion = await this.credentialStore.store(providerConfigId, credentials);
    } catch (error) {
      logger.error('R2 credentials could not be stored', {
        providerConfigId,
        providerType: 'R2',
        operation: 'SET_CREDENTIALS',
        category: safeStoreCategory(error),
      });
      throw new StorageAdminError('internal', 'Storage provider credentials could not be saved.');
    }

    try {
      await this.configs.setCredentialReference(providerConfigId, storedVersion.secretVersionRef, actor);
    } catch (error) {
      await this.credentialStore.destroyVersion(storedVersion.secretVersionRef, providerConfigId).catch((rollbackError: unknown) => {
        logger.error('Unused R2 credential version rollback failed', {
          providerConfigId,
          providerType: 'R2',
          operation: 'CREDENTIAL_ROLLBACK',
          category: safeStoreCategory(rollbackError),
        });
      });
      throw error;
    }
    // Older versions remain available for already-issued upload operations,
    // which pin an exact credential version. A later orphan/retention worker
    // may retire versions only after no live operation references them.
    return { config: sanitizeProviderConfig(await this.configs.get(providerConfigId)) };
  }

  async get(firebaseUid: string | undefined, request: unknown): Promise<{ config: SanitizedStorageProviderConfig }> {
    await this.requireDeveloper(firebaseUid);
    const providerConfigId = validateConfigIdRequest(request);
    return { config: sanitizeProviderConfig(await this.configs.get(providerConfigId)) };
  }

  async list(firebaseUid: string | undefined, request: unknown): Promise<{ configs: SanitizedStorageProviderConfig[] }> {
    await this.requireDeveloper(firebaseUid);
    validateListRequest(request);
    return { configs: (await this.configs.list()).map(sanitizeProviderConfig) };
  }

  async disable(firebaseUid: string | undefined, request: unknown): Promise<{ config: SanitizedStorageProviderConfig }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const providerConfigId = validateConfigIdRequest(request);
    await this.configs.get(providerConfigId);
    const runtime = await this.db.collection('storage_runtime').doc('config').get();
    const runtimeData = runtime.data() || {};
    if (runtimeData.strategy === 'MANUAL' && runtimeData.activeProviderConfigId === providerConfigId) {
      throw new StorageAdminError('failed-precondition', 'Select another manual upload provider before disabling this provider.');
    }
    await this.configs.disable(providerConfigId, actor);
    return { config: sanitizeProviderConfig(await this.configs.get(providerConfigId)) };
  }

  async enable(firebaseUid: string | undefined, request: unknown): Promise<{ config: SanitizedStorageProviderConfig }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const providerConfigId = validateConfigIdRequest(request);
    const config = await this.configs.get(providerConfigId);
    if (!config.secretConfigured || !config.credentialSecretRef || config.healthStatus !== 'HEALTHY') {
      throw new StorageAdminError(
        'failed-precondition',
        'Provider must have configured credentials and a HEALTHY connection test before it can be enabled.',
      );
    }
    await this.configs.enable(providerConfigId, actor);
    return { config: sanitizeProviderConfig(await this.configs.get(providerConfigId)) };
  }

  async testConnection(firebaseUid: string | undefined, request: unknown): Promise<{
    providerConfigId: string;
    status: StorageProviderHealthStatus;
    message: string;
    testedAt: string;
  }> {
    const actor = await this.requireDeveloper(firebaseUid);
    const providerConfigId = validateConfigIdRequest(request);
    await this.configs.get(providerConfigId);

    let status: StorageProviderHealthStatus;
    let message: string;
    try {
      const provider = await this.providerFactory.resolve(providerConfigId, { allowDisabled: true });
      const result = await provider.testConnection();
      status = result.status;
      message = result.message;
    } catch (error) {
      if (error instanceof StorageAdminError && error.code === 'failed-precondition') {
        status = 'INVALID_CONFIG';
        message = 'The R2 provider configuration or credentials are incomplete.';
      } else {
        status = 'UNKNOWN_ERROR';
        message = 'The R2 connection test could not be completed.';
        logger.error('R2 provider could not be initialized for connection test', {
          providerConfigId,
          providerType: 'R2',
          operation: 'TEST_CONNECTION_INITIALIZE',
          category: error instanceof StorageAdminError ? error.code : 'unknown',
        });
      }
    }

    await this.configs.recordHealth(providerConfigId, status, actor);
    return { providerConfigId, status, message, testedAt: new Date().toISOString() };
  }
}
