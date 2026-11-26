import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from 'firebase-functions';
import {
  R2Credentials,
  ServerStorageProvider,
  ServerStorageObjectMetadata,
  ServerStoragePutRequest,
  ServerStorageStreamWriteRequest,
  ServerStorageUploadAuthorization,
  StorageProviderConfigRecord,
  StorageProviderHealthStatus,
} from '../types';

function errorName(error: unknown): string {
  return String((error as { name?: unknown })?.name || 'UnknownError');
}

function errorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code || '');
}

function httpStatus(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
}

function classifyR2Error(error: unknown): StorageProviderHealthStatus {
  const name = errorName(error);
  const code = errorCode(error);
  const status = httpStatus(error);
  if (name === 'NoSuchBucket' || name === 'NotFound') return 'BUCKET_NOT_FOUND';
  if (['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'UnrecognizedClientException'].includes(name)) return 'AUTH_FAILED';
  if (name === 'AccessDenied' || status === 403) return 'PERMISSION_DENIED';
  if (status === 404) return 'BUCKET_NOT_FOUND';
  if (
    ['TimeoutError', 'NetworkingError', 'ECONNRESET', 'ENOTFOUND'].includes(name) ||
    ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) ||
    (status !== undefined && status >= 500)
  ) {
    return 'NETWORK_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

function healthMessage(status: StorageProviderHealthStatus): string {
  const messages: Record<StorageProviderHealthStatus, string> = {
    NOT_TESTED: 'The provider has not been tested.',
    HEALTHY: 'R2 bucket access and object write/read/delete permissions were verified.',
    AUTH_FAILED: 'R2 rejected the configured credentials.',
    BUCKET_NOT_FOUND: 'The configured R2 bucket was not found.',
    PERMISSION_DENIED: 'The R2 credentials do not have the required bucket permissions.',
    INVALID_CONFIG: 'The R2 provider configuration is incomplete or invalid.',
    NETWORK_ERROR: 'R2 could not be reached.',
    UNKNOWN_ERROR: 'The R2 connection test failed.',
  };
  return messages[status];
}

/** Credential-aware Cloudflare R2 adapter. This file is compiled only into Functions. */
export class R2Provider implements ServerStorageProvider {
  readonly providerConfigId: string;
  readonly providerType = 'R2' as const;
  private readonly client: S3Client;

  constructor(
    private readonly config: StorageProviderConfigRecord,
    credentials: R2Credentials,
  ) {
    this.providerConfigId = config.providerConfigId;
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
  }

  async put(request: ServerStoragePutRequest): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: request.objectKey,
      Body: request.body,
      ContentType: request.contentType,
      ContentLength: request.size,
      Metadata: {
        ...(request.metadata || {}),
        ...(request.checksumSha256 ? { sha256: request.checksumSha256 } : {}),
      },
    }));
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
  }

  async createReadStream(objectKey: string): Promise<Readable> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
    }));
    if (!(result.Body instanceof Readable)) {
      throw new Error('R2ObjectBodyIsNotReadable');
    }
    return result.Body;
  }

  async writeFromStream(request: ServerStorageStreamWriteRequest): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: request.objectKey,
      Body: request.body,
      ContentType: request.contentType,
      ContentLength: request.size,
      Metadata: request.metadata,
      IfNoneMatch: request.ifAbsent ? '*' : undefined,
    }));
  }

  async copy(request: {
    sourceObjectKey: string;
    destinationObjectKey: string;
    sourceEtag?: string;
    contentType: string;
    metadata: Record<string, string>;
  }): Promise<void> {
    const encodedSource = `${encodeURIComponent(this.config.bucket)}/${request.sourceObjectKey.split('/').map(encodeURIComponent).join('/')}`;
    await this.client.send(new CopyObjectCommand({
      Bucket: this.config.bucket,
      Key: request.destinationObjectKey,
      CopySource: encodedSource,
      CopySourceIfMatch: request.sourceEtag,
      MetadataDirective: 'REPLACE',
      ContentType: request.contentType,
      Metadata: request.metadata,
    }));
  }

  async head(objectKey: string): Promise<ServerStorageObjectMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
      return {
        objectKey,
        size: result.ContentLength ?? -1,
        contentType: result.ContentType,
        metadata: result.Metadata || {},
        // R2 currently documents SHA-256 as a composite checksum rather than
        // a compatible full-object SHA-256. Do not mislabel it as verification
        // of the browser's raw-byte digest.
        etag: result.ETag,
      };
    } catch (error) {
      if (httpStatus(error) === 404 || errorName(error) === 'NotFound' || errorName(error) === 'NoSuchKey') return null;
      throw error;
    }
  }

  async exists(objectKey: string): Promise<boolean> {
    return Boolean(await this.head(objectKey));
  }

  async createUploadAuthorization(request: {
    objectKey: string;
    contentType: string;
    metadata: Record<string, string>;
    expiresInSeconds: number;
  }): Promise<ServerStorageUploadAuthorization> {
    const metadataHeaders = Object.fromEntries(
      Object.entries(request.metadata).map(([key, value]) => [`x-amz-meta-${key.toLowerCase()}`, value]),
    );
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: request.objectKey,
      ContentType: request.contentType,
      Metadata: request.metadata,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: request.expiresInSeconds,
      signableHeaders: new Set(['content-type']),
      unhoistableHeaders: new Set(Object.keys(metadataHeaders)),
    });
    return {
      url,
      method: 'PUT',
      headers: {
        'content-type': request.contentType,
        ...metadataHeaders,
      },
      expiresAt: new Date(Date.now() + request.expiresInSeconds * 1000).toISOString(),
    };
  }

  async createReadAuthorization(objectKey: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: string }> {
    const url = await getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
    }), { expiresIn: expiresInSeconds });
    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async testConnection(): Promise<{ status: StorageProviderHealthStatus; message: string }> {
    const objectKey = `system/health-check/${randomUUID()}.txt`;
    const body = Buffer.from('r2-health-check', 'utf8');
    let objectCreated = false;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      await this.put({
        objectKey,
        body,
        contentType: 'text/plain',
        size: body.length,
        metadata: { purpose: 'health-check' },
      });
      objectCreated = true;
      if (!await this.exists(objectKey)) throw new Error('HealthCheckObjectMissing');
      await this.delete(objectKey);
      objectCreated = false;
      return { status: 'HEALTHY', message: healthMessage('HEALTHY') };
    } catch (error) {
      const status = classifyR2Error(error);
      logger.warn('R2 provider connection test failed', {
        providerConfigId: this.config.providerConfigId,
        providerType: this.config.providerType,
        bucket: this.config.bucket,
        operation: 'TEST_CONNECTION',
        category: status,
        errorName: errorName(error),
      });
      return { status, message: healthMessage(status) };
    } finally {
      if (objectCreated) {
        await this.delete(objectKey).catch((cleanupError: unknown) => {
          logger.error('R2 health-check cleanup failed', {
            providerConfigId: this.config.providerConfigId,
            providerType: this.config.providerType,
            bucket: this.config.bucket,
            operation: 'HEALTH_CHECK_CLEANUP',
            category: classifyR2Error(cleanupError),
          });
        });
      }
    }
  }
}
