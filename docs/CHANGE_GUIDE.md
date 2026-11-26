# CHANGE GUIDE

Use each entry as the initial inspection boundary. Expand only when the code shows a direct dependency not listed here.

## Change Designer form

READ FIRST: `src/components/QuickOrderComposer.tsx`, `src/components/CreateOrderModal.tsx`, `src/context/AppContext.tsx`, `src/types.ts`.

MAY ALSO AFFECT: parser, printer matching, local drafts, images, Sales Product linking. DO NOT NEED TO SCAN: Warehouse/shipping unless product link/output fields change.

## Change production instruction parser

READ FIRST: `src/utils/textParser.ts`, `src/components/QuickOrderComposer.tsx`, `src/components/CreateOrderModal.tsx`, `tests/workflow-v2-local.test.ts`.

MAY ALSO AFFECT: dynamic paper/GSM config. DO NOT NEED TO SCAN: Functions or Rules when output field meanings do not change.

## Change printer picker

READ FIRST: `src/utils/printerMatching.ts`, `src/components/QuickOrderComposer.tsx`, `src/context/AuthContext.tsx`, `tests/workflow-v2-local.test.ts`.

MAY ALSO AFFECT: active-user filtering and production assignment.

## Change local drafts

READ FIRST: `src/repositories/localProductionDraftRepository.ts`, `src/context/AppContext.tsx`, `src/context/ProductionContext.tsx`, `src/repositories/productionOrderRepository.ts`.

MAY ALSO AFFECT: image Blob lifecycle, `production_draft_backups`, dispatch idempotency. DO NOT NEED TO SCAN: finishing/logistics unless official order shape changes.

## Change image upload

READ FIRST: `src/services/imageStorageService.ts`, `src/services/runtimeImageTransport.ts`, `src/components/ResolvedImage.tsx`, `src/storage/storageManager.ts`, `src/storage/types.ts`, `src/repositories/imageRegistryRepository.ts`, `functions/src/storage/storageRuntimeService.ts`, `functions/src/storage/imageUploadPolicy.ts`, `functions/src/storage/imageDirectUploadService.ts`, `functions/src/storage/imageAccessService.ts`, `functions/src/storage/uploadOperationRepository.ts`, `storage.rules`, `firestore.rules`, `src/types.ts`, relevant UI caller.

MAY ALSO AFFECT: provider adapter, runtime strategy, object-key/SHA-256 helpers, draft IndexedDB/idempotency, read URL cache, logical retirement, Firestore reference fields, Storage tests. DO NOT NEED TO SCAN: unrelated repositories.

## Change Production Order

READ FIRST: `src/types.ts`, `src/context/AppContext.tsx`, `src/repositories/productionOrderRepository.ts`, `functions/src/workflows/productionWorkflow.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`, `firestore.rules`.

MAY ALSO AFFECT: Designer, Printer, issues, cancellation, Product links, finishing, images, tests.

## Change printer assignment

READ FIRST: `functions/src/workflows/productionWorkflow.ts` `reviseProductionOrder`, `src/context/AppContext.tsx`, `src/components/OrderDetailModal.tsx`, `firestore.rules`.

MAY ALSO AFFECT: revision ACK, accepted timestamp, canonical business IDs.

## Change Printer workflow

READ FIRST: `src/components/OrderCard.tsx`, `src/components/OrderDetailModal.tsx`, `src/context/AppContext.tsx`, `src/repositories/productionOrderRepository.ts`, `firestore.rules`, completion method in `functions/src/workflows/fulfillmentWorkflow.ts`.

MAY ALSO AFFECT: plate flow, cancellation, revision, finishing task creation, Workflow emulator tests.

## Change Revision

READ FIRST: `functions/src/workflows/productionWorkflow.ts`, `src/context/AppContext.tsx`, `firestore.rules`, `src/types.ts`.

MAY ALSO AFFECT: Printer UI and reassignment. DO NOT NEED TO SCAN: Warehouse unless output schema changes.

## Change Cancellation

READ FIRST: `functions/src/workflows/fulfillmentWorkflow.ts`, `src/services/workflowCallableService.ts`, `src/context/AppContext.tsx`, `src/components/FinishingTasksManagement.tsx`.

MAY ALSO AFFECT: Product links/status, finished goods, Sales Order derivation, audit, Rules tests.

## Change Issues

READ FIRST: `functions/src/workflows/issuePolicy.ts`, `productionWorkflow.ts`, `fulfillmentWorkflow.ts`, issue UI components, `src/permissions/index.ts`.

MAY ALSO AFFECT: `orders.issues`, `workflow_issues`, transition dialogs, Rules. Decide production-embedded versus Product-stage issue first.

## Change Finishing

READ FIRST: `src/components/FinishingTasksManagement.tsx`, `src/repositories/finishingTaskRepository.ts`, product-centric methods in `functions/src/workflows/fulfillmentWorkflow.ts`, `src/types.ts`.

MAY ALSO AFFECT: Products, finished goods, warehouse readiness, issues, cancellation, urgent. Check whether the requested change targets product-centric V2 or legacy embedded finishing.

## Change Warehouse

READ FIRST: `src/components/FinishedGoodsManagement.tsx`, `CreateDispatchModal.tsx`, `WarehouseDispatchManagement.tsx`, `src/services/warehouseDispatchService.ts`, `functions/src/workflows/logisticsWorkflow.ts`.

MAY ALSO AFFECT: Product readiness, inventory quantities, shipments, Sales Order derivation. Preserve anti-partial export.

## Change Sales Order

READ FIRST: Sales Order UI components, `src/services/salesOrderService.ts`, `src/repositories/salesOrderRepository.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`, `src/types.ts`.

MAY ALSO AFFECT: Products, Designer queue, direct routes, finishing, warehouse, shipping, Rules.

## Change Product

READ FIRST: `SalesOrderItem` in `src/types.ts`, `src/repositories/salesOrderRepository.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`.

MAY ALSO AFFECT: Production M:N links, finishing tasks, finished goods, warehouse readiness, parent aggregation.

## Change authentication

READ FIRST: `src/context/AuthContext.tsx`, `src/config/firebase.ts`, `functions/src/workflows/workflowAuth.ts`, `firestore.rules`, `storage.rules`.

MAY ALSO AFFECT: every protected feature. Preserve UID -> identity -> business user mapping.

## Change permissions

READ FIRST: `src/permissions/index.ts`, `src/components/DeveloperPermissionMatrix.tsx`, `src/context/ConfigContext.tsx`, then the relevant Function/Rules authority.

MAY ALSO AFFECT: `settings/app`. Never assume client permission override changes server authorization.

## Change Firestore Rules

READ FIRST: `firestore.rules`, canonical identity code, affected repository, affected Function workflow, emulator tests under `tests/`.

MAY ALSO AFFECT: direct-versus-callable write design. DO NOT NEED TO SCAN: presentation-only components unless allowed fields change.

## Change Cloud Functions

READ FIRST: `functions/src/index.ts`, target workflow/service, `functions/src/workflows/workflowAuth.ts`, `src/services/workflowCallableService.ts`, affected types/Rules/tests. For provider management also read `src/services/storageProviderAdminClient.ts`, `src/components/StorageProviderManager.tsx`, `functions/src/storage/`, `functions/package.json`, and the matching Firestore collection rules.

MAY ALSO AFFECT: audit logs, transaction idempotency, region/emulator config.

## Change chat

READ FIRST: `src/context/AppContext.tsx` `addComment`, `src/components/OrderCard.tsx`, `OrderDetailModal.tsx`, `Comment` in `src/types.ts`, `orders` update fields in `firestore.rules`.

MAY ALSO AFFECT: document size and image handling. There is no separate chat collection to scan.

## Change urgent

READ FIRST: `src/services/urgentOrderService.ts`, urgent methods in `src/context/AppContext.tsx` and `functions/src/workflows/fulfillmentWorkflow.ts`, relevant UI badges.

MAY ALSO AFFECT: Sales Order priority/Product urgency propagation and audit.

## Change Developer config

READ FIRST: `src/components/SettingsModal.tsx`, `DeveloperPermissionMatrix.tsx`, `StorageProviderManager.tsx`, `src/services/storageProviderAdminClient.ts`, `src/context/ConfigContext.tsx`, `src/config/appConfig.ts`, `src/repositories/settingsRepository.ts`.

MAY ALSO AFFECT: feature dependency graph, permissions, branding Storage, health check. DO NOT NEED TO SCAN: workflow Functions for presentation-only settings.

## Change Firebase Hosting

READ FIRST: `firebase.json`, `.firebaserc`, `vite.config.ts`, `package.json`, `index.html`, `public/manifest.json`.

MAY ALSO AFFECT: PWA assets and deployment scripts. Note that `server.ts` APIs are not hosted by the current static Firebase Hosting rewrite.

## Change Storage

READ FIRST: `src/storage/storageManager.ts`, `src/storage/types.ts`, `src/storage/adminTypes.ts`, browser provider adapter, `src/components/StorageProviderManager.tsx`, `src/services/storageProviderAdminClient.ts`, `functions/src/storage/`, `functions/src/index.ts`, `functions/package.json`, `src/repositories/imageRegistryRepository.ts`, `storage.rules`, `firestore.rules`, `src/services/imageStorageService.ts`, `src/config/firebase.ts`, image reference types and concrete caller.

MAY ALSO AFFECT: `storage_provider_configs`, `storage_runtime/config`, `storage_upload_operations`, tracked Image Registry usage, Secret Manager IAM/API/version retention, provider configuration IDs, presigned PUT/GET URL and CORS policy, staging/final keys, canonical identity roles, logical retirement, orphan cleanup, and emulator tests. Never put R2 credentials, secret-version references, caller-selected bucket/key fields, or persisted signed URLs in browser code. Note the current Warehouse-role omission in Storage Rules for legacy Firebase reads.

## Change shipping / returns

READ FIRST: `src/components/ShippingManagement.tsx`, `src/services/shippingService.ts`, `src/repositories/shipmentRepository.ts`, `functions/src/workflows/logisticsWorkflow.ts`.

MAY ALSO AFFECT: inventory, dispatch reversal constraints, Sales Order derivation.

## Change PWA/offline behavior

READ FIRST: `vite.config.ts`, `public/sw.js`, `public/manifest.json`, online/offline code in `src/context/AppContext.tsx`, `src/utils/firestoreSafeWrite.ts`.

MAY ALSO AFFECT: IndexedDB drafts. Do not turn official workflow writes into unconfirmed offline success.

## Change image backup / restore / integrity

READ FIRST: `functions/src/storage/backup/`, `functions/src/storage/types.ts`, `functions/src/storage/providers/R2Provider.ts`, `functions/src/storage/providers/FirebaseAdminStorageProvider.ts`, `functions/src/storage/providerFactory.ts`, `functions/src/index.ts`, `src/components/StorageBackupManager.tsx`, `src/services/imageBackupAdminClient.ts`, `firestore.rules`, `firestore.indexes.json`.

MAY ALSO AFFECT: `storage_backup_policies`, `image_replicas`, `image_backup_jobs/{jobId}/items`, canonical create/retire triggers, paginated discovery, aggregate coverage, stream lifecycle, checksum provenance, provider disable semantics, lease expiry/retry limits, audit logs and scoped Function limits. Preserve these invariants: canonical image is not a replica; auto-backup failure cannot fail canonical upload; backup is not migration; restore is missing-only and not a provider switch; object keys come from server records, never the caller.
