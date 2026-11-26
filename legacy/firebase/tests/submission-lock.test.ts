import assert from 'node:assert/strict';
import { createSynchronousSubmissionLock } from '../src/utils/submissionLock';

const lock = createSynchronousSubmissionLock();

assert.equal(lock.tryAcquire(), true, 'first submit acquires the lock');
assert.equal(lock.tryAcquire(), false, 'same-turn duplicate submit is rejected');
assert.equal(lock.tryAcquire(), false, 'repeated Enter remains rejected while pending');
assert.equal(lock.isLocked(), true, 'lock remains held until the operation settles');

lock.release();
assert.equal(lock.isLocked(), false, 'settlement releases the lock');
assert.equal(lock.tryAcquire(), true, 'a later, intentional submission is accepted');

console.log('PASS synchronous submission lock: duplicate rapid events produce one logical operation');
