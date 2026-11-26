import { 
  DocumentReference, 
  SetOptions, 
  WriteBatch, 
  setDoc, 
  updateDoc,
  deleteDoc,
  runTransaction,
  Transaction,
  Firestore
} from 'firebase/firestore';

/**
 * Enterprise Circuit Breaker & Concurrency Controller for Firestore Writes.
 * Strictly guarantees that at most 1 write is in-flight at any moment,
 * and trips a cooldown only for transient stream/transport failures.
 * This completely prevents Firestore Web SDK's internal WriteStream queue exhaustion.
 */

class FirestoreWriteProtector {
  private isCircuitOpen = false;
  private circuitResetTime = 0;
  private inFlight = 0;
  private maxInFlight = 1;
  private coolDownDurationMs = 180000; // 3 minutes cooldown on stream failure

  /**
   * Check if circuit breaker allows attempting writes.
   */
  public canWrite(): boolean {
    if (!this.isCircuitOpen) return this.inFlight < this.maxInFlight;
    if (Date.now() > this.circuitResetTime) {
      // Cooldown expired, half-open
      this.isCircuitOpen = false;
      this.inFlight = 0;
      return true;
    }
    return false;
  }

  /**
   * Trip circuit breaker on critical stream failure or resource exhaustion.
   */
  public tripCircuit(reason?: string) {
    this.isCircuitOpen = true;
    this.circuitResetTime = Date.now() + this.coolDownDurationMs;
    this.inFlight = 0;
    console.warn(`[Firestore SafeWrite] Circuit tripped for ${this.coolDownDurationMs / 1000}s. Reason:`, reason || 'Write stream error / timeout');
  }

  /**
   * Reset circuit manually (e.g. after connection test passes).
   */
  public resetCircuit() {
    this.isCircuitOpen = false;
    this.circuitResetTime = 0;
    this.inFlight = 0;
  }

  /** Execute a single Firestore write operation with concurrency protection. */
  public async executeSafe<T>(
    operation: () => Promise<T>,
    opName = 'Firestore write'
  ): Promise<T> {
    if (!this.canWrite()) {
      throw new Error('Firestore write is temporarily unavailable. Please retry after the connection recovers.');
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Thiết bị đang offline. Firestore chưa thể xác nhận thao tác.');
    }

    this.inFlight++;

    try {
      // Do not race a Firestore write against a local timeout. A timed-out
      // promise cannot cancel the SDK write and could later commit after the
      // UI has reported failure. Resolution here means server acknowledgement.
      const result = await operation();
      return result;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (isTransientFirestoreWriteError(err)) {
        this.tripCircuit(`${opName}: ${msg}`);
      }
      throw toUserFacingFirestoreError(err);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
    }
  }
}

export const firestoreProtector = new FirestoreWriteProtector();

type FirestoreErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable'
  | 'network-request-failed'
  | 'aborted'
  | 'failed-precondition'
  | 'deadline-exceeded'
  | 'resource-exhausted'
  | 'unknown';

function firestoreErrorCode(error: unknown): FirestoreErrorCode {
  const rawCode = String((error as { code?: unknown })?.code || '').toLowerCase();
  const message = String((error as { message?: unknown })?.message || error || '').toLowerCase();
  if (rawCode.includes('permission-denied') || message.includes('permission-denied')) return 'permission-denied';
  if (rawCode.includes('unauthenticated') || message.includes('unauthenticated')) return 'unauthenticated';
  if (rawCode.includes('unavailable') || message.includes('unavailable')) return 'unavailable';
  if (rawCode.includes('network-request-failed') || message.includes('network request failed')) return 'network-request-failed';
  if (rawCode.includes('aborted') || message.includes('aborted')) return 'aborted';
  if (rawCode.includes('failed-precondition') || message.includes('failed-precondition')) return 'failed-precondition';
  if (rawCode.includes('deadline-exceeded') || message.includes('deadline-exceeded')) return 'deadline-exceeded';
  if (rawCode.includes('resource-exhausted') || message.includes('resource-exhausted')) return 'resource-exhausted';
  return 'unknown';
}

function isTransientFirestoreWriteError(error: unknown): boolean {
  return ['unavailable', 'network-request-failed', 'deadline-exceeded', 'resource-exhausted'].includes(firestoreErrorCode(error));
}

/** Converts known Firestore failures into an accurate, non-sensitive UI message. */
export function toUserFacingFirestoreError(error: unknown): Error {
  const code = firestoreErrorCode(error);
  const messages: Record<FirestoreErrorCode, string> = {
    'permission-denied': 'Bạn không có quyền thực hiện thao tác này.',
    unauthenticated: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    unavailable: 'Dịch vụ Firestore đang tạm thời không khả dụng. Vui lòng thử lại.',
    'network-request-failed': 'Không thể kết nối đến Firestore. Vui lòng kiểm tra mạng và thử lại.',
    aborted: 'Thao tác bị xung đột với một cập nhật khác. Vui lòng tải lại dữ liệu và thử lại.',
    'failed-precondition': 'Dữ liệu hiện tại không thỏa điều kiện để thực hiện thao tác.',
    'deadline-exceeded': 'Kết nối đến Firestore quá thời gian chờ. Vui lòng thử lại.',
    'resource-exhausted': 'Firestore đang quá tải tạm thời. Vui lòng thử lại sau ít phút.',
    unknown: 'Không thể hoàn tất thao tác với Firestore. Vui lòng thử lại.',
  };
  const normalized = new Error(messages[code]);
  (normalized as Error & { code?: FirestoreErrorCode }).code = code;
  return normalized;
}

/**
 * Safe setDoc that never crashes on stream resource exhaustion.
 */
export async function safeFirestoreSetDoc<T extends object>(
  docRef: DocumentReference<T>,
  data: Partial<T>,
  options?: SetOptions
): Promise<void> {
  await firestoreProtector.executeSafe(async () => {
    if (options) {
      await setDoc(docRef, data as any, options);
    } else {
      await setDoc(docRef, data as any);
    }
  }, `setDoc(${docRef.path})`);
}

/**
 * Update a document and propagate every Firestore failure to the caller.
 * This deliberately has no local/offline-success fallback: callers may update
 * their cache only after this promise resolves.
 */
export async function safeFirestoreUpdateDoc<T extends object>(
  docRef: DocumentReference,
  data: T
): Promise<void> {
  await firestoreProtector.executeSafe(async () => {
    await updateDoc(docRef, data as any);
  }, `updateDoc(${docRef.path})`);
}

/**
 * Safe deleteDoc that never crashes on stream resource exhaustion.
 */
export async function safeFirestoreDeleteDoc(
  docRef: DocumentReference
): Promise<void> {
  await firestoreProtector.executeSafe(async () => {
    await deleteDoc(docRef);
  }, `deleteDoc(${docRef.path})`);
}

/**
 * Safe batch.commit that never crashes on stream resource exhaustion.
 */
export async function safeFirestoreBatchCommit(
  batch: WriteBatch
): Promise<void> {
  await firestoreProtector.executeSafe(async () => {
    await batch.commit();
  }, 'batch.commit');
}

/**
 * Safe runTransaction that executes within the concurrency protector.
 * Firestore owns transaction retry/acknowledgement; failures are rethrown.
 */
export async function safeFirestoreRunTransaction<T>(
  db: Firestore,
  updateFunction: (transaction: Transaction) => Promise<T>,
  _timeoutMs = 5000
): Promise<T> {
  void _timeoutMs; // kept for backward-compatible call sites
  return firestoreProtector.executeSafe(async () => runTransaction(db, updateFunction), 'runTransaction');
}
