import { assertObjectKeySegment } from '../storage/objectKey';
import { sha256Hex } from '../storage/sha256';
import { storageManager } from '../storage/storageManager';
import { StorageUploadProgress } from '../storage/types';
import { StoredImageReference } from '../types';
import { runtimeImageTransport } from './runtimeImageTransport';

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];

/** Original and optimized files are both capped before any Storage call. */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1920;

export interface PreparedImage {
  file: Blob;
  previewUrl: string;
  contentType: SupportedImageType;
  fileName: string;
  originalFileName?: string;
  size: number;
  width: number;
  height: number;
}

export type ImageUploadProgress = StorageUploadProgress;

type UploadTarget = {
  objectKeySegments: string[];
  uploadedBy: string;
  image: PreparedImage;
  entity: {
    entityType: 'PRODUCTION_ORDER_ITEM' | 'SALES_ORDER_ITEM' | 'USER_AVATAR' | 'COMPANY_LOGO';
    entityId: string;
    parentEntityId?: string;
  };
  onProgress?: (progress: ImageUploadProgress) => void;
};

function isSupportedImageType(value: string): value is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(value);
}

function extensionFor(contentType: SupportedImageType): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

function generateImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function createStorageFileName(contentType: SupportedImageType): string {
  return `${generateImageId()}.${extensionFor(contentType)}`;
}

function validateImageFile(file: Blob): SupportedImageType {
  if (!isSupportedImageType(file.type)) {
    throw new Error('Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.');
  }
  if (file.size <= 0) throw new Error('Tệp ảnh trống hoặc không hợp lệ.');
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Ảnh vượt quá giới hạn ${Math.floor(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} MB.`);
  }
  return file.type;
}

async function loadImage(source: Blob): Promise<HTMLImageElement> {
  const sourceUrl = URL.createObjectURL(source);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
      image.src = sourceUrl;
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function scaledDimensions(width: number, height: number, maximumDimension: number): { width: number; height: number } {
  if (width <= maximumDimension && height <= maximumDimension) return { width, height };
  const scale = Math.min(maximumDimension / width, maximumDimension / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function canvasBlob(canvas: HTMLCanvasElement, contentType: SupportedImageType): Promise<Blob> {
  const quality = contentType === 'image/png' ? undefined : 0.86;
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Không thể tối ưu ảnh.')), contentType, quality);
  });
}

/**
 * Produces an object-URL preview and a validated, optimized Blob. The preview
 * is local-only and must never be written to Firestore.
 */
async function prepareImage(file: Blob, maximumDimension = MAX_IMAGE_DIMENSION): Promise<PreparedImage> {
  const contentType = validateImageFile(file);
  const image = await loadImage(file);
  const { width, height } = scaledDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, maximumDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không hỗ trợ tối ưu ảnh.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // PNG output retains transparency. JPEG/WebP retain their native background.
  context.drawImage(image, 0, 0, width, height);
  const optimized = await canvasBlob(canvas, contentType);
  if (optimized.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Ảnh sau tối ưu vẫn vượt quá ${Math.floor(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} MB.`);
  }
  return {
    file: optimized,
    previewUrl: URL.createObjectURL(optimized),
    contentType,
    fileName: createStorageFileName(contentType),
    originalFileName: file instanceof File ? file.name : undefined,
    size: optimized.size,
    width,
    height,
  };
}

/** Downloads a selected sample only to turn it into the same validated upload
 * payload as a user-picked file. The remote URL is never persisted. */
async function prepareImageFromUrl(url: string, maximumDimension = MAX_IMAGE_DIMENSION): Promise<PreparedImage> {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) throw new Error('Không thể tải ảnh avatar mẫu. Vui lòng chọn mẫu khác hoặc tải ảnh lên.');
  const blob = await response.blob();
  return prepareImage(blob, maximumDimension);
}

async function upload(target: UploadTarget): Promise<StoredImageReference> {
  const sha256 = await sha256Hex(target.image.file);
  const prepared = await runtimeImageTransport.prepare({
    idempotencyKey: [
      target.entity.entityType,
      target.entity.parentEntityId || '-',
      target.entity.entityId,
      target.image.fileName,
    ].join(':'),
    originalFileName: target.image.originalFileName || target.image.fileName,
    contentType: target.image.contentType,
    size: target.image.file.size,
    clientReportedSha256: sha256,
    relationship: target.entity,
  });

  let result: {
    imageId: string;
    providerType: 'FIREBASE_STORAGE' | 'R2';
    providerConfigId: string;
    objectKey: string;
    readUrl: string;
    sha256: string;
    createdAt: string;
  };
  if (prepared.transport === 'FIREBASE_STORAGE') {
    result = await storageManager.uploadImage({
      data: target.image.file,
      contentType: target.image.contentType,
      originalFileName: target.image.originalFileName || target.image.fileName,
      width: target.image.width,
      height: target.image.height,
      createdBy: target.uploadedBy,
      entity: target.entity,
      objectKeySegments: target.objectKeySegments,
      providerConfigId: prepared.providerConfigId,
      imageId: prepared.imageId,
      objectKey: prepared.objectKey,
      sha256,
      onProgress: target.onProgress,
    });
  } else {
    let finalized = prepared.image;
    if (prepared.status !== 'FINALIZED') {
      if (!prepared.upload) throw new Error('Kho lưu trữ không cấp quyền tải ảnh. Vui lòng thử lại.');
      await runtimeImageTransport.uploadBinary(prepared.upload, target.image.file, target.onProgress);
      finalized = await runtimeImageTransport.finalize(prepared.operationId);
    }
    if (!finalized) throw new Error('Không thể hoàn tất đăng ký ảnh. Vui lòng thử lại.');
    result = {
      imageId: finalized.imageId,
      providerType: 'R2',
      providerConfigId: finalized.providerConfigId,
      objectKey: finalized.objectKey,
      readUrl: '',
      sha256: finalized.sha256 || sha256,
      createdAt: finalized.createdAt,
    };
  }
  return {
    imageId: result.imageId,
    providerType: result.providerType,
    providerConfigId: result.providerConfigId,
    objectKey: result.objectKey,
    sha256: result.sha256,
    // R2 keeps the compatibility path but never persists a signed read URL.
    storagePath: result.objectKey,
    downloadUrl: result.readUrl,
    fileName: target.image.fileName,
    contentType: target.image.contentType,
    size: target.image.size,
    width: target.image.width,
    height: target.image.height,
    uploadedAt: result.createdAt,
    uploadedBy: target.uploadedBy,
  };
}

function removePreview(image: PreparedImage | undefined): void {
  if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
}

function isDataImage(value: unknown): boolean {
  return typeof value === 'string' && /^data:image\//i.test(value);
}

function uploadErrorMessage(error: unknown): string {
  const code = String((error as { code?: unknown })?.code || '');
  if (code === 'storage/quota-exceeded') return 'Kho lưu trữ đã đạt giới hạn được cấu hình.';
  if (code === 'storage/unauthorized') return 'Bạn không có quyền tải ảnh lên vị trí này.';
  if (code === 'storage/canceled') return 'Tải ảnh đã bị hủy.';
  if (code === 'storage/retry-limit-exceeded') return 'Tải ảnh quá thời gian chờ. Vui lòng thử lại.';
  return (error as Error)?.message || 'Không thể tải ảnh lên kho lưu trữ. Vui lòng thử lại.';
}

const readUrlCache = new Map<string, { url: string; refreshAt: number }>();
const readUrlRequests = new Map<string, Promise<string>>();

export const imageStorageService = {
  prepareImage,
  prepareImageFromUrl,
  removePreview,
  isDataImage,
  uploadErrorMessage,

  async resolveImageUrl(image: Partial<StoredImageReference> | undefined, legacyUrl?: string): Promise<string> {
    if (!image?.imageId || image.providerType !== 'R2') {
      if (legacyUrl) return legacyUrl;
      const objectKey = image?.objectKey || image?.storagePath;
      if (!objectKey) return '';
      return storageManager.resolveImage({
        imageId: image?.imageId,
        providerType: image?.providerType,
        providerConfigId: image?.providerConfigId,
        objectKey,
      });
    }
    const cached = readUrlCache.get(image.imageId);
    if (cached && cached.refreshAt > Date.now()) return cached.url;
    const pending = readUrlRequests.get(image.imageId);
    if (pending) return pending;
    const request = runtimeImageTransport.resolveReadUrl(image.imageId).then((resolved) => {
      if (!resolved.url || !resolved.expiresAt) throw new Error('Không thể mở ảnh từ kho lưu trữ.');
      const expiresAt = new Date(resolved.expiresAt).getTime();
      const refreshAt = Math.max(Date.now() + 15_000, expiresAt - 60_000);
      readUrlCache.set(image.imageId!, { url: resolved.url!, refreshAt });
      return resolved.url;
    }).finally(() => readUrlRequests.delete(image.imageId!));
    readUrlRequests.set(image.imageId, request);
    return request;
  },

  async uploadProductionOrderItem(orderId: string, itemId: string, image: PreparedImage, uploadedBy: string, onProgress?: UploadTarget['onProgress']): Promise<StoredImageReference> {
    const safeOrderId = assertObjectKeySegment(orderId, 'Order ID');
    const safeItemId = assertObjectKeySegment(itemId, 'Item ID');
    return upload({
      objectKeySegments: ['production-orders', safeOrderId, 'items', safeItemId],
      uploadedBy: assertObjectKeySegment(uploadedBy, 'Uploader ID'),
      image,
      entity: { entityType: 'PRODUCTION_ORDER_ITEM', entityId: safeItemId, parentEntityId: safeOrderId },
      onProgress,
    });
  },

  async uploadSalesOrderItem(orderId: string, itemId: string, image: PreparedImage, uploadedBy: string, onProgress?: UploadTarget['onProgress']): Promise<StoredImageReference> {
    const safeOrderId = assertObjectKeySegment(orderId, 'Sales order ID');
    const safeItemId = assertObjectKeySegment(itemId, 'Item ID');
    return upload({
      objectKeySegments: ['sales-orders', safeOrderId, 'items', safeItemId, 'images'],
      uploadedBy: assertObjectKeySegment(uploadedBy, 'Uploader ID'),
      image,
      entity: { entityType: 'SALES_ORDER_ITEM', entityId: safeItemId, parentEntityId: safeOrderId },
      onProgress,
    });
  },

  async uploadAvatar(userId: string, image: PreparedImage, uploadedBy: string, onProgress?: UploadTarget['onProgress']): Promise<StoredImageReference> {
    const safeUserId = assertObjectKeySegment(userId, 'User ID');
    return upload({
      objectKeySegments: ['avatars', safeUserId],
      uploadedBy: assertObjectKeySegment(uploadedBy, 'Uploader ID'),
      image,
      entity: { entityType: 'USER_AVATAR', entityId: safeUserId },
      onProgress,
    });
  },

  async uploadCompanyLogo(image: PreparedImage, uploadedBy: string, onProgress?: UploadTarget['onProgress']): Promise<StoredImageReference> {
    return upload({
      objectKeySegments: ['settings', 'company-logo'],
      uploadedBy: assertObjectKeySegment(uploadedBy, 'Uploader ID'),
      image,
      entity: { entityType: 'COMPANY_LOGO', entityId: 'company' },
      onProgress,
    });
  },

  async deleteImage(image: Pick<StoredImageReference, 'storagePath'> & Partial<Pick<StoredImageReference, 'imageId' | 'providerType' | 'providerConfigId' | 'objectKey'>> | undefined): Promise<void> {
    if (!image?.storagePath) return;
    if (image.imageId) {
      await runtimeImageTransport.retire(image.imageId);
      readUrlCache.delete(image.imageId);
      readUrlRequests.delete(image.imageId);
      return;
    }
    await storageManager.deleteImage({
      imageId: image.imageId,
      providerType: image.providerType,
      providerConfigId: image.providerConfigId,
      objectKey: image.objectKey || image.storagePath,
    });
  },

  async cleanupImages(images: Array<Pick<StoredImageReference, 'storagePath'> & Partial<StoredImageReference>>): Promise<void> {
    await Promise.all(images.map(async (image) => {
      // Registered uploads keep their ACTIVE logical identity so a retry with
      // the same attachment idempotency key can recover it. A future orphan
      // collector may retire genuinely abandoned records.
      if (image.imageId) return;
      try {
        await this.deleteImage(image);
      } catch (error) {
        console.error('Image cleanup failed; manual cleanup may be required.', error);
      }
    }));
  },

  async retireImages(images: Array<Pick<StoredImageReference, 'storagePath'> & Partial<StoredImageReference>>): Promise<void> {
    await Promise.all(images.map(async (image) => {
      try {
        await this.deleteImage(image);
      } catch (error) {
        console.error('Image retirement failed; manual cleanup may be required.', error);
      }
    }));
  },
};
