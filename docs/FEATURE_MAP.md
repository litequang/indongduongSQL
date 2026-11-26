# FEATURE MAP

## Token-efficiency index — feature -> primary files

| Feature | Primary files |
|---|---|
| Authentication / canonical identity | `src/context/AuthContext.tsx`; `functions/src/workflows/workflowAuth.ts`; `firestore.rules` |
| Users / roles | `src/components/ProductionUserManagement.tsx`; `src/services/staffProvisioningService.ts`; `functions/src/staffProvisioningService.ts` |
| Sales Order / Product | `src/components/SalesOrderManagement.tsx`; `src/services/salesOrderService.ts`; `src/repositories/salesOrderRepository.ts`; `functions/src/workflows/fulfillmentWorkflow.ts` |
| Designer draft | `src/components/QuickOrderComposer.tsx`; `src/components/CreateOrderModal.tsx`; `src/context/AppContext.tsx`; `src/repositories/localProductionDraftRepository.ts` |
| Parser / printer picker | `src/utils/textParser.ts`; `src/utils/printerMatching.ts`; `src/components/QuickOrderComposer.tsx` |
| Production Order | `src/context/AppContext.tsx`; `src/repositories/productionOrderRepository.ts`; `functions/src/workflows/productionWorkflow.ts` |
| Printer workflow / revision ACK | `src/components/OrderCard.tsx`; `src/components/OrderDetailModal.tsx`; `src/context/AppContext.tsx`; `firestore.rules` |
| Cancellation | `src/context/AppContext.tsx`; `functions/src/workflows/fulfillmentWorkflow.ts` |
| Issues | `src/components/IssueReportModal.tsx`; `src/components/WorkflowIssuesPanel.tsx`; `functions/src/workflows/productionWorkflow.ts`; `functions/src/workflows/fulfillmentWorkflow.ts` |
| Finishing | `src/components/FinishingTasksManagement.tsx`; `src/repositories/finishingTaskRepository.ts`; `functions/src/workflows/fulfillmentWorkflow.ts` |
| Finished goods / Warehouse | `src/components/FinishedGoodsManagement.tsx`; `src/components/WarehouseDispatchManagement.tsx`; `functions/src/workflows/logisticsWorkflow.ts` |
| Supplemental Production Orders | `src/components/DesignerQueue.tsx`; `src/services/salesOrderWorkflowService.ts`; `functions/src/workflows/fulfillmentWorkflow.ts` |
| Urgent | `src/services/urgentOrderService.ts`; `src/context/AppContext.tsx`; `functions/src/workflows/fulfillmentWorkflow.ts` |
| Chat / comments | `src/components/OrderCard.tsx`; `src/components/OrderDetailModal.tsx`; `src/context/AppContext.tsx` |
| Images / attachments | `src/services/imageStorageService.ts`; `src/storage/`; `functions/src/storage/`; `src/repositories/imageRegistryRepository.ts`; `src/repositories/localProductionDraftRepository.ts`; `firestore.rules`; `storage.rules` |
| Developer / system config | `src/components/SettingsModal.tsx`; `src/components/DeveloperPermissionMatrix.tsx`; `src/context/ConfigContext.tsx`; `src/repositories/settingsRepository.ts`; `functions/src/storage/storageProviderAdminService.ts` |

Classifications below are deliberately limited to navigation-critical files.

## AUTHENTICATION — canonical identity

Purpose: authenticate with Firebase email/password, resolve a stable business identity, and block protected providers until resolution completes.

- UI: `src/components/LoginModal.tsx`, `src/components/BootstrapFirstRun.tsx`, auth gates in `src/App.tsx` (**FEATURE**).
- State: `src/context/AuthContext.tsx` (**CORE**); `src/utils/authInitializationState.ts` (**SHARED**).
- Firebase bootstrap: `src/config/firebase.ts` (**INFRASTRUCTURE**).
- Backend: `functions/src/bootstrapService.ts`, `functions/src/workflows/workflowAuth.ts` (**CORE**).
- Types: `src/types.ts` `User`/`UserRole`; `functions/src/types.ts`.
- Firestore: `auth_identities/{firebaseUid}` -> `businessUserId` -> `users/{businessUserId}`.
- Rules: `hasActiveIdentity`, `businessUserId`, `identityRole` in `firestore.rules`.
- Dependencies: all protected reads/writes, Rules, Functions, Storage.
- Change impact: an identity change can break every permission, assignment, audit, and user relationship. Firebase UID must not replace business IDs.

## USER / ROLE MANAGEMENT

Purpose: provision Auth accounts, maintain business profiles, roles, activation, passwords, and personal profile data.

- UI: `src/components/UserManagementModal.tsx`, `src/components/ProductionUserManagement.tsx`, `src/components/UserProfileModal.tsx` (**FEATURE**).
- Client: `src/services/staffProvisioningService.ts`, `src/repositories/userRepository.ts` (**CORE**).
- Backend: `functions/src/staffProvisioningService.ts`; callable exports in `functions/src/index.ts` (**CORE**).
- Permissions: `src/permissions/index.ts`; `firestore.rules` permits self profile fields only; privileged lifecycle uses Admin SDK.
- Firestore: `users`, `auth_identities`, `counters/staff_user_ids`, `audit_logs`.
- Dependencies: canonical identity, avatar Storage, developer permission matrix.
- Change impact: role/profile inconsistency causes `requireWorkflowActor` to reject all server actions.

## SALES ORDER AND PRODUCT

Purpose: commercial order with one or more independent Product (`sales_order_items`) records.

- UI: `src/components/SalesOrderManagement.tsx`, `CreateSalesOrderModal.tsx`, `SalesOrderDetailModal.tsx` (**FEATURE**).
- Services: `src/services/salesOrderService.ts`, `src/services/salesOrderWorkflowService.ts` (**CORE**).
- Repository: `src/repositories/salesOrderRepository.ts` (**CORE**).
- Types: `SalesOrder`, `SalesOrderItem`, `SalesOrderStatus`, `SalesOrderItemStatus` in `src/types.ts`.
- Firestore: `sales_orders`, `sales_order_items`.
- Functions: `confirmSalesOrder`, `cancelSalesOrder`, `forceReopenSalesOrder`, `linkProductionOrder`; implementation in `functions/src/workflows/fulfillmentWorkflow.ts`.
- Rules: browser creates/edits descriptive draft data; lifecycle status is not directly writable.
- Dependencies: customers, images, Designer queue, production links, finishing, finished goods, dispatch/shipping.
- Change impact: Product status/quantity affects finishing, warehouse readiness, and derived parent Sales Order status.

## PRODUCTION ORDER

Purpose: technical print run, independent of or linked to one or more Products; print sheets remain separate from product quantity.

- UI: `src/components/QuickOrderComposer.tsx`, `CreateOrderModal.tsx`, `OrderCard.tsx`, `OrderDetailModal.tsx`, `PrintCompletionModal.tsx` (**FEATURE**).
- State/orchestration: `src/context/AppContext.tsx`, `src/context/ProductionContext.tsx` (**CORE**).
- Repository: `src/repositories/productionOrderRepository.ts` (**CORE**).
- Services: `src/services/workflowCallableService.ts`, `src/services/salesOrderWorkflowService.ts`.
- Types: `ProductionOrder`, `ProductionItem`, `PrintImage`, status types in `src/types.ts`.
- Firestore: `orders`; optional product links reference `sales_order_items`; draft recovery in `production_draft_backups`.
- Functions: production and fulfillment workflow services.
- Rules: `orders` direct create/update constraints plus server callables for privileged transitions.
- Dependencies: Designer, Printer, revision, cancellation, issues, images, product-centric finishing.
- Change impact: schema/status changes affect Designer, Printer, Rules, Functions, issues, finishing, images, and Sales Order derivation.

## DESIGNER — local-first Production Order draft

Purpose: compose production instructions locally, preserve image Blobs, recover drafts, and send an official order idempotently.

- UI: `src/components/QuickOrderComposer.tsx`, `src/components/CreateOrderModal.tsx`, `src/components/DesignerQueue.tsx` (**FEATURE**).
- State: draft creation, background backup, dispatch, batch dispatch in `src/context/AppContext.tsx` (**CORE**); merge in `src/context/ProductionContext.tsx`.
- Parser: `src/utils/textParser.ts`; printer picker: `src/utils/printerMatching.ts` (**SHARED**). `CreateOrderModal` uses the parser; `QuickOrderComposer` uses both parser and unique printer matcher.
- IndexedDB: `src/repositories/localProductionDraftRepository.ts` (**CORE**) — DB `flexo-workflow-v2`, store `production-drafts`; device-local copy wins over backup.
- Firestore: `production_draft_backups`, then `orders` on send.
- Images: local Blob -> `imageStorageService` -> Storage before official Firestore write.
- Dependencies: users/printer availability, order code counter, images, Sales Product links.
- Change impact: sending/backup changes can duplicate official orders, orphan Storage objects, or lose offline drafts.

## PRINTER — claim/receive, revision ACK, start, complete

Purpose: assigned printer accepts work, acknowledges current technical revision, starts printing, and completes the run.

- UI: `src/components/OrderCard.tsx`, `OrderDetailModal.tsx`, `PrintCompletionModal.tsx` (**FEATURE**).
- State: `acceptOrder`, `acknowledgeProductionRevision`, `confirmPlateReceived`, `startPrintingDirect`, `finishPrinting` in `src/context/AppContext.tsx` (**CORE**).
- Repository: `src/repositories/productionOrderRepository.ts` transactions.
- Functions: `receivePlate`, `completeProductionPrint`; revisions through `reviseProductionOrder`.
- Rules: `isAssignedPrinter`, `isAllowedPrinterStatusTransition`, `printerAcknowledgedLatestRevision`, `printerStartIsSafe` in `firestore.rules`.
- Firestore: `orders.printerId`, `status`, `productionRevision`, `printerAcknowledgedRevision`, timestamps.
- Dependencies: canonical business ID, plate state, pending cancellation, revisions, issues, finishing task fan-out.
- Change impact: assignment/revision changes can grant the wrong printer authority or allow stale instructions to be printed.

## REVISION AND REVISION ACK

Purpose: technical instruction edits increment `productionRevision`; reassignment resets acknowledgement; printer must ACK latest revision before start.

- UI: instruction editing/ACK in `src/components/OrderDetailModal.tsx`, `OrderCard.tsx`.
- Client: `src/context/AppContext.tsx`, `src/services/workflowCallableService.ts`.
- Backend: `reviseProductionOrder` in `functions/src/workflows/productionWorkflow.ts`.
- Rules: revision/start helpers in `firestore.rules`.
- Firestore: fields on `orders`; no separate revisions collection.
- Change impact: any edit/reassignment path must keep revision and ACK fields coherent.

## CANCELLATION

Purpose: production cancellation request/assigned-printer response; finishing cancellation before/after claim; direct Sales Order cancellation.

- UI: `src/components/OrderCard.tsx`, `OrderDetailModal.tsx`, `FinishingTasksManagement.tsx`, `SalesOrderDetailModal.tsx`.
- Client: `src/context/AppContext.tsx`, `src/services/workflowCallableService.ts`, `src/services/salesOrderService.ts`.
- Backend: request/respond production and finishing methods plus Sales Order cancel in `functions/src/workflows/fulfillmentWorkflow.ts`.
- Types: `CancellationRequest` in `src/types.ts`.
- Firestore: embedded `orders.cancellationRequest`, embedded `finishing_tasks.cancellationRequest`, Sales/Product statuses.
- Authority: production request by Sales/Designer/management, response in current code only by assigned Printer; finishing request by Sales/Designer/management, claimed-task response by Finisher.
- Change impact: cancellation reconciles Product traceability and can create finished goods for cancelled finishing checkpoints; review all downstream records.

## UNIFIED ISSUES

Purpose: production-order issues plus product-stage issues for Finishing/Warehouse, with reporter/recipient authority.

- UI: `src/components/IssueReportModal.tsx`, `ProductWorkflowIssueModal.tsx`, `WorkflowIssuesPanel.tsx`, `OpenIssueTransitionModal.tsx`.
- Client: issue methods in `src/context/AppContext.tsx`; `src/repositories/workflowIssueRepository.ts`; `src/services/workflowCallableService.ts`.
- Backend: `functions/src/workflows/productionWorkflow.ts`, `fulfillmentWorkflow.ts`, `issuePolicy.ts`.
- Firestore: embedded `orders.issues`; separate `workflow_issues` for `SALES_ORDER_ITEM` at `FINISHING`/`WAREHOUSE`.
- Statuses: production type supports `OPEN/ACKNOWLEDGED/IN_PROGRESS/RESOLVED/CANCELLED`, but server production issue policy creates/handles `OPEN/RESOLVED/CANCELLED`; workflow issues use `OPEN/RESOLVED/CANCELLED`.
- Current policy: all issue types are non-blocking (`isBlockingIssue` returns false); UI may ask to resolve or continue through open issues.
- Change impact: recipient authority spans permissions, issue policy, UI filters, server callables, and audit.

## FINISHING — product-centric

Purpose: after print completion, create one checkpoint per linked Product; required work is claimed/completed, while no-work Products are explicitly confirmed.

- UI: `src/components/FinishingTasksManagement.tsx` (**FEATURE**).
- Repository: `src/repositories/finishingTaskRepository.ts` (**CORE**).
- Backend: `completeProductionPrint`, `claimFinishingTask`, `completeFinishingTask`, finishing cancellation/urgent methods in `functions/src/workflows/fulfillmentWorkflow.ts` (**CORE**).
- Types: `FinishingTask`; statuses `READY`, `CLAIMED`, `COMPLETED`, `CANCELLED`.
- Firestore: `finishing_tasks`, `sales_order_items`, `finished_goods`.
- Legacy parallel flow: order-level `FinishingJob` and `handoffToFinishing/startFinishing/completeFinishing` remain in `ProductionWorkflowService`/`FulfillmentWorkflowService` and AppContext. Classification: **LEGACY compatibility path** relative to the product-centric V2 queue.
- Dependencies: Production completion, Product quantity, Issues, Urgent, Warehouse.
- Change impact: bypassing the checkpoint can leave Product/Sales Order readiness stale.

## WAREHOUSE — order-aware and anti-partial export

Purpose: expose finished goods, create Sales Order-scoped dispatches, prevent dispatch creation until every active Product is fully accepted, and update stock transactionally.

- UI: `src/components/FinishedGoodsManagement.tsx`, `CreateDispatchModal.tsx`, `WarehouseDispatchManagement.tsx` (**FEATURE**).
- Client: `src/services/finishedGoodService.ts`, `warehouseDispatchService.ts`; corresponding repositories.
- Backend: `functions/src/workflows/logisticsWorkflow.ts` (**CORE**).
- Firestore: `finished_goods`, `warehouse_dispatches`, `warehouse_dispatch_items`, `sales_orders`, `sales_order_items`.
- Anti-partial gate: `createDispatch` verifies all non-cancelled Sales Products are `WAREHOUSE_READY`/`PRODUCTION_COMPLETED` and accepted finished-good quantity meets Product quantity before creating a dispatch.
- Authority: `WAREHOUSE` role creates/confirms/reverses dispatches; Rules deny direct lifecycle writes.
- Dependencies: finishing completion, accepted quantities, Sales Order derivation, shipping.
- Change impact: quantity/status changes can cause oversell, partial export, or incorrect Sales Order readiness.

## SUPPLEMENTAL PRODUCTION ORDERS

Purpose: M:N traceability allows multiple Production Orders/Items to link to a Sales Product, including late/supplemental links.

- UI: Product selection in `src/components/DesignerQueue.tsx`; production creation in `CreateOrderModal.tsx`/`QuickOrderComposer.tsx`.
- Client: `src/services/salesOrderWorkflowService.ts`, `workflowCallableService.ts`.
- Backend: `linkProductionOrder` in `functions/src/workflows/fulfillmentWorkflow.ts`.
- Fields: Product `linkedProductionItemIds`, `linkedProductionOrderIds`, `productionHistory`; ProductionItem `salesOrderId`, `salesOrderItemId`, `sourceType`.
- Current rule: links are traceability; `allocatedQuantity` is retained but not derived from sheets, and history writes `allocatedProductQuantity: 0`.
- Change impact: late links may create/update finishing tasks and finished goods for already-printed orders.

## URGENT METADATA

Purpose: mark Production Orders and finishing Product tasks urgent without redefining lifecycle status.

- UI/state: urgent controls in order components and `FinishingTasksManagement.tsx`; `toggleUrgentOrder` in `src/context/AppContext.tsx`.
- Helpers: `src/services/urgentOrderService.ts`.
- Backend: `setFinishingTaskUrgent` in `functions/src/workflows/fulfillmentWorkflow.ts`.
- Fields: Sales Order `priority`, Product `isUrgent`, Production Order `isUrgent/urgentReason/urgentSetBy/urgentSetName`, finishing task `urgent`.
- Dependencies: UI sorting/badges, feature flag `urgentBadges`; no separate collection.
- Change impact: preserve metadata-only semantics and audit/authority.

## CHAT / INTERNAL COMMENTS

Purpose: order-level internal discussion displayed in cards/details.

- UI: `src/components/OrderCard.tsx`, `OrderDetailModal.tsx`.
- State: `addComment` in `src/context/AppContext.tsx`.
- Types: `Comment` in `src/types.ts`.
- Firestore: embedded `orders.comments`; realtime arrives through the orders listener. There is no standalone chat collection or chat service.
- Images: production comment image input is not uploaded; AppContext only permits a non-data URL in demo mode.
- NOT FOUND / NEEDS CONFIRMATION: no standalone realtime chat/message backend or production chat-attachment upload path exists in the audited code.
- Dependencies: order update Rules and `features.comments`.
- Change impact: embedded arrays increase order document size and require allowed-field updates in Rules.

## IMAGES / ATTACHMENTS

Purpose: validate/resize images, route remote operations through a provider-neutral manager, register logical images, store compact compatibility references, and clean up failed uploads.

- Business-facing service: `src/services/imageStorageService.ts` (**CORE**) selects no provider itself; it delegates runtime selection and R2 transfer to `src/services/runtimeImageTransport.ts`. `src/services/storageService.ts` is a compatibility re-export (**LEGACY**).
- Storage foundation: `src/storage/storageManager.ts`, `src/storage/types.ts`, `src/storage/objectKey.ts`, `src/storage/sha256.ts` (**CORE**).
- Provider adapter: `src/storage/providers/FirebaseStorageProvider.ts` (**INFRASTRUCTURE**) is the only upload/read/delete Firebase SDK adapter.
- Backend runtime: `functions/src/storage/storageRuntimeService.ts` owns singleton `storage_runtime/config`, tracked registry usage, MANUAL/AUTOMATIC selection, deterministic R2 ordering/failover-before-issue, and optional final Firebase fallback. `imageDirectUploadService.ts` remains the pinned R2 prepare/finalize authority.
- Developer admin UI: `src/components/StorageProviderManager.tsx`, `src/services/storageProviderAdminClient.ts`, and `src/storage/adminTypes.ts` manage strategy, manual selection, enable/disable, priority, soft limit, threshold, tracked usage, health, and sanitized R2 configuration through callable Functions only. Credential form values remain transient.
- Upload operations: backend-only `storage_upload_operations/{operationId}` pins the image ID, relationship, provider config snapshot, exact credential version, staging/final keys, validation expectations, expiry, status, and finalize lock. Browser Firestore access is denied.
- Registry: `src/repositories/imageRegistryRepository.ts` writes Firebase metadata-only `image_registry/{imageId}` records; the direct-upload backend is the only path that may create an R2 ACTIVE record. Rules are in `firestore.rules`.
- Local drafts: `src/repositories/localProductionDraftRepository.ts` stores Blobs and stable attachment filenames. Creating a draft does not upload the Blob; official send reuses that identity for retry-safe runtime upload.
- UI call sites: Production/Sales Order creation, Settings logo, and user avatar all call the same provider-neutral service. `src/components/ResolvedImage.tsx` centralizes legacy/Firebase/R2 rendering and in-memory read URL reuse.
- Types: provider/registry contracts in `src/storage/types.ts`; backward-compatible `StoredImageReference` in `src/types.ts` retains `storagePath` and `downloadUrl` while adding optional provider-neutral fields.
- Storage paths: `production-orders/...`, `sales-orders/...`, `avatars/...`, `settings/company-logo/...`.
- Rules: `storage.rules`; JPEG/PNG/WebP, <= 5 MiB, immutable create, role/path-specific delete.
- NOT FOUND / NEEDS CONFIRMATION: no production upload implementation for print-completion evidence or issue/comment attachments was located; their model fields exist but current production paths do not persist arbitrary image input.
- Dependencies: browser Storage Manager/Firebase adapter, backend R2 factory/Secret Manager/presigner, Image Registry/Firestore metadata, canonical identity, local preview lifecycle.
- Change impact: Storage and Firestore are not one transaction. A registered upload survives a failed business write so the same idempotency key can recover it; registered replacements are logically retired. Reference-aware orphan/physical cleanup remains deferred. Never persist Blob/Base64/object URLs or R2 signed URLs in Firestore.
- Runtime boundary: changing strategy affects new uploads only. Existing images remain pinned by Image Registry. Disabled R2 configs reject new work but can resolve historical reads and finalize already-issued operations through their pinned/current credential rules.

## DEVELOPER / SYSTEM CONFIGURATION

Purpose: company branding, production lists, workflow thresholds, modules, permissions, health checks, and safe role preview.

- UI: `src/components/SettingsModal.tsx`, `StorageProviderManager.tsx`, `DeveloperPermissionMatrix.tsx`, `DatabaseMetricsDashboard.tsx`, `DemoSandboxFloatingBar.tsx`.
- State: `src/context/ConfigContext.tsx`; defaults in `src/config/appConfig.ts`.
- Repository: `src/repositories/settingsRepository.ts`; Firestore `settings/app`.
- Feature graph: `src/services/featureService.ts`, `src/hooks/useFeatures.ts`.
- Permissions: `src/permissions/index.ts`; developer preview utility in `src/utils/developerDemoPreview.ts`.
- Health: `testFirebaseConnection` in `src/config/firebase.ts`, Firestore `_system_health/ping`.
- Storage configuration: the Developer-only “Lưu trữ ảnh” tab uses callable Functions for provider metadata/credentials plus runtime strategy, manual provider, explicit enable, threshold, soft limit and tracked usage. It never reads or writes `storage_provider_configs` or `storage_runtime` directly.
- Dependencies: nearly all UI visibility. Server/Rules do not trust preview or client matrices for workflow authority.
- Change impact: permission UI changes can diverge from server authority; document the distinction.

## PWA / OFFLINE

- `vite.config.ts` uses `vite-plugin-pwa` with auto-update and generated manifest.
- `public/manifest.json` and `public/sw.js` are static assets; the explicit service worker is pass-through with an `Offline` response, not an application data cache.
- `src/context/AppContext.tsx` tracks online/offline and cross-tab changes.
- True local-first behavior is limited to production drafts in IndexedDB and demo/local UI data. Official production workflow writes require server confirmation.

## IMAGE BACKUP / RESTORE / INTEGRITY

- Backend modules: `functions/src/storage/backup/`, `FirebaseAdminStorageProvider.ts`, and streaming methods on `R2Provider.ts`.
- Admin UI: `StorageBackupManager.tsx` inside the existing Developer-only Storage Manager; client calls are in `imageBackupAdminClient.ts`.
- Data: canonical `image_registry` remains unchanged; Developer-only configuration lives in `storage_backup_policies`; verified physical copies live in deterministic `image_replicas`; resumable work lives in `image_backup_jobs/{jobId}/items`.
- Backup: enabled policies can enqueue new canonical images automatically; explicit backfill discovers existing ACTIVE images in bounded pages. Item transfers and each discovery page use expiring leases with at most three attempts; destinations are create-only and matching existing bytes are idempotent success.
- Operations: server-side aggregate coverage, recent bounded failures, policy status and job progress are shown without frontend collection scans. Per-image manual tools remain under Advanced.
- Integrity: SHA-256 is computed from actual source bytes and a separate destination read. ETag is never accepted as SHA-256, and client-reported historical checksums are not relabeled server-verified.
- Restore: Developer-only, typed confirmation, VERIFIED replica only, canonical provider/key derived server-side, missing-only destination, no automatic overwrite or provider migration.
- Runtime boundary: replica bytes and status do not affect MANUAL/AUTOMATIC production upload selection, canonical tracked usage, normal reads, or Designer local-first drafts.
