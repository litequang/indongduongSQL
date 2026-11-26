import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { BootstrapService } from './bootstrapService';
import { StaffProvisioningService, ProvisioningError } from './staffProvisioningService';
import { ChangeStaffRoleRequest, ProvisionStaffRequest, ResetStaffPasswordRequest, SetStaffActiveRequest } from './types';
import { WorkflowError } from './workflows/workflowAuth';
import { ProductionWorkflowService } from './workflows/productionWorkflow';
import { FulfillmentWorkflowService } from './workflows/fulfillmentWorkflow';
import { LogisticsWorkflowService } from './workflows/logisticsWorkflow';
import { GoogleSecretManagerR2CredentialStore } from './storage/credentialStore';
import { BackendStorageProviderFactory } from './storage/providerFactory';
import { StorageProviderConfigRepository } from './storage/providerConfigRepository';
import { StorageAdminError } from './storage/storageAdminError';
import { StorageProviderAdminService } from './storage/storageProviderAdminService';
import { StorageUploadOperationRepository } from './storage/uploadOperationRepository';
import { ImageDirectUploadService } from './storage/imageDirectUploadService';
import { StorageRuntimeService } from './storage/storageRuntimeService';
import { ImageAccessService } from './storage/imageAccessService';
import { FirebaseAdminStorageProvider } from './storage/providers/FirebaseAdminStorageProvider';
import { ImageBackupRepository } from './storage/backup/backupRepository';
import { StorageTransferProviderFactory } from './storage/backup/transferProviderFactory';
import { ImageBackupService } from './storage/backup/imageBackupService';
import { BackupPolicyRepository } from './storage/backup/backupPolicyRepository';
import { BackupPolicyService } from './storage/backup/backupPolicyService';
import { BackupCoverageService } from './storage/backup/backupCoverageService';
import { BackupAutomationService } from './storage/backup/backupAutomationService';

const REGION = 'asia-southeast1';
const adminApp = getApps().length ? getApps()[0] : initializeApp();
const staffProvisioning = new StaffProvisioningService(getAuth(adminApp), getFirestore(adminApp));
const bootstrapSecret = defineSecret('WORKSHOP_BOOTSTRAP_KEY');
const bootstrapService = new BootstrapService(getAuth(adminApp), getFirestore(adminApp));
const workflowDb = getFirestore(adminApp);
const productionWorkflow = new ProductionWorkflowService(workflowDb);
const fulfillmentWorkflow = new FulfillmentWorkflowService(workflowDb);
const logisticsWorkflow = new LogisticsWorkflowService(workflowDb, fulfillmentWorkflow);
const storageProviderConfigs = new StorageProviderConfigRepository(workflowDb);
const cloudProjectId = String(adminApp.options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '');
const r2CredentialStore = new GoogleSecretManagerR2CredentialStore(cloudProjectId);
const backendStorageProviderFactory = new BackendStorageProviderFactory(storageProviderConfigs, r2CredentialStore);
const storageProviderAdmin = new StorageProviderAdminService(
  workflowDb,
  storageProviderConfigs,
  r2CredentialStore,
  backendStorageProviderFactory,
);
const storageUploadOperations = new StorageUploadOperationRepository(workflowDb);
const storageRuntime = new StorageRuntimeService(workflowDb, storageProviderConfigs);
const imageDirectUpload = new ImageDirectUploadService(
  workflowDb,
  backendStorageProviderFactory,
  storageUploadOperations,
  storageRuntime,
);
const imageAccess = new ImageAccessService(workflowDb, backendStorageProviderFactory);
const firebaseAdminStorageProvider = new FirebaseAdminStorageProvider(
  getStorage(adminApp),
  adminApp.options.storageBucket,
);
const storageTransferProviders = new StorageTransferProviderFactory(
  backendStorageProviderFactory,
  firebaseAdminStorageProvider,
);
const imageBackupRepository = new ImageBackupRepository(workflowDb);
const imageBackup = new ImageBackupService(workflowDb, storageTransferProviders, imageBackupRepository);
const backupPolicies = new BackupPolicyRepository(workflowDb);
const backupPolicyAdmin = new BackupPolicyService(workflowDb, backupPolicies, storageTransferProviders);
const backupCoverage = new BackupCoverageService(workflowDb, backupPolicies, imageBackupRepository);
const backupAutomation = new BackupAutomationService(
  workflowDb,
  backupPolicies,
  imageBackupRepository,
  storageTransferProviders,
  imageBackup,
  storageProviderConfigs,
);

function toHttpsError(error: unknown): HttpsError {
  if (error instanceof ProvisioningError) {
    return new HttpsError(error.code, error.message);
  }
  if (error instanceof WorkflowError) return new HttpsError(error.code, error.message);
  return new HttpsError('internal', 'The staff account operation could not be completed.');
}

function toStorageHttpsError(error: unknown): HttpsError {
  if (error instanceof WorkflowError || error instanceof StorageAdminError) {
    return new HttpsError(error.code, error.message, error instanceof StorageAdminError ? error.details : undefined);
  }
  return new HttpsError('internal', 'The storage provider operation could not be completed.');
}

export const provisionStaffUser = onCall({ region: REGION }, async (request) => {
  try {
    return await staffProvisioning.provision(request.auth?.uid, request.data as ProvisionStaffRequest);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getStaffProvisioningStatus = onCall({ region: REGION }, async (request) => {
  try {
    return await staffProvisioning.getStaffStatus(request.auth?.uid);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const setStaffActive = onCall({ region: REGION }, async (request) => {
  try {
    return await staffProvisioning.setStaffActive(request.auth?.uid, request.data as SetStaffActiveRequest);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const changeStaffRole = onCall({ region: REGION }, async (request) => {
  try {
    return await staffProvisioning.changeStaffRole(request.auth?.uid, request.data as ChangeStaffRoleRequest);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const resetStaffPassword = onCall({ region: REGION }, async (request) => {
  try {
    return await staffProvisioning.resetStaffPassword(request.auth?.uid, request.data as ResetStaffPasswordRequest);
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getBootstrapStatus = onCall({ region: REGION }, async () => {
  try {
    return await bootstrapService.getStatus();
  } catch (error) {
    throw new HttpsError('internal', 'Bootstrap status could not be checked.');
  }
});

export const bootstrapFirstDeveloper = onCall({ region: REGION, secrets: [bootstrapSecret] }, async (request) => {
  try {
    return await bootstrapService.bootstrap(request.data, bootstrapSecret.value());
  } catch (error) {
    throw toHttpsError(error);
  }
});

function storageCall(operation: (uid: string | undefined, data: unknown) => Promise<unknown>) {
  return onCall({ region: REGION }, async (request) => {
    try {
      return await operation(request.auth?.uid, request.data);
    } catch (error) {
      throw toStorageHttpsError(error);
    }
  });
}

// Stream/hash operations may perform multiple provider reads. Runtime options
// are scoped to these callables and do not change unrelated Functions.
function storageTransferCall(operation: (uid: string | undefined, data: unknown) => Promise<unknown>) {
  return onCall({ region: REGION, timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
    try {
      return await operation(request.auth?.uid, request.data);
    } catch (error) {
      throw toStorageHttpsError(error);
    }
  });
}

export const createStorageProviderConfig = storageCall((uid, data) => storageProviderAdmin.create(uid, data));
export const updateStorageProviderConfig = storageCall((uid, data) => storageProviderAdmin.update(uid, data));
export const setStorageProviderCredentials = storageCall((uid, data) => storageProviderAdmin.setCredentials(uid, data));
export const getStorageProviderConfig = storageCall((uid, data) => storageProviderAdmin.get(uid, data));
export const listStorageProviderConfigs = storageCall((uid, data) => storageProviderAdmin.list(uid, data));
export const disableStorageProviderConfig = storageCall((uid, data) => storageProviderAdmin.disable(uid, data));
export const enableStorageProviderConfig = storageCall((uid, data) => storageProviderAdmin.enable(uid, data));
export const testStorageProviderConnection = storageCall((uid, data) => storageProviderAdmin.testConnection(uid, data));
export const getStorageRuntimeConfig = storageCall((uid, data) => storageRuntime.getAdmin(uid, data));
export const updateStorageRuntimeConfig = storageCall((uid, data) => storageRuntime.updateAdmin(uid, data));
export const setManualActiveStorageProvider = storageCall((uid, data) => storageRuntime.setManualActive(uid, data));
export const listStorageProviderRuntimeStatus = storageCall((uid, data) => storageRuntime.listStatuses(uid, data));
export const prepareImageUpload = storageCall((uid, data) => imageDirectUpload.prepare(uid, data));
export const finalizeImageUpload = storageCall((uid, data) => imageDirectUpload.finalize(uid, data));
export const resolveImageReadUrl = storageCall((uid, data) => imageAccess.resolveReadUrl(uid, data));
export const retireImage = storageCall((uid, data) => imageAccess.retire(uid, data));
export const createImageBackupJob = storageCall((uid, data) => imageBackup.createJob(uid, data));
export const getImageBackupJob = storageCall((uid, data) => imageBackup.getJob(uid, data));
export const listImageBackupJobs = storageCall((uid, data) => imageBackup.listJobs(uid, data));
export const runImageBackupJobStep = storageTransferCall((uid, data) => imageBackup.runStep(uid, data));
export const retryImageBackupJobItem = storageCall((uid, data) => imageBackup.retryItem(uid, data));
export const cancelImageBackupJob = storageCall((uid, data) => imageBackup.cancelJob(uid, data));
export const listImageReplicas = storageCall((uid, data) => imageBackup.listReplicas(uid, data));
export const verifyImageReplica = storageTransferCall((uid, data) => imageBackup.verifyReplica(uid, data));
export const verifyCanonicalImage = storageTransferCall((uid, data) => imageBackup.verifyCanonical(uid, data));
export const restoreImageFromReplica = storageTransferCall((uid, data) => imageBackup.restore(uid, data));
export const listBackupPolicies = storageCall((uid, data) => backupPolicyAdmin.list(uid, data));
export const createBackupPolicy = storageCall((uid, data) => backupPolicyAdmin.create(uid, data));
export const updateBackupPolicy = storageCall((uid, data) => backupPolicyAdmin.update(uid, data));
export const enableBackupPolicy = storageCall((uid, data) => backupPolicyAdmin.setEnabled(uid, data, true));
export const disableBackupPolicy = storageCall((uid, data) => backupPolicyAdmin.setEnabled(uid, data, false));
export const getBackupCoverage = storageCall((uid, data) => backupCoverage.coverage(uid, data));
export const listFailedBackupItems = storageCall((uid, data) => backupCoverage.failedItems(uid, data));
export const createBackupBackfillJob = storageCall((uid, data) => backupAutomation.createBackfill(uid, data));

export const enqueueCanonicalImageBackups = onDocumentCreated({
  document: 'image_registry/{imageId}',
  region: REGION,
  retry: false,
  maxInstances: 2,
  concurrency: 1,
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (event) => {
  if (!event.data) return;
  await backupAutomation.enqueueCanonical(event.params.imageId, event.data.data());
});

export const synchronizeRetiredImageReplicas = onDocumentUpdated({
  document: 'image_registry/{imageId}',
  region: REGION,
  retry: false,
  maxInstances: 1,
  concurrency: 1,
  timeoutSeconds: 60,
  memory: '256MiB',
}, async (event) => {
  if (!event.data) return;
  const beforeStatus = event.data.before.get('status');
  const afterStatus = event.data.after.get('status');
  if (beforeStatus === 'ACTIVE' && afterStatus === 'DELETED') {
    await backupAutomation.markCanonicalDeleted(event.params.imageId);
  }
});

export const processPendingImageBackupItem = onDocumentWritten({
  document: 'image_backup_jobs/{jobId}/items/{imageId}',
  region: REGION,
  retry: false,
  maxInstances: 2,
  concurrency: 1,
  timeoutSeconds: 300,
  memory: '512MiB',
}, async (event) => {
  const after = event.data?.after;
  if (!after?.exists || after.get('status') !== 'PENDING') return;
  const before = event.data?.before;
  if (before?.exists && before.get('status') === 'PENDING') return;
  await backupAutomation.processItem(event.params.jobId, event.params.imageId, event.id);
});

export const continueImageBackupBackfill = onDocumentWritten({
  document: 'image_backup_jobs/{jobId}',
  region: REGION,
  retry: false,
  maxInstances: 1,
  concurrency: 1,
  timeoutSeconds: 120,
  memory: '256MiB',
}, async (event) => {
  const after = event.data?.after;
  if (!after?.exists || after.get('jobType') !== 'BACKFILL' ||
      !['PENDING', 'DISCOVERING'].includes(String(after.get('discoveryStatus')))) return;
  if (Number(after.get('pendingItems')) > 0 || Number(after.get('runningItems')) > 0) return;
  const before = event.data?.before;
  const shouldAdvance = !before?.exists || after.get('discoveryStatus') === 'PENDING' ||
    after.get('discoveryRevision') !== before.get('discoveryRevision') ||
    after.get('pendingItems') !== before.get('pendingItems') ||
    after.get('runningItems') !== before.get('runningItems');
  if (!shouldAdvance) return;
  await backupAutomation.processDiscovery(event.params.jobId, event.id);
});

// Server-authoritative workflow entrypoints. Business roles are resolved from
// auth_identities/{uid}; client-supplied roles and demo preview state are ignored.
function workflowCall(operation: (uid: string | undefined, data: any) => Promise<unknown>) {
  return onCall({ region: REGION }, async (request) => {
    try {
      return await operation(request.auth?.uid, request.data);
    } catch (error) {
      throw toHttpsError(error);
    }
  });
}

export const reportBrokenPlate = workflowCall((uid, data) => productionWorkflow.reportBrokenPlate(uid, data));
export const reviseProductionOrder = workflowCall((uid, data) => productionWorkflow.reviseProductionOrder(uid, data));
export const reportProductionIssue = workflowCall((uid, data) => productionWorkflow.reportIssue(uid, data));
export const reissuePlate = workflowCall((uid, data) => productionWorkflow.reissuePlate(uid, data));
export const sendPlate = workflowCall((uid, data) => productionWorkflow.sendPlate(uid, data));
export const receivePlate = workflowCall((uid, data) => productionWorkflow.receivePlate(uid, data));
export const resolveProductionIssue = workflowCall((uid, data) => productionWorkflow.resolveIssue(uid, data));
export const cancelProductionIssue = workflowCall((uid, data) => productionWorkflow.cancelIssue(uid, data));
export const handoffToFinishing = workflowCall((uid, data) => productionWorkflow.handoffToFinishing(uid, data));
export const startFinishing = workflowCall((uid, data) => productionWorkflow.startFinishing(uid, data));
export const completeFinishing = workflowCall((uid, data) => fulfillmentWorkflow.completeFinishing(uid, data));
export const confirmFinishedGoodQuantity = workflowCall((uid, data) => fulfillmentWorkflow.confirmFinishedGoodQuantity(uid, data));
export const confirmSalesOrder = workflowCall((uid, data) => fulfillmentWorkflow.confirmSalesOrder(uid, data));
export const linkProductionOrder = workflowCall((uid, data) => fulfillmentWorkflow.linkProductionOrder(uid, data));
export const requestProductionCancellation = workflowCall((uid, data) => fulfillmentWorkflow.requestProductionCancellation(uid, data));
export const respondProductionCancellation = workflowCall((uid, data) => fulfillmentWorkflow.respondProductionCancellation(uid, data));
export const completeProductionPrint = workflowCall((uid, data) => fulfillmentWorkflow.completeProductionPrint(uid, data));
export const claimFinishingTask = workflowCall((uid, data) => fulfillmentWorkflow.claimFinishingTask(uid, data));
export const completeFinishingTask = workflowCall((uid, data) => fulfillmentWorkflow.completeFinishingTask(uid, data));
export const requestFinishingCancellation = workflowCall((uid, data) => fulfillmentWorkflow.requestFinishingCancellation(uid, data));
export const respondFinishingCancellation = workflowCall((uid, data) => fulfillmentWorkflow.respondFinishingCancellation(uid, data));
export const setFinishingTaskUrgent = workflowCall((uid, data) => fulfillmentWorkflow.setFinishingTaskUrgent(uid, data));
export const reportWorkflowIssue = workflowCall((uid, data) => fulfillmentWorkflow.reportWorkflowIssue(uid, data));
export const resolveWorkflowIssue = workflowCall((uid, data) => fulfillmentWorkflow.resolveWorkflowIssue(uid, data));
export const cancelWorkflowIssue = workflowCall((uid, data) => fulfillmentWorkflow.cancelWorkflowIssue(uid, data));
export const cancelSalesOrder = workflowCall((uid, data) => fulfillmentWorkflow.cancelSalesOrder(uid, data));
export const forceReopenSalesOrder = workflowCall((uid, data) => fulfillmentWorkflow.forceReopenSalesOrder(uid, data));
export const createWarehouseDispatch = workflowCall((uid, data) => logisticsWorkflow.createDispatch(uid, data));
export const confirmWarehouseDispatch = workflowCall((uid, data) => logisticsWorkflow.confirmDispatch(uid, data));
export const reverseWarehouseDispatch = workflowCall((uid, data) => logisticsWorkflow.reverseDispatch(uid, data));
export const createShipment = workflowCall((uid, data) => logisticsWorkflow.createShipment(uid, data));
export const transitionShipment = workflowCall((uid, data) => logisticsWorkflow.transitionShipment(uid, data));
export const inspectReturnedShipment = workflowCall((uid, data) => logisticsWorkflow.inspectReturnedShipment(uid, data));
