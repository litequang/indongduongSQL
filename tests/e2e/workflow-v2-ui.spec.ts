import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
const runId = `p12-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const requireFunctions = createRequire(`${process.cwd()}\\functions\\package.json`);
const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
const { getAuth } = requireFunctions('firebase-admin/auth');
const { getFirestore, Timestamp } = requireFunctions('firebase-admin/firestore');
const adminApp = getApps().length ? getApps()[0] : initializeApp({ projectId });
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);

type TestUser = { id: string; name: string; role: string; email: string; password: string };
const users: Record<string, TestUser> = {};
const contexts: BrowserContext[] = [];

const salesOrderId = `${runId}-sales`;
const finishItemId = `${runId}-item-finish`;
const confirmItemId = `${runId}-item-confirm`;
const directItemId = `${runId}-item-direct`;
const directGoodId = `fg_direct_${directItemId}`;
const productionId = `${runId}-production`;
const productionCode = `P12-${runId}`;
const cancelAcceptId = `${runId}-cancel-accept`;
const cancelRejectId = `${runId}-cancel-reject`;
const cancelAcceptCode = `P12-CA-${runId}`;
const cancelRejectCode = `P12-CR-${runId}`;

async function seedUser(key: string, role: string, name: string) {
  const id = `${runId}-${key}`;
  const email = `${id}@example.test`;
  const password = `${key}Pass123!`;
  const authUser = await adminAuth.createUser({ email, password, displayName: name });
  await Promise.all([
    adminDb.collection('users').doc(id).set({ id, name, email, role, active: true, createdAt: new Date().toISOString() }),
    adminDb.collection('auth_identities').doc(authUser.uid).set({ businessUserId: id, role, active: true }),
  ]);
  users[key] = { id, name, role, email, password };
}

async function login(browser: Browser, key: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto('/');
  await expect(page.getByText('Firebase Authentication required')).toBeVisible({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(users[key].email);
  await page.locator('input[type="password"]').fill(users[key].password);
  await page.getByRole('button', { name: /sign in with firebase/i }).click();
  await expect(page.getByText('Firebase Authentication required')).toBeHidden({ timeout: 20_000 });
  return page;
}

async function clickNav(page: Page, name: RegExp) {
  await page.locator('aside').getByRole('button', { name }).click();
}

async function getCard(page: Page, code: string) {
  const card = page.locator(`[id="order-accordion-${code}"]`);
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

async function expandCard(page: Page, code: string) {
  const card = await getCard(page, code);
  const expand = card.getByTitle(/Xem chi tiết lệnh/i);
  if (await expand.count()) await expand.click();
  return card;
}

async function openDetail(page: Page, code: string) {
  const card = await expandCard(page, code);
  await card.getByRole('button', { name: /Hộp thoại to/i }).click();
  await expect(page.locator('.fixed.inset-0').last()).toBeVisible();
}

async function closeTopModal(page: Page) {
  const overlay = page.locator('.fixed.inset-0').last();
  await overlay.locator('button:has(svg.lucide-x)').first().click();
  await expect(overlay).toBeHidden();
}

async function waitForDoc(collection: string, id: string, predicate: (data: FirebaseFirestore.DocumentData | undefined) => boolean) {
  await expect.poll(async () => {
    const snapshot = await adminDb.collection(collection).doc(id).get();
    return predicate(snapshot.exists ? snapshot.data() : undefined);
  }, { timeout: 20_000 }).toBe(true);
}

async function readLocalDrafts(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('flexo-workflow-v2');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ order: { id: string; instructionRaw?: string; items?: unknown[]; draftSync?: { backupStatus?: string } }; images?: Record<string, unknown> }>>((resolve, reject) => {
      const query = database.transaction('production-drafts').objectStore('production-drafts').getAll();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return records.map(record => ({
      id: record.order.id,
      instructionRaw: record.order.instructionRaw,
      itemCount: record.order.items?.length || 0,
      imageCount: Object.keys(record.images || {}).length,
      backupStatus: record.order.draftSync?.backupStatus,
    }));
  });
}

function productionSeed(id: string, code: string, items: FirebaseFirestore.DocumentData[], status = 'WAITING_ACCEPTANCE', legacyTimestampFields = false) {
  return {
    id,
    code,
    createdBy: users.designer.id,
    createdByName: users.designer.name,
    designerId: users.designer.id,
    designerName: users.designer.name,
    printerId: users.printer.id,
    printerName: users.printer.name,
    instructionRaw: `5150 tờ Kraft 70 25x48 - ${code}`,
    productionRevision: 1,
    printerAcknowledgedRevision: 0,
    productName: items.map(item => item.productName).join(', '),
    status,
    paperType: 'Kraft',
    paperGsm: '70',
    paperWidth: '25',
    paperHeight: '48',
    color: 'Nâu',
    totalSheets: 5150,
    plateType: 'NONE',
    plateStatus: 'NOT_REQUIRED',
    items,
    issues: [],
    comments: [],
    timeline: [],
    hasBlockingIssue: false,
    createdAt: new Date().toISOString(),
    // The real Printer accept scenario intentionally includes legacy Firestore
    // Timestamp fields. The UI must not rewrite them while accepting the job.
    ...(legacyTimestampFields ? { plateSentAt: Timestamp.now() } : {}),
    updatedAt: legacyTimestampFields ? Timestamp.now() : new Date().toISOString(),
  };
}

test.beforeAll(async () => {
  await seedUser('designer', 'DESIGNER', 'Thiết kế Prompt 12');
  await seedUser('printer', 'PRINTER', 'Nguyễn Văn Minh');
  await seedUser('manager', 'MANAGER', 'Quản lý Prompt 12');
  await seedUser('finisher', 'FINISHER', 'Gia công Prompt 12');
  await seedUser('finisher2', 'FINISHER', 'Gia công B Prompt 13');
  await seedUser('sale', 'SALE', 'Sale Prompt 12');
  await seedUser('wrongPrinter', 'PRINTER', 'Thợ in sai Prompt 13');
  await seedUser('designer13', 'DESIGNER', 'Thiết kế Prompt 13');
  await seedUser('printer13', 'PRINTER', 'Thoin');
  await seedUser('rapid13', 'DESIGNER', 'Rapid Prompt 13');

  await adminDb.collection('settings').doc('app').set({
    features: { production: true, finishing: true, customer: true, salesOrder: true, warehouseDispatch: true, shipping: false },
    system: { deploymentMode: 'PRODUCTION' },
  }, { merge: true });

  const customerId = `${runId}-customer`;
  await adminDb.collection('sales_orders').doc(salesOrderId).set({
    id: salesOrderId,
    code: `SO-${runId}`,
    customerId,
    customerSnapshot: { name: 'Khách Prompt 12', address: '12 Đường Emulator' },
    status: 'IN_PRODUCTION',
    totalItems: 3,
    createdBy: users.sale.id,
    createdByName: users.sale.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await Promise.all([
    adminDb.collection('sales_order_items').doc(finishItemId).set({
      id: finishItemId, salesOrderId, customerId, productName: 'Túi cần gia công P12', quantity: 4,
      requiresProduction: true, requiresFinishing: true, status: 'IN_PRODUCTION',
      allocatedQuantity: 4, linkedProductionItemIds: [`${productionId}-finish`], finishingTaskIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }),
    adminDb.collection('sales_order_items').doc(confirmItemId).set({
      id: confirmItemId, salesOrderId, customerId, productName: 'Túi không gia công P12', quantity: 3,
      requiresProduction: true, requiresFinishing: false, status: 'IN_PRODUCTION',
      allocatedQuantity: 3, linkedProductionItemIds: [`${productionId}-confirm`], finishingTaskIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }),
    adminDb.collection('sales_order_items').doc(directItemId).set({
      id: directItemId, salesOrderId, customerId, productName: 'Túi đi thẳng kho P13', quantity: 2,
      requiresProduction: false, requiresFinishing: false, status: 'WAREHOUSE_READY',
      allocatedQuantity: 0, linkedProductionItemIds: [], finishingTaskIds: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }),
    adminDb.collection('finished_goods').doc(directGoodId).set({
      id: directGoodId, sourceType: 'DIRECT_SALES', salesOrderId, salesOrderItemId: directItemId,
      customerId, productName: 'Túi đi thẳng kho P13',
      customerSnapshot: { name: 'Khách Prompt 12', address: '12 Đường Emulator' },
      orderedQuantity: 2, producedQuantity: 2, acceptedQuantity: 2,
      dispatchedQuantity: 0, totalDispatchedQuantity: 0, returnedQuantity: 0, restockedQuantity: 0,
      remainingQuantity: 2, quantityUnit: 'BAG', status: 'READY', createdAt: new Date().toISOString(),
    }),
  ]);
  await adminDb.collection('orders').doc(productionId).set(productionSeed(productionId, productionCode, [
    { id: `${productionId}-finish`, salesOrderId, salesOrderItemId: finishItemId, productName: 'Túi cần gia công P12', customerId, customerName: 'Khách Prompt 12', quantity: 5150, allocatedProductQuantity: 4, requiresFinishing: true, imageUrl: '' },
    { id: `${productionId}-confirm`, salesOrderId, salesOrderItemId: confirmItemId, productName: 'Túi không gia công P12', customerId, customerName: 'Khách Prompt 12', quantity: 5150, allocatedProductQuantity: 3, requiresFinishing: false, imageUrl: '' },
  ], 'WAITING_ACCEPTANCE', true));
  await Promise.all([
    adminDb.collection('orders').doc(cancelAcceptId).set(productionSeed(cancelAcceptId, cancelAcceptCode, [
      { id: `${cancelAcceptId}-item`, productName: 'Lệnh hủy đồng ý', quantity: 1200, requiresFinishing: true, imageUrl: '' },
    ])),
    adminDb.collection('orders').doc(cancelRejectId).set(productionSeed(cancelRejectId, cancelRejectCode, [
      { id: `${cancelRejectId}-item`, productName: 'Lệnh hủy từ chối', quantity: 1300, requiresFinishing: true, imageUrl: '' },
    ])),
  ]);
});

test.afterAll(async () => {
  await Promise.all(contexts.map(context => context.close().catch(() => undefined)));
});

test('Prompt 15: Printer nhận lệnh legacy Timestamp qua UI thật', async ({ browser }) => {
  test.setTimeout(120_000);
  const orderId = `${runId}-printer-accept-hotfix`;
  const orderCode = `P15-${runId}`;
  await adminDb.collection('orders').doc(orderId).set(
    productionSeed(orderId, orderCode, [], 'WAITING_ACCEPTANCE', true),
  );

  const printer = await login(browser, 'printer');
  await clickNav(printer, /Lệnh chờ in/i);
  let card = await getCard(printer, orderCode);
  await expect(card.getByRole('button', { name: /Nhận lệnh/i })).toBeVisible();

  const wrongPrinter = await login(browser, 'wrongPrinter');
  await clickNav(wrongPrinter, /Lệnh chờ in/i);
  await expect(wrongPrinter.locator(`[id="order-accordion-${orderCode}"]`)).toHaveCount(0);

  await printer.bringToFront();
  await card.getByRole('button', { name: /Nhận lệnh/i }).click();
  await waitForDoc('orders', orderId, data => data?.status === 'ACCEPTED');
  const accepted = await adminDb.collection('orders').doc(orderId).get();
  expect(typeof accepted.get('plateSentAt')?.toDate).toBe('function');

  card = await expandCard(printer, orderCode);
  const start = card.getByRole('button', { name: 'Bắt đầu in', exact: true });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await waitForDoc('orders', orderId, data => data?.status === 'PRINTING');
});

test('Prompt 13 Lite: local-first, 2 ảnh, 3 offline và batch 5+1 không trùng', async ({ browser }) => {
  test.setTimeout(240_000);
  const designer = await login(browser, 'designer13');
  const quickInput = designer.getByPlaceholder(/VD: Duplex 250/);
  await designer.getByRole('button', { name: /Tùy chỉnh/i }).click();
  const printerSelect = designer.getByText(/Thợ in nhận lệnh/i).locator('..').locator('select');
  const imageInput = designer.locator('form input[type="file"][multiple]');
  const png = readFileSync('Logo-01.png');
  const baseline = (await readLocalDrafts(designer)).length;

  await imageInput.setInputFiles([
    { name: 'p13-mau-1.png', mimeType: 'image/png', buffer: png },
    { name: 'p13-mau-2.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(designer.locator('form img[alt^="Mẫu"]')).toHaveCount(2, { timeout: 20_000 });
  await quickInput.fill('Mỗi màu 2600 tờ BB58 42x56 @Thoin');
  await expect(printerSelect.locator('option', { hasText: '@Thoin' })).toHaveCount(1, { timeout: 20_000 });
  await quickInput.press('Enter');
  await expect(quickInput).toHaveValue('');
  await expect.poll(async () => (await readLocalDrafts(designer)).length).toBe(baseline + 1);
  const imageDraft = (await readLocalDrafts(designer)).find(draft => draft.instructionRaw === 'Mỗi màu 2600 tờ BB58 42x56 @Thoin');
  expect(imageDraft).toMatchObject({ itemCount: 2, imageCount: 2 });

  await designer.context().setOffline(true);
  for (let index = 1; index <= 3; index += 1) {
    await quickInput.fill(`2600 tờ BB58 42x56 @Thoin #${runId}-offline-${index}`);
    await quickInput.press('Enter');
    await expect(quickInput).toHaveValue('');
    await expect.poll(async () => (await readLocalDrafts(designer)).length).toBe(baseline + 1 + index);
  }
  await designer.context().setOffline(false);

  await quickInput.fill(`2600 tờ BB58 42x56 @Thoin #${runId}-valid-5`);
  await quickInput.press('Enter');
  await expect(quickInput).toHaveValue('');
  await quickInput.fill(`2600 tờ BB58 42x56 #${runId}-missing-printer`);
  await printerSelect.selectOption('');
  await quickInput.press('Enter');
  await expect(quickInput).toHaveValue('');
  await expect.poll(async () => (await readLocalDrafts(designer)).length).toBe(baseline + 6);
  await expect.poll(async () => {
    const drafts = await readLocalDrafts(designer);
    const latest = drafts.filter(draft => draft.instructionRaw?.includes(`${runId}-valid-5`) || draft.instructionRaw?.includes(`${runId}-missing-printer`));
    return latest.length === 2 && latest.every(draft => draft.backupStatus === 'BACKED_UP' || draft.backupStatus === 'FAILED');
  }, { timeout: 30_000 }).toBe(true);

  await clickNav(designer, /Lệnh lưu nháp/i);
  await designer.getByRole('button', { name: /Chọn tất cả \(6 lệnh\)/i }).click();
  const firstDialogPromise = new Promise<string>(resolve => {
    designer.once('dialog', async dialog => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });
  await designer.getByRole('button', { name: /GỬI SANG SẢN XUẤT \(6\)/i }).click();
  const firstDialogMessage = await firstDialogPromise;
  expect(firstDialogMessage).toContain('5 đã gửi');
  expect(firstDialogMessage).toContain('1 chưa gửi');
  expect(firstDialogMessage).toContain('Chưa chọn thợ in');

  await expect.poll(async () => {
    const snapshots = await adminDb.collection('orders').where('createdBy', '==', users.designer13.id).get();
    return snapshots.docs.filter(doc => doc.get('clientDraftId')).length;
  }, { timeout: 30_000 }).toBe(5);
  const sent = (await adminDb.collection('orders').where('createdBy', '==', users.designer13.id).get()).docs.filter(doc => doc.get('clientDraftId'));
  expect(new Set(sent.map(doc => doc.get('clientDraftId')))).toHaveProperty('size', 5);
  await expect.poll(async () => (await readLocalDrafts(designer)).length).toBe(baseline + 1);

  const retryDialogPromise = new Promise<string>(resolve => {
    designer.once('dialog', async dialog => {
      const message = dialog.message();
      await dialog.accept();
      resolve(message);
    });
  });
  await designer.getByRole('button', { name: /GỬI SANG SẢN XUẤT \(1\)/i }).click();
  const retryDialogMessage = await retryDialogPromise;
  expect(retryDialogMessage).toContain('0 đã gửi');
  expect(retryDialogMessage).toContain('1 chưa gửi');
  await expect.poll(async () => (await adminDb.collection('orders').where('createdBy', '==', users.designer13.id).get()).docs.filter(doc => doc.get('clientDraftId')).length).toBe(5);
});

test('Workflow V2 chạy xuyên suốt trên trình duyệt thật', async ({ browser }) => {
  test.setTimeout(420_000);

  const designer = await login(browser, 'designer');
  const quickInput = designer.getByPlaceholder(/VD: Duplex 250/);
  await designer.getByRole('button', { name: /Tùy chỉnh/i }).click();
  const printerSelect = designer.getByText(/Thợ in nhận lệnh/i).locator('..').locator('select');
  await quickInput.fill(`2600 tờ BB58 42x56 Minh #${runId}-draft-a`);
  await expect(printerSelect.locator(`option[value="${users.printer.id}"]`)).toHaveCount(1, { timeout: 20_000 });
  await printerSelect.selectOption(users.printer.id);
  await quickInput.press('Enter');
  await expect(quickInput).toHaveValue('');
  await expect.poll(async () => (
    await adminDb.collection('production_draft_backups').where('createdBy', '==', users.designer.id).get()
  ).size, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  await clickNav(designer, /Lệnh lưu nháp/i);
  await designer.getByRole('button', { name: /Chọn tất cả \(1 lệnh\)/i }).click();
  await designer.getByRole('button', { name: /GỬI SANG SẢN XUẤT \(1\)/i }).click();
  await expect.poll(async () => (await readLocalDrafts(designer)).length, { timeout: 30_000 }).toBe(0);
  await expect.poll(async () => (await adminDb.collection('orders').where('createdBy', '==', users.designer.id).get()).docs.filter(doc => doc.get('clientDraftId')).length).toBe(1);

  const printer = await login(browser, 'printer');
  await clickNav(printer, /Lệnh chờ in/i);
  let productionCard = await getCard(printer, productionCode);
  const wrongPrinter = await login(browser, 'wrongPrinter');
  await clickNav(wrongPrinter, /Lệnh chờ in/i);
  await expect(wrongPrinter.locator(`[id="order-accordion-${productionCode}"]`)).toHaveCount(0);
  await printer.bringToFront();
  await productionCard.getByRole('button', { name: /Nhận lệnh/i }).click();
  await waitForDoc('orders', productionId, data => data?.status === 'ACCEPTED');

  await clickNav(designer, /Tất cả lệnh thiết kế/i);
  await openDetail(designer, productionCode);
  await designer.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  await designer.locator('.fixed.inset-0 textarea').last().fill(`5150 tờ Kraft 70 25x48 - hướng dẫn phiên bản 2 ${runId}`);
  await designer.getByRole('button', { name: /Lưu phiên bản mới/i }).click();
  await waitForDoc('orders', productionId, data => data?.productionRevision === 2);
  await closeTopModal(designer);

  await printer.bringToFront();
  await clickNav(printer, /Lệnh chờ in/i);
  productionCard = await expandCard(printer, productionCode);
  await expect(productionCard.getByRole('button', { name: 'Bắt đầu in', exact: true })).toHaveCount(0);
  await expect(productionCard.getByRole('button', { name: 'Xác nhận hướng dẫn', exact: true })).toBeVisible({ timeout: 20_000 });
  await productionCard.getByRole('button', { name: 'Xác nhận hướng dẫn', exact: true }).click();
  await waitForDoc('orders', productionId, data => data?.printerAcknowledgedRevision === 2);

  await designer.bringToFront();
  await clickNav(designer, /Tất cả lệnh thiết kế/i);
  await openDetail(designer, productionCode);
  await designer.getByRole('button', { name: 'Chỉnh sửa', exact: true }).click();
  await designer.locator('.fixed.inset-0 textarea').last().fill(`5150 tờ Kraft 70 25x48 - hướng dẫn phiên bản 3 ${runId}`);
  await designer.getByRole('button', { name: /Lưu phiên bản mới/i }).click();
  await waitForDoc('orders', productionId, data => data?.productionRevision === 3 && data?.printerAcknowledgedRevision === 2);
  await closeTopModal(designer);

  await printer.bringToFront();
  productionCard = await expandCard(printer, productionCode);
  await expect(productionCard.getByRole('button', { name: 'Bắt đầu in', exact: true })).toHaveCount(0);
  await expect(productionCard.getByRole('button', { name: 'Xác nhận hướng dẫn', exact: true })).toBeVisible({ timeout: 20_000 });
  await productionCard.getByRole('button', { name: 'Xác nhận hướng dẫn', exact: true }).click();
  await waitForDoc('orders', productionId, data => data?.printerAcknowledgedRevision === 3);
  await productionCard.getByRole('button', { name: 'Bắt đầu in', exact: true }).click();
  await waitForDoc('orders', productionId, data => data?.status === 'PRINTING');
  await clickNav(printer, /Đang in trên máy/i);
  productionCard = await expandCard(printer, productionCode);

  const urgentIssueMessage = `Máy in lỗi đa người nhận ${runId}`;
  await productionCard.getByRole('button', { name: /Báo sự cố/i }).click();
  const issueModal = printer.locator('.fixed.inset-0').last();
  await issueModal.getByText('MANAGER', { exact: true }).click();
  await issueModal.getByText('DESIGNER', { exact: true }).click();
  await issueModal.locator('textarea').fill(urgentIssueMessage);
  await issueModal.getByText(/KHẨN CẤP/).click();
  await issueModal.getByRole('button', { name: /GỬI CẢNH BÁO NGAY/i }).click();
  await waitForDoc('orders', productionId, data => data?.status === 'PRINTING' && Array.isArray(data?.issues) && data.issues.some((issue: FirebaseFirestore.DocumentData) => issue.message === urgentIssueMessage && issue.status === 'OPEN' && issue.priority === 'URGENT' && issue.recipientRoles?.includes('MANAGER') && issue.recipientRoles?.includes('DESIGNER')));

  await designer.bringToFront();
  await clickNav(designer, /Tất cả lệnh thiết kế/i);
  await openDetail(designer, productionCode);
  await expect(designer.getByText(urgentIssueMessage, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await closeTopModal(designer);

  const manager = await login(browser, 'manager');
  await manager.getByRole('button', { name: 'Xem ngay', exact: true }).click();
  await expect(manager.getByText('Danh sách lệnh có sự cố cần xử lý')).toBeVisible({ timeout: 20_000 });
  await openDetail(manager, productionCode);
  await expect(manager.getByText(urgentIssueMessage, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  manager.once('dialog', dialog => void dialog.accept('Đã xử lý qua E2E'));
  await manager.getByRole('button', { name: /XÁC NHẬN ĐÃ XỬ LÝ/i }).click();
  await waitForDoc('orders', productionId, data => data?.status === 'PRINTING' && Array.isArray(data?.issues) && data.issues.some((issue: FirebaseFirestore.DocumentData) => issue.message === urgentIssueMessage && issue.status === 'RESOLVED'));
  await closeTopModal(manager);
  await expect(manager.locator(`[id="order-accordion-${productionCode}"]`)).toHaveCount(0, { timeout: 20_000 });
  await clickNav(manager, /Tất cả lệnh in/i);

  await printer.bringToFront();
  await clickNav(printer, /Đang in trên máy/i);
  productionCard = await expandCard(printer, productionCode);
  const mistakenIssueMessage = `Báo nhầm cần hủy ${runId}`;
  await productionCard.getByRole('button', { name: /Báo sự cố/i }).click();
  const mistakenModal = printer.locator('.fixed.inset-0').last();
  await mistakenModal.getByText('MANAGER', { exact: true }).click();
  await mistakenModal.locator('textarea').fill(mistakenIssueMessage);
  await mistakenModal.getByRole('button', { name: /GỬI CẢNH BÁO NGAY/i }).click();
  await waitForDoc('orders', productionId, data => data?.issues?.some((issue: FirebaseFirestore.DocumentData) => issue.message === mistakenIssueMessage && issue.status === 'OPEN'));
  await openDetail(printer, productionCode);
  await printer.getByRole('button', { name: /HỦY BÁO CÁO/i }).click();
  await waitForDoc('orders', productionId, data => data?.issues?.some((issue: FirebaseFirestore.DocumentData) => issue.message === mistakenIssueMessage && issue.status === 'CANCELLED'));
  await closeTopModal(printer);

  productionCard = await expandCard(printer, productionCode);
  const openIssueMessage = `Máy in lỗi vẫn hoàn tất hợp lệ ${runId}`;
  await productionCard.getByRole('button', { name: /Báo sự cố/i }).click();
  const openIssueModal = printer.locator('.fixed.inset-0').last();
  await openIssueModal.getByText('MANAGER', { exact: true }).click();
  await openIssueModal.locator('textarea').fill(openIssueMessage);
  await openIssueModal.getByRole('button', { name: /GỬI CẢNH BÁO NGAY/i }).click();
  await waitForDoc('orders', productionId, data => data?.status === 'PRINTING' && data?.hasBlockingIssue === false && data?.issues?.some((issue: FirebaseFirestore.DocumentData) => issue.message === openIssueMessage && issue.status === 'OPEN' && issue.isBlocking === false));

  productionCard = await expandCard(printer, productionCode);
  await productionCard.getByRole('button', { name: 'In xong', exact: true }).click();
  await printer.getByRole('button', { name: /XÁC NHẬN IN XONG THỰC TẾ/i }).click();
  await waitForDoc('orders', productionId, data => data?.status === 'PRINTED' && data?.issues?.some((issue: FirebaseFirestore.DocumentData) => issue.message === openIssueMessage && issue.status === 'OPEN'));
  await waitForDoc('finishing_tasks', `ft_${productionId}_${productionId}-finish`, data => data?.status === 'READY' && data?.quantity === 4);
  await waitForDoc('finishing_tasks', `ft_${productionId}_${productionId}-confirm`, data => data?.status === 'READY' && data?.quantity === 3 && data?.requiresFinishing === false);

  await designer.bringToFront();
  await clickNav(designer, /Tất cả lệnh thiết kế/i);
  for (const [code, reason] of [[cancelAcceptCode, 'Khách đổi mẫu'], [cancelRejectCode, 'Khách tạm dừng']] as const) {
    const card = await expandCard(designer, code);
    await card.getByRole('button', { name: /Báo hủy lệnh/i }).click();
    const modal = designer.locator('.fixed.inset-0').last();
    await modal.locator('textarea').fill(`${reason} ${runId}`);
    await modal.getByRole('button', { name: /Gửi Yêu Cầu Hủy/i }).click();
  }
  await waitForDoc('orders', cancelAcceptId, data => data?.cancellationRequest?.status === 'PENDING');
  await waitForDoc('orders', cancelRejectId, data => data?.cancellationRequest?.status === 'PENDING');

  await printer.bringToFront();
  await clickNav(printer, /Lệnh chờ in/i);
  await openDetail(printer, cancelAcceptCode);
  await printer.getByRole('button', { name: /Đồng ý hủy/i }).click();
  await waitForDoc('orders', cancelAcceptId, data => data?.status === 'CANCELLED' && data?.cancellationRequest?.status === 'ACCEPTED');
  await openDetail(printer, cancelRejectCode);
  await printer.getByRole('button', { name: /Không thể hủy/i }).click();
  await printer.locator('.fixed.inset-0').last().getByRole('button', { name: /Gửi phản hồi/i }).click();
  await waitForDoc('orders', cancelRejectId, data => data?.status === 'WAITING_ACCEPTANCE' && data?.cancellationRequest?.status === 'REJECTED');

  const sale = await login(browser, 'sale');
  await clickNav(sale, /Thành phẩm/i);
  const directOnlyRow = sale.getByRole('row')
    .filter({ hasText: 'Túi đi thẳng kho P13' })
    .filter({ hasText: salesOrderId });
  await expect(directOnlyRow).toBeVisible({ timeout: 20_000 });
  await directOnlyRow.locator('input[type="checkbox"]').check();
  await sale.getByRole('button', { name: /Tạo phiếu xuất \(1\)/i }).click();
  const partialDispatchModal = sale.locator('.fixed.inset-0').last();
  await partialDispatchModal.getByRole('button', { name: /Lưu nháp phiếu xuất/i }).click();
  await expect(partialDispatchModal.getByText(/sales order is not ready for dispatch/i)).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await adminDb.collection('warehouse_dispatches').where('salesOrderId', '==', salesOrderId).get()).size).toBe(0);
  await closeTopModal(sale);

  const finisher = await login(browser, 'finisher');
  const finisher2 = await login(browser, 'finisher2');
  await clickNav(finisher, /Đang dán túi \/ bế/i);
  await clickNav(finisher2, /Đang dán túi \/ bế/i);
  const finishingArticle = finisher.getByText('Túi cần gia công P12', { exact: true }).locator('xpath=ancestor::article');
  const noFinishingArticle = finisher.getByText('Túi không gia công P12', { exact: true }).locator('xpath=ancestor::article');
  const competingArticle = finisher2.getByText('Túi cần gia công P12', { exact: true }).locator('xpath=ancestor::article');
  await expect(finishingArticle).toBeVisible({ timeout: 20_000 });
  await expect(competingArticle.getByRole('button', { name: /Nhận gia công/i })).toBeVisible({ timeout: 20_000 });
  await finishingArticle.getByRole('button', { name: /Báo sự cố/i }).click();
  const finishingIssueModal = finisher.locator('.fixed.inset-0').last();
  await finishingIssueModal.getByText('MANAGER', { exact: true }).click();
  await finishingIssueModal.locator('textarea').fill(`Gia công phát hiện lỗi ${runId}`);
  await finishingIssueModal.getByText(/KHẨN CẤP/).click();
  await finishingIssueModal.getByRole('button', { name: /GỬI SỰ CỐ/i }).click();
  await expect(finisher.getByText(`Gia công phát hiện lỗi ${runId}`)).toBeVisible({ timeout: 20_000 });

  await manager.bringToFront();
  await clickNav(manager, /Gia công/i);
  const downstreamIssue = manager.getByText(`Gia công phát hiện lỗi ${runId}`).locator('xpath=ancestor::article');
  await expect(downstreamIssue).toBeVisible({ timeout: 20_000 });
  await downstreamIssue.getByRole('button', { name: /Đã xử lý/i }).click();

  await finisher.bringToFront();
  await finishingArticle.getByRole('button', { name: /Nhận gia công/i }).click();
  await waitForDoc('finishing_tasks', `ft_${productionId}_${productionId}-finish`, data => data?.status === 'CLAIMED' && data?.claimedBy === users.finisher.id);
  await expect(competingArticle.getByRole('button', { name: /Nhận gia công/i })).toHaveCount(0, { timeout: 20_000 });
  await finishingArticle.getByRole('button', { name: /Hoàn thành sản phẩm/i }).click();
  await waitForDoc('sales_order_items', finishItemId, data => data?.status === 'WAREHOUSE_READY');
  await waitForDoc('sales_order_items', directItemId, data => data?.status === 'WAREHOUSE_READY');
  await waitForDoc('sales_orders', salesOrderId, data => data?.status !== 'READY_TO_SHIP');

  await sale.bringToFront();
  await clickNav(sale, /Thành phẩm/i);
  await expect(sale.getByRole('row').filter({ hasText: 'Túi cần gia công P12' }).filter({ hasText: salesOrderId })).toBeVisible({ timeout: 20_000 });
  await expect(sale.getByRole('row').filter({ hasText: 'Túi đi thẳng kho P13' }).filter({ hasText: salesOrderId })).toBeVisible({ timeout: 20_000 });
  await expect(sale.getByRole('row').filter({ hasText: 'Túi không gia công P12' }).filter({ hasText: salesOrderId })).toHaveCount(0);

  await finisher.bringToFront();
  await noFinishingArticle.getByRole('button', { name: /Xác nhận không gia công/i }).click();
  await waitForDoc('sales_order_items', confirmItemId, data => data?.status === 'WAREHOUSE_READY');
  await waitForDoc('sales_orders', salesOrderId, data => data?.status === 'READY_TO_SHIP');

  await sale.bringToFront();
  await clickNav(sale, /Thành phẩm/i);
  const finishRow = sale.getByRole('row').filter({ hasText: 'Túi cần gia công P12' }).filter({ hasText: salesOrderId });
  const confirmRow = sale.getByRole('row').filter({ hasText: 'Túi không gia công P12' }).filter({ hasText: salesOrderId });
  const directRow = sale.getByRole('row').filter({ hasText: 'Túi đi thẳng kho P13' }).filter({ hasText: salesOrderId });
  await expect(finishRow).toBeVisible({ timeout: 20_000 });
  await expect(confirmRow).toBeVisible({ timeout: 20_000 });
  await expect(directRow).toBeVisible({ timeout: 20_000 });
  await finishRow.getByRole('button', { name: /Báo sự cố/i }).click();
  const warehouseIssueModal = sale.locator('.fixed.inset-0').last();
  await warehouseIssueModal.getByText('MANAGER', { exact: true }).click();
  await warehouseIssueModal.locator('textarea').fill(`Kho kiểm tra sản phẩm ${runId}`);
  await warehouseIssueModal.getByRole('button', { name: /GỬI SỰ CỐ/i }).click();

  await manager.bringToFront();
  await clickNav(manager, /Thành phẩm/i);
  const warehouseIssue = manager.getByText(`Kho kiểm tra sản phẩm ${runId}`).locator('xpath=ancestor::article');
  await expect(warehouseIssue).toBeVisible({ timeout: 20_000 });
  await warehouseIssue.getByRole('button', { name: /Đã xử lý/i }).click();

  await sale.bringToFront();
  await finishRow.locator('input[type="checkbox"]').check();
  await confirmRow.locator('input[type="checkbox"]').check();
  await directRow.locator('input[type="checkbox"]').check();
  await sale.getByRole('button', { name: /Tạo phiếu xuất \(3\)/i }).click();
  const dispatchSubmit = sale.locator('.fixed.inset-0').last().getByRole('button', { name: /Lưu nháp phiếu xuất/i });
  await dispatchSubmit.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(async () => (await adminDb.collection('warehouse_dispatches').where('salesOrderId', '==', salesOrderId).get()).size, { timeout: 20_000 }).toBe(1);

  await manager.bringToFront();
  await clickNav(manager, /Xuất hàng/i);
  const dispatchRow = manager.getByRole('row').filter({ hasText: salesOrderId });
  await expect(dispatchRow).toBeVisible({ timeout: 20_000 });
  manager.once('dialog', dialog => void dialog.accept());
  await dispatchRow.getByRole('button', { name: /Xác nhận xuất/i }).click();
  await expect.poll(async () => (await adminDb.collection('warehouse_dispatches').where('salesOrderId', '==', salesOrderId).get()).docs[0]?.get('status'), { timeout: 20_000 }).toBe('DISPATCHED');
  await expect.poll(async () => (await adminDb.collection('finished_goods').where('salesOrderId', '==', salesOrderId).get()).docs.every(doc => doc.get('remainingQuantity') === 0), { timeout: 20_000 }).toBe(true);
});

test('Prompt 13 Lite: 10 draft liên tiếp vẫn local-first khi hoàn toàn offline', async ({ browser }) => {
  const designer = await login(browser, 'rapid13');
  const quickInput = designer.getByPlaceholder(/VD: Duplex 250/);
  // Let the freshly authenticated identity/profile listeners settle before
  // cutting every network route; the draft operation itself remains offline.
  await expect(quickInput).toBeVisible({ timeout: 20_000 });
  await designer.waitForTimeout(1_000);
  const baselineCount = (await readLocalDrafts(designer)).length;
  await designer.context().setOffline(true);
  await expect(quickInput).toBeVisible();

  for (let index = 0; index < 10; index += 1) {
    await quickInput.fill(`2600 tờ Kraft 70 25x48 #${runId}-rapid-${index}`);
    await quickInput.press('Enter');
    await expect(quickInput).toHaveValue('');
    await expect.poll(() => designer.evaluate(async () => {
      const request = indexedDB.open('flexo-workflow-v2');
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const query = database.transaction('production-drafts').objectStore('production-drafts').count();
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      });
      database.close();
      return count;
    }), { timeout: 10_000 }).toBe(baselineCount + index + 1);
  }

  const records = await designer.evaluate(async (expectedPrefix) => {
    const request = indexedDB.open('flexo-workflow-v2');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const drafts = await new Promise<Array<{ order: { id: string; instructionRaw?: string } }>>((resolve, reject) => {
      const query = database.transaction('production-drafts').objectStore('production-drafts').getAll();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    });
    database.close();
    return drafts
      .map(draft => ({ id: draft.order.id, instructionRaw: draft.order.instructionRaw }))
      .filter(draft => draft.instructionRaw?.includes(expectedPrefix));
  }, `${runId}-rapid-`);
  expect(records).toHaveLength(10);
  expect(new Set(records.map(record => record.id))).toHaveProperty('size', 10);
  expect(new Set(records.map(record => record.instructionRaw))).toHaveProperty('size', 10);
});
