const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { connectFirestoreEmulator, doc, getFirestore: getClientFirestore, setDoc } = require('firebase/firestore');
const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore } = functionsRequire('firebase-admin/firestore');

const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
const users = {
  developer: { id: 'health-developer', role: 'DEVELOPER', email: 'health-developer@example.test' },
  printer: { id: 'health-printer', role: 'PRINTER', email: 'health-printer@example.test' },
};
const password = 'HealthProbePass!';
let appNo = 0;

async function seedUser(user) {
  const authUser = await adminAuth.createUser({ email: user.email, password });
  await db.collection('auth_identities').doc(authUser.uid).set({
    businessUserId: user.id,
    role: user.role,
    active: true,
  });
}

async function asUser(user, callback) {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `health-${++appNo}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, user.email, password);
    const firestore = getClientFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    return await callback(firestore);
  } finally {
    await deleteApp(app);
  }
}

async function expectDenied(task) {
  await assert.rejects(task, error => String(error?.code || '').endsWith('permission-denied'));
}

async function main() {
  await Promise.all(Object.values(users).map(seedUser));
  await db.collection('_system_health').doc('ping').set({
    lastPing: '2026-08-24T00:00:00.000Z',
    app: 'Flexo Workshop',
    legacyDiagnostic: 'retained-for-compatibility',
  });

  const exactProbe = firestore => setDoc(doc(firestore, '_system_health', 'ping'), {
    lastPing: new Date().toISOString(),
    app: 'Flexo Workshop',
  }, { merge: true });

  if (process.env.EXPECT_LEGACY_DENIED === 'true') {
    await expectDenied(asUser(users.developer, exactProbe));
    console.log('PASS pre-fix: authenticated DEVELOPER health probe is DENIED when ping retains a legacy field');
    return;
  }

  await asUser(users.developer, exactProbe);
  const saved = await db.collection('_system_health').doc('ping').get();
  assert.equal(saved.get('legacyDiagnostic'), 'retained-for-compatibility');
  console.log('PASS post-fix: authenticated DEVELOPER exact health probe succeeds and preserves legacy fields');

  await expectDenied(asUser(users.printer, exactProbe));
  console.log('PASS authenticated PRINTER remains denied for the admin-only health document');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
