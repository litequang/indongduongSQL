/**
 * Compatibility export for older imports. New code must use the explicit
 * imageStorageService API, which accepts only validated Blob/File data and
 * never falls back to persisting a data URI.
 */
export { imageStorageService as storageService } from './imageStorageService';
