/**
 * Safe localStorage wrapper that handles QuotaExceededError gracefully
 * by clearing obsolete cache items and preventing runtime app crashes.
 */

import LZString from 'lz-string';

const COMPRESSION_PREFIX = 'LZ|';
const OBSOLETE_KEYS_TO_CLEAN = [
  'flexo_users_v1',
  'flexo_orders_v1',
  'flexo_orders_backup',
  'flexo_temp_cache',
  'flexo_print_logs_old'
];

export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    let storedValue = value;
    // Compress if the data is large enough to benefit (e.g., > 10KB)
    if (value.length > 10000) {
      storedValue = COMPRESSION_PREFIX + LZString.compressToUTF16(value);
    }
    
    localStorage.setItem(key, storedValue);
    return true;
  } catch (err: any) {
    console.warn(`[safeLocalStorageSet] Quota exceeded on key "${key}". Attempting auto-purge...`, err);

    // Step 1: Remove known obsolete or duplicate keys
    try {
      OBSOLETE_KEYS_TO_CLEAN.forEach(k => localStorage.removeItem(k));
      let storedValue = value;
      if (value.length > 5000) {
        storedValue = COMPRESSION_PREFIX + LZString.compressToUTF16(value);
      }
      localStorage.setItem(key, storedValue);
      return true;
    } catch {
      // Step 2: If still full, try removing old demo data if we are saving prod data
      if (key.includes('prod')) {
        try {
          localStorage.removeItem('flexo_orders_demo_v1');
          localStorage.removeItem('flexo_users_demo_v1');
          let storedValue = value;
          storedValue = COMPRESSION_PREFIX + LZString.compressToUTF16(value);
          localStorage.setItem(key, storedValue);
          return true;
        } catch {
          // Ignore
        }
      }
    }

    console.error(`[safeLocalStorageSet] Unable to store item in localStorage for key "${key}". Data is still preserved in memory and Firestore.`);
    return false;
  }
}

export function safeLocalStorageGet(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    
    if (value.startsWith(COMPRESSION_PREFIX)) {
      const compressedData = value.substring(COMPRESSION_PREFIX.length);
      const decompressed = LZString.decompressFromUTF16(compressedData);
      return decompressed || null;
    }
    
    return value;
  } catch (err) {
    console.warn(`[safeLocalStorageGet] Failed to read key "${key}":`, err);
    return null;
  }
}

export function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[safeLocalStorageRemove] Failed to remove key "${key}":`, err);
  }
}
