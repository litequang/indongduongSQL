import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';

export interface StreamDigest {
  sizeBytes: number;
  sha256: string;
}

export async function digestStream(stream: Readable): Promise<StreamDigest> {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += bytes.length;
      hash.update(bytes);
    }
    return { sizeBytes, sha256: hash.digest('hex') };
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

export function hashingTransform(): {
  stream: Transform;
  digest: () => StreamDigest;
} {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  let finalized = false;
  const stream = new Transform({
    transform(chunk: Buffer | string, encoding, callback) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      sizeBytes += bytes.length;
      hash.update(bytes);
      callback(null, bytes);
    },
  });
  return {
    stream,
    digest: () => {
      if (finalized) throw new Error('StreamDigestAlreadyFinalized');
      finalized = true;
      return { sizeBytes, sha256: hash.digest('hex') };
    },
  };
}
