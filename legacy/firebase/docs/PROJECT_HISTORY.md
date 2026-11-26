# Project History

This is a compact decision history, not a source of current runtime truth. Use this hierarchy:

```text
CURRENT CODE
  -> APP / FEATURE MAPS
  -> PROJECT_HISTORY
  -> LEGACY_REPORT_INDEX
  -> ARCHIVED RAW REPORTS
```

Archived reports describe the repository at different points in time and may contradict current code. The original filenames below are preserved under `docs/archive/codex-reports/`.

## Major architecture milestones

- The application began as a React/Vite production dashboard with a large `AppContext`, tab-based navigation, direct Firestore repositories, demo/localStorage behavior, and an optional Express JSON-store server. Later refactors split Auth, Config, Notifications, Saved Designs, and Production into providers while retaining AppContext as a compatibility facade. Current consequence: change the owning provider/repository first; treat `server.ts` as optional/legacy unless the architecture is explicitly changed. Sources: `CODEX_AUDIT_PART1.md`, `REPORT_V2.0D.md`, `MODULE_ARCHITECTURE_REPORT.md`, `CODEX_PROMPT09_SIMPLIFICATION.md`.
- Firestore performance work replaced broad reads with active/recent queries and indexes. Current consequence: preserve query/index alignment and do not reintroduce full-collection production loading without measuring it. Sources: `REPORT_V2.0C.md`, `REPORT_V2.5_AUDIT.md`.
- Concurrency work moved workflow mutations toward Firestore transactions and added synchronous UI submission locks. Current consequence: lifecycle decisions must be revalidated inside transactions and one logical submission must not fan out duplicate records. Sources: `CONCURRENCY_REPORT.md`, `CODEX_PROMPT06_PRE_PILOT_HARDENING.md`, `CODEX_PROMPT10_FULL_USER_QA_FIX.md`.

## Authentication / canonical identity fixes

- Early code used client PIN/demo identity while Rules required Firebase Auth, creating a real authorization mismatch that local caches could hide. Firebase email/password auth and the canonical mapping were introduced: Auth UID -> `auth_identities/{uid}` -> stable `businessUserId` -> `users/{businessUserId}`. Current consequence: all persisted assignments and audit actor IDs remain business IDs; roles are trusted only from the mapping and are cross-checked server-side. Sources: `CODEX_AUDIT_PART1B.md`, `CODEX_CRITICAL_FIX_AUTH_PERSISTENCE.md`, `CODEX_PROMPT04_USER_PROVISIONING.md`.
- Protected providers once started Firestore reads before identity resolution and did not reliably re-subscribe after login. AuthProvider was moved outermost and Config/SavedDesign/order synchronization became identity-gated. Current consequence: never start protected listeners from a merely initialized Firebase app; wait for a resolved business profile. Sources: `CODEX_PRE_DEPLOY_AUTH_CHECK.md`, `CODEX_CRITICAL_FIX_02_STARTUP_AUTH.md`.
- Login briefly flashed during restored-session profile resolution, and mapping errors were presented as unauthenticated login. Explicit `AUTH_INITIALIZING`, `AUTHENTICATED`, and `UNAUTHENTICATED` states plus an account-resolution error gate removed that ambiguity. Current consequence: an existing Firebase session with an invalid mapping must remain an account/provisioning error, not silently fall back to login or demo. Source: `CODEX_AUTH_INITIALIZATION_FLASH_FIX.md`.
- Production demo switching was separated from authenticated Developer role preview. Current consequence: production role preview is presentation-only, UID-bound, and makes production surfaces inert; it never changes authorization identity. Source: `CODEX_DEMO_MODE_RESTORE.md`.

## Workflow V2 implementation

- Workflow V2 made Sales Product (`sales_order_items`) the commercial unit while Production Order remained a technical print run. It introduced server-authoritative callable transitions, product-centric finishing, unified downstream issues, warehouse readiness, supplemental M:N links, and local-first production drafts. Current consequence: Product quantities are bags/output; Production `totalSheets` and `PrintImage.sheetCount` are technical sheets and must not be reconciled as the same unit. Sources: `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`, `CODEX_PROMPT13_LITE_WORKFLOW_V2_ACCEPTANCE.md`, `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.
- Browser clients were progressively denied direct lifecycle mutation for Sales Orders, Products, finishing tasks, finished goods, workflow issues, dispatches, and shipments. Current consequence: Cloud Functions and Rules are the lifecycle authority; frontend permission helpers remain UX guards. Sources: `CODEX_PROMPT08_FULL_PRODUCTION_BEHAVIOR_AUDIT.md`, `CODEX_PROMPT08B_CLOSE_BLOCKERS.md`, `CODEX_PROMPT10D_ZERO_TRUST_FULL_VERIFICATION.md`, `CODEX_PROMPT14_PERMISSION_MATRIX_REPORT.md`.
- Historical permission documents predate the later addition of `WAREHOUSE`. Current consequence: use current code and current maps when the archived Prompt 14 matrix says there is no Warehouse role. Sources: `CODEX_PROMPT14_PERMISSION_MATRIX_REPORT.md`, `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.

## Production Order / Product / Sales Order changes

- Customer and Sales Order documents once omitted `deletedAt: null` while active-list queries required equality with null, causing successful creates to disappear from lists. Current code writes the field and uses realtime listeners. Current consequence: soft-delete query fields must be present on creation. Sources: `CODEX_CUSTOMER_SALES_ORDER_AUDIT_FIX.md`, `CODEX_PROMPT06_PRE_PILOT_HARDENING.md`.
- Sales Order and Product models evolved from a basic one-parent/many-items module into M:N Production traceability. Supplemental production is allowed; links do not limit total production or infer technical sheet count. Sources: `SALES_ORDER_MODULE_IMPLEMENTATION_REPORT.md`, `REPORT_SALES_PRODUCTION_INTEGRATION.md`, `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`, `CODEX_PROMPT18_CLOSE_WORKFLOW_GAPS.md`.
- A “Production not found” defect occurred when a local-only draft was linked through a Function that could only read official `orders`. Current consequence: immediate production/link flows must create the official Firestore order before the callable link. Source: `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.
- Direct-route Products now support four combinations of `requiresProduction` and `requiresFinishing`. Current consequence: preserve direct finishing tasks and direct finished goods; do not force all Products through Production. Source: `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.

## Printer workflow

- Assigned Printer acceptance originally failed because `acceptedAt` was missing from the Rules allow-list; health diagnostics also mislabeled an expected admin-only write denial as connectivity failure. Current consequence: Printer direct-write fields and health-check semantics must remain aligned with Rules. Source: `CODEX_CRITICAL_FIX_03_PRINTER_WRITE.md`.
- A later production hotfix found whole-object transaction writes converting legacy Firestore `Timestamp` values into maps, making unchanged protected fields appear modified. Current consequence: preserve Firestore value serialization/diff behavior and prefer narrow updates where practical. Source: `CODEX_PROMPT15_PRINTER_ACCEPT_HOTFIX.md`.
- Plate status was decoupled from the permission to start printing; it remains operational information with explicit send/receive/replate callables. Current consequence: do not reintroduce a mandatory plate gate unless business policy explicitly changes. Sources: `CODEX_FIX_REPLATE_WORKFLOW.md`, `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`.

## Revision

- Technical instruction changes before printing now increment `productionRevision`; reassignment resets acknowledgement; the assigned Printer must acknowledge the latest revision before start. Editing and reassignment lock after printing begins. Current consequence: any new instruction-edit path must maintain revision/ACK invariants. Source: `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`.

## Cancellation

- Production cancellation became an explicit request/response record rather than a silent status rewrite. Accepted cancellation reconciles only that run's Product links; rejection preserves the order. Finishing cancellation has distinct pre-claim and claimed-task behavior. Current consequence: cancellation is a transaction spanning ownership, history, and downstream readiness. Sources: `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`, `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.

## Issues

- Production issues and Product-stage workflow issues were normalized around open/resolved/cancelled history with explicit recipients. Issues remain independent from lifecycle status and are currently non-blocking. Current consequence: UI may offer resolve-or-continue, but must not auto-resolve or mutate workflow state. Sources: `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`, `CODEX_PROMPT18_CLOSE_WORKFLOW_GAPS.md`.
- Historical blocker-style issue behavior was replaced after audit/zero-trust work. Current consequence: archived reports that describe machine/plate blockers are historical, not the present policy. Sources: `CODEX_PROMPT08_FULL_PRODUCTION_BEHAVIOR_AUDIT.md`, `CODEX_PROMPT10D_ZERO_TRUST_FULL_VERIFICATION.md`, `CODEX_PROMPT18_CLOSE_WORKFLOW_GAPS.md`.

## Finishing

- Earlier finishing was embedded at Production Order level. Workflow V2 added a deterministic finishing checkpoint per linked Product, including an explicit no-work confirmation for Products that do not require finishing. Current consequence: product-centric `finishing_tasks` is the main V2 queue, while embedded order finishing remains a compatibility path. Sources: `CODEX_FINAL_WORKFLOW_AUDIT.md`, `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`, `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.
- Completing or validly cancelling a Product task creates/updates finished goods and derives Product readiness from aggregate accepted output. Current consequence: never mark a parent ready solely because one sibling Product completed. Source: `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.

## Warehouse

- Finished goods and warehouse dispatch were introduced with transactional inventory updates, followed by shipment/return handling. Current consequence: dispatch lines reference finished goods and stock changes occur only through server transactions. Sources: `REPORT_V2.6_FINISHED_GOODS_DISPATCH.md`, `REPORT_V3.0_SHIPPING_VIETTELPOST.md`.
- Workflow V2 added an anti-partial-export gate: no dispatch may be created until every active Product in the Sales Order is warehouse-ready and fully accepted. A dedicated `WAREHOUSE` role later became the dispatch authority. Current consequence: preserve order-wide readiness even when the requested dispatch contains only some goods. Sources: `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`, `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md`.
- Return inspection separates historical dispatch from restock/scrap/customer-hold disposition. Current consequence: a returned shipment does not automatically become available stock. Sources: `REPORT_V3.1_FULL_SYSTEM_AUDIT.md`, `REPORT_V3.2_TARGETED_FIX.md`, `REPORT_V3.2B_VERIFICATION.md`.

## Realtime / persistence

- LocalStorage/sample merging once masked Firestore failures and produced device-specific official order views. Current consequence: production official records require acknowledged Firestore writes; local cache cannot count as cloud success. Source: `CODEX_CRITICAL_FIX_AUTH_PERSISTENCE.md`.
- Realtime coverage was expanded and tested across independent clients. Current consequence: repositories/providers own listener lifecycle and unsubscribe/re-subscribe on identity changes. Sources: `CODEX_PROMPT08D_REALTIME_FINAL.md`, `CODEX_PROMPT10D_ZERO_TRUST_FULL_VERIFICATION.md`, `CODEX_PROMPT10E_BROWSER_FULL_E2E.md`.
- Designer production drafts became truly local-first in IndexedDB with background Firestore backups and idempotent batch send. Current consequence: the local draft is authoritative when present; backup is recovery only. Source: `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`.

## Image / Storage history

- Production image persistence moved away from data URLs and arbitrary external URLs to validated Blob preparation, Firebase Storage objects, and compact Firestore references. Failed writes clean up only newly created objects. Current consequence: never persist preview/object/data URLs as production image state. Source: `CODEX_PROMPT05_IMAGE_STORAGE_REFACTOR.md`.
- Avatar work exposed the same boundary: external preset URLs may be previews but must be downloaded, validated, and uploaded before production persistence. Source: `CODEX_PROMPT17_USER_GUIDE_EXECUTIVE_AVATAR.md`.
- `CODEX_PROMPT15_STORAGE_MANAGER.md` is a historical planning prompt for another path (`D:\CODEX\xuongin`) and is not authoritative for this repository.
- Prompts 15A–15E established provider-neutral registry identity, backend-only R2 credentials, pinned direct upload, Developer administration, and runtime MANUAL/AUTOMATIC routing. Current consequence: new uploads follow `storage_runtime/config`; eligible R2 providers are ordered by lower priority then stable ID with optional Firebase final fallback, while existing images and issued operations never migrate/switch. Soft limits are Developer-defined routing thresholds based only on ACTIVE Image Registry bytes, not provider quota. R2 read URLs are short-lived and memory-only; registered replacement uses safe logical retirement until reference-aware garbage collection exists.

## Security / authorization fixes

- Rules were tightened around canonical identity, assigned-Printer ownership, privileged user lifecycle, and server-only downstream collections. Current consequence: do not broaden direct browser writes to simplify UI implementation. Sources: `CODEX_CRITICAL_FIX_AUTH_PERSISTENCE.md`, `CODEX_CRITICAL_FIX_03_PRINTER_WRITE.md`, `CODEX_PROMPT10D_ZERO_TRUST_FULL_VERIFICATION.md`.
- Permission-matrix work aligned UI helpers, callable roles, and Rules, but later Workflow V2 work changed the role set and some policies. Current consequence: use `functions/src/workflows/workflowAuth.ts`, current Rules, and current types as authority; use archived matrices only for rationale. Source: `CODEX_PROMPT14_PERMISSION_MATRIX_REPORT.md`.
- Several historical reports claimed deployment or security PASS for older schemas/rules. Current consequence: PASS evidence is time-bound and cannot certify current code after later changes. Sources: `REPORT_V2.5_AUDIT.md`, `REPORT_V3.1_FULL_SYSTEM_AUDIT.md`, `REPORT_V3.2B_VERIFICATION.md`, Prompt 06–13 reports.

## Firebase / deployment history

- Deployment audits established project `xuongin`, Hosting target `codex`, and site `indongduong`, while repeatedly distinguishing local source evidence from deployed-state evidence. Current consequence: verify the active project/target before deployment; never infer production state from a local report. Sources: `CODEX_AUDIT_PART1.md`, `CODEX_PROMPT07_DEPLOYMENT_READINESS.md`, `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md`.
- New-workshop bootstrap added a one-time server lock, secret-protected first Developer creation, and reusable setup/deploy scripts without migrating existing production data. Current consequence: bootstrap must remain race-safe and must not become an application-startup migration. Source: `CODEX_PROMPT20_NEW_WORKSHOP_BOOTSTRAP.md`.
- Login branding was deliberately made available from safe build/default configuration before auth, rather than reading protected Firestore settings. Current consequence: branding failure must never block login. Source: `CODEX_PROMPT19_LOGIN_BRANDING_UIUX.md`.

## Important historical bugs and their root causes

| Bug | Root cause | Architectural guard now required | Original reports |
|---|---|---|---|
| Cross-device official data mismatch | Firestore results merged with local/sample cache; failed writes looked successful | acknowledged Firestore writes; no production cache-as-success | `CODEX_CRITICAL_FIX_AUTH_PERSISTENCE.md` |
| Protected startup read failures | providers subscribed before canonical identity resolved | AuthProvider outermost; identity-gated listeners | `CODEX_PRE_DEPLOY_AUTH_CHECK.md`, `CODEX_CRITICAL_FIX_02_STARTUP_AUTH.md` |
| Login flicker/account error confusion | auth-ready became true before business profile resolution | explicit auth initialization state machine | `CODEX_AUTH_INITIALIZATION_FLASH_FIX.md` |
| New customers/orders disappeared | create omitted `deletedAt`, query required `deletedAt == null` | write soft-delete sentinel on creation | `CODEX_CUSTOMER_SALES_ORDER_AUDIT_FIX.md` |
| Assigned Printer could not accept | Rules omitted `acceptedAt` | keep direct-write allow-list synchronized | `CODEX_CRITICAL_FIX_03_PRINTER_WRITE.md` |
| Legacy Printer acceptance denied | whole-object serialization altered Firestore Timestamp shape | preserve Firestore types / narrow diffs | `CODEX_PROMPT15_PRINTER_ACCEPT_HOTFIX.md` |
| Production link “not found” | callable linked an IndexedDB-only draft | persist official order before server link | `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md` |
| Dispatch stuck in DRAFT | service existed but UI action was absent | verify every transition has a reachable UI/controller path | `CODEX_FINAL_WORKFLOW_AUDIT.md` |
| Avatar selected but not saved/rendered | external preview URL conflicted with Storage-only production policy | upload validated asset, store reference, keep fallback | `CODEX_PROMPT17_USER_GUIDE_EXECUTIVE_AVATAR.md` |

## Important architectural decisions that must not regress

1. Canonical identity is Auth UID -> identity mapping -> stable business user; assignments use business IDs.
2. Current code and Rules override every historical report.
3. Production lifecycle transitions are server-authoritative except explicitly narrow Rules-approved order writes.
4. Official production writes require cloud acknowledgement; IndexedDB authority applies only to local drafts.
5. Product quantity is separate from print sheets and technical imposition images.
6. Production/Product relationships are M:N traceability and allow supplemental runs.
7. Issues do not mutate or currently block lifecycle state.
8. Finishing is product-centric and includes a no-work checkpoint.
9. Warehouse export is Sales Order-aware and rejects partial readiness.
10. Storage persists validated binary objects plus metadata references, never production data URLs.
11. Role preview is UI-only and cannot become an authorization input.
12. Startup/bootstrap must never perform destructive data migration.
