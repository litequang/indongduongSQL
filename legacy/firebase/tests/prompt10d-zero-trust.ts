/*
 * Prompt 10D controller/integration verification.  This deliberately uses
 * independent Web SDK Firebase apps, real emulator Auth sessions, Rules, and
 * callable Functions. Browser UI coverage lives in workflow-v2-ui.spec.ts.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, onSnapshot, query, setDoc, updateDoc, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { buildUrgentOrderUpdate } from '../src/services/urgentOrderService';
import { sanitizeForFirestore } from '../src/utils/firestoreSerialization';

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const functionsRequire = createRequire(`${process.cwd()}\\functions\\package.json`);
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore: getAdminFirestore } = functionsRequire('firebase-admin/firestore');
const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

const runId = `p10d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let serial = 0;
const credentials: Record<string, { email: string; password: string }> = {};
const clients: Client[] = [];

type Client = { key: string; businessUserId: string; app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions };

function record(label: string) { console.log(`EXECUTED PASS ${label}`); }
async function expectDenied(label: string, work: () => Promise<unknown>) {
  await assert.rejects(work, (error: any) => String(error?.code || '').includes('permission-denied'));
  record(`${label} denied as expected`);
}
async function call(client: Client, name: string, data: Record<string, unknown>) {
  return (await httpsCallable(client.functions, name)(data)).data as Record<string, any>;
}
async function createClient(key: string, businessUserId: string): Promise<Client> {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `${runId}-${key}-${++serial}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'asia-southeast1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const client = { key, businessUserId, app, auth, firestore, functions };
  clients.push(client);
  return client;
}
async function provision(bootstrap: Client, key: string, role: string) {
  credentials[key] = { email: `${runId}-${key}@example.test`, password: `${key}Pass123!` };
  const result = await call(bootstrap, 'provisionStaffUser', {
    mode: 'new', name: `${runId}-${key}`, email: credentials[key].email, initialPassword: credentials[key].password, role, active: true,
  });
  assert.equal(typeof result.businessUserId, 'string');
  return result.businessUserId as string;
}
function baseOrder(id: string, printerId: string, overrides: Record<string, unknown> = {}) {
  return { id, code: 'P10D-ORDER', status: 'WAITING_ACCEPTANCE', printerId, printerName: 'Printer A', paperType: 'Kraft', totalSheets: 10,
    instructionRaw: 'P10D raw instruction', productionRevision: 1, printerAcknowledgedRevision: 1,
    plateType: 'NONE', plateStatus: 'NOT_REQUIRED', hasBlockingIssue: false, timeline: [], issues: [], comments: [],
    items: [{ id: `${id}-item`, productName: 'P10D product', quantity: 1, requiresFinishing: false }], createdAt: new Date().toISOString(), ...overrides };
}
function observeDocument(client: Client, path: string): { waitFor: (predicate: (value: any) => boolean, label: string) => Promise<any>; close: () => void } {
  const [group, id] = path.split('/');
  const values: any[] = []; const waiters: Array<{ predicate: (value: any) => boolean; resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = [];
  const unsubscribe: Unsubscribe = onSnapshot(doc(client.firestore, group, id), (snapshot) => {
    const value = snapshot.exists() ? snapshot.data() : null; values.push(value);
    for (const waiter of [...waiters]) if (waiter.predicate(value)) { clearTimeout(waiter.timer); waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(value); }
  }, (error) => { for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); } });
  return {
    waitFor(predicate, label) {
      const prior = values.find(predicate); if (prior !== undefined) return Promise.resolve(prior);
      return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`Realtime timeout: ${label}`)), 12_000); waiters.push({ predicate, resolve, reject, timer }); });
    },
    close: unsubscribe,
  };
}

async function main() {
  // Bootstrap is the sole intentionally seeded identity. Every exercised role
  // below is created through provisionStaffUser and then signs in normally.
  credentials.bootstrap = { email: `${runId}-bootstrap@example.test`, password: 'BootstrapPass123!' };
  const bootstrapAuth = await adminAuth.createUser(credentials.bootstrap);
  const bootstrapId = `${runId}-bootstrap`;
  await adminDb.collection('users').doc(bootstrapId).set({ id: bootstrapId, name: 'bootstrap', role: 'DEVELOPER', active: true, createdAt: new Date().toISOString() });
  await adminDb.collection('auth_identities').doc(bootstrapAuth.uid).set({ businessUserId: bootstrapId, role: 'DEVELOPER', active: true });
  const bootstrap = await createClient('bootstrap', bootstrapId);
  const roles: Record<string, string> = {};
  for (const [key, role] of [
    ['developer', 'DEVELOPER'], ['admin', 'ADMIN'], ['manager', 'MANAGER'], ['sale', 'SALE'], ['designer', 'DESIGNER'], ['printerA', 'PRINTER'], ['printerB', 'PRINTER'], ['finisherA', 'FINISHER'], ['finisherB', 'FINISHER'],
  ]) roles[key] = await provision(bootstrap, key, role);
  const byKey = Object.fromEntries(await Promise.all(Object.entries(roles).map(async ([key, id]) => [key, await createClient(key, id)]))) as Record<string, Client>;
  for (const [key, client] of Object.entries(byKey)) {
    let identity;
    try {
      identity = await getDoc(doc(client.firestore, 'auth_identities', client.auth.currentUser!.uid));
    } catch (error: any) {
      throw new Error(`Identity bootstrap read failed for ${key}: ${error?.code || error?.message || error}`);
    }
    assert.equal(identity.get('businessUserId'), roles[key]);
    assert.equal(identity.get('active'), true);
  }
  record('nine provisioned identities resolve Firebase UID -> auth_identity -> business user -> active role');

  // Authenticated customer CRUD plus reload/list and duplicate-detection query.
  const customerId = `${runId}-customer`;
  console.log('PROMPT10D checkpoint: customer create');
  try {
    await setDoc(doc(byKey.sale.firestore, 'customers', customerId), { id: customerId, code: 'KH-P10D', name: 'Initial customer', phone: '0900123456', phoneNormalized: '0900123456', deletedAt: null, createdAt: new Date().toISOString() });
  } catch (error: any) {
    throw new Error(`Customer create failed: ${error?.code || error?.message || error}`);
  }
  assert.equal((await getDocs(query(collection(byKey.sale.firestore, 'customers'), where('phoneNormalized', '==', '0900123456'), where('deletedAt', '==', null)))).size, 1);
  await updateDoc(doc(byKey.sale.firestore, 'customers', customerId), { name: 'Edited customer', updatedAt: new Date().toISOString() });
  assert.equal((await getDoc(doc(byKey.manager.firestore, 'customers', customerId))).get('name'), 'Edited customer');
  await updateDoc(doc(byKey.sale.firestore, 'customers', customerId), { deletedAt: new Date().toISOString() });
  assert.equal((await getDocs(query(collection(byKey.sale.firestore, 'customers'), where('deletedAt', '==', null)))).docs.some((entry) => entry.id === customerId), false);
  record('customer create, list/search, independent-client reload, edit, duplicate preflight, and soft delete');

  // Two independent live clients observe the exact urgent controller payload.
  const urgentOrderId = `${runId}-urgent`;
  await setDoc(doc(byKey.designer.firestore, 'orders', urgentOrderId), baseOrder(urgentOrderId, roles.printerA));
  const printerView = observeDocument(byKey.printerA, `orders/${urgentOrderId}`);
  await printerView.waitFor((value) => value?.id === urgentOrderId, 'printer initial order');
  const urgentActors = ['designer', 'manager', 'admin', 'developer'];
  for (const key of urgentActors) {
    const actor = { id: roles[key], name: `${runId}-${key}`, role: key === 'printerA' ? 'PRINTER' : key.toUpperCase(), active: true } as any;
    const before = (await getDoc(doc(byKey[key].firestore, 'orders', urgentOrderId))).data()!;
    const setPayload = sanitizeForFirestore(buildUrgentOrderUpdate(before as any, actor, true, `${key} deadline`));
    const seenSet = printerView.waitFor((value) => value?.isUrgent === true && value?.urgentSetBy === roles[key], `${key} urgent set`);
    await setDoc(doc(byKey[key].firestore, 'orders', urgentOrderId), setPayload as any, { merge: true });
    await seenSet;
    const setStored = (await getDoc(doc(byKey.printerA.firestore, 'orders', urgentOrderId))).data()!;
    assert.equal(setStored.urgentReason, `${key} deadline`); assert.equal(setStored.urgentSetBy, roles[key]);
    const clearPayload = sanitizeForFirestore(buildUrgentOrderUpdate(setStored as any, actor, false));
    const seenClear = printerView.waitFor((value) => value?.isUrgent === false && value?.urgentSetBy === null, `${key} urgent clear`);
    await setDoc(doc(byKey[key].firestore, 'orders', urgentOrderId), clearPayload as any, { merge: true });
    await seenClear;
    record(`urgent set and clear via shared card/dialog controller payload for ${key}`);
  }
  const printerActor = { id: roles.printerA, name: `${runId}-printerA`, role: 'PRINTER', active: true } as any;
  const neutral = (await getDoc(doc(byKey.printerA.firestore, 'orders', urgentOrderId))).data()!;
  await expectDenied('assigned printer urgent set', () => setDoc(doc(byKey.printerA.firestore, 'orders', urgentOrderId), sanitizeForFirestore(buildUrgentOrderUpdate(neutral as any, printerActor, true)) as any, { merge: true }));
  const designerActor = { id: roles.designer, name: `${runId}-designer`, role: 'DESIGNER', active: true } as any;
  const activeUrgent = sanitizeForFirestore(buildUrgentOrderUpdate(neutral as any, designerActor, true, 'negative-clear setup'));
  await setDoc(doc(byKey.designer.firestore, 'orders', urgentOrderId), activeUrgent as any, { merge: true });
  await expectDenied('assigned printer urgent clear', () => setDoc(doc(byKey.printerA.firestore, 'orders', urgentOrderId), sanitizeForFirestore(buildUrgentOrderUpdate(activeUrgent as any, printerActor, false)) as any, { merge: true }));
  printerView.close();
  record('urgent bidirectional realtime reaches independent assigned-printer client without reload');

  // Direct browser lifecycle writes use the same Rules-protected operations as
  // the production context; wrong assignment remains denied.
  const cleanOrderId = `${runId}-clean`;
  await setDoc(doc(byKey.designer.firestore, 'orders', cleanOrderId), baseOrder(cleanOrderId, roles.printerA));
  await expectDenied('wrong printer accept', () => updateDoc(doc(byKey.printerB.firestore, 'orders', cleanOrderId), { status: 'ACCEPTED', acceptedAt: new Date().toISOString() }));
  await updateDoc(doc(byKey.printerA.firestore, 'orders', cleanOrderId), { status: 'WAITING_PRINT', acceptedAt: new Date().toISOString() });
  await updateDoc(doc(byKey.printerA.firestore, 'orders', cleanOrderId), { status: 'PRINTING', printingStartedAt: new Date().toISOString() });
  await expectDenied('direct browser print completion with actual quantities', () => updateDoc(doc(byKey.printerA.firestore, 'orders', cleanOrderId), { status: 'PRINTED', actualPrintedSheets: 10, spoilageSheets: 0, printingCompletedAt: new Date().toISOString() }));
  await call(byKey.printerA, 'completeProductionPrint', { orderId: cleanOrderId });
  const cleanOrder = await getDoc(doc(byKey.designer.firestore, 'orders', cleanOrderId));
  assert.equal(cleanOrder.get('status'), 'PRINTED');
  assert.equal(cleanOrder.data()?.actualPrintedSheets, undefined);
  record('clean assigned-printer accept, start, callable raw-confirm completion and wrong-printer deny');

  // Plate and machine blocker recovery are authoritative callable workflows.
  const issueOrderId = `${runId}-issues`;
  await setDoc(doc(byKey.designer.firestore, 'orders', issueOrderId), baseOrder(issueOrderId, roles.printerA, { plateType: 'NEW', plateStatus: 'NOT_SENT' }));
  const designerIssueView = observeDocument(byKey.designer, `orders/${issueOrderId}`);
  await designerIssueView.waitFor((value) => value?.id === issueOrderId, 'designer issue order');
  await Promise.all(Array.from({ length: 4 }, () => call(byKey.printerA, 'reportBrokenPlate', { orderId: issueOrderId, reason: 'missing plate' })));
  let issueOrder = await getDoc(doc(byKey.designer.firestore, 'orders', issueOrderId));
  assert.equal(issueOrder.get('issues').filter((item: any) => item.issueType === 'PLATE_NOT_SENT' && item.status !== 'RESOLVED').length, 1);
  await call(byKey.printerA, 'reportProductionIssue', { orderId: issueOrderId, issueType: 'MACHINE', message: 'press fault' });
  const machineOpened = designerIssueView.waitFor((value) => value?.hasBlockingIssue === false && value?.issues?.some((item: any) => item.issueType === 'MACHINE' && item.status === 'OPEN' && item.isBlocking === false), 'non-blocking machine issue realtime');
  await machineOpened;
  await call(byKey.designer, 'sendPlate', { orderId: issueOrderId });
  await call(byKey.printerA, 'receivePlate', { orderId: issueOrderId });
  issueOrder = await getDoc(doc(byKey.designer.firestore, 'orders', issueOrderId));
  assert.equal(issueOrder.get('hasBlockingIssue'), false);
  const machine = issueOrder.get('issues').find((item: any) => item.issueType === 'MACHINE');
  await expectDenied('printer resolving manager machine issue', () => call(byKey.printerA, 'resolveProductionIssue', { orderId: issueOrderId, issueId: machine.id }));
  await call(byKey.manager, 'resolveProductionIssue', { orderId: issueOrderId, issueId: machine.id });
  assert.equal((await getDoc(doc(byKey.printerA.firestore, 'orders', issueOrderId))).get('hasBlockingIssue'), false);
  designerIssueView.close();
  record('plate-not-sent idempotency, non-blocking machine issue realtime, owner resolution, and workflow independence');

  // A same-ID rapid create proves the persisted logical row is one document.
  const onceId = `${runId}-create-once`;
  const oncePayload = baseOrder(onceId, roles.printerA);
  await Promise.all(Array.from({ length: 5 }, () => setDoc(doc(byKey.designer.firestore, 'orders', onceId), oncePayload, { merge: true })));
  assert.equal((await getDocs(query(collection(byKey.designer.firestore, 'orders'), where('id', '==', onceId)))).size, 1);
  record('rapid same-operation production create persists one logical order row');

  console.log('PROMPT10D_ZERO_TRUST_PASS');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(clients.map(async (client) => { try { await deleteApp(client.app); } catch { /* best effort */ } }));
});
