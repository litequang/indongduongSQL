/** Converts undefined values to null so merge writes have a stable Firestore payload. */
export function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_, value) => value === undefined ? null : value));
}
