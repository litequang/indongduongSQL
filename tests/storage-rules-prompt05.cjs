const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { initializeApp, deleteApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { connectFirestoreEmulator, doc: firestoreDoc, getDoc: getFirestoreDoc, getFirestore: getClientFirestore, setDoc, updateDoc, deleteField } = require('firebase/firestore');
const { connectStorageEmulator, deleteObject, getBytes, getDownloadURL, getStorage, ref, uploadBytes } = require('firebase/storage');
const functionsRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { getApps, initializeApp: initializeAdminApp } = functionsRequire('firebase-admin/app');
const { getAuth: getAdminAuth } = functionsRequire('firebase-admin/auth');
const { getFirestore } = functionsRequire('firebase-admin/firestore');

const adminApp = getApps().length ? getApps()[0] : initializeAdminApp({ projectId });
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);
let appNumber = 0;

const credentials = {
  designer: { email: 'storage-designer@example.test', password: 'DesignerPass123!' },
  sale: { email: 'storage-sale@example.test', password: 'SalePass123!' },
  printerA: { email: 'storage-printer-a@example.test', password: 'PrinterPass123!' },
  printerB: { email: 'storage-printer-b@example.test', password: 'PrinterPass123!' },
};

function imageBlob(size = 32, type = 'image/jpeg') {
  return new Blob([new Uint8Array(size).fill(7)], { type });
}

async function seedStaff(key, businessUserId, role) {
  const credential = credentials[key];
  const authUser = await adminAuth.createUser({ email: credential.email, password: credential.password });
  await Promise.all([
    db.collection('auth_identities').doc(authUser.uid).set({ businessUserId, role, active: true }),
    db.collection('users').doc(businessUserId).set({ id: businessUserId, name: key, role, active: true }),
  ]);
}

async function withClientContext(key, task) {
  const app = initializeApp({
    apiKey: 'storage-test-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  }, `storage-rules-test-${++appNumber}`);
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    if (key) await signInWithEmailAndPassword(auth, credentials[key].email, credentials[key].password);
    const firestore = getClientFirestore(app);
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    const storage = getStorage(app);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    return await task({ storage, firestore });
  } finally {
    await deleteApp(app);
  }
}

async function withClient(key, task) {
  return withClientContext(key, ({ storage }) => task(storage));
}

async function expectPass(label, task) {
  await task();
  console.log(`PASS ${label}`);
}

async function expectDenied(label, task) {
  await assert.rejects(task, (error) => {
    const code = String(error?.code || '');
    return code === 'storage/unauthorized' || code === 'storage/unauthenticated';
  }, `${label}: expected a Storage authorization failure`);
  console.log(`PASS ${label}`);
}

async function expectMissing(label, task) {
  await assert.rejects(task, (error) => String(error?.code || '') === 'storage/object-not-found', `${label}: expected object-not-found`);
  console.log(`PASS ${label}`);
}

async function put(storage, pathName, blob = imageBlob()) {
  return uploadBytes(ref(storage, pathName), blob, { contentType: blob.type });
}

async function uploadStoredReference(storage, pathName, uploadedBy) {
  const uploadResult = await put(storage, pathName);
  return {
    storagePath: pathName,
    downloadUrl: await getDownloadURL(uploadResult.ref),
    fileName: pathName.slice(pathName.lastIndexOf('/') + 1),
    contentType: 'image/jpeg',
    size: 32,
    width: 16,
    height: 16,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
  };
}

async function main() {
  await seedStaff('designer', 'storage-designer-user', 'DESIGNER');
  await seedStaff('sale', 'storage-sale-user', 'SALE');
  await seedStaff('printerA', 'storage-printer-a-user', 'PRINTER');
  await seedStaff('printerB', 'storage-printer-b-user', 'PRINTER');
  await Promise.all([
    db.collection('orders').doc('storage-order-a').set({ printerId: 'storage-printer-a-user' }),
    db.collection('orders').doc('storage-order-b').set({ printerId: 'storage-printer-b-user' }),
  ]);

  const productionPath = 'production-orders/storage-order-a/items/storage-item-a/artwork-12345678.jpg';
  const salesOldPath = 'sales-orders/storage-sales-a/items/storage-sales-item-a/images/sales-old-12345678.jpg';
  const salesNewPath = 'sales-orders/storage-sales-a/items/storage-sales-item-a/images/sales-new-12345678.jpg';

  await expectDenied('unauthenticated user cannot upload', () => withClient(null, (storage) => put(storage, productionPath)));

  await expectPass('DESIGNER uploads production artwork', () => withClient('designer', (storage) => put(storage, productionPath)));
  await expectPass('active PRINTER can read production artwork', () => withClient('printerA', async (storage) => {
    const bytes = await getBytes(ref(storage, productionPath));
    assert.equal(bytes.byteLength, 32);
  }));
  await expectDenied('PRINTER cannot replace production artwork', () => withClient('printerA', (storage) => put(storage, productionPath)));
  await expectDenied('PRINTER cannot upload source artwork', () => withClient('printerA', (storage) => put(storage, 'production-orders/storage-order-a/items/storage-item-b/printer-source-12345678.jpg')));

  await expectDenied('PRINTER has no unused print-completion upload permission', () => withClient('printerA', (storage) => put(storage, 'production-orders/storage-order-a/print-completions/printed-12345678.jpg')));
  await expectDenied('PRINTER cannot write company settings image', () => withClient('printerA', (storage) => put(storage, 'settings/company-logo/logo-12345678.jpg')));

  const functionalOrderId = 'storage-functional-order';
  const functionalFirstPath = `production-orders/${functionalOrderId}/items/storage-functional-item-a/functional-first-12345678.jpg`;
  const functionalSecondPath = `production-orders/${functionalOrderId}/items/storage-functional-item-b/functional-second-12345678.jpg`;
  await expectPass('one image is stored as a Firestore Storage reference, not Base64', () => withClientContext('designer', async ({ storage }) => {
    const storedImage = await uploadStoredReference(storage, functionalFirstPath, 'storage-designer-user');
    // Workflow V2 creates official production orders through the callable
    // boundary. Admin SDK mirrors that trusted boundary for this storage test.
    await db.collection('orders').doc(functionalOrderId).set({
      id: functionalOrderId,
      code: 'IMG-REF-001',
      status: 'WAITING_ACCEPTANCE',
      deletedAt: null,
      paperType: 'Kraft',
      totalSheets: 100,
      createdAt: new Date().toISOString(),
      items: [{ id: 'storage-functional-item-a', imageUrl: storedImage.downloadUrl, image: storedImage }],
    });
    const saved = await db.collection('orders').doc(functionalOrderId).get();
    assert.equal(saved.data()?.items?.[0]?.image?.storagePath, functionalFirstPath);
    assert.equal(JSON.stringify(saved.data()).includes('data:image'), false);
  }));
  await expectPass('two images are retained as independent Storage references', () => withClientContext('designer', async ({ storage }) => {
    const storedImage = await uploadStoredReference(storage, functionalSecondPath, 'storage-designer-user');
    const orderRef = db.collection('orders').doc(functionalOrderId);
    const previous = await orderRef.get();
    const existingItems = previous.data()?.items || [];
    await orderRef.update({
      items: [...existingItems, { id: 'storage-functional-item-b', imageUrl: storedImage.downloadUrl, image: storedImage }],
    });
    const saved = await orderRef.get();
    assert.equal(saved.data()?.items?.length, 2);
    assert.equal(saved.data()?.items?.[1]?.image?.storagePath, functionalSecondPath);
  }));
  await expectPass('SavedDesign retains the shared Storage reference after an order soft-delete', () => withClientContext('designer', async ({ firestore }) => {
    const orderRef = firestoreDoc(firestore, 'orders', functionalOrderId);
    const order = await getFirestoreDoc(orderRef);
    const sourceImage = order.data()?.items?.[0]?.image;
    await setDoc(firestoreDoc(firestore, 'saved_designs', 'storage-functional-design'), {
      id: 'storage-functional-design',
      imageUrl: sourceImage.downloadUrl,
      image: sourceImage,
      customerName: 'Storage Test Customer',
      productName: 'Storage Test Design',
      createdAt: new Date().toISOString(),
    });
    // Soft deletion is likewise an authoritative server-side operation in V2.
    await db.collection('orders').doc(functionalOrderId).update({ deletedAt: new Date().toISOString() });
    const savedDesign = await getFirestoreDoc(firestoreDoc(firestore, 'saved_designs', 'storage-functional-design'));
    assert.equal(savedDesign.data()?.image?.storagePath, functionalFirstPath);
  }));
  await expectPass('SavedDesign source stays readable after soft-delete', () => withClient('printerA', (storage) => getBytes(ref(storage, functionalFirstPath))));

  const salesItemId = 'storage-sales-item-a';
  await expectPass('SALE uploads and persists a sales-order image reference', () => withClientContext('sale', async ({ storage, firestore }) => {
    const storedImage = await uploadStoredReference(storage, salesOldPath, 'storage-sale-user');
    const itemRef = firestoreDoc(firestore, 'sales_order_items', salesItemId);
    await setDoc(itemRef, {
      id: salesItemId,
      salesOrderId: 'storage-sales-a',
      customerId: 'storage-customer-a',
      productName: 'Storage Test Product',
      quantity: 1,
      status: 'NEW',
      deletedAt: null,
      imageUrl: storedImage.downloadUrl,
      image: storedImage,
    });
    assert.equal((await getFirestoreDoc(itemRef)).data()?.image?.storagePath, salesOldPath);
  }));
  await expectPass('SALE persists replacement metadata before prior image cleanup', () => withClientContext('sale', async ({ storage, firestore }) => {
    const storedImage = await uploadStoredReference(storage, salesNewPath, 'storage-sale-user');
    const itemRef = firestoreDoc(firestore, 'sales_order_items', salesItemId);
    await updateDoc(itemRef, { imageUrl: storedImage.downloadUrl, image: storedImage });
    assert.equal((await getFirestoreDoc(itemRef)).data()?.image?.storagePath, salesNewPath);
  }));
  await expectPass('SALE removes prior image after replacement succeeds', () => withClient('sale', (storage) => deleteObject(ref(storage, salesOldPath))));
  await expectMissing('replaced asset is absent after explicit cleanup', () => withClient('sale', (storage) => getBytes(ref(storage, salesOldPath))));
  await expectPass('replacement asset remains readable', () => withClient('sale', (storage) => getBytes(ref(storage, salesNewPath))));

  await expectPass('remove clears Firestore reference before Storage cleanup', () => withClientContext('sale', async ({ storage, firestore }) => {
    const itemRef = firestoreDoc(firestore, 'sales_order_items', salesItemId);
    await updateDoc(itemRef, { imageUrl: deleteField(), image: deleteField() });
    const saved = await getFirestoreDoc(itemRef);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.data() || {}, 'imageUrl'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.data() || {}, 'image'), false);
    await deleteObject(ref(storage, salesNewPath));
  }));
  await expectMissing('removed image asset is absent', () => withClient('sale', (storage) => getBytes(ref(storage, salesNewPath))));

  const recoveryPath = 'sales-orders/storage-sales-a/items/storage-sales-item-a/images/recovery-12345678.jpg';
  await expectPass('upload cleanup removes an asset after an actual Firestore-save denial', () => withClientContext('sale', async ({ storage, firestore }) => {
    await put(storage, recoveryPath);
    await assert.rejects(
      setDoc(firestoreDoc(firestore, 'orders', 'storage-invalid-order'), {
        id: 'storage-invalid-order', code: 'INVALID', status: 'NOT_A_WORKFLOW_STATUS', paperType: 'Kraft', totalSheets: 1, createdAt: new Date().toISOString(),
      }),
      (error) => String(error?.code || '').endsWith('permission-denied'),
    );
    await deleteObject(ref(storage, recoveryPath));
  }));
  await expectMissing('failed save leaves no orphan asset', () => withClient('sale', (storage) => getBytes(ref(storage, recoveryPath))));

  await expectDenied('invalid MIME type is rejected', () => withClient('designer', (storage) => put(storage, 'production-orders/storage-order-a/items/storage-item-a/invalid-mime-12345678.jpg', imageBlob(32, 'text/plain'))));
  await expectDenied('oversize image is rejected', () => withClient('designer', (storage) => put(storage, 'production-orders/storage-order-a/items/storage-item-a/oversize-12345678.jpg', imageBlob(5 * 1024 * 1024 + 1))));
  await expectDenied('invalid image file name is rejected', () => withClient('designer', (storage) => put(storage, 'production-orders/storage-order-a/items/storage-item-a/a.jpg')));

  console.log('STORAGE_RULES_PROMPT05_PASS');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
