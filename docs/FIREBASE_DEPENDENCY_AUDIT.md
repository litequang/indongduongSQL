# Firebase dependency audit â€” source b1cefcdd

Audit date: 2026-11-26. Static source audit only; no production account, database, bucket, Secret Manager or hosting contacted. Sanitized source snapshot provenance: SOURCE_PROVENANCE.md.

## Identity and accounts

`src/config/firebase.ts` creates Auth, Firestore and Storage clients from VITE variables, with explicit emulator paths. `AuthContext` observes Auth, signs in by email/password, then resolves `auth_identities/{uid}` to a business ID and `users/{id}`. Eight roles are cross-checked in `functions/src/workflows/workflowAuth.ts`. Staff provisioning uses Admin Auth plus identity/profile writes; Developer can manage all roles; Admin can manage Manager/Designer/Sale/Printer/Finisher/Warehouse, never Admin/Developer. Browser profile writes are restricted by Rules. SQL replaces both identity layers with a stable UUID business user and DB session; Firebase identities/passwords are not transferred.

## Persistence inventory

| Area | Source collections / subcollections | Boundary and SQL disposition |
|---|---|---|
| Core | users, auth_identities, settings/app, audit_logs, counters, _system_health, system bootstrap state | Users/settings/audit/system migrated in 01; counters become transactional SQL sequences |
| Commercial | customers, customer_import_jobs, sales_orders, sales_order_items | 02A normalized tables; draft descriptive writes separate from server lifecycle |
| Design/production | saved_designs, orders, production_draft_backups | 02A/B; embedded items/images/comments/issues/status timeline split into relational children |
| Fulfillment | finishing_tasks, finished_goods, workflow_issues | 02C; product-centric checkpoint and accepted quantities |
| Logistics | warehouse_dispatches, warehouse_dispatch_items, shipments | 02C; shipment items normalized; anti-partial order readiness |
| Communication | notifications | 03; current source per-user onSnapshot + read state |
| Images | image_registry, storage_provider_configs, storage_upload_operations, storage_runtime/config | 03; private R2 only, env credentials, registry SQL |
| Backup | storage_backup_policies, image_backup_jobs/{jobId}/items/{itemId}, image_replicas | 03; bounded resumable jobs, SHA-256 verification, missing-only restore |

See FIREBASE_REFERENCE_INVENTORY.md for file-level SDK calls, exported callables/triggers, and every composite index from the audited snapshot. Raw rules and functions remain isolated reference material under `legacy/firebase` after Phase 01.

## Queries, listeners, transactions

Repository listeners cover users/settings, production orders, saved designs, customers, sales orders/items, finishing tasks, finished goods, dispatches/items, shipments, issues and notifications. Filters combine status, assignee/creator, customer, active/deleted flags, order IDs and timestamps. `firestore.indexes.json` contains 13 composite indexes across customers, sales_orders, orders, warehouse_dispatches, shipments, audit_logs, image_registry, image_replicas and backup collection-group items. Preserve required filters in bounded SQL indexes; timestamps alone cannot be a reliable incremental cursor.

Firestore transactions implement counters, production ACK/start, links, confirmation, cancellation, finishing fan-out, goods stock, dispatch and shipment progression. Admin callables authorize actor and object; some printer acceptance/start writes are direct browser transactions guarded by Rules. SQL must move every lifecycle write behind API transactions. M:N links in current code are traceability; new history records allocatedProductQuantity=0. Never infer product allocation from sheets or silently treat this as a numeric allocation implementation.

## Server exports and asynchronous work

`functions/src/index.ts` exposes bootstrap/status, staff lifecycle, production/plate/issues/revision/cancellation, product finishing, dispatch, shipment, image prepare/finalize/read/delete, runtime-provider configuration, backup policy/coverage/backfill/verify/restore callables. onDocumentCreated/Updated/Written triggers enqueue canonical-image backups, retire replicas, process pending backup items and continue paged backfills. These rely on Firestore execution and cannot run on shared hosting unchanged. Replace with request-driven bounded jobs or explicit hosting cron in Phase 03; no persistent daemon required.

## Storage and secrets

Browser `imageStorageService` resizes/validates JPEG/PNG/WebP (5 MiB), hashes and delegates provider selection to runtimeImageTransport. FirebaseStorageProvider is an SDK adapter. R2 direct upload uses backend-issued staging URLs, pinned upload operations, finalize verification/promotion and server-owned ACTIVE registry. Provider config secrets are versioned in Google Secret Manager (`credentialStore.ts`); Admin Storage is a fallback. Backup streams compare source/destination SHA-256 and byte size. SQL design retains private objects, staged validation, registry and verified replicas, replaces Secret Manager with backend-only environment configuration, and does not contact old buckets.

## Offline/demo/cache/unsafe server

IndexedDB `flexo-workflow-v2` production-drafts stores local draft records and image Blobs; local draft wins over remote recovery. Official sends require acknowledged persistence and can partially succeed in a batch. Demo users/orders/settings and role preview use localStorage; preview never changes trusted identity. These are reference only in SQL runtime; no production business state may fall back to browser storage. Original main.tsx suppresses broad network/Firebase errors, which must be removed from SQL entry.

Original `server.ts` exposes unauthenticated JSON-store user/order/config synchronization, filesystem backup and AI routes with a 50 MB parser and fixed port. It is not a production security boundary and is replaced, not extended. PWA uses VitePWA plus a legacy public/sw.js and runtime icon logic. SQL must use one generated service worker, exclude every /api response and disable offline navigation into protected content.

## UI audit

AppContext and protected providers bind most screens to Firebase. Navbar/Sidebar/MobileNav, large modal editors, production cards and role queues are intertwined with demo state and custom permissions. Preserve the workflow and useful parser/eligibility tests; replace shell, account/config state and data access. Phase 01 exposes only completed users/settings/profile; other role modules show an explicit unavailable state. Detailed module parity and authoritative policy differences are tracked in FEATURE_PARITY_MATRIX.md.
