# Firebase reference inventory

Static source inventory at b1cefcdd. Paths below are relative to the source snapshot, moved under legacy/firebase in SQL. No runtime or production access.

## SDK call sites

| File | Dependency markers |
|---|---|
| `src/components/ProductionUserManagement.tsx` | localStorage (1) |
| `src/components/StorageProviderManager.tsx` | localStorage (1) |
| `src/config/firebase.ts` | firebase/auth (1), firebase/firestore (1), firebase/storage (1), localStorage (1) |
| `src/context/AppContext.tsx` | onSnapshot (2) |
| `src/context/AuthContext.tsx` | firebase/auth (1), firebase/firestore (1) |
| `src/context/ConfigContext.tsx` | localStorage (1) |
| `src/repositories/auditRepository.ts` | firebase/firestore (1) |
| `src/repositories/customerRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/finishedGoodRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/finishingTaskRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/imageRegistryRepository.ts` | firebase/firestore (1) |
| `src/repositories/localProductionDraftRepository.ts` | indexedDB (2) |
| `src/repositories/productionOrderRepository.ts` | firebase/firestore (1), onSnapshot (3) |
| `src/repositories/salesOrderRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/savedDesignRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/settingsRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/shipmentRepository.ts` | firebase/firestore (1) |
| `src/repositories/userRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/repositories/warehouseDispatchRepository.ts` | firebase/firestore (1) |
| `src/repositories/workflowIssueRepository.ts` | firebase/firestore (1), onSnapshot (2) |
| `src/services/bootstrapService.ts` | httpsCallable (3) |
| `src/services/finishedGoodService.ts` | firebase/firestore (1), runTransaction (1) |
| `src/services/imageBackupAdminClient.ts` | httpsCallable (2) |
| `src/services/runtimeImageTransport.ts` | httpsCallable (2) |
| `src/services/salesOrderWorkflowService.ts` | firebase/firestore (1) |
| `src/services/staffProvisioningService.ts` | httpsCallable (2) |
| `src/services/storageProviderAdminClient.ts` | httpsCallable (2) |
| `src/services/workflowCallableService.ts` | httpsCallable (2) |
| `src/storage/providers/FirebaseStorageProvider.ts` | firebase/storage (1) |
| `src/utils/firestoreSafeWrite.ts` | firebase/firestore (1), runTransaction (4) |
| `src/utils/storageUtils.ts` | localStorage (10) |
| `src/utils/versionUtils.ts` | localStorage (1) |
| `functions/src/bootstrapService.ts` | firebase-admin (2), firebase-functions (1), runTransaction (3) |
| `functions/src/index.ts` | firebase-admin (4), firebase-functions (3), onDocument (7) |
| `functions/src/staffProvisioningService.ts` | firebase-admin (2), firebase-functions (1), runTransaction (1) |
| `functions/src/storage/backup/backupAutomationService.ts` | firebase-admin (1) |
| `functions/src/storage/backup/backupCoverageService.ts` | firebase-admin (1) |
| `functions/src/storage/backup/backupPolicyRepository.ts` | firebase-admin (1), runTransaction (2) |
| `functions/src/storage/backup/backupPolicyService.ts` | firebase-admin (1) |
| `functions/src/storage/backup/backupRepository.ts` | firebase-admin (1), runTransaction (15) |
| `functions/src/storage/backup/imageBackupService.ts` | firebase-admin (1) |
| `functions/src/storage/backup/types.ts` | firebase-admin (1) |
| `functions/src/storage/credentialStore.ts` | secret-manager (1) |
| `functions/src/storage/imageAccessService.ts` | firebase-admin (1) |
| `functions/src/storage/imageDirectUploadService.ts` | firebase-admin (1), firebase-functions (1) |
| `functions/src/storage/providerConfigRepository.ts` | firebase-admin (1) |
| `functions/src/storage/providers/FirebaseAdminStorageProvider.ts` | firebase-admin (1) |
| `functions/src/storage/providers/R2Provider.ts` | firebase-functions (1) |
| `functions/src/storage/storageProviderAdminService.ts` | firebase-admin (1), firebase-functions (1) |
| `functions/src/storage/storageRuntimeService.ts` | firebase-admin (1) |
| `functions/src/storage/types.ts` | firebase-admin (1) |
| `functions/src/storage/uploadOperationRepository.ts` | firebase-admin (1), onSnapshot (3), runTransaction (4) |
| `functions/src/workflows/fulfillmentWorkflow.ts` | firebase-admin (1), runTransaction (17) |
| `functions/src/workflows/logisticsWorkflow.ts` | firebase-admin (1), runTransaction (6) |
| `functions/src/workflows/productionWorkflow.ts` | firebase-admin (1), runTransaction (10) |
| `functions/src/workflows/workflowAudit.ts` | firebase-admin (1) |
| `functions/src/workflows/workflowAuth.ts` | firebase-admin (1) |
| `scripts/cleanup-business-data.cjs` | firebase-admin (2) |
| `tests/e2e/urgent-ui.spec.ts` | firebase/auth (1), firebase/firestore (1), firebase-admin (3), httpsCallable (2) |
| `tests/e2e/workflow-v2-ui.spec.ts` | firebase-admin (3), indexedDB (3) |
| `tests/health-probe-emulator.cjs` | firebase/auth (1), firebase/firestore (1), firebase-admin (3) |
| `tests/prompt08b-provisioned-e2e.cjs` | firebase/auth (1), firebase-admin (3), httpsCallable (2) |
| `tests/prompt08d-realtime.ts` | firebase/auth (1), firebase/firestore (1), firebase-admin (3), onSnapshot (3), httpsCallable (2) |
| `tests/prompt10d-zero-trust.ts` | firebase/auth (1), firebase/firestore (1), firebase-admin (3), onSnapshot (2), httpsCallable (2) |
| `tests/prompt14-permissions-emulator.cjs` | firebase/auth (1), firebase/firestore (1), firebase-admin (3), runTransaction (3), httpsCallable (2) |
| `tests/provisioning-emulator.cjs` | firebase/auth (1), firebase/firestore (1), firebase-admin (3), runTransaction (4), httpsCallable (2) |
| `tests/storage-rules-prompt05.cjs` | firebase/auth (1), firebase/firestore (1), firebase/storage (1), firebase-admin (3) |
| `tests/workflow-emulator.cjs` | firebase/auth (1), firebase/firestore (1), firebase-admin (3), httpsCallable (2) |

## Exported server entry points

- `provisionStaffUser`
- `getStaffProvisioningStatus`
- `setStaffActive`
- `changeStaffRole`
- `resetStaffPassword`
- `getBootstrapStatus`
- `bootstrapFirstDeveloper`
- `createStorageProviderConfig`
- `updateStorageProviderConfig`
- `setStorageProviderCredentials`
- `getStorageProviderConfig`
- `listStorageProviderConfigs`
- `disableStorageProviderConfig`
- `enableStorageProviderConfig`
- `testStorageProviderConnection`
- `getStorageRuntimeConfig`
- `updateStorageRuntimeConfig`
- `setManualActiveStorageProvider`
- `listStorageProviderRuntimeStatus`
- `prepareImageUpload`
- `finalizeImageUpload`
- `resolveImageReadUrl`
- `retireImage`
- `createImageBackupJob`
- `getImageBackupJob`
- `listImageBackupJobs`
- `runImageBackupJobStep`
- `retryImageBackupJobItem`
- `cancelImageBackupJob`
- `listImageReplicas`
- `verifyImageReplica`
- `verifyCanonicalImage`
- `restoreImageFromReplica`
- `listBackupPolicies`
- `createBackupPolicy`
- `updateBackupPolicy`
- `enableBackupPolicy`
- `disableBackupPolicy`
- `getBackupCoverage`
- `listFailedBackupItems`
- `createBackupBackfillJob`
- `enqueueCanonicalImageBackups`
- `synchronizeRetiredImageReplicas`
- `processPendingImageBackupItem`
- `continueImageBackupBackfill`
- `reportBrokenPlate`
- `reviseProductionOrder`
- `reportProductionIssue`
- `reissuePlate`
- `sendPlate`
- `receivePlate`
- `resolveProductionIssue`
- `cancelProductionIssue`
- `handoffToFinishing`
- `startFinishing`
- `completeFinishing`
- `confirmFinishedGoodQuantity`
- `confirmSalesOrder`
- `linkProductionOrder`
- `requestProductionCancellation`
- `respondProductionCancellation`
- `completeProductionPrint`
- `claimFinishingTask`
- `completeFinishingTask`
- `requestFinishingCancellation`
- `respondFinishingCancellation`
- `setFinishingTaskUrgent`
- `reportWorkflowIssue`
- `resolveWorkflowIssue`
- `cancelWorkflowIssue`
- `cancelSalesOrder`
- `forceReopenSalesOrder`
- `createWarehouseDispatch`
- `confirmWarehouseDispatch`
- `reverseWarehouseDispatch`
- `createShipment`
- `transitionShipment`
- `inspectReturnedShipment`

## Composite indexes

| Collection/group | Scope | Fields |
|---|---|---|
| customers | COLLECTION | deletedAt ASCENDING, createdAt DESCENDING |
| sales_orders | COLLECTION | customerId ASCENDING, deletedAt ASCENDING, createdAt DESCENDING |
| sales_orders | COLLECTION | saleId ASCENDING, deletedAt ASCENDING, createdAt DESCENDING |
| sales_orders | COLLECTION | deletedAt ASCENDING, createdAt DESCENDING |
| orders | COLLECTION | status ASCENDING, createdAt DESCENDING |
| orders | COLLECTION | status ASCENDING, createdAt ASCENDING |
| warehouse_dispatches | COLLECTION | salesOrderId ASCENDING, createdAt DESCENDING |
| warehouse_dispatches | COLLECTION | customerId ASCENDING, createdAt DESCENDING |
| shipments | COLLECTION | salesOrderId ASCENDING, createdAt DESCENDING |
| audit_logs | COLLECTION | targetType ASCENDING, targetId ASCENDING, createdAt DESCENDING |
| image_registry | COLLECTION | providerConfigId ASCENDING, status ASCENDING, __name__ ASCENDING |
| image_replicas | COLLECTION | sourceProviderConfigId ASCENDING, providerConfigId ASCENDING, canonicalStatus ASCENDING, status ASCENDING |
| items | COLLECTION_GROUP | status ASCENDING, updatedAt DESCENDING |

## Reference files reviewed

Types/interfaces and schema groups: src/types.ts, functions/src/types.ts. Navigation and UI: App.tsx, main.tsx, Navbar, Sidebar, MobileNav, LoginModal, BootstrapFirstRun, UserManagementModal, UserProfileModal, ProductionUserManagement, SettingsModal. Core data flows: every repository/service/context and functions workflows/storage. Trust boundaries: firestore.rules, storage.rules, firebase.json, server.ts. Current source maps and available tests were cross-checked. Source archives are historical and excluded from the clean snapshot.
