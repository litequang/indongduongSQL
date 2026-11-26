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

const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
let appNo = 0;
const staff = {
  developer: ['u-developer', 'DEVELOPER'], admin: ['u-admin', 'ADMIN'], manager: ['u-manager', 'MANAGER'],
  sale: ['u-sale', 'SALE'], designer: ['u-designer', 'DESIGNER'], printer: ['u-printer', 'PRINTER'],
  printer2: ['u-printer-2', 'PRINTER'], finisher: ['u-finisher', 'FINISHER'], finisher2: ['u-finisher-2', 'FINISHER'],
};
const credentials = Object.fromEntries(Object.keys(staff).map(key => [key, {
  email: `${key}.prompt14@example.test`, password: `Prompt14${key}Pass!`,
}]));
const now = () => new Date().toISOString();
const productionOrder = (id, overrides = {}) => ({
  id, code: id.toUpperCase(), status: 'WAITING_ACCEPTANCE', printerId: 'u-printer', printerName: 'Printer',
  paperType: 'Kraft', totalSheets: 100, plateType: 'NEW', plateStatus: 'RECEIVED', productionRevision: 1,
  printerAcknowledgedRevision: 0, instructionRaw: '100 tờ Kraft', createdBy: 'u-designer', createdByName: 'Designer',
  createdAt: now(), timeline: [], issues: [], comments: [], items: [], ...overrides,
});

async function seedStaff(key) {
  const [id, role] = staff[key];
  const authUser = await adminAuth.createUser({ email: credentials[key].email, password: credentials[key].password });
  await db.collection('users').doc(id).set({ id, name: id, role, active: true, createdAt: now() });
  await db.collection('auth_identities').doc(authUser.uid).set({ businessUserId: id, role, active: true });
}

async function clientAs(key, callback) {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `p14-${++appNo}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
    return await callback(app);
  } finally { await deleteApp(app); }
}

async function callAs(key, name, data) {
  return clientAs(key, async app => {
    const functions = getFunctions(app, 'asia-southeast1');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    return httpsCallable(functions, name)(data);
  });
}

async function directAs(key, callback) {
  return clientAs(key, async app => {
    const firestore = getClientFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    return callback(firestore);
  });
}

async function expectFunctionDenied(label, task, code = 'functions/permission-denied') {
  await assert.rejects(task, error => error?.code === code, `${label}: expected ${code}`);
  console.log(`PASS ${label}`);
}

async function expectRuleDenied(label, task) {
  await assert.rejects(task, error => String(error?.code || '').endsWith('permission-denied'), `${label}: expected permission-denied`);
  console.log(`PASS ${label}`);
}

async function main() {
  await Promise.all(Object.keys(staff).map(seedStaff));

  // Mirror the production health probe exactly: an authenticated privileged
  // identity performs setDoc(..., { merge: true }) with this two-field payload.
  // A legacy diagnostic field must not make an otherwise permitted health
  // update fail; it is not a business record and this probe never changes it.
  await db.collection('_system_health').doc('ping').set({
    lastPing: '2026-08-24T00:00:00.000Z',
    app: 'Flexo Workshop',
    legacyDiagnostic: 'retained-for-compatibility',
  });
  await directAs('developer', firestore => setDoc(doc(firestore, '_system_health', 'ping'), {
    lastPing: now(),
    app: 'Flexo Workshop',
  }, { merge: true }));
  console.log('PASS DEVELOPER health probe updates ping with retained legacy diagnostic fields');
  await expectRuleDenied('PRINTER cannot write the admin health document', directAs('printer', firestore => setDoc(doc(firestore, '_system_health', 'ping'), {
    lastPing: now(),
    app: 'Flexo Workshop',
  }, { merge: true })));

  for (const role of ['manager', 'admin', 'developer']) {
    const id = `revise-${role}`;
    await db.collection('orders').doc(id).set(productionOrder(id));
    await callAs(role, 'reviseProductionOrder', { orderId: id, instructionRaw: `Revision by ${role}` });
    assert.equal((await db.collection('orders').doc(id).get()).get('productionRevision'), 2);
  }
  console.log('PASS MANAGER/ADMIN/DEVELOPER inherit pre-start technical authority');

  await db.collection('orders').doc('assigned-printer').set(productionOrder('assigned-printer'));
  await directAs('printer', firestore => updateDoc(doc(firestore, 'orders', 'assigned-printer'), {
    status: 'ACCEPTED', acceptedAt: now(), printerAcknowledgedRevision: 1,
  }));
  assert.equal((await db.collection('orders').doc('assigned-printer').get()).get('status'), 'ACCEPTED');
  console.log('PASS assigned Printer can accept a valid job');
  // This mirrors the historical repository behavior: it read an entire legacy
  // order in a browser transaction, JSON-serialized it, then merge-set it.
  // Timestamp-valued fields that the Printer did not touch became plain maps,
  // which Rules correctly treated as an unauthorized protected-field edit.
  await db.collection('orders').doc('legacy-assigned-printer').set(productionOrder('legacy-assigned-printer', {
    plateSentAt: new Date(),
    updatedAt: new Date(),
  }));
  await expectRuleDenied('legacy full-document accept rewrite is denied', directAs('printer', firestore => runTransaction(firestore, async transaction => {
    const ref = doc(firestore, 'orders', 'legacy-assigned-printer');
    const current = (await transaction.get(ref)).data();
    transaction.set(ref, JSON.parse(JSON.stringify({
      ...current,
      status: 'ACCEPTED',
      acceptedAt: now(),
      printerAcknowledgedRevision: 1,
      timeline: [{ id: 'legacy-accept' }],
      updatedAt: now(),
    })), { merge: true });
  })));
  await directAs('printer', firestore => updateDoc(doc(firestore, 'orders', 'legacy-assigned-printer'), {
    status: 'ACCEPTED',
    acceptedAt: now(),
    printerAcknowledgedRevision: 1,
    timeline: [{ id: 'legacy-accept' }],
    updatedAt: now(),
  }));
  assert.equal((await db.collection('orders').doc('legacy-assigned-printer').get()).get('status'), 'ACCEPTED');
  console.log('PASS assigned Printer accepts legacy order with only actual fields changed');

  // Prompt 15 Critical #2: the urgent control historically went through
  // saveOrder(), which merge-set the whole legacy document. The DEVELOPER
  // identity and the Rules management inheritance are valid; only the
  // accidental Timestamp rewrite must be denied.
  await db.collection('orders').doc('legacy-developer-urgent').set(productionOrder('legacy-developer-urgent', {
    plateSentAt: new Date(), updatedAt: new Date(),
  }));
  await expectRuleDenied('legacy full-document Developer urgent set is denied before repository fix', directAs('developer', firestore => runTransaction(firestore, async transaction => {
    const ref = doc(firestore, 'orders', 'legacy-developer-urgent');
    const current = (await transaction.get(ref)).data();
    transaction.set(ref, JSON.parse(JSON.stringify({
      ...current, isUrgent: true, urgentReason: 'Developer deadline', urgentSetBy: 'u-developer', urgentSetName: 'developer',
      timeline: [{ id: 'urgent-set' }], updatedAt: now(),
    })), { merge: true });
  })));
  await directAs('developer', firestore => updateDoc(doc(firestore, 'orders', 'legacy-developer-urgent'), {
    isUrgent: true, urgentReason: 'Developer deadline', urgentSetBy: 'u-developer', urgentSetName: 'developer',
    timeline: [{ id: 'urgent-set' }], updatedAt: now(),
  }));
  await directAs('developer', firestore => updateDoc(doc(firestore, 'orders', 'legacy-developer-urgent'), {
    isUrgent: false, urgentReason: null, urgentSetBy: null, urgentSetName: null,
    timeline: [{ id: 'urgent-set' }, { id: 'urgent-clear' }], updatedAt: now(),
  }));
  const legacyUrgent = await db.collection('orders').doc('legacy-developer-urgent').get();
  assert.equal(legacyUrgent.get('isUrgent'), false);
  assert.equal(typeof legacyUrgent.get('plateSentAt')?.toDate, 'function', 'urgent set/clear must retain legacy Timestamp');
  console.log('PASS DEVELOPER sets and clears legacy urgent metadata with minimal fields only');

  for (const role of ['sale', 'designer', 'manager', 'admin', 'developer']) {
    const id = `urgent-${role}`;
    await db.collection('orders').doc(id).set(productionOrder(id));
    await directAs(role, firestore => updateDoc(doc(firestore, 'orders', id), {
      isUrgent: true, urgentReason: `${role} deadline`, urgentSetBy: staff[role][0], urgentSetName: role,
      timeline: [{ id: `urgent-${role}` }], updatedAt: now(),
    }));
    await directAs(role, firestore => updateDoc(doc(firestore, 'orders', id), {
      isUrgent: false, urgentReason: null, urgentSetBy: null, urgentSetName: null,
      timeline: [{ id: `urgent-${role}` }, { id: `clear-${role}` }], updatedAt: now(),
    }));
  }
  console.log('PASS SALE/DESIGNER/MANAGER/ADMIN/DEVELOPER follow canonical urgent set and clear matrix');
  for (const role of ['printer', 'finisher']) {
    const id = `urgent-denied-${role}`;
    await db.collection('orders').doc(id).set(productionOrder(id));
    await expectRuleDenied(`${role} cannot set urgent`, directAs(role, firestore => updateDoc(doc(firestore, 'orders', id), {
      isUrgent: true, urgentReason: 'Denied', urgentSetBy: staff[role][0], urgentSetName: role,
      timeline: [{ id: `urgent-denied-${role}` }], updatedAt: now(),
    })));
  }
  await db.collection('orders').doc('wrong-printer').set(productionOrder('wrong-printer'));
  await expectRuleDenied('wrong Printer cannot accept', directAs('printer2', firestore => updateDoc(doc(firestore, 'orders', 'wrong-printer'), { status: 'ACCEPTED', acceptedAt: now(), printerAcknowledgedRevision: 1 })));
  await db.collection('orders').doc('unassigned-printer').set(productionOrder('unassigned-printer', { printerId: '' }));
  await expectRuleDenied('unassigned Printer cannot accept', directAs('printer', firestore => updateDoc(doc(firestore, 'orders', 'unassigned-printer'), { status: 'ACCEPTED', acceptedAt: now(), printerAcknowledgedRevision: 1 })));
  await db.collection('orders').doc('admin-assigned').set(productionOrder('admin-assigned', { printerId: 'u-admin' }));
  await expectRuleDenied('management cannot impersonate assigned Printer', directAs('admin', firestore => updateDoc(doc(firestore, 'orders', 'admin-assigned'), { status: 'ACCEPTED', acceptedAt: now(), printerAcknowledgedRevision: 1 })));

  for (const role of ['manager', 'admin', 'developer']) {
    const id = `manager-issue-${role}`;
    await db.collection('orders').doc(id).set(productionOrder(id, { issues: [{ id: 'issue', type: 'GENERAL', status: 'OPEN', recipientRoles: ['MANAGER'], recipientUserIds: [], createdBy: 'u-sale', createdAt: now() }] }));
    await callAs(role, 'resolveProductionIssue', { orderId: id, issueId: 'issue' });
    assert.equal((await db.collection('orders').doc(id).get()).get('issues')[0].status, 'RESOLVED');
  }
  console.log('PASS Issue MANAGER recipient supports ordered management inheritance');

  await db.collection('orders').doc('specialist-issue').set(productionOrder('specialist-issue', { issues: [{ id: 'printer-issue', type: 'GENERAL', status: 'OPEN', recipientRoles: ['PRINTER'], recipientUserIds: [], createdBy: 'u-sale', createdAt: now() }] }));
  await expectFunctionDenied('management cannot resolve specialist-recipient Issue', callAs('admin', 'resolveProductionIssue', { orderId: 'specialist-issue', issueId: 'printer-issue' }));
  await callAs('printer', 'resolveProductionIssue', { orderId: 'specialist-issue', issueId: 'printer-issue' });

  await db.collection('orders').doc('user-recipient-issue').set(productionOrder('user-recipient-issue', { issues: [{ id: 'user-issue', type: 'GENERAL', status: 'OPEN', recipientRoles: [], recipientUserIds: ['u-printer-2'], createdBy: 'u-sale', createdAt: now() }] }));
  await expectFunctionDenied('non-recipient cannot resolve explicit-user Issue', callAs('printer', 'resolveProductionIssue', { orderId: 'user-recipient-issue', issueId: 'user-issue' }));
  await callAs('printer2', 'resolveProductionIssue', { orderId: 'user-recipient-issue', issueId: 'user-issue' });
  console.log('PASS exact role and explicit-user Issue recipients can resolve');

  await db.collection('orders').doc('reporter-issue').set(productionOrder('reporter-issue', { issues: [{ id: 'owned-issue', type: 'GENERAL', status: 'OPEN', recipientRoles: ['MANAGER'], recipientUserIds: [], createdBy: 'u-sale', reportedBy: 'u-sale', createdAt: now() }] }));
  await expectFunctionDenied('non-reporter cannot cancel Issue', callAs('admin', 'cancelProductionIssue', { orderId: 'reporter-issue', issueId: 'owned-issue' }));
  await callAs('sale', 'cancelProductionIssue', { orderId: 'reporter-issue', issueId: 'owned-issue' });
  assert.equal((await db.collection('orders').doc('reporter-issue').get()).get('issues')[0].status, 'CANCELLED');
  console.log('PASS reporter cancels own Issue without hard delete');

  await db.collection('sales_order_items').doc('finish-item').set({ id: 'finish-item', salesOrderId: 'so-finish', status: 'READY_FOR_FINISHING', quantity: 10, deletedAt: null });
  await db.collection('finishing_tasks').doc('finish-task').set({ id: 'finish-task', salesOrderId: 'so-finish', salesOrderItemId: 'finish-item', status: 'READY', requiresFinishing: true, createdAt: now() });
  await callAs('finisher', 'claimFinishingTask', { taskId: 'finish-task' });
  assert.equal((await db.collection('finishing_tasks').doc('finish-task').get()).get('claimedBy'), 'u-finisher');
  await expectFunctionDenied('second Finisher cannot steal claim', callAs('finisher2', 'claimFinishingTask', { taskId: 'finish-task' }), 'functions/failed-precondition');

  await db.collection('orders').doc('legacy-finishing').set(productionOrder('legacy-finishing', { status: 'FINISHING', finishing: { finisherId: 'u-finisher', status: 'PENDING' } }));
  await expectFunctionDenied('management cannot start assigned legacy Finishing work', callAs('admin', 'startFinishing', { orderId: 'legacy-finishing' }));
  await callAs('finisher', 'startFinishing', { orderId: 'legacy-finishing' });
  await expectFunctionDenied('management cannot complete assigned legacy Finishing work', callAs('admin', 'completeFinishing', { orderId: 'legacy-finishing' }));
  console.log('PASS legacy Finishing start/complete remain assigned-Finisher only');

  await db.collection('orders').doc('printing-lock').set(productionOrder('printing-lock', { status: 'PRINTING', printerAcknowledgedRevision: 1 }));
  for (const role of ['manager', 'admin', 'developer']) {
    await expectFunctionDenied(`${role} cannot edit technical data after Start`, callAs(role, 'reviseProductionOrder', { orderId: 'printing-lock', instructionRaw: `Forbidden ${role}` }), 'functions/failed-precondition');
  }

  await db.collection('sales_orders').doc('so-partial').set({ id: 'so-partial', code: 'SO-PARTIAL', status: 'READY_TO_SHIP', customerId: 'customer', customerSnapshot: { name: 'Customer' }, deletedAt: null, createdAt: now() });
  await db.collection('sales_order_items').doc('partial-ready').set({ id: 'partial-ready', salesOrderId: 'so-partial', status: 'WAREHOUSE_READY', quantity: 10, deletedAt: null });
  await db.collection('sales_order_items').doc('partial-waiting').set({ id: 'partial-waiting', salesOrderId: 'so-partial', status: 'FINISHING', quantity: 10, deletedAt: null });
  await db.collection('finished_goods').doc('fg-partial').set({ id: 'fg-partial', salesOrderId: 'so-partial', salesOrderItemId: 'partial-ready', productName: 'Ready product', acceptedQuantity: 10, remainingQuantity: 10, status: 'READY', createdAt: now() });
  await expectFunctionDenied('partial warehouse export is denied', callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'so-partial', items: [{ finishedGoodId: 'fg-partial', quantity: 1 }], dispatchMethod: 'INTERNAL_DELIVERY' }), 'functions/failed-precondition');

  const salesOrderDraft = { id: 'so-designer', code: 'SO-DESIGNER', status: 'DRAFT', customerId: 'customer', customerSnapshot: { name: 'Customer' }, saleId: 'u-designer', totalItems: 1, deletedAt: null, createdAt: now() };
  await directAs('designer', async firestore => {
    await setDoc(doc(firestore, 'sales_orders', 'so-designer'), salesOrderDraft);
    await setDoc(doc(firestore, 'sales_order_items', 'so-designer-item'), { id: 'so-designer-item', salesOrderId: 'so-designer', customerId: 'customer', productName: 'Draft product', quantity: 1, status: 'NEW', deletedAt: null, createdAt: now() });
  });
  console.log('PASS Designer can create a Sales Order draft with products');
  await expectRuleDenied('Printer cannot create Sales Order draft', directAs('printer', firestore => setDoc(doc(firestore, 'sales_orders', 'so-printer'), { ...salesOrderDraft, id: 'so-printer', code: 'SO-PRINTER' })));
  await expectRuleDenied('Designer cannot edit commercial Sales Order parent', directAs('designer', firestore => updateDoc(doc(firestore, 'sales_orders', 'so-designer'), { internalNote: 'Commercial edit denied' })));

  console.log('PASS Prompt 14 targeted backend and Rules permission suite');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
