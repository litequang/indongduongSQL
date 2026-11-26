# APP MAP

## Repository identity

- Repository: `D:\CODE\indongduong`
- Current branch: `main`
- Audited commit: `e68f8e44b2fdb575c1de2ba5de161cad4ce3af34`
- Audit scope: repository state at the commit above. Existing untracked root files were not changed.

## Runtime architecture

```text
Browser (React 19 + Vite SPA; tab/state navigation, no URL router)
  -> React providers and feature components
  -> services / repositories
     -> imageStorageService -> backend runtime selection
        -> Firebase provider adapter OR direct R2 PUT/finalize
        -> Image Registry + centralized read resolver
     -> Firebase Auth
     -> Firestore (direct descriptive reads/writes + realtime listeners)
     -> callable Cloud Functions (authoritative workflow transitions)
     -> Firebase Storage (validated image blobs)
     -> IndexedDB (authoritative device-local production drafts)
     -> localStorage (demo data, UI/config caches, notifications)
  -> Firebase Hosting (static SPA rewrite)

Cloud Functions (Node 20, asia-southeast1)
  -> canonical identity lookup
  -> transactional workflow writes in Firestore
  -> audit logs / notifications
  -> Developer-only storage provider administration
     -> storage_provider_configs (non-secret metadata)
     -> storage_runtime/config (strategy/manual selection/threshold/fallback)
     -> Google Secret Manager (versioned R2 credentials)
     -> backend provider factory -> R2 S3-compatible API
  -> authorized runtime image transport
     -> storage_upload_operations (server-only provider/key/expiry pin)
     -> short-lived R2 staging PUT -> verified server-side copy
     -> transactional ACTIVE image_registry record
     -> relationship-authorized short-lived R2 read URL
```

`server.ts` is a separate Express/Vite development server with a JSON-file store and a Gemini customer-import endpoint. Current frontend code does not call its users/orders/config endpoints, and the customer import UI explicitly treats the Gemini endpoint as unavailable on static Firebase Hosting. Treat it as legacy/optional runtime, not the production Workflow V2 authority.

## Main directories

### `src/`

Purpose: browser application.

- `src/main.tsx` — **CORE** — browser mount and top-level error boundary.
- `src/App.tsx` — **CORE** — auth/bootstrap gates, application shell, tab-to-page composition.
- `src/types.ts` — **CORE / SHARED** — browser domain models and all major status unions.
- `src/components/` — **FEATURE** — pages, modals, navigation, and workflow controls. Important files: `QuickOrderComposer.tsx`, `CreateOrderModal.tsx`, `DesignerQueue.tsx`, `OrderCard.tsx`, `OrderDetailModal.tsx`, `SalesOrderManagement.tsx`, `FinishingTasksManagement.tsx`, `FinishedGoodsManagement.tsx`, `WarehouseDispatchManagement.tsx`, `ShippingManagement.tsx`, `SettingsModal.tsx`.
- `src/context/` — **CORE** — provider state and orchestration. `AppContext.tsx` is the main client workflow coordinator; `AuthContext.tsx` owns canonical login resolution; `ProductionContext.tsx` merges local drafts with realtime official orders.
- `src/services/` — **FEATURE / CORE** — use cases and callable/storage adapters. `imageStorageService.ts` plus `runtimeImageTransport.ts` form the provider-neutral browser image boundary; `firebaseFunctionsClient.ts` centralizes regional/emulator Functions access.
- `src/storage/` — **CORE / INFRASTRUCTURE** — provider-neutral image contracts, Storage Manager orchestration, object-key/SHA-256 helpers, and concrete provider adapters.
- `src/repositories/` — **CORE / INFRASTRUCTURE** — Firestore, IndexedDB, and demo persistence access.
- `src/permissions/` — **CORE / SHARED** — frontend permission matrix and context-specific helpers; not the server authorization source.
- `src/utils/` — **SHARED** — production parser, printer matching, safe Firestore writes, serialization, dates, browser storage, PWA/version helpers.
- `src/features/customer-import/` — **FEATURE** — CSV/XLSX parsing, normalization, and import UI.
- `src/config/` — **INFRASTRUCTURE** — Firebase bootstrap, defaults, branding.
- `src/data/` — **LEGACY / DEMO** — initial/demo data and guide content.

### `functions/`

Purpose: trusted Firebase callable backend.

- `functions/src/index.ts` — **CORE / INFRASTRUCTURE** — all callable exports; region `asia-southeast1`.
- `functions/src/workflows/workflowAuth.ts` — **CORE** — canonical identity and role enforcement.
- `functions/src/workflows/productionWorkflow.ts` — **CORE** — revisions, plates, production issues, legacy order-level finishing handoff.
- `functions/src/workflows/fulfillmentWorkflow.ts` — **CORE** — Sales Order/Product derivation, print completion, product-centric finishing, cancellations, downstream issues, finished goods.
- `functions/src/workflows/logisticsWorkflow.ts` — **CORE** — warehouse dispatches, shipments, returns.
- `functions/src/workflows/workflowAudit.ts` — **SHARED** — server audit entries.
- `functions/src/staffProvisioningService.ts` — **CORE** — Firebase Auth and business-user lifecycle.
- `functions/src/bootstrapService.ts` — **INFRASTRUCTURE** — first developer bootstrap.
- `functions/src/storage/` — **CORE / INFRASTRUCTURE** — server-authoritative provider/runtime configs, tracked usage selection, Secret Manager credentials, R2 adapter, sanitized Developer administration, pinned direct upload, and logical image read/retirement authority.
- `functions/src/types.ts` — **SHARED** — backend identity/provisioning types.

### `tests/`

Purpose: unit, emulator, and browser coverage. Classification: **TEST**.

Important suites include `workflow-emulator.cjs`, `workflow-v2-local.test.ts`, `production-eligibility.test.ts`, `submission-lock.test.ts`, `prompt14-permissions-emulator.cjs`, `storage-rules-prompt05.cjs`, and `tests/e2e/workflow-v2-ui.spec.ts`. Tests were identified but not run during this documentation-only audit.

### `public/`

Purpose: PWA/static assets. Classification: **INFRASTRUCTURE**.

- `public/manifest.json` — static manifest (VitePWA also generates/injects a manifest).
- `public/sw.js` — pass-through fallback service worker; no application-data offline cache.
- `public/version.json`, `public/icon.svg` — deployment/version assets.

### `scripts/`

Purpose: setup/deployment/data administration. Classification: **INFRASTRUCTURE**.

Important files: `setup-new-workshop.cjs`, `deploy-workshop.cjs`, `cleanup-business-data.cjs`. These are operational scripts, not application startup migrations.

## Application entry points

- Browser HTML: `index.html` -> `/src/main.tsx`.
- React root: `src/main.tsx` -> `src/App.tsx`.
- Provider order: `AuthProvider` -> `ConfigProvider` -> `NotificationProvider` -> `SavedDesignProvider` -> `ProductionProvider` -> `AppProviderInner` in `src/context/AppContext.tsx`.
- Auth/bootstrap gate: `AuthGate` and `BootstrapGate` in `src/App.tsx`; `src/context/AuthContext.tsx`; `src/services/bootstrapService.ts`.
- Navigation/router: there is no React Router. `activeTab` in `src/context/AppContext.tsx`, rendered by `src/App.tsx`, with selectors in `src/components/Sidebar.tsx` and `src/components/MobileNav.tsx`.
- Firebase browser bootstrap: `src/config/firebase.ts` lazily initializes Auth, Firestore, Storage, and optional emulators.
- Cloud Functions entry: `functions/src/index.ts` (compiled to `functions/lib/index.js`).
- Optional Express entry: `server.ts`; used by `npm run dev`/`npm start`, but separate from Firebase Hosting/Functions production architecture.

## Main application pages/tabs

`src/App.tsx` composes pages from state rather than URL routes:

- Production dashboard/list tabs: `overview`, `all`, `my_work`, `drafts`, `not_sent_plate`, `ready_plate`, `unaccepted`, `waiting_plate`, `waiting_print`, `printing`, `printed`, `completed`, `issue`.
- Standalone feature tabs: `customers`, `salesOrders`, `designer_queue`, `finishing`, `finished_goods`, `dispatches`, `shipping`, `guide`.
- Modal surfaces: production create/detail, print completion, issue report, finishing handoff, saved-design library, settings, user management/profile, image viewer, customer import, login/bootstrap.

## Key configuration files

- `package.json` — React/Vite/Express scripts and dependencies.
- `vite.config.ts` — React, Tailwind, VitePWA, Firebase/vendor chunking.
- `tsconfig.json` — browser TypeScript configuration.
- `firebase.json` — Node 20 Functions, Firestore/Storage rules, Hosting SPA rewrite, emulator ports.
- `.firebaserc` — default project `xuongin`; hosting target `codex` -> site `indongduong`.
- `firestore.rules` — canonical-identity authorization and direct-write boundaries.
- `firestore.indexes.json` — customer, Sales Order, order, dispatch, shipment, audit indexes.
- `storage.rules` — image namespaces, roles, types, sizes, immutable object creation.
- `functions/package.json`, `functions/tsconfig.json` — Functions build/runtime.
- Functions-only provider dependencies: AWS SDK v3 S3 client/presigner and Google Cloud Secret Manager client. They are not frontend dependencies.
- `.env.example`, `workshop.example.json`, `firebase-blueprint.json` — environment/workshop templates.

## Persistence and realtime summary

- Firestore realtime listeners: users, active production orders, Sales Orders, customers, saved designs, app config, finishing tasks, finished goods, and workflow issues. See repository `subscribe*` methods and provider effects.
- IndexedDB: database `flexo-workflow-v2`, object store `production-drafts`; production draft plus image Blobs.
- Firestore draft recovery: `production_draft_backups` by `createdBy`.
- Backend-only storage state: `storage_runtime/config` and `storage_upload_operations`; browser Rules deny all reads/writes. Callables own routing, tracked-usage eligibility, idempotency, expiry, provider/credential pinning, finalization and R2 read authorization.
- localStorage: demo orders/users/designs/settings, notifications, developer demo-preview binding, optional demo Firebase config, and compatibility caches. Production official orders are not treated as an offline-success write path.
- Cross-tab refresh: `BroadcastChannel('flexo_sync_channel')` in `src/context/AppContext.tsx`.

## Storage disaster-recovery layer

- `functions/src/storage/backup/` owns Developer-managed backup policies, bounded backfill discovery, background item leases, deterministic replica metadata, streaming SHA-256 verification and missing-only restore.
- R2 and the Admin SDK default Firebase bucket implement one provider-neutral backend stream contract; binary data never passes through the browser.
- A finalized canonical record enqueues enabled matching auto policies without blocking upload completion. Backfill is explicitly started by a Developer and discovers ACTIVE canonical records in bounded pages.
- `image_registry` remains the single canonical runtime locator. `storage_backup_policies` is backend-only configuration, `image_replicas` is disaster-recovery state, and `image_backup_jobs/{jobId}/items` is resumable operational state.
- `StorageBackupManager` is policy-first inside the verified Developer Storage Manager; per-image tools are collapsed under Advanced and the browser never receives provider credentials or arbitrary object-key authority.
