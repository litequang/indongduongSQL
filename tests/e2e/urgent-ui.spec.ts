import { expect, test, type Browser, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
const runId = `p10e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const credentials: Record<string, { email: string; password: string }> = {};
const requireFunctions = createRequire(`${process.cwd()}\\functions\\package.json`);
const { getApps, initializeApp: initializeAdminApp } = requireFunctions('firebase-admin/app');
const { getAuth: getAdminAuth } = requireFunctions('firebase-admin/auth');
const { getFirestore: getAdminFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

type Client = { app: FirebaseApp; auth: Auth; firestore: Firestore; functions: Functions; businessUserId: string };
const clients: Client[] = [];
const users: Record<string, Client> = {};
let orderId = '';

async function makeClient(key: string, businessUserId: string): Promise<Client> {
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com`, projectId }, `${runId}-${key}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  const functions = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const client = { app, auth, firestore, functions, businessUserId };
  clients.push(client);
  return client;
}

async function provision(bootstrap: Client, key: string, role: string) {
  credentials[key] = { email: `${runId}-${key}@example.test`, password: `${key}Pass123!` };
  const result = await httpsCallable(bootstrap.functions, 'provisionStaffUser')({
    mode: 'new', name: `${runId}-${key}`, email: credentials[key].email,
    initialPassword: credentials[key].password, role, active: true,
  });
  const businessUserId = String((result.data as { businessUserId: string }).businessUserId);
  users[key] = await makeClient(key, businessUserId);
}

async function login(page: Page, key: string) {
  await page.goto('/');
  await expect(page.getByText('Firebase Authentication required')).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(credentials[key].email);
  await page.locator('input[type="password"]').fill(credentials[key].password);
  await page.getByRole('button', { name: /sign in with firebase/i }).click();
  await expect(page.getByText('Firebase Authentication required')).toBeHidden({ timeout: 20_000 });
}

async function openOrder(page: Page) {
  await expect(page.getByText(`#P10E-${runId}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByTitle(/xem chi tiết lệnh/i).first().click();
}

async function toggleUrgentInCard(page: Page, expectUrgent: boolean) {
  const selector = expectUrgent ? /báo cần gấp/i : /đã báo gấp/i;
  await page.getByRole('button', { name: selector }).click();
  await expect(page.getByRole('button', { name: expectUrgent ? /đã báo gấp/i : /báo cần gấp/i })).toBeVisible({ timeout: 15_000 });
}

async function toggleUrgentInDialog(page: Page, expectUrgent: boolean) {
  // The large-dialog action is deliberately available only after expanding
  // the card.  Open it through its real visible button instead of clicking
  // the card body (which would collapse the accordion).
  await page.getByRole('button', { name: /hộp thoại to/i }).click();
  const selector = expectUrgent ? /đánh dấu gấp/i : /đã báo gấp/i;
  // The expanded card remains mounted behind the modal and has a matching
  // action, so target the last match: the modal is rendered last in the DOM.
  await page.getByRole('button', { name: selector }).last().click();
  await expect(page.getByRole('button', { name: expectUrgent ? /đã báo gấp/i : /báo cần gấp/i }).first()).toBeVisible({ timeout: 15_000 });
}

test.beforeAll(async () => {
  credentials.bootstrap = { email: `${runId}-bootstrap@example.test`, password: 'BootstrapPass123!' };
  const bootstrapAuth = await adminAuth.createUser(credentials.bootstrap);
  const bootstrapBusinessId = `${runId}-bootstrap`;
  await adminDb.collection('users').doc(bootstrapBusinessId).set({ id: bootstrapBusinessId, name: 'bootstrap', role: 'DEVELOPER', active: true, createdAt: new Date().toISOString() });
  await adminDb.collection('auth_identities').doc(bootstrapAuth.uid).set({ businessUserId: bootstrapBusinessId, role: 'DEVELOPER', active: true });
  const bootstrap = await makeClient('bootstrap', bootstrapBusinessId);
  for (const [key, role] of [['developer', 'DEVELOPER'], ['admin', 'ADMIN'], ['manager', 'MANAGER'], ['designer', 'DESIGNER'], ['sale', 'SALE'], ['printer', 'PRINTER'], ['finisher', 'FINISHER']] as const) {
    await provision(bootstrap, key, role);
  }
  orderId = `${runId}-urgent`;
  await adminDb.collection('orders').doc(orderId).set({
    id: orderId, code: `P10E-${runId}`, productName: 'Browser urgent order', status: 'WAITING_ACCEPTANCE',
    printerId: users.printer.businessUserId, printerName: `${runId}-printer`, paperType: 'Kraft', paperGsm: '70',
    totalSheets: 10, plateType: 'NONE', plateStatus: 'NOT_REQUIRED', hasBlockingIssue: false,
    isUrgent: false, timeline: [], issues: [], comments: [], items: [], createdAt: new Date().toISOString(),
    // Production-compatible legacy data: the browser control must not rewrite
    // this field while it only sets or clears urgent metadata.
    plateSentAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
});

test.afterAll(async () => { await Promise.all(clients.map(({ app }) => deleteApp(app).catch(() => undefined))); });

test('high-authority roles use card and detail urgent controls; printer has neither control', async ({ browser }) => {
  for (const key of ['designer', 'manager', 'admin', 'developer']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, key);
    await openOrder(page);
    await toggleUrgentInCard(page, true);
    await toggleUrgentInDialog(page, false);
    await context.close();
  }

  const printerContext = await browser.newContext();
  const printerPage = await printerContext.newPage();
  await login(printerPage, 'printer');
  await openOrder(printerPage);
  await expect(printerPage.getByRole('button', { name: /báo cần gấp|đánh dấu gấp|đã báo gấp/i })).toHaveCount(0);
  await printerContext.close();
});

test('DEVELOPER urgent set and clear are realtime, persistent, and legacy-safe', async ({ browser }) => {
  const developerContext = await browser.newContext();
  const managerContext = await browser.newContext();
  const developer = await developerContext.newPage();
  const manager = await managerContext.newPage();
  await login(developer, 'developer');
  await login(manager, 'manager');
  await openOrder(developer);
  await openOrder(manager);

  await toggleUrgentInCard(developer, true);
  await expect(manager.getByRole('button', { name: /đã báo gấp/i }).first()).toBeVisible({ timeout: 15_000 });
  const setSnapshot = await adminDb.collection('orders').doc(orderId).get();
  expect(setSnapshot.get('isUrgent')).toBe(true);
  expect(typeof setSnapshot.get('plateSentAt')?.toDate).toBe('function');

  await manager.reload();
  await openOrder(manager);
  await expect(manager.getByRole('button', { name: /đã báo gấp/i }).first()).toBeVisible({ timeout: 15_000 });

  await toggleUrgentInCard(developer, false);
  const clearSnapshot = await adminDb.collection('orders').doc(orderId).get();
  expect(clearSnapshot.get('isUrgent')).toBe(false);
  expect(typeof clearSnapshot.get('plateSentAt')?.toDate).toBe('function');
  await expect(manager.getByRole('button', { name: /báo cần gấp/i }).first()).toBeVisible({ timeout: 15_000 });
  await Promise.all([developerContext.close(), managerContext.close()]);
});
