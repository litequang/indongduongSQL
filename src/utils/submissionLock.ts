import { useCallback, useRef, useState } from 'react';

/** Protects repeated UI events before React can render a disabled button. */
export function createSynchronousSubmissionLock() {
  let locked = false;
  return {
    tryAcquire: () => {
      if (locked) return false;
      locked = true;
      return true;
    },
    release: () => { locked = false; },
    isLocked: () => locked,
  };
}

export function useSynchronousSubmissionLock(): readonly [boolean, () => boolean, () => void] {
  const lock = useRef(createSynchronousSubmissionLock());
  const [isLocked, setIsLocked] = useState(false);
  const tryAcquire = useCallback(() => {
    const acquired = lock.current.tryAcquire();
    if (acquired) setIsLocked(true);
    return acquired;
  }, []);
  const release = useCallback(() => {
    lock.current.release();
    setIsLocked(false);
  }, []);
  return [isLocked, tryAcquire, release] as const;
}
