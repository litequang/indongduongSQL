/* Pre-pilot callable-workflow and direct-write regression suite. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { collection, connectFirestoreEmulator, doc, getDocs, getFirestore: getClientFirestore, orderBy, query, setDoc, updateDoc, where } = require('firebase/firestore');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');
const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore } = functionsRequire('firebase-admin/firestore');

const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
let appNo = 0;
const credentials = Object.fromEntries(['admin', 'sale', 'designer', 'printer', 'printer2', 'finisher', 'finisher2'].map((key) => [key, {
  email: `${key}.workflow@example.test`, password: `${key[0].toUpperCase()}${key.slice(1)}Pass123!`,
}]));

const profile = (id, role) => ({ id, name: id, role, active: true, createdAt: new Date().toISOString() });
const order = (id, overrides = {}) => ({
  id, code: id.toUpperCase(), status: 'ACCEPTED', printerId: 'u-printer', printerName: 'Printer',
  paperType: 'Kraft', totalSheets: 100, plateType: 'NEW', plateStatus: 'RECEIVED', hasBlockingIssue: false,
  productionRevision: 1, printerAcknowledgedRevision: 1, instructionRaw: '100 tờ Kraft', createdBy: 'u-designer',
  createdAt: new Date().toISOString(), timeline: [], issues: [], comments: [], items: [], ...overrides,
});

async function seedStaff(key, id, role) {
  const user = await adminAuth.createUser({ email: credentials[key].email, password: credentials[key].password });
  await db.collection('users').doc(id).set(profile(id, role));
  await db.collection('auth_identities').doc(user.uid).set({ businessUserId: id, role, active: true });
}

async function callAs(key, name, data) {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `workflow-${++appNo}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
    const functions = getFunctions(app, 'asia-southeast1');
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    return await httpsCallable(functions, name)(data);
  } finally { await deleteApp(app); }
}

async function expectError(label, task, code) {
  await assert.rejects(task, (error) => error?.code === code, `${label}: expected ${code}`);
  console.log(`PASS ${label}`);
}

async function directFirestoreAs(key, callback) {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `workflow-rules-${++appNo}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
    const firestore = getClientFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    return await callback(firestore);
  } finally { await deleteApp(app); }
}

async function expectDirectDenied(label, task) {
  await assert.rejects(task, (error) => String(error?.code || '').endsWith('permission-denied'), `${label}: expected permission-denied`);
  console.log(`PASS ${label}`);
}

async function main() {
  await Promise.all([
    seedStaff('admin', 'u-admin', 'ADMIN'), seedStaff('sale', 'u-sale', 'SALE'), seedStaff('designer', 'u-designer', 'DESIGNER'),
    seedStaff('printer', 'u-printer', 'PRINTER'), seedStaff('printer2', 'u-printer-2', 'PRINTER'),
    seedStaff('finisher', 'u-finisher', 'FINISHER'), seedStaff('finisher2', 'u-finisher-2', 'FINISHER'),
  ]);

  // Active-list records always retain deletedAt:null and can be queried in realtime-safe order.
  await directFirestoreAs('sale', async (firestore) => {
    const now = new Date().toISOString();
    await setDoc(doc(firestore, 'customers', 'customer-active'), { id: 'customer-active', name: 'Active customer', code: 'KH-TEST', phone: '0900 123 456', phoneNormalized: '0900123456', deletedAt: null, createdAt: now });
    await setDoc(doc(firestore, 'sales_orders', 'so-draft-list'), { id: 'so-draft-list', code: 'SO-DRAFT-LIST', status: 'DRAFT', customerId: 'customer-active', customerSnapshot: { name: 'Active customer' }, saleId: 'u-sale', totalItems: 0, deletedAt: null, createdAt: now });
    const [customers, salesOrders, duplicatePhone] = await Promise.all([
      getDocs(query(collection(firestore, 'customers'), where('deletedAt', '==', null), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(firestore, 'sales_orders'), where('deletedAt', '==', null), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(firestore, 'customers'), where('phoneNormalized', 'in', ['0900123456']), where('deletedAt', '==', null))),
    ]);
    assert(customers.docs.some((snapshot) => snapshot.id === 'customer-active'));
    assert(salesOrders.docs.some((snapshot) => snapshot.id === 'so-draft-list'));
    assert.equal(duplicatePhone.size, 1);
  });
  console.log('PASS active customer and sales-order list records use deletedAt:null');

  // Plate metadata and issues are parallel; neither creates a backend deadlock.
  await db.collection('orders').doc('plate-order').set(order('plate-order'));
  await callAs('printer', 'reportBrokenPlate', { orderId: 'plate-order', reason: 'Kẽm rách' });
  let plate = await db.collection('orders').doc('plate-order').get();
  assert.equal(plate.get('plateStatus'), 'PLATE_DAMAGED');
  assert.equal(plate.get('hasBlockingIssue'), false);
  await expectDirectDenied('printer cannot mark a damaged plate received directly', () => directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'plate-order'), { plateStatus: 'RECEIVED' })));
  await callAs('designer', 'reissuePlate', { orderId: 'plate-order' });
  plate = await db.collection('orders').doc('plate-order').get();
  await callAs('printer', 'receivePlate', { orderId: 'plate-order' });
  plate = await db.collection('orders').doc('plate-order').get();
  assert.equal(plate.get('issues')[0].status, 'OPEN');
  await directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'plate-order'), { status: 'PRINTING', printingStartedAt: new Date().toISOString() }));
  assert.equal((await db.collection('orders').doc('plate-order').get()).get('issues')[0].status, 'OPEN');
  console.log('PASS plate metadata and open issues do not block Start Print or auto-resolve');

  await db.collection('orders').doc('missing-plate-order').set(order('missing-plate-order', { plateStatus: 'NOT_SENT', status: 'WAITING_ACCEPTANCE' }));
  await Promise.all(Array.from({ length: 4 }, () => callAs('printer', 'reportBrokenPlate', { orderId: 'missing-plate-order' })));
  let missingPlate = await db.collection('orders').doc('missing-plate-order').get();
  assert.equal(missingPlate.get('plateStatus'), 'NOT_SENT');
  assert.equal(missingPlate.get('issues').length, 1);
  assert.equal(missingPlate.get('issues')[0].issueType, 'PLATE_NOT_SENT');
  assert.equal(missingPlate.get('hasBlockingIssue'), false);
  await callAs('designer', 'sendPlate', { orderId: 'missing-plate-order' });
  await callAs('printer', 'receivePlate', { orderId: 'missing-plate-order' });
  missingPlate = await db.collection('orders').doc('missing-plate-order').get();
  assert.equal(missingPlate.get('issues')[0].status, 'OPEN');
  assert.equal(missingPlate.get('hasBlockingIssue'), false);
  await callAs('designer', 'resolveProductionIssue', { orderId: 'missing-plate-order', issueId: missingPlate.get('issues')[0].id });
  assert.equal((await db.collection('orders').doc('missing-plate-order').get()).get('issues')[0].status, 'RESOLVED');
  console.log('PASS missing plate issue is idempotent and resolved explicitly by its recipient');

  await db.collection('orders').doc('initial-plate-order').set(order('initial-plate-order', { plateStatus: 'NOT_SENT', status: 'WAITING_ACCEPTANCE' }));
  await expectDirectDenied('browser cannot send a plate directly', () => directFirestoreAs('designer', (firestore) => updateDoc(doc(firestore, 'orders', 'initial-plate-order'), { plateStatus: 'SENT' })));
  await callAs('designer', 'sendPlate', { orderId: 'initial-plate-order', plateNote: 'Initial plate' });
  assert.equal((await db.collection('orders').doc('initial-plate-order').get()).get('plateStatus'), 'SENT');
  console.log('PASS initial plate is sent through the callable workflow');

  // Issue resolution is recipient-based and always preserves production state.
  await db.collection('orders').doc('generic-issue-order').set(order('generic-issue-order', {
    status: 'PRINTED',
    issues: [{ id: 'machine-issue', type: 'MACHINE_ISSUE', status: 'OPEN', isBlocking: false, recipientRoles: ['MANAGER'], createdAt: new Date().toISOString() }],
  }));
  await expectError('printer cannot resolve a management issue', () => callAs('printer', 'resolveProductionIssue', { orderId: 'generic-issue-order', issueId: 'machine-issue' }), 'functions/permission-denied');
  await callAs('admin', 'resolveProductionIssue', { orderId: 'generic-issue-order', issueId: 'machine-issue' });
  const genericIssueOrder = await db.collection('orders').doc('generic-issue-order').get();
  assert.equal(genericIssueOrder.get('status'), 'PRINTED');
  assert.equal(genericIssueOrder.get('issues')[0].status, 'RESOLVED');
  console.log('PASS management issue resolution preserves the production state');

  await db.collection('orders').doc('machine-issue-order').set(order('machine-issue-order', { status: 'WAITING_PRINT', plateStatus: 'RECEIVED' }));
  await Promise.all(Array.from({ length: 4 }, (_, index) => callAs('printer', 'reportProductionIssue', { orderId: 'machine-issue-order', issueType: 'MACHINE', message: `Press fault ${index}`, recipientRoles: ['MANAGER'], urgent: index === 0 })));
  const machineIssueOrder = await db.collection('orders').doc('machine-issue-order').get();
  assert.equal(machineIssueOrder.get('issues').length, 4);
  assert.equal(machineIssueOrder.get('issues')[0].ownerRole, 'MANAGER');
  assert.equal(machineIssueOrder.get('issues').some((issue) => issue.priority === 'URGENT'), true);
  assert.equal(machineIssueOrder.get('issues')[0].isBlocking, false);
  assert.equal(machineIssueOrder.get('hasBlockingIssue'), false);
  await expectError('printer cannot resolve machine issue', () => callAs('printer', 'resolveProductionIssue', { orderId: 'machine-issue-order', issueId: machineIssueOrder.get('issues')[0].id }), 'functions/permission-denied');
  await callAs('admin', 'resolveProductionIssue', { orderId: 'machine-issue-order', issueId: machineIssueOrder.get('issues')[0].id });
  assert.equal((await db.collection('orders').doc('machine-issue-order').get()).get('status'), 'WAITING_PRINT');
  console.log('PASS parallel, urgent machine issues remain non-blocking and recipient resolution preserves state');

  const cancelledIssue = await callAs('printer', 'reportProductionIssue', { orderId: 'machine-issue-order', issueType: 'GENERAL', message: 'Reported by mistake', recipientRoles: ['MANAGER'] });
  await expectError('non-reporter cannot cancel an issue', () => callAs('admin', 'cancelProductionIssue', { orderId: 'machine-issue-order', issueId: cancelledIssue.data.issueId }), 'functions/permission-denied');
  await callAs('printer', 'cancelProductionIssue', { orderId: 'machine-issue-order', issueId: cancelledIssue.data.issueId });
  assert.equal((await db.collection('orders').doc('machine-issue-order').get()).get('issues').find((issue) => issue.id === cancelledIssue.data.issueId).status, 'CANCELLED');
  console.log('PASS reporter cancellation keeps issue history without changing workflow state');

  // Revision acknowledgement and reassignment are enforced by callable + Rules.
  await db.collection('orders').doc('revision-order').set(order('revision-order', { status: 'WAITING_ACCEPTANCE', printerAcknowledgedRevision: 0 }));
  await directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { status: 'ACCEPTED', acceptedAt: new Date().toISOString(), printerAcknowledgedRevision: 1 }));
  await callAs('designer', 'reviseProductionOrder', { orderId: 'revision-order', instructionRaw: 'Thông tin kỹ thuật phiên bản 2' });
  assert.equal((await db.collection('orders').doc('revision-order').get()).get('productionRevision'), 2);
  await expectDirectDenied('Start Print is denied until latest revision acknowledgement', () => directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { status: 'PRINTING', printingStartedAt: new Date().toISOString() })));
  await expectDirectDenied('wrong printer cannot acknowledge revision', () => directFirestoreAs('printer2', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { printerAcknowledgedRevision: 2 })));
  await directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { printerAcknowledgedRevision: 2 }));
  await callAs('designer', 'reviseProductionOrder', { orderId: 'revision-order', instructionRaw: 'Thông tin kỹ thuật phiên bản 3' });
  assert.equal((await db.collection('orders').doc('revision-order').get()).get('printerAcknowledgedRevision'), 2);
  await expectDirectDenied('latest revision requires a fresh acknowledgement', () => directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { status: 'PRINTING', printingStartedAt: new Date().toISOString() })));
  await directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { printerAcknowledgedRevision: 3 }));
  await directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'revision-order'), { status: 'PRINTING', printingStartedAt: new Date().toISOString() }));
  const duringPrintIssue = await callAs('printer', 'reportProductionIssue', { orderId: 'revision-order', issueType: 'MACHINE', message: 'Máy dừng giữa ca', recipientRoles: ['MANAGER'], urgent: true });
  assert.equal((await db.collection('orders').doc('revision-order').get()).get('status'), 'PRINTING');
  await callAs('admin', 'resolveProductionIssue', { orderId: 'revision-order', issueId: duringPrintIssue.data.issueId });
  assert.equal((await db.collection('orders').doc('revision-order').get()).get('status'), 'PRINTING');
  await expectError('technical editing locks after Start Print', () => callAs('designer', 'reviseProductionOrder', { orderId: 'revision-order', instructionRaw: 'Forbidden version 3' }), 'functions/failed-precondition');

  await db.collection('orders').doc('reassign-order').set(order('reassign-order', { status: 'ACCEPTED' }));
  await callAs('designer', 'reviseProductionOrder', { orderId: 'reassign-order', printerId: 'u-printer-2' });
  const reassigned = await db.collection('orders').doc('reassign-order').get();
  assert.equal(reassigned.get('printerId'), 'u-printer-2');
  assert.equal(reassigned.get('status'), 'WAITING_ACCEPTANCE');
  await expectDirectDenied('old printer loses authority immediately after reassignment', () => directFirestoreAs('printer', (firestore) => updateDoc(doc(firestore, 'orders', 'reassign-order'), { status: 'ACCEPTED', acceptedAt: new Date().toISOString(), printerAcknowledgedRevision: 1 })));
  await directFirestoreAs('printer2', (firestore) => updateDoc(doc(firestore, 'orders', 'reassign-order'), { status: 'ACCEPTED', acceptedAt: new Date().toISOString(), printerAcknowledgedRevision: 1 }));
  console.log('PASS edit revision, acknowledgement, post-start lock and pre-start reassignment');

  // Finishing and deterministic finished-good generation.
  await db.collection('orders').doc('finish-order').set(order('finish-order', {
    status: 'PRINTED', items: [{ id: 'prod-item-1', productName: 'Bag', quantity: 10, customerId: 'cus-1' }],
  }));
  await callAs('admin', 'handoffToFinishing', { orderId: 'finish-order', finisherId: 'u-finisher', types: ['Dán'] });
  await expectError('wrong finisher cannot start', () => callAs('finisher2', 'startFinishing', { orderId: 'finish-order' }), 'functions/permission-denied');
  await expectDirectDenied('browser finisher cannot mutate finishing state', () => directFirestoreAs('finisher', (firestore) => updateDoc(doc(firestore, 'orders', 'finish-order'), { status: 'FINISHING', finishing: { status: 'IN_PROGRESS' } })));
  await expectError('cannot complete finishing while PENDING', () => callAs('finisher', 'completeFinishing', { orderId: 'finish-order' }), 'functions/failed-precondition');
  await callAs('finisher', 'startFinishing', { orderId: 'finish-order' });
  await callAs('finisher', 'completeFinishing', { orderId: 'finish-order' });
  await callAs('finisher', 'completeFinishing', { orderId: 'finish-order' });
  const generated = await db.collection('finished_goods').where('sourceProductionOrderId', '==', 'finish-order').get();
  assert.equal(generated.size, 1);
  console.log('PASS finishing requires PENDING -> IN_PROGRESS -> COMPLETED and is idempotent');

  // READY_TO_SHIP derives only after production item is complete and actual FG quantity is confirmed.
  await db.collection('sales_orders').doc('so-ready').set({ id: 'so-ready', code: 'SO-READY', status: 'PRODUCTION_COMPLETED', customerId: 'cus-1', customerSnapshot: { name: 'Customer' }, saleId: 'u-sale', totalItems: 1, createdAt: new Date().toISOString(), deletedAt: null });
  await db.collection('sales_order_items').doc('so-item-ready').set({ id: 'so-item-ready', salesOrderId: 'so-ready', customerId: 'cus-1', productName: 'Bag', quantity: 10, status: 'PRODUCTION_COMPLETED', createdAt: new Date().toISOString(), deletedAt: null });
  await db.collection('finished_goods').doc('fg-ready').set({ id: 'fg-ready', sourceProductionOrderId: 'manual-ready', sourceProductionItemId: 'manual-item', salesOrderId: 'so-ready', salesOrderItemId: 'so-item-ready', customerId: 'cus-1', productName: 'Bag', orderedQuantity: 10, producedQuantity: 10, acceptedQuantity: 0, dispatchedQuantity: 0, remainingQuantity: 0, quantityUnit: 'BAG', status: 'WAITING', createdAt: new Date().toISOString() });
  await callAs('finisher', 'confirmFinishedGoodQuantity', { finishedGoodId: 'fg-ready', acceptedQuantity: 10 });
  assert.equal((await db.collection('sales_orders').doc('so-ready').get()).get('status'), 'READY_TO_SHIP');
  console.log('PASS READY_TO_SHIP derives after confirmed finished-good quantity');

  // Pending production cancellation is resolved only by the assigned printer and reconciles linked sales data atomically.
  await db.collection('sales_orders').doc('so-cancel').set({ id: 'so-cancel', code: 'SO-CANCEL', status: 'IN_PRODUCTION', customerId: 'cus-1', customerSnapshot: { name: 'Customer' }, saleId: 'u-sale', totalItems: 1, createdAt: new Date().toISOString(), deletedAt: null });
  await db.collection('sales_order_items').doc('so-item-cancel').set({ id: 'so-item-cancel', salesOrderId: 'so-cancel', customerId: 'cus-1', productName: 'Bag', quantity: 5, allocatedQuantity: 5, linkedProductionItemIds: ['prod-item-cancel'], status: 'IN_PRODUCTION', createdAt: new Date().toISOString(), deletedAt: null });
  await db.collection('orders').doc('cancel-order').set(order('cancel-order', { status: 'ACCEPTED', items: [{ id: 'prod-item-cancel', salesOrderId: 'so-cancel', salesOrderItemId: 'so-item-cancel', productName: 'Bag', quantity: 5000, allocatedProductQuantity: 5 }] }));
  await callAs('sale', 'requestProductionCancellation', { orderId: 'cancel-order', reason: 'Customer changed requirements' });
  await expectError('unassigned printer cannot resolve cancellation', () => callAs('printer2', 'respondProductionCancellation', { orderId: 'cancel-order', accept: true }), 'functions/permission-denied');
  await callAs('printer', 'respondProductionCancellation', { orderId: 'cancel-order', accept: true });
  const [cancelledProduction, cancelledItem, cancelledSalesOrder] = await Promise.all([
    db.collection('orders').doc('cancel-order').get(), db.collection('sales_order_items').doc('so-item-cancel').get(), db.collection('sales_orders').doc('so-cancel').get(),
  ]);
  assert.equal(cancelledProduction.get('status'), 'CANCELLED');
  assert.equal(cancelledItem.get('status'), 'READY_FOR_PRODUCTION');
  assert.equal(cancelledItem.get('allocatedQuantity'), 0);
  assert.deepEqual(cancelledItem.get('linkedProductionItemIds'), []);
  assert.equal(cancelledSalesOrder.get('status'), 'DESIGNING');
  console.log('PASS cancellation reconciliation is assigned-worker-only and restores sales readiness');

  await db.collection('orders').doc('cancel-reject-order').set(order('cancel-reject-order', { status: 'ACCEPTED' }));
  await callAs('designer', 'requestProductionCancellation', { orderId: 'cancel-reject-order', reason: 'Please stop' });
  await callAs('printer', 'respondProductionCancellation', { orderId: 'cancel-reject-order', accept: false, responseReason: 'Already printed physically' });
  assert.equal((await db.collection('orders').doc('cancel-reject-order').get()).get('status'), 'ACCEPTED');
  await db.collection('orders').doc('cancel-after-start').set(order('cancel-after-start', { status: 'PRINTING' }));
  await expectError('normal cancellation is denied after Start Print', () => callAs('designer', 'requestProductionCancellation', { orderId: 'cancel-after-start', reason: 'Too late' }), 'functions/failed-precondition');

  // Multi-item linking/cancellation must read every linked sales item before the first transaction write.
  await db.collection('sales_orders').doc('so-multi-link').set({ id: 'so-multi-link', code: 'SO-MULTI-LINK', status: 'DESIGNING', customerId: 'cus-1', customerSnapshot: { name: 'Customer' }, saleId: 'u-sale', totalItems: 2, createdAt: new Date().toISOString(), deletedAt: null });
  await Promise.all([
    db.collection('sales_order_items').doc('so-multi-item-a').set({ id: 'so-multi-item-a', salesOrderId: 'so-multi-link', customerId: 'cus-1', productName: 'Bag A', quantity: 2, allocatedQuantity: 0, linkedProductionItemIds: [], status: 'READY_FOR_PRODUCTION', createdAt: new Date().toISOString(), deletedAt: null }),
    db.collection('sales_order_items').doc('so-multi-item-b').set({ id: 'so-multi-item-b', salesOrderId: 'so-multi-link', customerId: 'cus-1', productName: 'Bag B', quantity: 3, allocatedQuantity: 0, linkedProductionItemIds: [], status: 'READY_FOR_PRODUCTION', createdAt: new Date().toISOString(), deletedAt: null }),
  ]);
  await db.collection('orders').doc('multi-link-order').set(order('multi-link-order', {
    status: 'WAITING_ACCEPTANCE',
    items: [
      { id: 'multi-prod-a', salesOrderId: 'so-multi-link', salesOrderItemId: 'so-multi-item-a', productName: 'Bag A', quantity: 2, allocatedProductQuantity: 2 },
      { id: 'multi-prod-b', salesOrderId: 'so-multi-link', salesOrderItemId: 'so-multi-item-b', productName: 'Bag B', quantity: 3, allocatedProductQuantity: 3 },
    ],
  }));
  await callAs('designer', 'linkProductionOrder', { productionOrderId: 'multi-link-order' });
  let [multiItemA, multiItemB] = await Promise.all([
    db.collection('sales_order_items').doc('so-multi-item-a').get(),
    db.collection('sales_order_items').doc('so-multi-item-b').get(),
  ]);
  assert.equal(multiItemA.get('allocatedQuantity'), 2);
  assert.equal(multiItemB.get('allocatedQuantity'), 3);
  await callAs('sale', 'requestProductionCancellation', { orderId: 'multi-link-order', reason: 'Multi-item read-order regression' });
  await callAs('printer', 'respondProductionCancellation', { orderId: 'multi-link-order', accept: true });
  [multiItemA, multiItemB] = await Promise.all([
    db.collection('sales_order_items').doc('so-multi-item-a').get(),
    db.collection('sales_order_items').doc('so-multi-item-b').get(),
  ]);
  assert.equal(multiItemA.get('allocatedQuantity'), 0);
  assert.equal(multiItemB.get('allocatedQuantity'), 0);
  assert.equal(multiItemA.get('status'), 'READY_FOR_PRODUCTION');
  assert.equal(multiItemB.get('status'), 'READY_FOR_PRODUCTION');
  console.log('PASS multi-item production linking and cancellation keep all transaction reads before writes');

  // Multi-line reversal follows the same read-before-write transaction requirement.
  await db.collection('sales_orders').doc('so-multi-dispatch').set({ id: 'so-multi-dispatch', code: 'SO-MULTI-DISPATCH', status: 'READY_TO_SHIP', customerId: 'cus-1', customerSnapshot: { name: 'Customer' }, saleId: 'u-sale', totalItems: 2, createdAt: new Date().toISOString(), deletedAt: null });
  await Promise.all([
    db.collection('sales_order_items').doc('multi-a').set({ id: 'multi-a', salesOrderId: 'so-multi-dispatch', customerId: 'cus-1', productName: 'Bag A', quantity: 2, status: 'WAREHOUSE_READY', createdAt: new Date().toISOString(), deletedAt: null }),
    db.collection('sales_order_items').doc('multi-b').set({ id: 'multi-b', salesOrderId: 'so-multi-dispatch', customerId: 'cus-1', productName: 'Bag B', quantity: 3, status: 'WAREHOUSE_READY', createdAt: new Date().toISOString(), deletedAt: null }),
    db.collection('finished_goods').doc('fg-multi-a').set({ id: 'fg-multi-a', sourceProductionOrderId: 'multi-order', sourceProductionItemId: 'multi-a', salesOrderId: 'so-multi-dispatch', salesOrderItemId: 'multi-a', customerId: 'cus-1', productName: 'Bag A', orderedQuantity: 2, producedQuantity: 2, acceptedQuantity: 2, dispatchedQuantity: 0, totalDispatchedQuantity: 0, remainingQuantity: 2, quantityUnit: 'BAG', status: 'READY', createdAt: new Date().toISOString() }),
    db.collection('finished_goods').doc('fg-multi-b').set({ id: 'fg-multi-b', sourceProductionOrderId: 'multi-order', sourceProductionItemId: 'multi-b', salesOrderId: 'so-multi-dispatch', salesOrderItemId: 'multi-b', customerId: 'cus-1', productName: 'Bag B', orderedQuantity: 3, producedQuantity: 3, acceptedQuantity: 3, dispatchedQuantity: 0, totalDispatchedQuantity: 0, remainingQuantity: 3, quantityUnit: 'BAG', status: 'READY', createdAt: new Date().toISOString() }),
  ]);
  const multiDispatch = await callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'so-multi-dispatch', items: [{ finishedGoodId: 'fg-multi-a', quantity: 1 }, { finishedGoodId: 'fg-multi-b', quantity: 1 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  await callAs('admin', 'confirmWarehouseDispatch', { dispatchId: multiDispatch.data.dispatchId });
  await callAs('admin', 'reverseWarehouseDispatch', { dispatchId: multiDispatch.data.dispatchId, reason: 'Multi-line read-order regression' });
  const [multiGoodA, multiGoodB] = await Promise.all([
    db.collection('finished_goods').doc('fg-multi-a').get(), db.collection('finished_goods').doc('fg-multi-b').get(),
  ]);
  assert.equal(multiGoodA.get('remainingQuantity'), 2);
  assert.equal(multiGoodB.get('remainingQuantity'), 3);
  console.log('PASS multi-line dispatch reversal reads all finished goods before writes');

  // Dispatch is server transactional and cannot be confirmed twice.
  const createDispatch = await callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'so-ready', items: [{ finishedGoodId: 'fg-ready', quantity: 5 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  const dispatchId = createDispatch.data.dispatchId;
  await Promise.all([callAs('admin', 'confirmWarehouseDispatch', { dispatchId }), callAs('admin', 'confirmWarehouseDispatch', { dispatchId })]);
  assert.equal((await db.collection('finished_goods').doc('fg-ready').get()).get('remainingQuantity'), 5);
  console.log('PASS concurrent dispatch confirmation deducts inventory once');

  // Shipment transitions and return inspection are explicitly guarded.
  const createdShipment = await callAs('sale', 'createShipment', { dispatchId, method: 'INTERNAL_DELIVERY', receiver: { name: 'Customer', phone: '0900', address: 'Address' }, packageCount: 1, weightGrams: 100, codAmount: 0 });
  const shipmentId = createdShipment.data.shipmentId;
  assert.equal((await db.collection('sales_orders').doc('so-ready').get()).get('status'), 'SHIPPING');
  await expectError('shipment rejects DRAFT -> DELIVERED', () => callAs('sale', 'transitionShipment', { shipmentId, targetStatus: 'DELIVERED' }), 'functions/failed-precondition');
  for (const targetStatus of ['CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'RETURNING', 'RETURNED']) await callAs('sale', 'transitionShipment', { shipmentId, targetStatus });
  await callAs('admin', 'inspectReturnedShipment', { shipmentId, result: 'RESTOCKED', note: 'Intact' });
  assert.equal((await db.collection('sales_orders').doc('so-ready').get()).get('status'), 'SHIPPING');
  await expectError('return inspection cannot restock twice', () => callAs('admin', 'inspectReturnedShipment', { shipmentId, result: 'RESTOCKED' }), 'functions/failed-precondition');
  console.log('PASS legal shipment/return lifecycle is guarded and idempotent');

  // Rules reject browser lifecycle mutation even for a valid SALE identity.
  await expectDirectDenied('browser cannot set sales order lifecycle', () => directFirestoreAs('sale', (firestore) => updateDoc(doc(firestore, 'sales_orders', 'so-ready'), { status: 'DELIVERED' })));
  await expectDirectDenied('browser cannot set sales item lifecycle', () => directFirestoreAs('sale', (firestore) => updateDoc(doc(firestore, 'sales_order_items', 'so-item-ready'), { status: 'IN_PRODUCTION' })));
  await expectDirectDenied('browser cannot mutate finished-good inventory', () => directFirestoreAs('sale', (firestore) => updateDoc(doc(firestore, 'finished_goods', 'fg-ready'), { remainingQuantity: 999 })));
  await expectDirectDenied('browser cannot mutate dispatch lifecycle', () => directFirestoreAs('sale', (firestore) => updateDoc(doc(firestore, 'warehouse_dispatches', dispatchId), { status: 'CANCELLED' })));
  await expectDirectDenied('browser cannot mutate shipment lifecycle', () => directFirestoreAs('sale', (firestore) => updateDoc(doc(firestore, 'shipments', shipmentId), { status: 'DELIVERED' })));

  // Full happy path uses only normal browser-permitted creation/printing actions and authoritative callables.
  await directFirestoreAs('sale', async (firestore) => {
    const now = new Date().toISOString();
    await setDoc(doc(firestore, 'customers', 'e2e-customer'), { id: 'e2e-customer', code: 'KH-E2E', name: 'E2E Customer', phoneNormalized: '0900111222', deletedAt: null, createdAt: now });
    await setDoc(doc(firestore, 'sales_orders', 'e2e-sales'), { id: 'e2e-sales', code: 'SO-E2E', status: 'DRAFT', customerId: 'e2e-customer', customerSnapshot: { name: 'E2E Customer' }, saleId: 'u-sale', totalItems: 1, deletedAt: null, createdAt: now });
    await setDoc(doc(firestore, 'sales_order_items', 'e2e-sales-item'), { id: 'e2e-sales-item', salesOrderId: 'e2e-sales', customerId: 'e2e-customer', productName: 'E2E Bag', quantity: 4, requiresProduction: true, requiresFinishing: true, status: 'NEW', linkedProductionItemIds: [], deletedAt: null, createdAt: now });
  });
  await callAs('sale', 'confirmSalesOrder', { salesOrderId: 'e2e-sales' });
  await callAs('sale', 'confirmSalesOrder', { salesOrderId: 'e2e-sales' }); // idempotent retry
  await directFirestoreAs('designer', (firestore) => setDoc(doc(firestore, 'orders', 'e2e-production'), order('e2e-production', {
    code: 'PO-E2E', status: 'WAITING_ACCEPTANCE', printerId: 'u-printer', printerName: 'Printer', plateStatus: 'NOT_SENT', printerAcknowledgedRevision: 0,
    items: [{ id: 'e2e-production-item', salesOrderId: 'e2e-sales', salesOrderItemId: 'e2e-sales-item', customerId: 'e2e-customer', productName: 'E2E Bag', quantity: 5150, allocatedProductQuantity: 4, requiresFinishing: true }],
  })));
  await callAs('designer', 'linkProductionOrder', { productionOrderId: 'e2e-production' });
  await directFirestoreAs('printer', async (firestore) => {
    await updateDoc(doc(firestore, 'orders', 'e2e-production'), { status: 'WAITING_PRINT', acceptedAt: new Date().toISOString(), printerAcknowledgedRevision: 1 });
    await updateDoc(doc(firestore, 'orders', 'e2e-production'), { status: 'PRINTING', printingStartedAt: new Date().toISOString() });
  });
  await callAs('printer', 'completeProductionPrint', { orderId: 'e2e-production' });
  assert.equal((await db.collection('finishing_tasks').doc('ft_e2e-production_e2e-production-item').get()).get('quantity'), 4);
  await callAs('finisher', 'claimFinishingTask', { taskId: 'ft_e2e-production_e2e-production-item' });
  await expectError('second finisher cannot claim the same product', () => callAs('finisher2', 'claimFinishingTask', { taskId: 'ft_e2e-production_e2e-production-item' }), 'functions/failed-precondition');
  await expectError('other finisher cannot complete a claimed product', () => callAs('finisher2', 'completeFinishingTask', { taskId: 'ft_e2e-production_e2e-production-item' }), 'functions/permission-denied');
  await callAs('finisher', 'completeFinishingTask', { taskId: 'ft_e2e-production_e2e-production-item' });
  assert.equal((await db.collection('sales_orders').doc('e2e-sales').get()).get('status'), 'READY_TO_SHIP');
  const e2eDispatch = await callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'e2e-sales', items: [{ finishedGoodId: 'fg_finish_ft_e2e-production_e2e-production-item', quantity: 4 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  await callAs('admin', 'confirmWarehouseDispatch', { dispatchId: e2eDispatch.data.dispatchId });
  const e2eShipment = await callAs('sale', 'createShipment', { dispatchId: e2eDispatch.data.dispatchId, method: 'INTERNAL_DELIVERY', receiver: { name: 'E2E Customer', phone: '0900111222', address: 'E2E address' }, packageCount: 1, weightGrams: 100, codAmount: 0 });
  await callAs('sale', 'transitionShipment', { shipmentId: e2eShipment.data.shipmentId, targetStatus: 'PICKUP_PENDING' });
  await callAs('sale', 'transitionShipment', { shipmentId: e2eShipment.data.shipmentId, targetStatus: 'PICKUP_PENDING' }); // stale/retry idempotency
  for (const targetStatus of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) await callAs('sale', 'transitionShipment', { shipmentId: e2eShipment.data.shipmentId, targetStatus });
  assert.equal((await db.collection('sales_orders').doc('e2e-sales').get()).get('status'), 'COMPLETED');
  console.log('PASS end-to-end customer -> sales -> production -> finishing -> FG -> dispatch -> delivery completes');

  // Mixed routing: direct product enters Warehouse immediately, while a
  // printed no-finishing product still waits for the one-click checkpoint.
  await db.collection('sales_orders').doc('so-mixed').set({ id: 'so-mixed', code: 'SO-MIXED', status: 'DRAFT', customerId: 'cus-mixed', customerSnapshot: { name: 'Mixed Customer' }, saleId: 'u-sale', totalItems: 2, createdAt: new Date().toISOString(), deletedAt: null });
  await Promise.all([
    db.collection('sales_order_items').doc('mixed-direct').set({ id: 'mixed-direct', salesOrderId: 'so-mixed', customerId: 'cus-mixed', productName: 'Direct product', quantity: 2, requiresProduction: false, requiresFinishing: true, status: 'NEW', createdAt: new Date().toISOString(), deletedAt: null }),
    db.collection('sales_order_items').doc('mixed-print').set({ id: 'mixed-print', salesOrderId: 'so-mixed', customerId: 'cus-mixed', productName: 'Printed no-finishing product', quantity: 4, requiresProduction: true, requiresFinishing: false, status: 'NEW', createdAt: new Date().toISOString(), deletedAt: null }),
  ]);
  await callAs('sale', 'confirmSalesOrder', { salesOrderId: 'so-mixed' });
  const [directItem, printItem, directGood] = await Promise.all([
    db.collection('sales_order_items').doc('mixed-direct').get(),
    db.collection('sales_order_items').doc('mixed-print').get(),
    db.collection('finished_goods').doc('fg_direct_mixed-direct').get(),
  ]);
  assert.equal(directItem.get('status'), 'WAREHOUSE_READY');
  assert.equal(directItem.get('requiresFinishing'), false);
  assert.equal(printItem.get('status'), 'WAITING_DESIGN');
  assert.equal(directGood.get('acceptedQuantity'), 2);
  await expectError('partial export is denied while a sibling product is not in Warehouse', () => callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'so-mixed', items: [{ finishedGoodId: 'fg_direct_mixed-direct', quantity: 2 }], dispatchMethod: 'INTERNAL_DELIVERY' }), 'functions/failed-precondition');

  await db.collection('orders').doc('late-link-production').set(order('late-link-production', {
    status: 'PRINTING', instructionRaw: '5150 tờ Kraft 25x48', items: [{ id: 'late-link-item', productName: 'Independent print', quantity: 5150, requiresFinishing: false }],
  }));
  await callAs('printer', 'completeProductionPrint', { orderId: 'late-link-production' });
  let lateTask = await db.collection('finishing_tasks').doc('ft_late-link-production_late-link-item').get();
  assert.equal(lateTask.get('salesOrderItemId'), null);
  assert.equal(lateTask.get('quantity'), 5150);
  await callAs('designer', 'linkProductionOrder', { productionOrderId: 'late-link-production', links: [{ productionItemId: 'late-link-item', salesOrderId: 'so-mixed', salesOrderItemId: 'mixed-print', allocatedProductQuantity: 4 }] });
  lateTask = await db.collection('finishing_tasks').doc('ft_late-link-production_late-link-item').get();
  assert.equal(lateTask.get('salesOrderItemId'), 'mixed-print');
  assert.equal(lateTask.get('quantity'), 4);
  assert.equal(lateTask.get('requiresFinishing'), false);
  assert.equal((await db.collection('orders').doc('late-link-production').get()).get('instructionRaw'), '5150 tờ Kraft 25x48');
  await callAs('sale', 'setFinishingTaskUrgent', { taskId: lateTask.id, urgent: true });
  assert.equal((await db.collection('finishing_tasks').doc(lateTask.id).get()).get('urgent'), true);
  await expectError('Finisher cannot rewrite product urgency', () => callAs('finisher', 'setFinishingTaskUrgent', { taskId: lateTask.id, urgent: false }), 'functions/permission-denied');
  const finishingIssue = await callAs('finisher', 'reportWorkflowIssue', { salesOrderItemId: 'mixed-print', stage: 'FINISHING', issueType: 'Thiếu số lượng', message: 'Thiếu khi kiểm đếm', recipientRoles: ['SALE', 'DESIGNER', 'MANAGER'], urgent: true });
  assert.equal((await db.collection('workflow_issues').doc(finishingIssue.data.issueId).get()).get('priority'), 'URGENT');
  await expectError('non-recipient cannot resolve downstream issue', () => callAs('finisher', 'resolveWorkflowIssue', { issueId: finishingIssue.data.issueId }), 'functions/permission-denied');
  await callAs('sale', 'resolveWorkflowIssue', { issueId: finishingIssue.data.issueId });
  assert.equal((await db.collection('workflow_issues').doc(finishingIssue.data.issueId).get()).get('status'), 'RESOLVED');
  await expectError('no-finishing checkpoint cannot be claimed', () => callAs('finisher', 'claimFinishingTask', { taskId: lateTask.id }), 'functions/failed-precondition');
  await expectDirectDenied('browser cannot mutate a Finishing task directly', () => directFirestoreAs('finisher', (firestore) => updateDoc(doc(firestore, 'finishing_tasks', lateTask.id), { status: 'COMPLETED' })));
  await callAs('finisher', 'completeFinishingTask', { taskId: lateTask.id });
  assert.equal((await db.collection('sales_orders').doc('so-mixed').get()).get('status'), 'READY_TO_SHIP');
  const warehouseIssue = await callAs('sale', 'reportWorkflowIssue', { salesOrderItemId: 'mixed-direct', stage: 'WAREHOUSE', issueType: 'Sai hàng', message: 'Báo nhầm để kiểm tra hủy', recipientUserIds: ['u-designer'] });
  await expectDirectDenied('browser cannot mutate downstream issue history', () => directFirestoreAs('sale', (firestore) => updateDoc(doc(firestore, 'workflow_issues', warehouseIssue.data.issueId), { status: 'RESOLVED' })));
  await callAs('sale', 'cancelWorkflowIssue', { issueId: warehouseIssue.data.issueId });
  assert.equal((await db.collection('workflow_issues').doc(warehouseIssue.data.issueId).get()).get('status'), 'CANCELLED');
  const mixedDispatch = await callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'so-mixed', items: [{ finishedGoodId: 'fg_direct_mixed-direct', quantity: 2 }, { finishedGoodId: `fg_finish_${lateTask.id}`, quantity: 4 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  assert.equal(typeof mixedDispatch.data.dispatchId, 'string');
  await db.collection('orders').doc('supplemental-production').set(order('supplemental-production', {
    instructionRaw: 'Bổ sung theo quyết định thủ công: 900 tờ BB58',
    items: [{ id: 'supplemental-item', productName: 'Manual supplemental print', quantity: 900, requiresFinishing: false }],
  }));
  await callAs('designer', 'linkProductionOrder', { productionOrderId: 'supplemental-production', links: [{ productionItemId: 'supplemental-item', salesOrderId: 'so-mixed', salesOrderItemId: 'mixed-print', allocatedProductQuantity: 1 }] });
  const supplementedProduct = await db.collection('sales_order_items').doc('mixed-print').get();
  assert.deepEqual(new Set(supplementedProduct.get('linkedProductionItemIds')), new Set(['late-link-item', 'supplemental-item']));
  assert.equal(supplementedProduct.get('allocatedQuantity'), 5);
  assert.equal((await db.collection('orders').doc('supplemental-production').get()).get('instructionRaw'), 'Bổ sung theo quyết định thủ công: 900 tờ BB58');
  console.log('PASS direct routing, sibling readiness, late linkage, manual supplemental history and no-finishing confirmation');

  // Dispatch reversal and shipment creation race in transactions; precisely one legal outcome may commit.
  await db.collection('sales_orders').doc('so-race').set({ id: 'so-race', code: 'SO-RACE', status: 'READY_TO_SHIP', customerId: 'cus-1', customerSnapshot: { name: 'Customer' }, saleId: 'u-sale', totalItems: 1, createdAt: new Date().toISOString(), deletedAt: null });
  await db.collection('sales_order_items').doc('race-item').set({ id: 'race-item', salesOrderId: 'so-race', customerId: 'cus-1', productName: 'Bag', quantity: 1, status: 'WAREHOUSE_READY', createdAt: new Date().toISOString(), deletedAt: null });
  await db.collection('finished_goods').doc('fg-race').set({ id: 'fg-race', sourceProductionOrderId: 'race-order', sourceProductionItemId: 'race-item', salesOrderId: 'so-race', salesOrderItemId: 'race-item', customerId: 'cus-1', productName: 'Bag', orderedQuantity: 1, producedQuantity: 1, acceptedQuantity: 1, dispatchedQuantity: 0, remainingQuantity: 1, quantityUnit: 'BAG', status: 'READY', createdAt: new Date().toISOString() });
  const raceDispatch = await callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'so-race', items: [{ finishedGoodId: 'fg-race', quantity: 1 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  await callAs('admin', 'confirmWarehouseDispatch', { dispatchId: raceDispatch.data.dispatchId });
  const raceResults = await Promise.allSettled([
    callAs('admin', 'reverseWarehouseDispatch', { dispatchId: raceDispatch.data.dispatchId, reason: 'Race test' }),
    callAs('sale', 'createShipment', { dispatchId: raceDispatch.data.dispatchId, method: 'INTERNAL_DELIVERY', receiver: { name: 'Customer', phone: '0900', address: 'Address' }, packageCount: 1, weightGrams: 10, codAmount: 0 }),
  ]);
  assert.equal(raceResults.filter((result) => result.status === 'fulfilled').length, 1);
  console.log('PASS concurrent dispatch reverse and shipment creation cannot both commit');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
