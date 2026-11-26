import { BackendStorageProviderFactory } from '../providerFactory';
import { FirebaseAdminStorageProvider } from '../providers/FirebaseAdminStorageProvider';
import { StorageAdminError } from '../storageAdminError';
import { ServerStorageTransferProvider } from '../types';
import { FIREBASE_PRIMARY_PROVIDER_CONFIG_ID } from '../storageRuntimeService';

export class StorageTransferProviderFactory {
  constructor(
    private readonly r2Providers: BackendStorageProviderFactory,
    private readonly firebaseProvider: FirebaseAdminStorageProvider,
  ) {}

  async resolve(
    providerConfigId: string,
    options: { forNewBackup: boolean },
  ): Promise<ServerStorageTransferProvider> {
    if (providerConfigId === FIREBASE_PRIMARY_PROVIDER_CONFIG_ID) return this.firebaseProvider;
    try {
      return await this.r2Providers.resolve(providerConfigId, {
        allowDisabled: !options.forNewBackup,
      });
    } catch (error) {
      if (error instanceof StorageAdminError) throw error;
      throw new StorageAdminError('failed-precondition', 'Storage provider could not be resolved.', {
        reason: 'PROVIDER_INVALID_CONFIG',
      });
    }
  }
}
