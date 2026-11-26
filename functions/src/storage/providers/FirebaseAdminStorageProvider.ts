import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Storage } from 'firebase-admin/storage';
import {
  ServerStorageObjectMetadata,
  ServerStorageStreamWriteRequest,
  ServerStorageTransferProvider,
} from '../types';

function storageErrorCode(error: unknown): number | undefined {
  const value = (error as { code?: unknown })?.code;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Backend adapter for the app's configured default Firebase Storage bucket. */
export class FirebaseAdminStorageProvider implements ServerStorageTransferProvider {
  readonly providerConfigId = 'firebase-primary';
  readonly providerType = 'FIREBASE_STORAGE' as const;

  constructor(
    private readonly storage: Storage,
    private readonly bucketName?: string,
  ) {}

  private bucket() {
    // The name comes from the initialized Admin app/FIREBASE_CONFIG. Passing it
    // explicitly avoids inventing a legacy appspot.com bucket convention.
    return this.storage.bucket(this.bucketName);
  }

  async head(objectKey: string): Promise<ServerStorageObjectMetadata | null> {
    try {
      const [metadata] = await this.bucket().file(objectKey).getMetadata();
      const size = Number(metadata.size);
      return {
        objectKey,
        size: Number.isSafeInteger(size) ? size : -1,
        contentType: metadata.contentType,
        metadata: Object.fromEntries(
          Object.entries(metadata.metadata || {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        ),
        etag: metadata.etag,
      };
    } catch (error) {
      if (storageErrorCode(error) === 404) return null;
      throw error;
    }
  }

  createReadStream(objectKey: string): Promise<Readable> {
    return Promise.resolve(this.bucket().file(objectKey).createReadStream());
  }

  async writeFromStream(request: ServerStorageStreamWriteRequest): Promise<void> {
    const destination = this.bucket().file(request.objectKey).createWriteStream({
      resumable: false,
      metadata: {
        contentType: request.contentType,
        metadata: request.metadata,
      },
      ...(request.ifAbsent ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
    });
    await pipeline(request.body, destination);
  }
}
