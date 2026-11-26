const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { connectFirestoreEmulator, doc, getFirestore: getClientFirestore, runTransaction, setDoc, updateDoc } = require('firebase/firestore');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');
const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore } = functionsRequire('firebase-admin/firestore');
const { StaffProvisioningService, ProvisioningError } = functionsRequire('./lib/staffProvisioningService.js');

const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
let appNumber = 0;

const credentials = {
  developer: { email: 'developer@example.test', password: 'DeveloperPass123!' },
  admin: { email: 'admin@example.test', password: 'AdminPass123!' },
  printer: { email: 'printer@example.test', password: 'PrinterPass123!' },
  sale: { email: 'sale@example.test', password: 'SalePass123!' },
  designer: { email: 'designer@example.test', password: 'DesignerPass123!' },
};

function roleProfile(id, name, role) {
  return { id, name, role, active: true, createdAt: new Date().toISOString() };
}

async function seedAuthenticatedStaff(key, businessUserId, role) {
  const credential = credentials[key];
  const authUser = await adminAuth.createUser({ email: credential.email, password: credential.password, displayName: key });
  await db.collection('users').doc(businessUserId).set(roleProfile(businessUserId, key, role));
  await db.collection('auth_identities').doc(authUser.uid).set({ businessUserId, role, active: true });
}

async function callAs(key, functionName, data) {
  const config = { apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
  const app = initializeApp(config, `provisioning-test-${++appNumber}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
    const functions = getFunctions(app, 'asia-southeast1');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    return await httpsCallable(functions, functionName)(data);
  } finally {
    await deleteApp(app);
  }
}

async function directAsCredentials(email, password, callback) {
  const config = { apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId };
  const app = initializeApp(config, `printer-accept-rules-${++appNumber}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, email, password);
    const firestore = getClientFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    return await callback(firestore);
  } finally {
    await deleteApp(app);
  }
}

async function expectFunctionError(label, task, expectedCode) {
  await assert.rejects(task, (error) => error?.code === expectedCode, `${label}: expected ${expectedCode}`);
  console.log(`PASS ${label}`);
}

async function expectFirestorePermissionDenied(label, task) {
  await assert.rejects(task, (error) => String(error?.code || '').endsWith('permission-denied'), `${label}: expected permission-denied`);
  console.log(`PASS ${label}`);
}

async function identityFor(businessUserId) {
  const snapshot = await db.collection('auth_identities').where('businessUserId', '==', businessUserId).get();
  assert.equal(snapshot.size, 1, `expected exactly one identity for ${businessUserId}`);
  return snapshot.docs[0];
}

async function testCallableProvisioning() {
  await Promise.all([
    seedAuthenticatedStaff('developer', 'u-developer-1', 'DEVELOPER'),
    seedAuthenticatedStaff('admin', 'u-admin-1', 'ADMIN'),
    seedAuthenticatedStaff('printer', 'u-printer-caller', 'PRINTER'),
    seedAuthenticatedStaff('sale', 'u-sale-caller', 'SALE'),
    seedAuthenticatedStaff('designer', 'u-designer-caller', 'DESIGNER'),
  ]);

  const developerCreate = await callAs('developer', 'provisionStaffUser', {
    mode: 'new', name: 'Printer Created By Developer', email: 'printer.dev.created@example.test', initialPassword: 'PrinterCreated123!', role: 'PRINTER', phone: '0900000001', active: true,
  });
  assert.equal(developerCreate.data.role, 'PRINTER');
  assert.equal(developerCreate.data.mode, 'new');
  assert.equal('firebaseUid' in developerCreate.data, false, 'callable must not expose Firebase UID');
  const developerBusinessUserId = developerCreate.data.businessUserId;
  const developerProfile = await db.collection('users').doc(developerBusinessUserId).get();
  assert.equal(developerProfile.get('role'), 'PRINTER');
  assert.equal(developerProfile.get('email'), 'printer.dev.created@example.test');
  assert.equal(Object.prototype.hasOwnProperty.call(developerProfile.data(), 'initialPassword'), false);
  const developerIdentity = await identityFor(developerBusinessUserId);
  assert.equal(developerIdentity.get('role'), 'PRINTER');
  await adminAuth.getUserByEmail('printer.dev.created@example.test');
  console.log('PASS DEVELOPER creates PRINTER with Auth + profile + identity');

  const printerA = await callAs('developer', 'provisionStaffUser', {
    mode: 'new', name: 'Printer Accept A', email: 'printer.accept.a@example.test', initialPassword: 'PrinterAcceptA123!', role: 'PRINTER', active: true,
  });
  const printerB = await callAs('developer', 'provisionStaffUser', {
    mode: 'new', name: 'Printer Accept B', email: 'printer.accept.b@example.test', initialPassword: 'PrinterAcceptB123!', role: 'PRINTER', active: true,
  });
  const acceptedAt = new Date().toISOString();
  const legacyOrder = {
    id: 'legacy-printer-accept', code: 'LEGACY-PRINTER-ACCEPT', status: 'WAITING_ACCEPTANCE',
    printerId: printerA.data.businessUserId, printerName: 'Printer Accept A',
    paperType: 'Kraft', totalSheets: 100, plateType: 'NEW', plateStatus: 'RECEIVED',
    productionRevision: 1, printerAcknowledgedRevision: 0, instructionRaw: 'Legacy Timestamp accept',
    createdBy: 'u-designer-caller', createdByName: 'designer', createdAt: acceptedAt,
    timeline: [], issues: [], comments: [], items: [], plateSentAt: new Date(), updatedAt: new Date(),
  };
  await db.collection('orders').doc(legacyOrder.id).set(legacyOrder);
  await expectFirestorePermissionDenied('legacy full-document Printer accept is denied before repository fix', () => directAsCredentials(
    'printer.accept.a@example.test', 'PrinterAcceptA123!', firestore => runTransaction(firestore, async transaction => {
      const orderRef = doc(firestore, 'orders', legacyOrder.id);
      const current = (await transaction.get(orderRef)).data();
      transaction.set(orderRef, JSON.parse(JSON.stringify({
        ...current, status: 'ACCEPTED', acceptedAt, printerAcknowledgedRevision: 1,
        timeline: [{ id: 'accept', at: acceptedAt }], updatedAt: acceptedAt,
      })), { merge: true });
    }),
  ));
  await directAsCredentials('printer.accept.a@example.test', 'PrinterAcceptA123!', firestore => runTransaction(firestore, async transaction => {
    const orderRef = doc(firestore, 'orders', legacyOrder.id);
    await transaction.get(orderRef);
    transaction.update(orderRef, {
      status: 'ACCEPTED', acceptedAt, printerAcknowledgedRevision: 1,
      timeline: [{ id: 'accept', at: acceptedAt }], updatedAt: acceptedAt,
    });
  }));
  const acceptedLegacyOrder = await db.collection('orders').doc(legacyOrder.id).get();
  assert.equal(acceptedLegacyOrder.get('status'), 'ACCEPTED');
  assert.equal(typeof acceptedLegacyOrder.get('plateSentAt')?.toDate, 'function', 'legacy Timestamp must remain untouched');
  console.log('PASS canonical-provisioned assigned Printer accepts legacy Timestamp order with minimal transaction payload');

  await db.collection('orders').doc('wrong-printer-accept').set({ ...legacyOrder, id: 'wrong-printer-accept', code: 'WRONG-PRINTER-ACCEPT', status: 'WAITING_ACCEPTANCE', printerAcknowledgedRevision: 0 });
  await expectFirestorePermissionDenied('canonical-provisioned wrong Printer cannot accept assigned job', () => directAsCredentials(
    'printer.accept.b@example.test', 'PrinterAcceptB123!', firestore => updateDoc(doc(firestore, 'orders', 'wrong-printer-accept'), {
      status: 'ACCEPTED', acceptedAt, printerAcknowledgedRevision: 1,
    }),
  ));

  const adminCreate = await callAs('admin', 'provisionStaffUser', {
    mode: 'new', name: 'Printer Created By Admin', email: 'printer.admin.created@example.test', initialPassword: 'PrinterCreated123!', role: 'PRINTER', active: true,
  });
  assert.equal(adminCreate.data.role, 'PRINTER');
  console.log('PASS ADMIN creates PRINTER');

  await expectFunctionError('PRINTER cannot provision staff', () => callAs('printer', 'provisionStaffUser', {
    mode: 'new', name: 'Denied Printer', email: 'denied.printer@example.test', initialPassword: 'DeniedPass123!', role: 'PRINTER',
  }), 'functions/permission-denied');
  await expectFunctionError('SALE cannot provision staff', () => callAs('sale', 'provisionStaffUser', {
    mode: 'new', name: 'Denied Sale', email: 'denied.sale@example.test', initialPassword: 'DeniedPass123!', role: 'PRINTER',
  }), 'functions/permission-denied');
  await expectFunctionError('DESIGNER cannot provision staff', () => callAs('designer', 'provisionStaffUser', {
    mode: 'new', name: 'Denied Designer', email: 'denied.designer@example.test', initialPassword: 'DeniedPass123!', role: 'PRINTER',
  }), 'functions/permission-denied');
  await expectFunctionError('ADMIN cannot create DEVELOPER', () => callAs('admin', 'provisionStaffUser', {
    mode: 'new', name: 'Denied Developer', email: 'denied.developer@example.test', initialPassword: 'DeniedPass123!', role: 'DEVELOPER',
  }), 'functions/permission-denied');

  await db.collection('users').doc('u-printer-vinh').set(roleProfile('u-printer-vinh', 'Existing Printer Vinh', 'PRINTER'));
  const linkResult = await callAs('admin', 'provisionStaffUser', {
    mode: 'linkExisting', existingBusinessUserId: 'u-printer-vinh', email: 'printer.vinh@example.test', initialPassword: 'ExistingPrinter123!',
  });
  assert.equal(linkResult.data.businessUserId, 'u-printer-vinh');
  assert.equal(linkResult.data.mode, 'linkExisting');
  assert.equal((await db.collection('users').doc('u-printer-vinh').get()).get('name'), 'Existing Printer Vinh');
  await identityFor('u-printer-vinh');
  console.log('PASS existing business user links Firebase Auth without duplicate profile');

  const duplicateRequest = {
    mode: 'new', name: 'Double Submit', email: 'double.submit@example.test', initialPassword: 'DoubleSubmit123!', role: 'PRINTER', active: true,
  };
  const duplicateResults = await Promise.allSettled([
    callAs('developer', 'provisionStaffUser', duplicateRequest),
    callAs('developer', 'provisionStaffUser', duplicateRequest),
  ]);
  assert.equal(duplicateResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(duplicateResults.filter((result) => result.status === 'rejected' && result.reason?.code === 'functions/already-exists').length, 1);
  await adminAuth.getUserByEmail('double.submit@example.test');
  const doubleProfiles = await db.collection('users').where('email', '==', 'double.submit@example.test').get();
  assert.equal(doubleProfiles.size, 1);
  await identityFor(doubleProfiles.docs[0].id);
  console.log('PASS double submit leaves one Auth user, profile, and identity');

  await callAs('developer', 'setStaffActive', { businessUserId: developerBusinessUserId, active: false });
  assert.equal((await db.collection('users').doc(developerBusinessUserId).get()).get('active'), false);
  assert.equal((await identityFor(developerBusinessUserId)).get('active'), false);
  assert.equal((await adminAuth.getUser(developerIdentity.id)).disabled, true);
  await callAs('developer', 'setStaffActive', { businessUserId: developerBusinessUserId, active: true });
  assert.equal((await db.collection('users').doc(developerBusinessUserId).get()).get('active'), true);
  assert.equal((await identityFor(developerBusinessUserId)).get('active'), true);
  assert.equal((await adminAuth.getUser(developerIdentity.id)).disabled, false);
  console.log('PASS deactivate/reactivate synchronizes Auth, profile, and identity');

  await callAs('developer', 'changeStaffRole', { businessUserId: developerBusinessUserId, role: 'FINISHER' });
  assert.equal((await db.collection('users').doc(developerBusinessUserId).get()).get('role'), 'FINISHER');
  assert.equal((await identityFor(developerBusinessUserId)).get('role'), 'FINISHER');
  console.log('PASS privileged role change synchronizes profile and identity');

  await callAs('developer', 'resetStaffPassword', { businessUserId: developerBusinessUserId, temporaryPassword: 'ResetPassword123!' });
  const resetApp = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `reset-login-${++appNumber}`);
  try {
    const resetAuth = getAuth(resetApp);
    connectAuthEmulator(resetAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(resetAuth, 'printer.dev.created@example.test', 'ResetPassword123!');
  } finally {
    await deleteApp(resetApp);
  }
  const auditDocs = await db.collection('audit_logs').get();
  auditDocs.forEach((document) => {
    const serialized = JSON.stringify(document.data());
    assert.equal(serialized.includes('ResetPassword123!'), false, 'audit log must never store a password');
    assert.equal(serialized.includes('PrinterCreated123!'), false, 'audit log must never store an initial password');
  });
  console.log('PASS password reset works without password storage');
}

async function testDirectBrowserWriteProtection() {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `rules-test-${++appNumber}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, credentials.admin.email, credentials.admin.password);
    const firestore = getClientFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);

    await expectFirestorePermissionDenied('browser cannot create auth_identities', () => setDoc(
      doc(firestore, 'auth_identities', 'browser-created-identity'),
      { businessUserId: 'u-browser-created', role: 'DEVELOPER', active: true },
    ));
    await expectFirestorePermissionDenied('browser cannot create staff profiles directly', () => setDoc(
      doc(firestore, 'users', 'u-browser-created'),
      roleProfile('u-browser-created', 'Browser Created', 'DEVELOPER'),
    ));
    await expectFirestorePermissionDenied('browser cannot grant itself a role', () => updateDoc(
      doc(firestore, 'users', 'u-admin-1'), { role: 'DEVELOPER' },
    ));
    await expectFirestorePermissionDenied('browser cannot change staff active status', () => updateDoc(
      doc(firestore, 'users', 'u-admin-1'), { active: false },
    ));
  } finally {
    await deleteApp(app);
  }
}

function fakeSnapshot(data, exists = true) {
  return { exists, data: () => data, get: (key) => data[key] };
}

async function testRollbackRecovery() {
  let deletedUid = null;
  const references = new Map();
  const ref = (collection, id) => {
    const documentId = id || `auto-${references.size + 1}`;
    return {
      collection,
      id: documentId,
      get: async () => (
        collection === 'auth_identities' && documentId === 'caller-auth'
          ? fakeSnapshot({ businessUserId: 'u-developer-1', role: 'DEVELOPER', active: true })
          : fakeSnapshot({}, false)
      ),
    };
  };
  const fakeDb = {
    collection(collectionName) {
      return {
        doc(id) { return ref(collectionName, id); },
        where() { return { limit() { return { get: async () => ({ empty: true, size: 0, docs: [] }) }; } }; },
      };
    },
    async runTransaction(callback) {
      return callback({
        get: async (documentRef) => {
          if (documentRef.collection === 'auth_identities' && documentRef.id === 'caller-auth') {
            return fakeSnapshot({ businessUserId: 'u-developer-1', role: 'DEVELOPER', active: true });
          }
          return fakeSnapshot({}, false);
        },
        set() {},
      });
    },
    batch() {
      return {
        create() {}, update() {},
        commit: async () => { throw new Error('simulated Firestore batch failure'); },
      };
    },
  };
  const fakeAuth = {
    createUser: async () => ({ uid: 'orphan-candidate' }),
    deleteUser: async (uid) => { deletedUid = uid; },
    updateUser: async () => undefined,
  };
  const service = new StaffProvisioningService(fakeAuth, fakeDb);
  await assert.rejects(
    () => service.provision('caller-auth', { mode: 'new', name: 'Rollback Test', email: 'rollback@example.test', initialPassword: 'RollbackPass123!', role: 'PRINTER' }),
    (error) => error instanceof ProvisioningError && error.code === 'internal',
  );
  assert.equal(deletedUid, 'orphan-candidate');
  console.log('PASS Auth account is rolled back after simulated Firestore provisioning failure');
}

async function main() {
  await testCallableProvisioning();
  await testDirectBrowserWriteProtection();
  await testRollbackRecovery();
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
