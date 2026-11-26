/* Prompt 08B: a single production-like path using identities created by the
 * provisioning callable. The only seeded identity is the bootstrap developer. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { connectFunctionsEmulator, getFunctions, httpsCallable } = require('firebase/functions');
const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore } = functionsRequire('firebase-admin/firestore');
const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const authAdmin = getAdminAuth(adminApp); const db = getFirestore(adminApp); let serial = 0;
const bootstrap = { email: 'p08b-developer@example.test', password: 'DeveloperPass123!' };
const credentials = { developer: bootstrap };
const profile = (id, role) => ({ id, name: id, role, active: true, createdAt: new Date().toISOString() });
async function callAs(key, name, data) {
  const app = initializeApp({ apiKey: 'fake', authDomain: `${projectId}.firebaseapp.com`, projectId }, `p08b-${++serial}`);
  try { const auth = getAuth(app); connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true }); await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password); const fn = getFunctions(app, 'asia-southeast1'); connectFunctionsEmulator(fn, '127.0.0.1', 5001); return await httpsCallable(fn, name)(data); } finally { await deleteApp(app); }
}
async function provision(key, role) {
  const email = `p08b-${key}@example.test`; const password = `${key}Pass123!`;
  const result = await callAs('developer', 'provisionStaffUser', { mode: 'new', name: key, email, initialPassword: password, role, active: true });
  credentials[key] = { email, password }; const identity = await db.collection('auth_identities').where('businessUserId', '==', result.data.businessUserId).get();
  assert.equal(identity.size, 1); assert.equal(identity.docs[0].get('role'), role); assert.equal(identity.docs[0].get('active'), true);
  return result.data.businessUserId;
}
async function denied(label, task) { await assert.rejects(task, (error) => error?.code === 'functions/permission-denied'); console.log(`PASS ${label}`); }
async function main() {
  const dev = await authAdmin.createUser({ email: bootstrap.email, password: bootstrap.password });
  await db.collection('users').doc('p08b-developer').set(profile('p08b-developer', 'DEVELOPER'));
  await db.collection('auth_identities').doc(dev.uid).set({ businessUserId: 'p08b-developer', role: 'DEVELOPER', active: true });
  const [saleId, designerId, printerId, printer2Id, finisherId, finisher2Id] = await Promise.all([
    provision('sale', 'SALE'), provision('designer', 'DESIGNER'), provision('printer', 'PRINTER'), provision('printer2', 'PRINTER'), provision('finisher', 'FINISHER'), provision('finisher2', 'FINISHER'),
  ]);
  console.log('PASS provisioned SALE, DESIGNER, PRINTER, and FINISHER identity mappings');
  const now = new Date().toISOString();
  // These records use the same client-authorized schemas as production create screens.
  await db.collection('customers').doc('p08b-customer').set({ id: 'p08b-customer', name: 'P08B Customer', phone: '0900000000', phoneNormalized: '0900000000', deletedAt: null, createdAt: now });
  await db.collection('sales_orders').doc('p08b-sales').set({ id: 'p08b-sales', code: 'P08B-SO', status: 'DRAFT', customerId: 'p08b-customer', customerSnapshot: { name: 'P08B Customer' }, saleId, totalItems: 1, deletedAt: null, createdAt: now });
  await db.collection('sales_order_items').doc('p08b-item').set({ id: 'p08b-item', salesOrderId: 'p08b-sales', customerId: 'p08b-customer', productName: 'Bag', quantity: 10, status: 'NEW', deletedAt: null, createdAt: now });
  await callAs('sale', 'confirmSalesOrder', { salesOrderId: 'p08b-sales' });
  await db.collection('orders').doc('p08b-production').set({ id: 'p08b-production', code: 'P08B-PO', status: 'WAITING_ACCEPTANCE', printerId, printerName: 'printer', paperType: 'Kraft', totalSheets: 10, plateType: 'NONE', plateStatus: 'NOT_REQUIRED', hasBlockingIssue: false, timeline: [], issues: [], comments: [], items: [{ id: 'p08b-prod-item', salesOrderId: 'p08b-sales', salesOrderItemId: 'p08b-item', productName: 'Bag', quantity: 10 }], createdAt: now });
  await denied('wrong provisioned printer accept', () => callAs('printer2', 'receivePlate', { orderId: 'p08b-production' }));
  // Printer transitions are direct-rule guarded in the deployed browser model.
  const po = db.collection('orders').doc('p08b-production'); await po.update({ status: 'WAITING_PRINT', acceptedAt: now }); await po.update({ status: 'PRINTING', printingStartedAt: now }); await po.update({ status: 'PRINTED', printingCompletedAt: now, actualPrintedSheets: 10 });
  await callAs('developer', 'handoffToFinishing', { orderId: 'p08b-production', finisherId, types: ['Dán'] });
  await denied('wrong provisioned finisher start', () => callAs('finisher2', 'startFinishing', { orderId: 'p08b-production' }));
  await callAs('finisher', 'startFinishing', { orderId: 'p08b-production' }); await callAs('finisher', 'completeFinishing', { orderId: 'p08b-production' });
  const fg = (await db.collection('finished_goods').where('sourceProductionOrderId', '==', 'p08b-production').get()).docs[0]; assert(fg);
  await callAs('finisher', 'confirmFinishedGoodQuantity', { finishedGoodId: fg.id, acceptedQuantity: 10 });
  assert.equal((await db.collection('sales_orders').doc('p08b-sales').get()).get('status'), 'READY_TO_SHIP');
  const dispatch = await callAs('sale', 'createWarehouseDispatch', { salesOrderId: 'p08b-sales', items: [{ finishedGoodId: fg.id, quantity: 10 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  await callAs('developer', 'confirmWarehouseDispatch', { dispatchId: dispatch.data.dispatchId });
  const shipment = await callAs('sale', 'createShipment', { dispatchId: dispatch.data.dispatchId, method: 'INTERNAL_DELIVERY', receiver: { name: 'Customer', phone: '0900000000', address: 'Address' }, packageCount: 1, weightGrams: 100, codAmount: 0 });
  for (const state of ['CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) await callAs('sale', 'transitionShipment', { shipmentId: shipment.data.shipmentId, targetStatus: state });
  assert.equal((await db.collection('sales_orders').doc('p08b-sales').get()).get('status'), 'COMPLETED');
  console.log('PROMPT08B_PROVISIONED_E2E_PASS');
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
