import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { R2Credentials } from './types';
import { validateProviderConfigId } from './validation';

export type CredentialStoreErrorCategory =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_PAYLOAD'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export class CredentialStoreError extends Error {
  constructor(public readonly category: CredentialStoreErrorCategory) {
    super('The provider credential store operation failed.');
    this.name = 'CredentialStoreError';
  }
}

export interface StoredCredentialVersion {
  secretVersionRef: string;
}

export interface R2CredentialStore {
  store(providerConfigId: string, credentials: R2Credentials): Promise<StoredCredentialVersion>;
  load(secretVersionRef: string, providerConfigId: string): Promise<R2Credentials>;
  destroyVersion(secretVersionRef: string, providerConfigId: string): Promise<void>;
}

function grpcCode(error: unknown): number | undefined {
  const raw = (error as { code?: unknown })?.code;
  if (typeof raw === 'number') return raw;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function classifyCredentialStoreError(error: unknown): CredentialStoreError {
  if (error instanceof CredentialStoreError) return error;
  const code = grpcCode(error);
  if (code === 5 || code === 9) return new CredentialStoreError('NOT_FOUND');
  if (code === 7 || code === 16) return new CredentialStoreError('PERMISSION_DENIED');
  if (code === 4 || code === 14) return new CredentialStoreError('UNAVAILABLE');
  return new CredentialStoreError('UNKNOWN');
}

/** Backend-only R2 credential storage. Secret payloads never enter Firestore. */
export class GoogleSecretManagerR2CredentialStore implements R2CredentialStore {
  constructor(
    private readonly projectId: string,
    private readonly client = new SecretManagerServiceClient(),
  ) {}

  private assertProjectId(): string {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(this.projectId)) throw new CredentialStoreError('UNKNOWN');
    return this.projectId;
  }

  private secretId(providerConfigId: string): string {
    return `storage-r2-${validateProviderConfigId(providerConfigId)}`;
  }

  private secretRef(providerConfigId: string): string {
    return `projects/${this.assertProjectId()}/secrets/${this.secretId(providerConfigId)}`;
  }

  private normalizeVersionRef(secretVersionRef: string, providerConfigId: string): string {
    const match = /^projects\/[^/]+\/secrets\/([^/]+)\/versions\/(\d+)$/.exec(secretVersionRef);
    const expectedSecretId = this.secretId(providerConfigId);
    if (!match || match[1] !== expectedSecretId) {
      throw new CredentialStoreError('NOT_FOUND');
    }
    const version = match[2];
    return `projects/${this.assertProjectId()}/secrets/${expectedSecretId}/versions/${version}`;
  }

  async store(providerConfigId: string, credentials: R2Credentials): Promise<StoredCredentialVersion> {
    const secretRef = this.secretRef(providerConfigId);
    try {
      try {
        await this.client.getSecret({ name: secretRef });
      } catch (error) {
        if (grpcCode(error) !== 5) throw error;
        try {
          await this.client.createSecret({
            parent: `projects/${this.assertProjectId()}`,
            secretId: this.secretId(providerConfigId),
            secret: {
              replication: { automatic: {} },
              labels: { component: 'storage-provider', provider: 'r2' },
            },
          });
        } catch (createError) {
          // Another concurrent request may have created the stable secret.
          if (grpcCode(createError) !== 6) throw createError;
        }
      }

      const payload = Buffer.from(JSON.stringify({
        version: 1,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      }), 'utf8');
      const [version] = await this.client.addSecretVersion({
        parent: secretRef,
        payload: { data: payload },
      });
      if (!version.name) throw new CredentialStoreError('UNKNOWN');
      return { secretVersionRef: this.normalizeVersionRef(version.name, providerConfigId) };
    } catch (error) {
      throw classifyCredentialStoreError(error);
    }
  }

  async load(secretVersionRef: string, providerConfigId: string): Promise<R2Credentials> {
    try {
      const [version] = await this.client.accessSecretVersion({
        name: this.normalizeVersionRef(secretVersionRef, providerConfigId),
      });
      const raw = version.payload?.data;
      if (!raw) throw new CredentialStoreError('INVALID_PAYLOAD');
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
      } catch {
        throw new CredentialStoreError('INVALID_PAYLOAD');
      }
      const credential = parsed as Partial<R2Credentials> & { version?: unknown };
      if (
        credential.version !== 1 || typeof credential.accessKeyId !== 'string' || !credential.accessKeyId ||
        typeof credential.secretAccessKey !== 'string' || !credential.secretAccessKey
      ) {
        throw new CredentialStoreError('INVALID_PAYLOAD');
      }
      return {
        accessKeyId: credential.accessKeyId,
        secretAccessKey: credential.secretAccessKey,
      };
    } catch (error) {
      throw classifyCredentialStoreError(error);
    }
  }

  async destroyVersion(secretVersionRef: string, providerConfigId: string): Promise<void> {
    try {
      await this.client.destroySecretVersion({
        name: this.normalizeVersionRef(secretVersionRef, providerConfigId),
      });
    } catch (error) {
      throw classifyCredentialStoreError(error);
    }
  }
}
