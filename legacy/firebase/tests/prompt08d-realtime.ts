/* Prompt 08D: independent Firebase-client realtime proof.
 * Every workflow assertion below is fulfilled by a listener callback; this
 * test deliberately imports neither getDoc nor getDocs. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getFirestore, onSnapshot, query, setDoc, updateDoc, where, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { getProductionEligibility } from '../src/utils/productionEligibility';

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
// The test is bundled into the OS temp directory, so resolve the Functions
// dependency from the emulator script's workspace cwd rather than __dirname.
const functionsRequire = createRequire(`${process.cwd()}\\functions\\package.json`);
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore: getAdminFirestore } = functionsRequire('firebase-admin/firestore');
const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

let serial = 0;
const runId = `p08d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const bootstrap = { email: `${runId}-bootstrap@example.test`, password: 'BootstrapPass123!' };
const credentials: Record<string, { email: string; password: string }> = { bootstrap };
const observers: Observer<EventValue>[] = [];
const clients: Client[] = [];

type Client = { label: string; app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions; uid: string; businessUserId: string };
type EventValue = Record<string, unknown> | Record<string, unknown>[] | null;

class Observer<T extends EventValue> {
  private readonly events: T[] = [];
  private readonly waiters: Array<{ predicate: (value: T) => boolean; resolve: (value: T) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = [];
  private readonly unsubscribe: Unsubscribe;
  readonly ready: Promise<void>;

  constructor(read: (snapshot: any) => T, label: string, subscribe: (next: (snapshot: any) => void, error: (error: Error) => void) => Unsubscribe) {
    let markReady!: () => void;
    this.ready = new Promise((resolve) => { markReady = resolve; });
    let initialized = false;
    this.unsubscribe = subscribe((snapshot) => {
      const value = read(snapshot);
      this.events.push(value);
      if (!initialized) { initialized = true; markReady(); }
      for (const waiter of [...this.waiters]) {
        if (waiter.predicate(value)) {
          clearTimeout(waiter.timer);
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(value);
        }
      }
    }, (error) => {
      for (const waiter of this.waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); }
    });
    observers.push(this as unknown as Observer<EventValue>);
    void label;
  }

  expect(predicate: (value: T) => boolean, label: string, timeoutMs = 12_000): Promise<T> {
    const prior = this.events.find(predicate);
    if (prior !== undefined) return Promise.resolve(prior);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`Realtime timeout: ${label}`));
      }, timeoutMs);
      const waiter = { predicate, resolve, reject, timer };
      this.waiters.push(waiter);
    });
  }

  close() { this.unsubscribe(); }
}

function observeDoc(client: Client, collectionName: string, id: string) {
  return new Observer<Record<string, unknown> | null>((snapshot) => snapshot.exists() ? snapshot.data() : null, `${client.label}:${collectionName}/${id}`, (next, error) => onSnapshot(doc(client.firestore, collectionName, id), next, error));
}

function observeBySalesOrder(client: Client, collectionName: string, salesOrderId: string) {
  return new Observer<Record<string, unknown>[]>((snapshot) => snapshot.docs.map((entry: any) => entry.data()), `${client.label}:${collectionName}`, (next, error) => onSnapshot(query(collection(client.firestore, collectionName), where('salesOrderId', '==', salesOrderId)), next, error));
}

function byStatus(status: string) { return (value: EventValue) => !!value && !Array.isArray(value) && value.status === status; }
function hasStatus(status: string) { return (value: EventValue) => Array.isArray(value) && value.some((entry) => entry.salesOrderId && entry.status === status); }
function orderState(value: EventValue) { assert(value && !Array.isArray(value)); return value as Record<string, any>; }

async function createClient(label: string, key: string, businessUserId: string): Promise<Client> {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `${runId}-${label}-${++serial}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const client = { label, app, auth, firestore, functions, uid: auth.currentUser!.uid, businessUserId };
  clients.push(client);
  return client;
}

async function call(client: Client, name: string, data: Record<string, unknown>) {
  return (await httpsCallable(client.functions, name)(data)).data as Record<string, any>;
}

async function provision(bootstrapClient: Client, key: string, role: string) {
  const email = `${runId}-${key}@example.test`;
  const password = `${key}Pass123!`;
  const result = await call(bootstrapClient, 'provisionStaffUser', { mode: 'new', name: `${runId}-${key}`, email, initialPassword: password, role, active: true });
  credentials[key] = { email, password };
  assert.equal(typeof result.businessUserId, 'string');
  return result.businessUserId as string;
}

function eligibility(value: EventValue) { return getProductionEligibility(orderState(value) as Parameters<typeof getProductionEligibility>[0]); }

async function main() {
  const bootstrapUser = await adminAuth.createUser({ email: bootstrap.email, password: bootstrap.password });
  await adminDb.collection('users').doc(`${runId}-bootstrap`).set({ id: `${runId}-bootstrap`, name: 'bootstrap', role: 'DEVELOPER', active: true, createdAt: new Date().toISOString() });
  await adminDb.collection('auth_identities').doc(bootstrapUser.uid).set({ businessUserId: `${runId}-bootstrap`, role: 'DEVELOPER', active: true });
  const bootstrapClient = await createClient('bootstrap', 'bootstrap', `${runId}-bootstrap`);
  const [developerId, printerId, finisherId, saleId] = await Promise.all([
    provision(bootstrapClient, 'developer', 'DEVELOPER'), provision(bootstrapClient, 'printer', 'PRINTER'), provision(bootstrapClient, 'finisher', 'FINISHER'), provision(bootstrapClient, 'sale', 'SALE'),
  ]);
  const [clientA, clientB, finisher, sale] = await Promise.all([
    createClient('A-developer', 'developer', developerId), createClient('B-printer', 'printer', printerId), createClient('finisher', 'finisher', finisherId), createClient('sale', 'sale', saleId),
  ]);
  assert.notEqual(clientA.app.name, clientB.app.name);
  assert.notEqual(clientA.auth, clientB.auth);
  assert.notEqual(clientA.firestore, clientB.firestore);
  assert.notEqual(clientA.uid, clientB.uid);
  console.log('PASS independent Firebase apps, Auth, Firestore, and provisioned identities');

  const now = new Date().toISOString();
  const customerId = `${runId}-customer`, salesOrderId = `${runId}-sales`, salesItemId = `${runId}-item`, orderId = `${runId}-production`, productionItemId = `${runId}-production-item`;
  await setDoc(doc(sale.firestore, 'customers', customerId), { id: customerId, name: 'Realtime customer', phone: '0900000000', phoneNormalized: '0900000000', deletedAt: null, createdAt: now });
  await setDoc(doc(sale.firestore, 'sales_orders', salesOrderId), { id: salesOrderId, code: `${runId}-SO`, status: 'DRAFT', customerId, customerSnapshot: { name: 'Realtime customer' }, saleId, totalItems: 1, deletedAt: null, createdAt: now });
  await setDoc(doc(sale.firestore, 'sales_order_items', salesItemId), { id: salesItemId, salesOrderId, customerId, productName: 'Realtime bag', quantity: 10, requiresProduction: true, requiresFinishing: true, status: 'NEW', deletedAt: null, createdAt: now });
  await call(sale, 'confirmSalesOrder', { salesOrderId });

  const printerOrder = observeDoc(clientB, 'orders', orderId);
  await printerOrder.ready;
  const waiting = printerOrder.expect((value) => byStatus('WAITING_ACCEPTANCE')(value) && eligibility(value).canAccept, 'printer receives WAITING_ACCEPTANCE and canAccept');
  await setDoc(doc(clientA.firestore, 'orders', orderId), { id: orderId, code: `${runId}-PO`, status: 'WAITING_ACCEPTANCE', printerId, printerName: 'Realtime printer', paperType: 'Kraft', totalSheets: 10, productionRevision: 1, printerAcknowledgedRevision: 0, plateType: 'NEW', plateStatus: 'NOT_SENT', hasBlockingIssue: false, timeline: [], issues: [], comments: [], items: [{ id: productionItemId, salesOrderId, salesOrderItemId: salesItemId, customerId, productName: 'Realtime bag', quantity: 10 }], createdAt: now });
  await waiting;
  console.log('PASS assignment realtime: B listener received WAITING_ACCEPTANCE before/after A mutation');

  const developerOrder = observeDoc(clientA, 'orders', orderId);
  await developerOrder.ready;
  const accepted = developerOrder.expect((value) => byStatus('ACCEPTED')(value) && !eligibility(value).canAccept, 'developer receives ACCEPTED');
  await updateDoc(doc(clientB.firestore, 'orders', orderId), { status: 'ACCEPTED', acceptedAt: new Date().toISOString() });
  await accepted;
  await updateDoc(doc(clientB.firestore, 'orders', orderId), { printerAcknowledgedRevision: 1, updatedAt: new Date().toISOString() });
  console.log('PASS accept realtime and listener-derived canAccept false');

  const sent = printerOrder.expect((value) => value && !Array.isArray(value) && value.plateStatus === 'SENT' && eligibility(value).canStartPrint, 'printer receives informational plate SENT');
  await call(clientA, 'sendPlate', { orderId });
  await sent;
  const received = developerOrder.expect((value) => value && !Array.isArray(value) && value.plateStatus === 'RECEIVED' && eligibility(value).canStartPrint, 'developer receives plate RECEIVED');
  await call(clientB, 'receivePlate', { orderId });
  await received;
  console.log('PASS informational plate SENT/RECEIVED does not gate listener-derived start eligibility');

  const printing = developerOrder.expect((value) => byStatus('PRINTING')(value) && eligibility(value).canCompletePrint, 'developer receives PRINTING');
  await updateDoc(doc(clientB.firestore, 'orders', orderId), { status: 'PRINTING', printingStartedAt: new Date().toISOString() });
  await printing;
  const taskId = `ft_${orderId}_${productionItemId}`;
  const taskListener = observeDoc(finisher, 'finishing_tasks', taskId);
  await taskListener.ready;
  const printed = developerOrder.expect((value) => byStatus('PRINTED')(value) && !eligibility(value).canCompletePrint, 'developer receives PRINTED');
  const taskReady = taskListener.expect((value) => byStatus('READY')(value), 'finisher receives product checkpoint READY');
  await call(clientB, 'completeProductionPrint', { orderId });
  await Promise.all([printed, taskReady]);
  console.log('PASS printing completion confirms raw instructions without actual quantity and fans out product task');

  const claimed = taskListener.expect((value) => byStatus('CLAIMED')(value), 'finisher receives product CLAIMED');
  await call(finisher, 'claimFinishingTask', { taskId });
  await claimed;
  const finishedGoodId = `fg_finish_${taskId}`;
  const goodListener = observeDoc(finisher, 'finished_goods', finishedGoodId);
  await goodListener.ready;
  const completed = taskListener.expect((value) => byStatus('COMPLETED')(value), 'product finishing COMPLETED');
  const goodCreated = goodListener.expect((value) => value && !Array.isArray(value) && value.status === 'READY', 'finisher receives finished-good state');
  const readyToShip = observeDoc(clientA, 'sales_orders', salesOrderId);
  await readyToShip.ready;
  const salesReady = readyToShip.expect((value) => byStatus('READY_TO_SHIP')(value), 'sales order ready to ship');
  await call(finisher, 'completeFinishingTask', { taskId });
  await Promise.all([completed, goodCreated]);
  await salesReady;
  console.log('PASS product-centric finishing realtime: READY, CLAIMED, COMPLETED, and finished-good callback');

  const dispatchQuery = observeBySalesOrder(clientA, 'warehouse_dispatches', salesOrderId);
  await dispatchQuery.ready;
  const dispatchDraft = dispatchQuery.expect((value) => Array.isArray(value) && value.some((entry) => entry.salesOrderId === salesOrderId && entry.status === 'DRAFT'), 'other client receives dispatch draft');
  const dispatch = await call(sale, 'createWarehouseDispatch', { salesOrderId, items: [{ finishedGoodId, quantity: 10 }], dispatchMethod: 'INTERNAL_DELIVERY' });
  await dispatchDraft;
  const dispatchListener = observeDoc(clientB, 'warehouse_dispatches', dispatch.dispatchId);
  const inventoryListener = observeDoc(clientB, 'finished_goods', finishedGoodId);
  await Promise.all([dispatchListener.ready, inventoryListener.ready]);
  const dispatched = dispatchListener.expect((value) => byStatus('DISPATCHED')(value), 'printer client receives confirmed dispatch');
  const inventoryMoved = inventoryListener.expect((value) => byStatus('DISPATCHED')(value), 'printer client receives dispatched inventory');
  await call(clientA, 'confirmWarehouseDispatch', { dispatchId: dispatch.dispatchId });
  await Promise.all([dispatched, inventoryMoved]);
  console.log('PASS dispatch realtime including independent inventory callback');

  const shipmentQuery = observeBySalesOrder(clientB, 'shipments', salesOrderId);
  await shipmentQuery.ready;
  const shipmentReady = shipmentQuery.expect((value) => Array.isArray(value) && value.some((entry) => entry.salesOrderId === salesOrderId && entry.status === 'READY'), 'printer client receives shipment READY');
  const shipment = await call(sale, 'createShipment', { dispatchId: dispatch.dispatchId, method: 'INTERNAL_DELIVERY', receiver: { name: 'Realtime receiver', phone: '0900000000', address: 'Realtime address' }, packageCount: 1, weightGrams: 100, codAmount: 0 });
  await shipmentReady;
  const shipmentListener = observeDoc(clientA, 'shipments', shipment.shipmentId);
  await shipmentListener.ready;
  for (const targetStatus of ['CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
    const delivered = shipmentListener.expect((value) => byStatus(targetStatus)(value), `developer receives shipment ${targetStatus}`);
    await call(sale, 'transitionShipment', { shipmentId: shipment.shipmentId, targetStatus });
    await delivered;
  }
  console.log('PASS shipment realtime: READY through DELIVERED observed by independent listeners');
  console.log('PROMPT08D_REALTIME_PASS');
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  for (const observer of observers) observer.close();
  await Promise.all(clients.map(async (client) => { try { await deleteApp(client.app); } catch { /* cleanup best effort */ } }));
});
