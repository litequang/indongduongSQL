const assert = require('node:assert/strict');

const projectId = process.env.GCLOUD_PROJECT || 'xuongin';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const endpoint = `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents:commit`;
const documentRoot = `projects/${projectId}/databases/(default)/documents`;

function mockToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    iat: now,
    exp: now + 3600,
    auth_time: now,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })).toString('base64url');
  return `${header}.${payload}.`;
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: firestoreFields(value) } };
}

function firestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

async function write(path, data, token = 'owner') {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [{
        update: {
          name: `${documentRoot}/${path}`,
          fields: firestoreFields(data),
        },
      }],
    }),
  });
  return response;
}

async function expectStatus(label, responsePromise, expectedStatus) {
  const response = await responsePromise;
  const body = await response.text();
  assert.equal(response.status, expectedStatus, `${label}: expected HTTP ${expectedStatus}, received ${response.status}. ${body}`);
  console.log(`PASS ${label}`);
}

function order(id, printerId, status = 'WAITING_ACCEPTANCE') {
  return {
    id,
    code: id.toUpperCase(),
    status,
    printerId,
    plateStatus: 'RECEIVED',
    hasBlockingIssue: false,
    paperType: 'Kraft',
    totalSheets: 100,
    createdAt: '2026-08-22T00:00:00.000Z',
    timeline: [],
    issues: [],
    comments: [],
  };
}

async function seed(path, data) {
  await expectStatus(`seed ${path}`, write(path, data), 200);
}

async function main() {
  const printerToken = mockToken('printer-auth');
  const orderA = order('order-a', 'printer-a');
  const orderB = order('order-b', 'printer-b');

  await seed('auth_identities/printer-auth', {
    active: true,
    businessUserId: 'printer-a',
    role: 'PRINTER',
  });
  await seed('auth_identities/printer-b-auth', {
    active: true,
    businessUserId: 'printer-b',
    role: 'PRINTER',
  });
  await seed('auth_identities/designer-auth', {
    active: true,
    businessUserId: 'designer-a',
    role: 'DESIGNER',
  });
  await seed('users/printer-a', {
    id: 'printer-a',
    name: 'Printer A',
    role: 'PRINTER',
    active: true,
  });
  await seed('users/designer-a', {
    id: 'designer-a',
    name: 'Designer A',
    role: 'DESIGNER',
    active: true,
  });
  await seed('settings/app', { label: 'protected' });
  await seed('orders/order-a', orderA);
  await seed('orders/order-b', orderB);

  const designerToken = mockToken('designer-auth');
  const urgentByDesigner = {
    ...orderA,
    isUrgent: true,
    urgentReason: 'Customer deadline',
    urgentSetBy: 'designer-a',
    urgentSetName: 'Designer A',
    timeline: [{ id: 'urgent' }],
    updatedAt: '2026-08-22T00:30:00.000Z',
  };
  await expectStatus('DESIGNER can set urgent metadata', write('orders/order-a', urgentByDesigner, designerToken), 200);
  await expectStatus('PRINTER cannot change urgent metadata', write('orders/order-a', {
    ...urgentByDesigner,
    isUrgent: false,
    urgentReason: null,
    urgentSetBy: null,
    urgentSetName: null,
    updatedAt: '2026-08-22T00:35:00.000Z',
  }, printerToken), 403);

  const accepted = {
    ...urgentByDesigner,
    status: 'ACCEPTED',
    acceptedAt: '2026-08-22T01:00:00.000Z',
    timeline: [{ id: 'accept' }],
    updatedAt: '2026-08-22T01:00:00.000Z',
  };
  await expectStatus('assigned PRINTER accepts assigned order', write('orders/order-a', accepted, printerToken), 200);

  const printing = {
    ...accepted,
    status: 'PRINTING',
    printingStartedAt: '2026-08-22T01:05:00.000Z',
    timeline: [{ id: 'accept' }, { id: 'start' }],
    updatedAt: '2026-08-22T01:05:00.000Z',
  };
  await expectStatus('assigned PRINTER starts printing', write('orders/order-a', printing, printerToken), 200);

  const printed = {
    ...printing,
    status: 'PRINTED',
    actualPrintedSheets: 98,
    spoilageSheets: 2,
    printedNote: 'Completed',
    printingCompletedAt: '2026-08-22T01:15:00.000Z',
    timeline: [{ id: 'accept' }, { id: 'start' }, { id: 'complete' }],
    updatedAt: '2026-08-22T01:15:00.000Z',
  };
  await expectStatus('PRINTER cannot bypass completeProductionPrint callable', write('orders/order-a', printed, printerToken), 403);

  const issueReported = {
    ...printing,
    issues: [{ id: 'issue-1', status: 'OPEN' }],
    timeline: [...printing.timeline, { id: 'issue' }],
    updatedAt: '2026-08-22T01:20:00.000Z',
  };
  await expectStatus('PRINTER cannot bypass reportProductionIssue callable', write('orders/order-a', issueReported, printerToken), 403);

  await expectStatus('PRINTER cannot accept another printer order', write('orders/order-b', {
    ...orderB,
    status: 'ACCEPTED',
    acceptedAt: '2026-08-22T01:00:00.000Z',
    updatedAt: '2026-08-22T01:00:00.000Z',
  }, printerToken), 403);

  await expectStatus('PRINTER cannot rewrite acceptedAt after acceptance', write('orders/order-a', {
    ...issueReported,
    acceptedAt: '2026-08-22T02:00:00.000Z',
    updatedAt: '2026-08-22T02:00:00.000Z',
  }, printerToken), 403);

  await expectStatus('PRINTER cannot change protected totalSheets', write('orders/order-a', {
    ...issueReported,
    totalSheets: 999,
    updatedAt: '2026-08-22T02:05:00.000Z',
  }, printerToken), 403);

  await expectStatus('PRINTER cannot reassign protected printerId', write('orders/order-a', {
    ...issueReported,
    printerId: 'printer-b',
    updatedAt: '2026-08-22T02:10:00.000Z',
  }, printerToken), 403);

  await expectStatus('PRINTER cannot change own role', write('users/printer-a', {
    id: 'printer-a',
    name: 'Printer A',
    role: 'ADMIN',
    active: true,
  }, printerToken), 403);

  await expectStatus('PRINTER cannot change auth identity', write('auth_identities/printer-auth', {
    active: true,
    businessUserId: 'printer-a',
    role: 'ADMIN',
  }, printerToken), 403);

  await expectStatus('PRINTER cannot change settings', write('settings/app', { label: 'escalated' }, printerToken), 403);

  await expectStatus('PRINTER cannot write health document', write('_system_health/ping', {
    lastPing: '2026-08-22T02:15:00.000Z',
    app: 'Flexo Workshop',
  }, printerToken), 403);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
