# FIREBASE MAP

## Firebase project configuration

- Default project alias: `xuongin`; Hosting target `codex` -> site `indongduong` in `.firebaserc`.
- Browser config: `VITE_FIREBASE_*` values in `src/config/firebase.ts`; demo builds may use `flexo_custom_firebase_config_v1`.
- Region: callable Functions use `asia-southeast1`.
- Runtime: Functions Node 20; source `functions/`; entry `functions/src/index.ts`.
- Hosting: static `dist` with `** -> /index.html` rewrite.
- Emulators: Auth 9099, Functions 5001, Firestore 8080, Storage 9199.

## Authentication and canonical identity

Files: `src/context/AuthContext.tsx`, `src/config/firebase.ts`, `functions/src/workflows/workflowAuth.ts`, `functions/src/staffProvisioningService.ts`, `functions/src/bootstrapService.ts`, `firestore.rules`, `storage.rules`.

```text
Firebase Auth UID
  -> auth_identities/{uid}
     { businessUserId, role, active }
  -> users/{businessUserId}
```

Frontend display role comes from the identity mapping. Functions additionally require `users/{businessUserId}.role` to match and the profile to be active. Rules never authorize from `users.role` alone.

## Firestore collections

| Collection/path | Main document | Writers | Readers / consumers |
|---|---|---|---|
| `auth_identities` | UID -> business identity | Admin SDK provisioning/bootstrap only | own mapping in client; Rules/Storage/Functions authority |
| `users` | `User` business profile | Admin SDK privileged lifecycle; self limited profile update | authenticated clients, assignments, workflow actor lookup |
| `orders` | `ProductionOrder` | limited browser creation/update plus workflow Functions | production UI/realtime, fulfillment |
| `production_draft_backups` | recovery `ProductionOrder` draft | owning Designer/management rules | `ProductionContext` recovery |
| `sales_orders` | `SalesOrder` | browser draft description; lifecycle Functions | Sales UI, Designer, fulfillment/logistics |
| `sales_order_items` | `SalesOrderItem` Product | browser draft description; lifecycle Functions | Designer, finishing, warehouse, parent derivation |
| `finishing_tasks` | `FinishingTask` | Functions only | Finishing queue/realtime |
| `finished_goods` | `FinishedGood` | Functions only | finished-goods and warehouse UI |
| `workflow_issues` | `WorkflowIssue` | Functions only | Finishing/Warehouse issue UI/realtime |
| `warehouse_dispatches` | `WarehouseDispatch` | Functions only | warehouse/shipping UI |
| `warehouse_dispatch_items` | dispatch line | Functions only | warehouse/shipping Functions and UI detail |
| `shipments` | `Shipment` | Functions only | shipping UI and Sales Order derivation |
| `customers` | `Customer` | Sale/management browser operations | customer/Sales UI |
| `customer_import_jobs` | `CustomerImportJob` | Sale/management import | customer import/audit UI |
| `saved_designs` | `SavedDesign` | Designer/Sale browser operations | design library/realtime |
| `image_registry` | provider-neutral logical image metadata | Firebase browser manager or R2 finalize/retire callables | authenticated metadata reads; runtime usage/read resolver |
| `storage_provider_configs` | non-secret backend provider configuration + exact Secret Manager version reference | Developer-authorized callable Functions/Admin SDK only | callable backend only; direct client access denied |
| `storage_runtime/config` | singleton strategy, manual provider, threshold and Firebase fallback | Developer-authorized callable Functions/Admin SDK only | callable backend only; direct client access denied |
| `storage_upload_operations` | pinned R2 upload identity/provider/credential/key/expiry state | image upload callables/Admin SDK only | callable backend only; direct client access denied |
| `storage_backup_policies` | source/target backup policy, auto-new-image flag and operational timestamps | Developer-authorized callable Functions/Admin SDK only | callable backend and Firestore triggers; direct client access denied |
| `image_replicas` | deterministic verified disaster-recovery copies | Developer backup/verify callables/Admin SDK only | callable backend only; direct client access denied |
| `image_backup_jobs/{jobId}/items` | manual/auto/backfill work, discovery cursor, exact progress, retries and leases | Developer backup callables and background Functions/Admin SDK only | callable/trigger backend only; direct client access denied |
| `settings/app` | `AppConfig` | Admin/Developer per Rules | all authenticated clients via `ConfigContext` |
| `settings/system_bootstrap` | bootstrap marker | Admin SDK bootstrap | bootstrap callable |
| `notifications` | notification document | active clients and Functions | no frontend Firestore reader was found; browser notification state is localStorage |
| `audit_logs` | workflow/provision audit | Functions; constrained client audit repository | management queries |
| `counters/*` | sequence counters | Designer/Sale browser and Admin SDK | order/customer/staff ID allocation |
| `_system_health/ping` | diagnostic | Admin/Developer only | Firebase connection test |

No undocumented collection is inferred beyond literal code references.

## Cloud Functions

All exports are in `functions/src/index.ts`; current browser callers include `src/services/workflowCallableService.ts`, `staffProvisioningService.ts`, `bootstrapService.ts`, and the focused `storageProviderAdminClient.ts` for Developer storage configuration.

### Identity / provisioning

| Function | Implementation | Purpose / caller |
|---|---|---|
| `provisionStaffUser` | `staffProvisioningService.ts` | create/link Auth + business identity; Production user UI |
| `getStaffProvisioningStatus` | same | list provisioned staff state; user UI |
| `setStaffActive` | same | activate/deactivate staff |
| `changeStaffRole` | same | synchronized role change |
| `resetStaffPassword` | same | reset Firebase Auth password |
| `getBootstrapStatus` | `bootstrapService.ts` | decide whether first setup is needed; `BootstrapGate` |
| `bootstrapFirstDeveloper` | same | secret-protected first developer creation |

### Production

| Function | Implementation | Purpose |
|---|---|---|
| `reportBrokenPlate` | `productionWorkflow.ts` | create plate issue/notifications |
| `reviseProductionOrder` | same | technical revision or printer reassignment |
| `reportProductionIssue` | same | embedded production issue |
| `reissuePlate` | same | damaged plate -> SENT |
| `sendPlate` | same | NOT_SENT -> SENT |
| `receivePlate` | same | SENT -> RECEIVED |
| `resolveProductionIssue` | same | recipient resolution |
| `cancelProductionIssue` | same | reporter cancellation |
| `handoffToFinishing` | same | legacy order-level finishing assignment |
| `startFinishing` | same | legacy order-level finishing start |

### Fulfillment / Products

| Function | Implementation | Purpose |
|---|---|---|
| `completeFinishing` | `fulfillmentWorkflow.ts` | legacy order-level finishing completion/output |
| `confirmFinishedGoodQuantity` | same | accept produced quantity |
| `confirmSalesOrder` | same | route Products into production/direct finishing/direct warehouse |
| `linkProductionOrder` | same | M:N/late Product traceability link |
| `requestProductionCancellation` | same | request pre-print cancellation |
| `respondProductionCancellation` | same | assigned Printer decision/reconciliation |
| `completeProductionPrint` | same | PRINTING -> PRINTED and Product finishing fan-out |
| `claimFinishingTask` | same | READY -> CLAIMED |
| `completeFinishingTask` | same | checkpoint -> finished good/Product readiness |
| `requestFinishingCancellation` | same | cancel/request checkpoint cancellation |
| `respondFinishingCancellation` | same | claiming Finisher decision |
| `setFinishingTaskUrgent` | same | Product finishing urgency metadata |
| `reportWorkflowIssue` | same | Finishing/Warehouse Product issue |
| `resolveWorkflowIssue` | same | recipient resolves downstream issue |
| `cancelWorkflowIssue` | same | reporter cancels downstream issue |
| `cancelSalesOrder` | same | transactional Sales/Product cancellation |
| `forceReopenSalesOrder` | same | Developer/Admin recovery |

### Logistics

| Function | Implementation | Purpose |
|---|---|---|
| `createWarehouseDispatch` | `logisticsWorkflow.ts` | order-aware/anti-partial DRAFT dispatch |
| `confirmWarehouseDispatch` | same | decrement stock, mark DISPATCHED |
| `reverseWarehouseDispatch` | same | restore stock, cancel dispatch |
| `createShipment` | same | shipment from DISPATCHED dispatch |
| `transitionShipment` | same | legal shipment status transition |
| `inspectReturnedShipment` | same | return disposition and inventory update |

### Storage provider administration

Backend implementation: `functions/src/storage/storageProviderAdminService.ts`; all operations require a canonical active `DEVELOPER` identity and matching active business-user profile. Frontend: the Developer-only tab in `SettingsModal.tsx` renders `StorageProviderManager.tsx`, which uses `storageProviderAdminClient.ts`; production role-preview and Demo mode do not expose the tab.

| Function | Purpose |
|---|---|
| `createStorageProviderConfig` | create non-secret R2 config with stable `providerConfigId` |
| `updateStorageProviderConfig` | update validated non-secret metadata |
| `setStorageProviderCredentials` | add a versioned Secret Manager credential payload and store only its reference |
| `getStorageProviderConfig` | return one sanitized config |
| `listStorageProviderConfigs` | return sanitized configs ordered by priority/ID |
| `disableStorageProviderConfig` | disable a config without deleting audit/config history |
| `enableStorageProviderConfig` | enable only a credentialed provider with persisted HEALTHY status |
| `testStorageProviderConnection` | backend R2 bucket + temporary object write/head/delete probe |
| `getStorageRuntimeConfig` | return sanitized singleton runtime strategy |
| `updateStorageRuntimeConfig` | set MANUAL/AUTOMATIC, threshold, or Firebase fallback |
| `setManualActiveStorageProvider` | validate and store the provider used by MANUAL |
| `listStorageProviderRuntimeStatus` | return tracked registry usage and routing eligibility |

`storage_provider_configs` and `storage_runtime` have no direct client read/write Rules. Callable responses omit `credentialSecretRef`, access key ID, secret access key, and secret payload.

The UI supports multiple independent R2 configs, explicit enable/disable, runtime strategy/manual selection, deterministic priority, Developer-defined soft limit, global automatic threshold, tracked usage and eligibility. New configs are created disabled. Credentials remain transient, masked, never prefilled/persisted, and are cleared after a successful callable response.

Credential replacement keeps older exact Secret Manager versions available because live upload operations pin a version. A future retention worker may destroy an old version only after no unexpired/recoverable operation references it; rollback may still destroy a newly created version that was never committed to a config.

Operational prerequisites (not performed by source code): enable `secretmanager.googleapis.com`; grant the deployed Functions runtime service account `roles/secretmanager.admin`, or a custom role containing `secretmanager.secrets.create`, `secretmanager.secrets.get`, `secretmanager.versions.add`, `secretmanager.versions.access`, and `secretmanager.versions.destroy`. Local backend execution requires Application Default Credentials with equivalent access. R2 credentials must be bucket-scoped for Object Read & Write so the connection probe can write, head/list-access the bucket, and delete its temporary object.

### Runtime image upload and read

Implementation: `functions/src/storage/imageDirectUploadService.ts`, `imageUploadPolicy.ts`, `uploadOperationRepository.ts`, provider factory, and `R2Provider`.

| Function | Purpose | Authorization |
|---|---|---|
| `prepareImageUpload` | Validate logical relationship/type/size; select runtime transport; return stable Firebase identity or create/recover a pinned R2 operation and 10-minute staging PUT | canonical active identity plus current role/ownership policy for Production item, Sales item, avatar, or company logo |
| `finalizeImageUpload` | Claim a two-minute finalize lock, HEAD and validate the staging object, conditionally copy it to the immutable final key, create one ACTIVE registry record transactionally, and finalize the operation | operation owner re-resolved through canonical identity plus the same current relationship policy |
| `resolveImageReadUrl` | Validate ACTIVE registry relationship and return a five-minute R2 GET URL; Firebase returns its provider locator | canonical active role in the current Storage read-role set; existing WAREHOUSE omission retained |
| `retireImage` | mark a registered image DELETED without unsafe physical deletion | current relationship upload/manage policy |

`storage_upload_operations/{operationId}` is callable/Admin-SDK only. Its deterministic ID is SHA-256 of canonical `businessUserId` plus caller idempotency key; reuse with different logical metadata is rejected. It stores both staging and final keys, provider snapshot and exact credential version, relationship, expected type/size/client checksum, 30-minute expiry, timestamps, safe failure code, and `PENDING | FINALIZING | FAILED | EXPIRED | FINALIZED`. Duplicate finalize calls cannot create a second registry document.

## Firestore Rules

File: `firestore.rules`.

Important helpers:

- `hasActiveIdentity()` — requires signed-in UID with active canonical mapping and known role.
- `businessUserId()` / `identityRole()` — canonical business identity values.
- `isAdmin`, `isManager`, `isDesigner`, `isPrinter`, `isSale` — role sets.
- `isValidId`, `isValidUser`, `isValidOrder` — schema guards.
- `isAssignedPrinter` — assignment uses business user ID.
- `isAllowedPrinterStatusTransition`, `printerAcknowledgedLatestRevision`, `printerStartIsSafe` — direct Printer transition boundary.

Rules allow descriptive draft writes where documented but deny direct lifecycle mutation for downstream Workflow V2 collections. Admin SDK Functions are the only writers for finished goods, finishing tasks, workflow issues, dispatches/items, and shipments.
`storage_provider_configs`, `storage_runtime`, and `storage_upload_operations` are explicitly denied to all browser reads/writes; their APIs are callable-only.

## Image Registry and Storage

Files: `src/services/imageStorageService.ts`, `src/storage/`, `src/repositories/imageRegistryRepository.ts`, `src/config/firebase.ts`, `firestore.rules`, `storage.rules`.

- `image_registry/{imageId}` contains metadata only: provider type/config ID, object key, original filename, content type, size, optional SHA-256 plus truthful checksum status, timestamps, creator, status, and one of the four current entity relationships.
- Registry create/delete-tombstone authorization mirrors the matching Storage namespaces. Records cannot be hard-deleted by browser clients.
- `storage_runtime/config` is the system singleton. Missing-document compatibility defaults to `MANUAL`, `firebase-primary`, threshold 90%, Firebase fallback enabled; only a Developer callable writes it.
- MANUAL uses `activeProviderConfigId`. AUTOMATIC considers R2 configs that are enabled, credentialed, HEALTHY and below their configured tracked-usage threshold, ordered by lower numeric priority then stable ID. Firebase is an optional final fallback. Provider failure before operation creation may advance; a created R2 operation never switches.

| Path | Upload/delete roles | Call sites |
|---|---|---|
| `production-orders/{orderId}/items/{itemId}/{imageName}` | Developer/Admin/Manager/Designer/Sale | Production draft/send/create in AppContext |
| `sales-orders/{salesOrderId}/items/{itemId}/images/{imageName}` | Developer/Admin/Manager/Sale | Create/edit Sales Order |
| `avatars/{userId}/{imageName}` | self or Developer/Admin | profile/user UI |
| `settings/company-logo/{imageName}` | Developer/Admin | Settings |

- Read: any role accepted by Storage `hasActiveIdentity`.
- Firebase SDK calls exist only in `FirebaseStorageProvider`; R2 browser PUT exists only in `runtimeImageTransport`. Business call sites enter through `imageStorageService`.
- Constraint: new immutable JPEG/PNG/WebP objects, <= 5 MiB; filename is the stable `imageId` plus content extension.
- Metadata: Image Registry and `StoredImageReference` are stored in Firestore; bytes remain at their original provider. Legacy `storagePath`/`downloadUrl` fields remain readable. New R2 references persist no signed URL and require no old-image migration.
- R2 finalization verifies the pinned key, object existence, exact byte size, content type, controlled metadata, and source ETag before immutable publish. R2 read URLs expire after five minutes and the frontend caches them only in memory until one minute before expiry. Disabling blocks new uploads but not historical reads or safe pinned finalization. Signed URLs are never persisted.
- R2 browser PUT requires bucket CORS configured outside this repository: allow only `https://example-workshop.web.app`, `https://indongduong.firebaseapp.com`, and each explicitly approved production custom origin; method `PUT`; request headers `content-type`, `x-amz-meta-operation-id`, `x-amz-meta-image-id`, `x-amz-meta-expected-size`, and `x-amz-meta-client-sha256`; expose `etag`; `MaxAgeSeconds: 600`. Do not use `*` origins or broad methods/headers. Omit the optional checksum metadata header when authorization does not return it.
- Gap: Storage Rules' active-role list omits `WAREHOUSE`, while Firestore canonical identity accepts it. Therefore a Warehouse account cannot read even otherwise-readable Storage images under current rules. This is documented only, not changed.

## Indexes and realtime

- Index file: `firestore.indexes.json` covers customers, Sales Orders, production orders, dispatches, shipments, audit logs, backup discovery/coverage, and the bounded failed-item dashboard.
- Realtime direct listeners are implemented in repositories using `onSnapshot` for core active lists/config.
- Workflow entrypoints remain callable. Storage backup additionally exports scoped Firestore triggers for canonical enqueue/retirement, backup item processing and paginated backfill continuation.

## Image backup, restore and integrity (15F / 15F.2)

- `image_replicas/{replicaId}` stores one deterministic replica identity per `imageId + providerConfigId`, actual-byte SHA-256, size, provider locator and verification state. It never replaces or expands the canonical `image_registry` locator.
- `storage_backup_policies/{policyId}` stores multiple Developer-managed source/target policies and the auto-new-image flag; it contains no credentials. Browser Rules deny direct access.
- `image_backup_jobs/{jobId}` plus `items/{imageId}` stores resumable manual, auto and backfill work, exact counters, paginated discovery state, attempt counts and expiring leases. Callable and background Functions use Admin SDK.
- `functions/src/storage/backup/` resolves canonical source metadata server-side, streams bytes between provider adapters, hashes source and destination bytes, and marks a replica `VERIFIED` only after size and SHA-256 match.
- Canonical-create automation is failure-isolated from upload finalization. Explicit backfill pages through ACTIVE registry records and deterministic workers reuse the same transfer engine; Functions have bounded instances/concurrency and no warm minimum.
- Coverage and recent failures are aggregated/query-bounded on the server; the frontend does not scan protected collections.
- Required backup indexes are query-specific: `image_registry(providerConfigId, status, __name__)` supports source-filtered paginated backfill (and its ACTIVE coverage denominator); `image_replicas(sourceProviderConfigId, providerConfigId, canonicalStatus, status)` supports policy coverage counts; collection-group `items(status, updatedAt desc)` supports the bounded recent-failure dashboard.
- Restore is explicit and missing-only: it writes to the canonical provider/object key from `image_registry`, never overwrites an existing object and never changes the canonical provider. Backup replica bytes are not included in canonical tracked-usage routing.
- Backend adapters support R2 and the Admin SDK default Firebase bucket. Disabled R2 providers reject new backups but remain resolvable as historical replica sources. No Secret Manager payload, signed URL or credential enters job/replica documents.
