import assert from 'node:assert/strict';
import type { User } from '../src/types';
import {
  canUseDeveloperDemoPreview,
  DEVELOPER_DEMO_PREVIEW_ROLES,
  getEffectiveUiUser,
  parsePersistedDeveloperDemoPreview,
  serializeDeveloperDemoPreview,
} from '../src/utils/developerDemoPreview';

const realDeveloper: User = {
  id: 'u-dev',
  legacyUserId: 'u-dev',
  firebaseUid: 'firebase-developer-uid',
  name: 'Verified Developer',
  role: 'DEVELOPER',
  avatar: '',
  phone: '',
  username: 'developer',
  pin: '',
  active: true,
  createdAt: '2026-08-22T00:00:00.000Z',
};

const printer: User = {
  ...realDeveloper,
  id: 'u-printer',
  legacyUserId: 'u-printer',
  name: 'Printer Preview Profile',
  role: 'PRINTER',
  firebaseUid: undefined,
};

assert.equal(canUseDeveloperDemoPreview(realDeveloper), true, 'verified Developer may enable UI preview');
assert.equal(canUseDeveloperDemoPreview({ ...realDeveloper, role: 'ADMIN' }), false, 'Admin may not enable UI preview');
assert.equal(canUseDeveloperDemoPreview({ ...realDeveloper, role: 'PRINTER' }), false, 'Printer may not enable UI preview');
assert.equal(canUseDeveloperDemoPreview({ ...realDeveloper, active: false }), false, 'inactive Developer may not enable UI preview');

const persisted = serializeDeveloperDemoPreview(realDeveloper.firebaseUid!, 'PRINTER');
assert.deepEqual(parsePersistedDeveloperDemoPreview(persisted, realDeveloper.firebaseUid!), {
  uid: realDeveloper.firebaseUid,
  enabled: true,
  previewRole: 'PRINTER',
});
assert.equal(parsePersistedDeveloperDemoPreview(persisted, 'another-firebase-uid'), null, 'preview state must not cross Firebase users');
assert.equal(
  parsePersistedDeveloperDemoPreview(JSON.stringify({ uid: realDeveloper.firebaseUid, enabled: true, previewRole: 'UNTRUSTED_ROLE' }), realDeveloper.firebaseUid!),
  null,
  'invalid persisted roles must be rejected',
);

const printerUiUser = getEffectiveUiUser(realDeveloper, [realDeveloper, printer], true, 'PRINTER');
assert.equal(printerUiUser.role, 'PRINTER', 'Printer preview uses the printer UI role');
assert.equal(printerUiUser.id, 'u-printer', 'Printer preview can reuse assigned-order presentation data');
assert.equal(realDeveloper.role, 'DEVELOPER', 'preview must not mutate real authenticated role');
assert.equal(realDeveloper.firebaseUid, 'firebase-developer-uid', 'preview must not mutate Firebase identity');
assert.strictEqual(getEffectiveUiUser(realDeveloper, [realDeveloper, printer], false, 'PRINTER'), realDeveloper, 'toggle off restores real Developer UI');

for (const role of ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER']) {
  assert.equal(DEVELOPER_DEMO_PREVIEW_ROLES.includes(role as typeof DEVELOPER_DEMO_PREVIEW_ROLES[number]), true, `${role} must be selectable for preview`);
}

console.log('PASS DEVELOPER DEMO PREVIEW: Developer-only, UID-scoped persistence, role presentation, real identity preservation, and toggle-off restoration');
