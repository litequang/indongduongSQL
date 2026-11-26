import { StorageImageContentType } from './types';

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export function assertObjectKeySegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`${label} is invalid for an image object key.`);
  }
  return value;
}

export function createImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function extensionFor(contentType: StorageImageContentType): 'jpg' | 'png' | 'webp' {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

/** Provider-independent, immutable key. The logical image ID owns the filename. */
export function buildImageObjectKey(
  segments: string[],
  imageId: string,
  contentType: StorageImageContentType,
): string {
  const safeSegments = segments.map((segment, index) => assertObjectKeySegment(segment, `Object key segment ${index + 1}`));
  const safeImageId = assertObjectKeySegment(imageId, 'Image ID');
  return [...safeSegments, `${safeImageId}.${extensionFor(contentType)}`].join('/');
}
