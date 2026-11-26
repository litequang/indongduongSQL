import { R2CredentialStore, CredentialStoreError } from './credentialStore';
import { StorageProviderConfigRepository } from './providerConfigRepository';
import { R2Provider } from './providers/R2Provider';
import { StorageAdminError } from './storageAdminError';
import { PinnedR2ProviderConfig, ServerStorageProvider, StorageProviderConfigRecord } from './types';

/** Resolves persisted config + an exact Secret Manager version into a backend provider. */
export class BackendStorageProviderFactory {
  constructor(
    private readonly configs: StorageProviderConfigRepository,
    private readonly credentials: R2CredentialStore,
  ) {}

  async resolve(providerConfigId: string, options: { allowDisabled?: boolean } = {}): Promise<ServerStorageProvider> {
    const config = await this.configs.get(providerConfigId);
    if (!options.allowDisabled && !config.enabled) {
      throw new StorageAdminError('failed-precondition', 'Storage provider configuration is disabled.', {
        reason: 'PROVIDER_DISABLED',
      });
    }
    if (config.providerType !== 'R2') {
      throw new StorageAdminError('failed-precondition', 'Storage provider type is not supported by the backend factory.');
    }
    if (!config.secretConfigured || !config.credentialSecretRef) {
      throw new StorageAdminError('failed-precondition', 'Storage provider credentials have not been configured.');
    }
    return this.resolveConfig(config);
  }

  async resolvePinned(
    pinned: PinnedR2ProviderConfig,
    options: { requireCurrentlyEnabled?: boolean } = {},
  ): Promise<ServerStorageProvider> {
    const current = await this.configs.get(pinned.providerConfigId);
    if (current.providerType !== pinned.providerType) {
      throw new StorageAdminError('failed-precondition', 'Pinned storage provider type no longer matches its configuration.');
    }
    if (options.requireCurrentlyEnabled && !current.enabled) {
      throw new StorageAdminError('unavailable', 'The pinned storage provider is disabled.');
    }
    return this.resolveConfig({
      ...current,
      bucket: pinned.bucket,
      endpoint: pinned.endpoint,
      credentialSecretRef: pinned.credentialSecretRef,
      secretConfigured: true,
    });
  }

  private async resolveConfig(config: StorageProviderConfigRecord): Promise<ServerStorageProvider> {
    if (!config.credentialSecretRef) {
      throw new StorageAdminError('failed-precondition', 'Storage provider credentials have not been configured.');
    }
    try {
      const secret = await this.credentials.load(config.credentialSecretRef, config.providerConfigId);
      return new R2Provider(config, secret);
    } catch (error) {
      if (error instanceof CredentialStoreError && ['NOT_FOUND', 'INVALID_PAYLOAD'].includes(error.category)) {
        throw new StorageAdminError('failed-precondition', 'Storage provider credentials are missing, disabled, or invalid.');
      }
      throw new StorageAdminError('internal', 'Storage provider credentials could not be resolved.');
    }
  }
}
