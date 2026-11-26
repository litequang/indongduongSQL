import { httpsCallable } from 'firebase/functions';
import { ImageEntityReference, StorageImageContentType, StorageUploadProgress } from '../storage/types';
import { getRegionalFunctions } from './firebaseFunctionsClient';

export interface RuntimeImageMetadata {
  idempotencyKey: string;
  originalFileName: string;
  contentType: StorageImageContentType;
  size: number;
  clientReportedSha256: string;
  relationship: ImageEntityReference;
}

export interface RuntimeFinalizedImage {
  imageId: string;
  providerType: 'R2';
  providerConfigId: string;
  objectKey: string;
  originalFileName: string;
  contentType: string;
  size: number;
  sha256?: string;
  createdAt: string;
}

type PrepareResponse = {
  transport: 'FIREBASE_STORAGE' | 'R2';
  providerConfigId: string;
  operationId: string;
  imageId: string;
  objectKey: string;
  status: 'READY' | 'PENDING' | 'FINALIZED';
  upload?: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
  image?: RuntimeFinalizedImage;
};

function transportError(error: unknown): Error {
  const code = String((error as { code?: unknown })?.code || '').replace(/^functions\//, '');
  if (code === 'unauthenticated') return new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  if (code === 'permission-denied') return new Error('Bạn không có quyền tải ảnh cho nội dung này.');
  if (code === 'invalid-argument') return new Error('Ảnh hoặc thông tin liên kết ảnh không hợp lệ.');
  if (code === 'already-exists') return new Error('Ảnh đang được thử lại với dữ liệu khác. Hãy chọn lại ảnh.');
  return new Error('Không thể tải ảnh lên kho lưu trữ. Vui lòng thử lại.');
}

async function call<TRequest extends object, TResponse>(name: string, data: TRequest): Promise<TResponse> {
  try {
    return (await httpsCallable<TRequest, TResponse>(getRegionalFunctions(), name, { timeout: 30000 })(data)).data;
  } catch (error) {
    throw transportError(error);
  }
}

export const runtimeImageTransport = {
  async prepare(metadata: RuntimeImageMetadata): Promise<PrepareResponse> {
    return call<RuntimeImageMetadata, PrepareResponse>('prepareImageUpload', metadata);
  },

  async uploadBinary(
    authorization: NonNullable<PrepareResponse['upload']>,
    data: Blob,
    onProgress?: (progress: StorageUploadProgress) => void,
  ): Promise<void> {
    onProgress?.({ transferredBytes: 0, totalBytes: data.size, percent: 0 });
    let response: Response;
    try {
      // The signed URL is deliberately confined to this call and is never
      // logged, cached, or persisted.
      response = await fetch(authorization.url, {
        method: authorization.method,
        headers: authorization.headers,
        body: data,
      });
    } catch {
      throw new Error('Không thể tải ảnh lên kho lưu trữ. Vui lòng kiểm tra mạng và thử lại.');
    }
    if (!response.ok) throw new Error('Kho lưu trữ từ chối dữ liệu ảnh. Vui lòng thử lại.');
    onProgress?.({ transferredBytes: data.size, totalBytes: data.size, percent: 100 });
  },

  async finalize(operationId: string): Promise<RuntimeFinalizedImage> {
    const result = await call<{ operationId: string }, { image: RuntimeFinalizedImage }>(
      'finalizeImageUpload',
      { operationId },
    );
    return result.image;
  },

  async resolveReadUrl(imageId: string): Promise<{
    providerType: 'FIREBASE_STORAGE' | 'R2';
    objectKey: string;
    url?: string;
    expiresAt?: string;
  }> {
    return call<
      { imageId: string },
      { providerType: 'FIREBASE_STORAGE' | 'R2'; objectKey: string; url?: string; expiresAt?: string }
    >('resolveImageReadUrl', { imageId });
  },

  async retire(imageId: string): Promise<void> {
    await call('retireImage', { imageId });
  },
};
