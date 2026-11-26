# DATA FLOW MAP

## Auth flow

```text
LoginModal
  -> AuthContext.signInWithFirebase
  -> Firebase Auth UID
  -> auth_identities/{uid}
  -> businessUserId + authoritative role + active
  -> users/{businessUserId}
  -> resolved User / provider startup
```

Files: `src/components/LoginModal.tsx`, `src/context/AuthContext.tsx`, `src/config/firebase.ts`, `src/App.tsx`, `firestore.rules`. Callable workflows repeat the same resolution in `functions/src/workflows/workflowAuth.ts`; provisioning is in `functions/src/staffProvisioningService.ts`.

## Designer draft flow

```text
QuickOrderComposer / CreateOrderModal
  -> parseQuickOrderText
  -> optional findUniquePrinterMatch
  -> AppContext.createOrder(isDraft=true)
  -> immediate in-memory render
  -> IndexedDB flexo-workflow-v2 / production-drafts (authoritative local copy)
  -> metadata-only production_draft_backups/{draftId}; image Blob stays local
  -> ProductionContext merges local drafts + recovery backups + official orders
```

Files: `src/components/QuickOrderComposer.tsx`, `src/components/CreateOrderModal.tsx`, `src/utils/textParser.ts`, `src/utils/printerMatching.ts`, `src/context/AppContext.tsx`, `src/repositories/localProductionDraftRepository.ts`, `src/repositories/productionOrderRepository.ts`, `src/context/ProductionContext.tsx`, `src/services/imageStorageService.ts`.

Local draft wins when both local and backup exist. Backup is disaster recovery and is fire-and-forget; failures are recorded in `draftSync`.
Saving the IndexedDB draft does not wait for Storage or Image Registry. The stored draft image includes its Blob and optional original filename.

## Production Order send flow

```text
local draft
  -> validate assigned active PRINTER
  -> upload missing local image Blobs through provider-neutral imageStorageService
  -> backend runtime selects Firebase or an eligible R2 config
  -> provider object + image_registry/{imageId}
  -> allocate official LIN-* code
  -> build WAITING_ACCEPTANCE order, revision >= 1, ACK = 0
  -> productionOrderRepository.createOfficialFromDraft transaction
  -> orders/{orderId}
  -> remove IndexedDB draft
  -> delete production_draft_backups/{draftId}
  -> optional linkProductionOrder callable for Product traceability
```

Files: `src/context/AppContext.tsx` (`sendLocalDraft`, dispatch methods), `src/repositories/productionOrderRepository.ts`, `src/services/imageStorageService.ts`, `src/services/workflowCallableService.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`.

The IndexedDB Blob and draft remain on upload/send failure. The persisted local filename supplies a stable idempotency identity across retries. A successfully registered image is retained for that retry instead of being retired into an unrecoverable identity; future reference-aware orphan cleanup is deferred.

## Printer flow

```text
orders/{id} WAITING_ACCEPTANCE assigned by business user ID
  -> assigned printer accepts (ACCEPTED or WAITING_PRINT)
  -> plate receive when applicable (SENT -> RECEIVED)
  -> acknowledge productionRevision
  -> start print (ACCEPTED/WAITING_PRINT -> PRINTING)
  -> completeProductionPrint callable
  -> PRINTED
  -> one finishing_tasks checkpoint per linked Product
```

Files: `src/components/OrderCard.tsx`, `src/components/OrderDetailModal.tsx`, `src/components/PrintCompletionModal.tsx`, `src/context/AppContext.tsx`, `src/repositories/productionOrderRepository.ts`, `src/services/workflowCallableService.ts`, `functions/src/workflows/productionWorkflow.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`, `firestore.rules`.

Start is blocked by a pending cancellation and by a stale revision ACK. Current code does not block on open issues or plate status; plate/issues are parallel records.

## Revision flow

```text
authorized technical edit or printer reassignment
  -> reviseProductionOrder callable
  -> validate pre-print status
  -> instruction change: productionRevision + 1
  -> reassignment: printerId changes, ACK = 0, status = WAITING_ACCEPTANCE
  -> assigned printer ACKs latest revision through allowed direct order transaction
  -> Firestore Rules allow PRINTING only when ACK >= revision
```

Files: `src/components/OrderDetailModal.tsx`, `src/context/AppContext.tsx`, `src/services/workflowCallableService.ts`, `functions/src/workflows/productionWorkflow.ts`, `firestore.rules`.

## Finishing flow

```text
linked Product + completed print
  -> completeProductionPrint
  -> finishing_tasks/ft_{productionOrderId}_{productionItemId} READY
  -> requiresFinishing=true: FINISHER claim -> CLAIMED -> complete
  -> requiresFinishing=false: explicit confirmation directly from READY
  -> finished_goods/fg_finish_{taskId} READY
  -> Sales Product WAREHOUSE_READY when accepted goods meet quantity
  -> parent Sales Order derived
```

Files: `src/components/FinishingTasksManagement.tsx`, `src/repositories/finishingTaskRepository.ts`, `src/services/workflowCallableService.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`.

A legacy order-centric path also remains: `handoffToFinishing` -> `startFinishing` -> `completeFinishing` on embedded `orders.finishing`.

## Product without production flow

```text
confirm Sales Order
  -> requiresProduction=false, requiresFinishing=true
     -> direct finishing_tasks/ft_direct_{productId}
  -> requiresProduction=false, requiresFinishing=false
     -> direct finished_goods/fg_direct_{productId}
     -> Product WAREHOUSE_READY
```

Files: `src/services/salesOrderService.ts`, `src/services/workflowCallableService.ts`, `functions/src/workflows/fulfillmentWorkflow.ts` (`confirmSalesOrder`).

## Warehouse flow

```text
finished_goods grouped by Sales Order
  -> createWarehouseDispatch callable
  -> verify every active Product is warehouse-ready and fully accepted
  -> verify requested goods belong to same Sales Order and stock is sufficient
  -> warehouse_dispatches DRAFT + warehouse_dispatch_items
  -> confirmWarehouseDispatch transaction
  -> decrement remainingQuantity / increment dispatchedQuantity
  -> dispatch DISPATCHED
  -> optional shipment
```

Files: `src/components/FinishedGoodsManagement.tsx`, `CreateDispatchModal.tsx`, `WarehouseDispatchManagement.tsx`, `src/services/warehouseDispatchService.ts`, related repositories, `functions/src/workflows/logisticsWorkflow.ts`.

The all-Product readiness test is the anti-partial-export gate. `WAREHOUSE` is the dispatch authority in current Functions code.

## Shipment / return flow

```text
DISPATCHED warehouse dispatch
  -> SALE/management createShipment
  -> shipments CREATED
  -> legal shipment transitions
  -> DELIVERED => Sales Order derivation toward COMPLETED
  -> RETURNED => WAITING_INSPECTION
  -> inspectReturnedShipment
  -> RESTOCKED / SCRAPPED / CUSTOMER_HOLD
  -> inventory + Sales Order status re-derived
```

Files: `src/components/CreateShipmentModal.tsx`, `src/components/ShippingManagement.tsx`, `src/services/shippingService.ts`, `src/repositories/shipmentRepository.ts`, `functions/src/workflows/logisticsWorkflow.ts`, `functions/src/workflows/fulfillmentWorkflow.ts` (`deriveSalesOrder`).

## Image flow

```text
File/Blob or selected remote sample
  -> imageStorageService.prepareImage (decode, resize <= 1920, validate <= 5 MiB)
  -> local object URL for preview
  -> draft Blob in IndexedDB OR imageStorageService runtime upload
  -> prepareImageUpload validates relationship and reads storage_runtime/config
  -> MANUAL: selected eligible provider
     AUTOMATIC: eligible R2 by priority ASC, providerConfigId ASC; Firebase final fallback if enabled
  -> firebase-primary: FirebaseStorageProvider.upload + browser registry create
     R2: short-lived PUT -> finalizeImageUpload -> backend registry create
  -> StoredImageReference (imageId/providerConfigId/objectKey; legacy URL only when durable)
  -> ResolvedImage/imageStorageService.resolveImageUrl
     legacy/Firebase URL OR authorized short-lived R2 URL cached in memory
  -> replacement/delete: backend logical registry retirement for registered images
```

Files: `src/services/imageStorageService.ts`, `src/services/runtimeImageTransport.ts`, `src/components/ResolvedImage.tsx`, `src/storage/`, `src/repositories/imageRegistryRepository.ts`, `src/repositories/localProductionDraftRepository.ts`, `functions/src/storage/`, production/Sales Order creation components, profile/settings components, `src/types.ts`, `storage.rules`, `firestore.rules`.

Namespaces: production order items, Sales Order item images, avatars, company logo. No current production upload flow exists for print-completion evidence or chat attachments.
Firebase registry-write failure still attempts targeted deletion of that just-uploaded object. Registered replacement cleanup is logical retirement because the current model does not prove the binary has no other references; physical orphan cleanup is deferred.

R2 runtime transport:

```text
authenticated browser + logical image relationship + idempotency key
  -> prepareImageUpload callable
  -> canonical UID -> auth identity -> active business user/role authorization
  -> deterministic storage_upload_operations ID + backend imageId/keys
  -> before operation issue, AUTOMATIC may try the next deterministic eligible R2
  -> pin one providerConfigId, bucket/endpoint, and exact secret version
  -> 10-minute presigned PUT for system/uploads/{operationId}/... staging key
  -> browser PUTs binary directly to R2 with returned headers
  -> finalizeImageUpload(operationId)
  -> operation-owner authorization + transactional finalize lock
  -> HEAD: existence + size + content type + controlled metadata
  -> ETag-conditional server-side copy to provider-independent immutable final key
  -> HEAD final object
  -> transaction: create image_registry/{imageId} ACTIVE + operation FINALIZED
  -> best-effort staging delete
```

The 30-minute operation retains staging/final keys, provider pin, relationship, status, timestamps, and safe failures. Once created it never fails over. A retry with the same caller/idempotency key recovers the same image/operation; changed metadata is rejected. Concurrent finalizers produce at most one ACTIVE registry record. Browser SHA-256 remains `CLIENT_REPORTED` because R2 composite checksum semantics are not treated as raw full-object verification.

## Developer R2 provider configuration flow

```text
SettingsModal -> Lưu trữ ảnh (verified production DEVELOPER only)
  -> StorageProviderManager
  -> storageProviderAdminClient
  -> provider create/update/setCredentials/get/list/enable/disable/test callables
  -> runtime get/update/set-manual-active/status callables
  -> requireWorkflowActor(DEVELOPER)
  -> storage_provider_configs/{providerConfigId} (non-secret metadata + optional softLimitBytes)
  -> storage_runtime/config (MANUAL/AUTOMATIC, manual provider, threshold, Firebase fallback)
  -> credentialSecretRef (exact Secret Manager version)
  -> Google Secret Manager (accessKeyId + secretAccessKey JSON)
  -> BackendStorageProviderFactory
  -> R2Provider (AWS SDK v3, region auto, validated Cloudflare endpoint)
  -> HeadBucket + controlled put/head/delete connection test
```

Files: `functions/src/index.ts`, `functions/src/storage/`, `functions/src/workflows/workflowAuth.ts`, `firestore.rules`.

Frontend files: `src/components/SettingsModal.tsx`, `src/components/StorageProviderManager.tsx`, `src/services/storageProviderAdminClient.ts`, `src/storage/adminTypes.ts`. Provider/runtime metadata is never accessed through the Firestore browser SDK. Create remains disabled-first and credential submission is transient. Enable requires configured credentials plus persisted `HEALTHY`; disable is non-destructive and cannot disable the current MANUAL provider.

Credential replacement adds a new secret version and atomically changes the reference. Older exact versions remain available for pinned operations; historical reads use current credentials. Tracked app usage is the sum of ACTIVE registry sizes per provider, not Cloudflare quota. A configured soft limit and threshold affect AUTOMATIC routing only and may overshoot under concurrency.

## Chat flow

```text
OrderCard / OrderDetailModal text
  -> AppContext.addComment
  -> append Comment to orders/{id}.comments
  -> acknowledged Firestore write
  -> orders realtime listener
  -> render embedded discussion
```

Files: `src/components/OrderCard.tsx`, `src/components/OrderDetailModal.tsx`, `src/context/AppContext.tsx`, `src/repositories/productionOrderRepository.ts`, `firestore.rules`.

There is no independent conversation/message collection.

## Issue flow

Production issue:

```text
IssueReportModal / plate quick action
  -> reportProductionIssue or reportBrokenPlate callable
  -> issue policy + recipient validation
  -> embedded orders.issues[] + timeline (+ notifications for broken plate)
  -> recipient resolves OR reporter cancels
```

Product-stage issue:

```text
Finishing/Warehouse Product UI
  -> reportWorkflowIssue callable
  -> workflow_issues document keyed to SALES_ORDER_ITEM + stage
  -> realtime WorkflowIssuesPanel
  -> authorized recipient resolves OR reporter cancels
```

Files: issue UI components; `src/repositories/workflowIssueRepository.ts`; `functions/src/workflows/productionWorkflow.ts`, `fulfillmentWorkflow.ts`, `issuePolicy.ts`.

## Cancellation flow

Production:

```text
Sales/Designer/management request before print
  -> orders.cancellationRequest PENDING
  -> assigned Printer accepts/rejects
  -> accepted: order CANCELLED + only this run's Product links reconciled
  -> affected Sales Orders re-derived
```

Finishing:

```text
request on READY -> direct CANCELLED checkpoint
request on CLAIMED -> PENDING -> claiming Finisher accepts/rejects
accepted cancellation -> finished good created for bypassed work + Product WAREHOUSE_READY
```

Sales Order:

```text
cancelSalesOrder callable
  -> reject if downstream production/readiness is too advanced
  -> transactionally mark parent + Products CANCELLED
```

Files: `src/context/AppContext.tsx`, `src/components/FinishingTasksManagement.tsx`, `src/services/workflowCallableService.ts`, `functions/src/workflows/fulfillmentWorkflow.ts`.

## Realtime and offline flow

- `ProductionContext` subscribes to active `orders`, then merges current IndexedDB drafts.
- `ConfigContext` subscribes to `settings/app`; `SavedDesignContext` to `saved_designs`; `AuthContext` to `users` after identity resolution.
- Feature pages subscribe to Sales Orders, finishing tasks, finished goods, and workflow issues through repositories.
- `BroadcastChannel('flexo_sync_channel')` signals cross-tab order refresh.
- Production direct writes go through `src/utils/firestoreSafeWrite.ts`; offline is an error, not success.
- Notifications in `NotificationContext` are browser-local; server broken-plate notifications also write `notifications`, but no frontend Firestore notification repository/listener was found.

## Image backup / restore flow

```text
Developer Storage Manager
  -> createImageBackupJob(imageId, targetProviderConfigId)
  -> backend resolves image_registry canonical provider/object key
  -> image_backup_jobs/{jobId}/items/{imageId}
  -> runImageBackupJobStep claims one item with an expiring lease
  -> stream source bytes -> create-only destination write while hashing SHA-256
  -> read destination bytes again -> size + SHA-256 verification
  -> deterministic image_replicas/{hash(imageId + targetProviderConfigId)} VERIFIED

verifyCanonicalImage / verifyImageReplica
  -> backend stream read only -> actual size + SHA-256 result

restoreImageFromReplica + typed confirmation
  -> verify replica again -> require canonical object missing
  -> stream to canonical provider/object key -> verify destination
  -> image_registry remains unchanged
```

Backup is not migration, and restore is not a provider switch. Normal 15E upload selection and read resolution continue to use only the canonical Image Registry record.

### Automatic policy and backfill flow

```text
Developer Storage Manager
  -> create/update/enable storage_backup_policies/{policyId}
  -> optional explicit backfill request
  -> backend discovers ACTIVE image_registry records in pages of 25
  -> deterministic job items trigger bounded background workers
  -> the same lease/stream/hash/verify engine writes image_replicas

new finalized image_registry record
  -> Firestore trigger finds enabled matching auto policies
  -> deterministic auto job + item (idempotent per policy/image)
  -> background worker performs backup independently of upload response
```

Coverage uses server-side Firestore aggregate counts; the browser does not scan Image Registry or replica collections. Disabling a policy prevents new work and cancels/reconciles its queued work without deleting canonical or replica objects.
