#!/usr/bin/env node
'use strict';

/*
 * Production business-data cleanup guard.
 *
 * Default mode is read-only. `--execute` is intentionally interactive and
 * only deletes the explicit allowlist below from Firestore project `xuongin`.
 * It never accesses Firebase Authentication accounts.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const PROJECT_ID = 'xuongin';
const MAX_BATCH_SIZE = 400;
const args = process.argv.slice(2);

if (args.some((arg) => arg !== '--execute')) {
  console.error('Usage: node scripts/cleanup-business-data.cjs [--execute]');
  process.exitCode = 2;
  return;
}

const execute = args.includes('--execute');

// Every entry was traced from Firestore Rules, repositories and callable
// workflow Functions. Do not add a collection here without the same audit.
const BUSINESS_COLLECTIONS = Object.freeze([
  'orders',
  'production_draft_backups',
  'saved_designs',
  'notifications',
  'customers',
  'customer_import_jobs',
  'sales_orders',
  'sales_order_items',
  'finished_goods',
  'finishing_tasks',
  'workflow_issues',
  'warehouse_dispatches',
  'warehouse_dispatch_items',
  'shipments',
  'audit_logs',
]);

const PROTECTED_COLLECTIONS = Object.freeze([
  'users — business accounts and role/account configuration',
  'auth_identities — Firebase Auth UID to business-user mapping',
  'settings — company branding, app configuration and permission settings',
  '_system_health — system diagnostic configuration/state',
  'counters/staff_user_ids — account provisioning counter',
]);

// `counters` is deliberately not a collection-wide deletion target. The two
// listed documents are operational sequences derived from test business data.
const BUSINESS_COUNTER_DOCUMENTS = new Set(['orders', 'customers']);
const PROTECTED_COUNTER_DOCUMENTS = new Set(['staff_user_ids']);

function requireAdmin() {
  const adminPath = path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin');
  try {
    return require(adminPath);
  } catch (error) {
    throw new Error(`Cannot load firebase-admin from functions/node_modules. Run npm install in functions first. (${error.message})`);
  }
}

function assertProjectConfiguration() {
  const configuredProjectIds = [];
  if (process.env.GCLOUD_PROJECT) configuredProjectIds.push(process.env.GCLOUD_PROJECT);
  if (process.env.FIREBASE_CONFIG) {
    try {
      const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      if (firebaseConfig.projectId) configuredProjectIds.push(String(firebaseConfig.projectId));
    } catch {
      throw new Error('FIREBASE_CONFIG is not valid JSON; refusing to continue.');
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credential = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
      if (credential.project_id) configuredProjectIds.push(String(credential.project_id));
    } catch {
      throw new Error('Cannot validate GOOGLE_APPLICATION_CREDENTIALS; refusing to continue.');
    }
  }

  const mismatches = configuredProjectIds.filter((projectId) => projectId !== PROJECT_ID);
  if (mismatches.length) {
    throw new Error(`Configured project does not exactly match ${PROJECT_ID}; refusing to continue.`);
  }
}

async function promptForProjectConfirmation() {
  if (!stdin.isTTY) throw new Error('--execute requires an interactive terminal confirmation.');
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const confirmation = await prompt.question(`Type ${PROJECT_ID} to delete only the audited business data in Firebase project ${PROJECT_ID}: `);
    if (confirmation.trim() !== PROJECT_ID) throw new Error('Project confirmation did not exactly match; no documents were deleted.');
  } finally {
    prompt.close();
  }
}

async function collectCollectionDeleteTargets(collectionRef, displayName) {
  const snapshot = await collectionRef.get();
  const targets = [];
  for (const document of snapshot.docs) {
    const subcollections = await document.ref.listCollections();
    for (const subcollection of subcollections) {
      const nested = await collectCollectionDeleteTargets(subcollection, `${displayName}/${document.id}/${subcollection.id}`);
      targets.push(...nested.targets);
    }
    // Child documents must be removed before their parent document.
    targets.push(document.ref);
  }
  return { displayName, targets };
}

async function collectCounterDeleteTargets(db) {
  const snapshot = await db.collection('counters').get();
  const unknownCounterDocuments = [];
  const targets = [];

  for (const document of snapshot.docs) {
    if (BUSINESS_COUNTER_DOCUMENTS.has(document.id)) {
      // The codebase does not define counter subcollections. If one exists,
      // it is unclassified and must block execution rather than be guessed.
      const subcollections = await document.ref.listCollections();
      if (subcollections.length) unknownCounterDocuments.push(`${document.id} (has unclassified subcollection data)`);
      targets.push(document.ref);
    } else if (!PROTECTED_COUNTER_DOCUMENTS.has(document.id)) {
      unknownCounterDocuments.push(document.id);
    }
  }

  return { displayName: 'counters (only orders, customers)', targets, unknownCounterDocuments };
}

async function deleteInBatches(db, documentRefs) {
  let deleted = 0;
  for (let offset = 0; offset < documentRefs.length; offset += MAX_BATCH_SIZE) {
    const batch = db.batch();
    for (const documentRef of documentRefs.slice(offset, offset + MAX_BATCH_SIZE)) batch.delete(documentRef);
    await batch.commit();
    deleted += Math.min(MAX_BATCH_SIZE, documentRefs.length - offset);
  }
  return deleted;
}

async function main() {
  assertProjectConfiguration();
  const admin = requireAdmin();
  const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: PROJECT_ID });
  if (app.options.projectId !== PROJECT_ID) throw new Error(`Initialized app project is not ${PROJECT_ID}; refusing to continue.`);
  const db = admin.firestore(app);

  const rootCollections = await db.listCollections();
  const rootCollectionNames = new Set(rootCollections.map((collection) => collection.id));
  const knownRootCollections = new Set([
    ...BUSINESS_COLLECTIONS,
    'users',
    'auth_identities',
    'settings',
    '_system_health',
    'counters',
  ]);
  const unknownRootCollections = [...rootCollectionNames].filter((name) => !knownRootCollections.has(name)).sort();

  const plans = [];
  for (const collectionName of BUSINESS_COLLECTIONS) {
    plans.push(await collectCollectionDeleteTargets(db.collection(collectionName), collectionName));
  }
  const counterPlan = await collectCounterDeleteTargets(db);
  plans.push(counterPlan);

  console.log(`Firebase project: ${PROJECT_ID}`);
  console.log(`Mode: ${execute ? 'EXECUTE (confirmation still required)' : 'DRY RUN (no documents will be deleted)'}`);
  console.log('\nBUSINESS COLLECTIONS TO DELETE:');
  for (const plan of plans) console.log(`- ${plan.displayName}: ${plan.targets.length} document(s)`);

  console.log('\nPROTECTED COLLECTIONS / DOCUMENTS:');
  for (const protectedCollection of PROTECTED_COLLECTIONS) console.log(`- ${protectedCollection}`);
  console.log('- Firebase Authentication users — never read, modified or deleted by this script');

  if (unknownRootCollections.length || counterPlan.unknownCounterDocuments.length) {
    console.log('\nUNCLASSIFIED DATA DETECTED — EXECUTION BLOCKED:');
    for (const collectionName of unknownRootCollections) console.log(`- top-level collection: ${collectionName}`);
    for (const documentId of counterPlan.unknownCounterDocuments) console.log(`- counters/${documentId}`);
    if (execute) throw new Error('Fail-closed: classify the data in source and update the audited allowlist before any deletion.');
    console.log('\nDRY RUN completed without deletion. Resolve the unclassified data before using --execute.');
    return;
  }

  if (!execute) {
    console.log('\nDRY RUN completed. No documents were deleted.');
    return;
  }

  await promptForProjectConfirmation();
  console.log('\nDeleting audited business data only:');
  for (const plan of plans) {
    const deleted = await deleteInBatches(db, plan.targets);
    console.log(`- ${plan.displayName}: deleted ${deleted} document(s)`);
  }
  console.log('\nCompleted. Firebase Auth, users, auth_identities, settings and protected counters were not modified.');
}

main().catch((error) => {
  console.error(`Cleanup aborted: ${error.message}`);
  process.exitCode = 1;
});
