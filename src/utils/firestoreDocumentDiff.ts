type FirestoreComparable = Record<string, unknown>;

function isEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftWithIsEqual = left as { isEqual?: (other: unknown) => boolean };
    if (typeof leftWithIsEqual.isEqual === 'function') return leftWithIsEqual.isEqual(right);

    if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => isEquivalent(value, right[index]));
    }

    if (!Array.isArray(left) && !Array.isArray(right)) {
      const leftRecord = left as FirestoreComparable;
      const rightRecord = right as FirestoreComparable;
      const leftKeys = Object.keys(leftRecord);
      const rightKeys = Object.keys(rightRecord);
      return leftKeys.length === rightKeys.length && leftKeys.every(key =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) && isEquivalent(leftRecord[key], rightRecord[key])
      );
    }
  }

  return false;
}

/**
 * A transaction callback works with a full domain object for ergonomics, but a
 * legacy Firestore document may contain Timestamp values or fields unknown to
 * the current UI. Returning the full object to Firestore would serialize those
 * unchanged values again and make Rules treat them as unauthorized edits.
 */
export function changedTopLevelFields<T extends object>(
  before: T,
  after: T,
): Partial<T> {
  const beforeRecord = before as FirestoreComparable;
  const changed: FirestoreComparable = {};
  for (const [key, value] of Object.entries(after as FirestoreComparable)) {
    if (!isEquivalent(beforeRecord[key], value)) {
      changed[key] = value;
    }
  }
  return changed as Partial<T>;
}
