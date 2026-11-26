# Legacy Report Index

All entries below are raw historical snapshots archived without content changes. “Still relevant” describes value as history/rationale, not authority over current code.

Archive root: `docs/archive/codex-reports/`

| Filename | Purpose | Approximate topic | Still relevant | Important information extracted to `PROJECT_HISTORY` | Archive path |
|---|---|---|---|---|---|
| `CODEX_AUDIT_PART1.md` | Repository audit | Initial architecture, Firebase, modules, optional server | PARTIAL | Original architecture and optional Express runtime | `docs/archive/codex-reports/CODEX_AUDIT_PART1.md` |
| `CODEX_AUDIT_PART1B.md` | Auth/Rules mismatch audit | PIN-era auth, deployed-rules uncertainty, cache masking | HISTORICAL ONLY | Why canonical Auth and acknowledged writes were needed | `docs/archive/codex-reports/CODEX_AUDIT_PART1B.md` |
| `CODEX_AUTH_INITIALIZATION_FLASH_FIX.md` | Fix validation | Login flicker and account-resolution state | YES | Explicit auth initialization state machine | `docs/archive/codex-reports/CODEX_AUTH_INITIALIZATION_FLASH_FIX.md` |
| `CODEX_CRITICAL_FIX_02_STARTUP_AUTH.md` | Critical fix report | Provider ordering and protected listener gating | YES | Identity-gated provider/listener startup | `docs/archive/codex-reports/CODEX_CRITICAL_FIX_02_STARTUP_AUTH.md` |
| `CODEX_CRITICAL_FIX_03_PRINTER_WRITE.md` | Critical fix/security report | Printer acceptance Rules and health check | YES | `acceptedAt` allow-list and assigned-Printer boundary | `docs/archive/codex-reports/CODEX_CRITICAL_FIX_03_PRINTER_WRITE.md` |
| `CODEX_CRITICAL_FIX_AUTH_PERSISTENCE.md` | Critical architecture fix | Canonical Auth, cross-device persistence, safe writes | YES | No production cache-as-success; stable business IDs | `docs/archive/codex-reports/CODEX_CRITICAL_FIX_AUTH_PERSISTENCE.md` |
| `CODEX_CUSTOMER_SALES_ORDER_AUDIT_FIX.md` | Recovery audit | Missing `deletedAt: null` create/query mismatch | HISTORICAL ONLY | Soft-delete sentinel root cause | `docs/archive/codex-reports/CODEX_CUSTOMER_SALES_ORDER_AUDIT_FIX.md` |
| `CODEX_DEMO_MODE_RESTORE.md` | Recovery review | Demo build vs authenticated Developer preview | PARTIAL | Preview is UI-only and UID-bound | `docs/archive/codex-reports/CODEX_DEMO_MODE_RESTORE.md` |
| `CODEX_FINAL_WORKFLOW_AUDIT.md` | Workflow audit | Older state machines and unreachable dispatch action | HISTORICAL ONLY | Every service transition needs a reachable UI path | `docs/archive/codex-reports/CODEX_FINAL_WORKFLOW_AUDIT.md` |
| `CODEX_FIX_REPLATE_WORKFLOW.md` | Recovery report | Plate damage/reissue workflow | PARTIAL | Plate is explicit but not a print-start gate | `docs/archive/codex-reports/CODEX_FIX_REPLATE_WORKFLOW.md` |
| `CODEX_PRE_DEPLOY_AUTH_CHECK.md` | Deployment gate audit | Startup auth blocker | HISTORICAL ONLY | Pre-auth readers that led to Critical Fix 02 | `docs/archive/codex-reports/CODEX_PRE_DEPLOY_AUTH_CHECK.md` |
| `CODEX_PROMPT04_USER_PROVISIONING.md` | Implementation report | Secure Auth/business-user provisioning | YES | Admin SDK owns privileged staff lifecycle | `docs/archive/codex-reports/CODEX_PROMPT04_USER_PROVISIONING.md` |
| `CODEX_PROMPT05_IMAGE_STORAGE_REFACTOR.md` | Implementation/validation report | Storage-backed image references and cleanup | YES | Binary Storage objects, no production data URLs | `docs/archive/codex-reports/CODEX_PROMPT05_IMAGE_STORAGE_REFACTOR.md` |
| `CODEX_PROMPT06_CHECKPOINT.md` | Interim checkpoint | Pre-pilot work in progress | OBSOLETE | Superseded by final Prompt 06 report | `docs/archive/codex-reports/CODEX_PROMPT06_CHECKPOINT.md` |
| `CODEX_PROMPT06_PRE_PILOT_HARDENING.md` | Hardening report | Transactions, emulator coverage, pre-pilot gates | PARTIAL | Transaction pre-reads and concurrency discipline | `docs/archive/codex-reports/CODEX_PROMPT06_PRE_PILOT_HARDENING.md` |
| `CODEX_PROMPT07_DEPLOYMENT_READINESS.md` | Deployment report | Environment alignment and safe release plan | HISTORICAL ONLY | Verify project/target and separate local from deployed evidence | `docs/archive/codex-reports/CODEX_PROMPT07_DEPLOYMENT_READINESS.md` |
| `CODEX_PROMPT08_FULL_PRODUCTION_BEHAVIOR_AUDIT.md` | Behavior/security audit | Production workflows and blockers | HISTORICAL ONLY | Step toward server-authoritative lifecycle | `docs/archive/codex-reports/CODEX_PROMPT08_FULL_PRODUCTION_BEHAVIOR_AUDIT.md` |
| `CODEX_PROMPT08B_CLOSE_BLOCKERS.md` | Fix report | Remaining production audit blockers | HISTORICAL ONLY | Continued callable/Rules tightening | `docs/archive/codex-reports/CODEX_PROMPT08B_CLOSE_BLOCKERS.md` |
| `CODEX_PROMPT08C_FINAL_BLOCKERS.md` | Final status note | Short blocker closure snapshot | OBSOLETE | No unique durable decision beyond Prompt 08 series | `docs/archive/codex-reports/CODEX_PROMPT08C_FINAL_BLOCKERS.md` |
| `CODEX_PROMPT08D_REALTIME_FINAL.md` | Realtime evidence report | Independent-client listener propagation | PARTIAL | Realtime listener ownership and cross-client expectation | `docs/archive/codex-reports/CODEX_PROMPT08D_REALTIME_FINAL.md` |
| `CODEX_PROMPT09_SIMPLIFICATION.md` | Architecture report | Context/service simplification | PARTIAL | Split providers while retaining AppContext facade | `docs/archive/codex-reports/CODEX_PROMPT09_SIMPLIFICATION.md` |
| `CODEX_PROMPT09B_FINAL_VALIDATION.md` | Validation snapshot | Prompt 09 final checks | OBSOLETE | No unique durable decision | `docs/archive/codex-reports/CODEX_PROMPT09B_FINAL_VALIDATION.md` |
| `CODEX_PROMPT10_FULL_USER_QA_FIX.md` | QA/fix report | User workflows and submission locking | PARTIAL | Duplicate-submission prevention | `docs/archive/codex-reports/CODEX_PROMPT10_FULL_USER_QA_FIX.md` |
| `CODEX_PROMPT10D_ZERO_TRUST_FULL_VERIFICATION.md` | Security/integration report | Provisioned-role emulator verification | PARTIAL | Canonical identity and negative authorization evidence | `docs/archive/codex-reports/CODEX_PROMPT10D_ZERO_TRUST_FULL_VERIFICATION.md` |
| `CODEX_PROMPT10E_BROWSER_FULL_E2E.md` | Browser test report | Playwright/emulator urgent UI coverage | HISTORICAL ONLY | Browser evidence scope was narrower than full application | `docs/archive/codex-reports/CODEX_PROMPT10E_BROWSER_FULL_E2E.md` |
| `CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md` | Major implementation report | Workflow V2, local drafts, Products, Functions | YES | Core Workflow V2 decisions and invariants | `docs/archive/codex-reports/CODEX_PROMPT12_WORKFLOW_V2_IMPLEMENTATION.md` |
| `CODEX_PROMPT13_LITE_WORKFLOW_V2_ACCEPTANCE.md` | Acceptance snapshot | Targeted Workflow V2 browser QA | OBSOLETE | Time-bound acceptance evidence only | `docs/archive/codex-reports/CODEX_PROMPT13_LITE_WORKFLOW_V2_ACCEPTANCE.md` |
| `CODEX_PROMPT14_PERMISSION_MATRIX_REPORT.md` | Permission report | Canonical matrix before Warehouse role | PARTIAL | UI vs Function/Rules authority distinction | `docs/archive/codex-reports/CODEX_PROMPT14_PERMISSION_MATRIX_REPORT.md` |
| `CODEX_PROMPT15_PRINTER_ACCEPT_HOTFIX.md` | Production hotfix report | Legacy Timestamp serialization denial | YES | Whole-object write can alter protected Firestore types | `docs/archive/codex-reports/CODEX_PROMPT15_PRINTER_ACCEPT_HOTFIX.md` |
| `CODEX_PROMPT15_STORAGE_MANAGER.md` | Planning prompt | Multi-R2/provider registry and backup/restore | OBSOLETE | Explicitly recorded as unimplemented/wrong-path plan | `docs/archive/codex-reports/CODEX_PROMPT15_STORAGE_MANAGER.md` |
| `CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md` | Implementation report | Four Product routes, print images, Warehouse role | YES | Product-centric finishing and Warehouse authority | `docs/archive/codex-reports/CODEX_PROMPT16_WORKFLOW_PRODUCT_FINISHING_WAREHOUSE.md` |
| `CODEX_PROMPT17_USER_GUIDE_EXECUTIVE_AVATAR.md` | Feature/fix report | User guide, executive view, avatar persistence | PARTIAL | External preview must become validated Storage object | `docs/archive/codex-reports/CODEX_PROMPT17_USER_GUIDE_EXECUTIVE_AVATAR.md` |
| `CODEX_PROMPT18_CLOSE_WORKFLOW_GAPS.md` | Gap-closure report | Open issue transitions, permissions, link policy | YES | Issues are non-blocking and do not auto-resolve | `docs/archive/codex-reports/CODEX_PROMPT18_CLOSE_WORKFLOW_GAPS.md` |
| `CODEX_PROMPT19_LOGIN_BRANDING_UIUX.md` | UI/security report | Safe pre-auth branding and login UX | PARTIAL | Login branding uses safe defaults and cannot block auth | `docs/archive/codex-reports/CODEX_PROMPT19_LOGIN_BRANDING_UIUX.md` |
| `CODEX_PROMPT20_NEW_WORKSHOP_BOOTSTRAP.md` | Infrastructure report | New-workshop setup, first Developer, deploy scripts | YES | Race-safe one-time bootstrap; no startup migration | `docs/archive/codex-reports/CODEX_PROMPT20_NEW_WORKSHOP_BOOTSTRAP.md` |
| `CONCURRENCY_REPORT.md` | Technical report | Transaction conversion and race conditions | PARTIAL | Revalidate state inside transactions | `docs/archive/codex-reports/CONCURRENCY_REPORT.md` |
| `MODULE_ARCHITECTURE_REPORT.md` | Architecture report | Modules, feature flags, dependencies | HISTORICAL ONLY | Pre-map feature dependency milestone | `docs/archive/codex-reports/MODULE_ARCHITECTURE_REPORT.md` |
| `REPORT_CUSTOMER_IMPORT.md` | Implementation report | CSV/XLSX import, mapping, normalization | PARTIAL | Customer import milestone; current code is authority | `docs/archive/codex-reports/REPORT_CUSTOMER_IMPORT.md` |
| `REPORT_SALES_PRODUCTION_INTEGRATION.md` | Integration report | Sales Product to Production relationships | PARTIAL | M:N ancestry and quantity-separation rationale | `docs/archive/codex-reports/REPORT_SALES_PRODUCTION_INTEGRATION.md` |
| `REPORT_V2.0C.md` | Performance report | Firestore query/index optimization | PARTIAL | Avoid broad reads; keep indexes aligned | `docs/archive/codex-reports/REPORT_V2.0C.md` |
| `REPORT_V2.0D.md` | Refactor report | Provider/service/repository split | PARTIAL | AppContext compatibility facade history | `docs/archive/codex-reports/REPORT_V2.0D.md` |
| `REPORT_V2.1.md` | Implementation report | Customer core | HISTORICAL ONLY | Early Customer module milestone | `docs/archive/codex-reports/REPORT_V2.1.md` |
| `REPORT_V2.5_AUDIT.md` | System audit | Older multi-module readiness snapshot | OBSOLETE | Time-bound PASS claims, superseded by later audits | `docs/archive/codex-reports/REPORT_V2.5_AUDIT.md` |
| `REPORT_V2.6_FINISHED_GOODS_DISPATCH.md` | Implementation report | Finished goods and warehouse dispatch | PARTIAL | Transactional inventory/dispatch origin | `docs/archive/codex-reports/REPORT_V2.6_FINISHED_GOODS_DISPATCH.md` |
| `REPORT_V3.0_SHIPPING_VIETTELPOST.md` | Implementation report | Shipment abstraction and Viettel Post mock | HISTORICAL ONLY | Shipment/return milestone; provider claims may be stale | `docs/archive/codex-reports/REPORT_V3.0_SHIPPING_VIETTELPOST.md` |
| `REPORT_V3.1_FULL_SYSTEM_AUDIT.md` | System audit | Older full-system PASS matrix | OBSOLETE | Return/dispatch history; PASS claims are time-bound | `docs/archive/codex-reports/REPORT_V3.1_FULL_SYSTEM_AUDIT.md` |
| `REPORT_V3.1_PRODUCTION_STATUS_UX.md` | UI report | Production status badge simplification | HISTORICAL ONLY | Primary status UX milestone | `docs/archive/codex-reports/REPORT_V3.1_PRODUCTION_STATUS_UX.md` |
| `REPORT_V3.2_TARGETED_FIX.md` | Targeted audit/fix report | Import endpoint, reports, issues, returns, locking | HISTORICAL ONLY | Return ownership and static-hosting endpoint history | `docs/archive/codex-reports/REPORT_V3.2_TARGETED_FIX.md` |
| `REPORT_V3.2B_VERIFICATION.md` | Verification report | Deployment, Storage, direct-write security | HISTORICAL ONLY | Demonstrates why old PASS claims cannot define current Rules | `docs/archive/codex-reports/REPORT_V3.2B_VERIFICATION.md` |
| `SALES_ORDER_MODULE_IMPLEMENTATION_REPORT.md` | Implementation report | Initial Sales Order/Product module | HISTORICAL ONLY | Early Product model before Workflow V2 | `docs/archive/codex-reports/SALES_ORDER_MODULE_IMPLEMENTATION_REPORT.md` |

## Kept active at repository root

- `README.md` — repository entry document.
- `PROJECT_CONTEXT.md` — active project/business context; its archived Workflow V2 reference is updated.
- `DEPLOY_NEW_WORKSHOP.md` — current operational deployment instructions.
- `security_spec.md` — active security specification.
- `WORKFLOW_V2_PERMISSION_MATRIX.md` and `WORKFLOW_V2_PERMISSION_POLICY.md` — named canonical policy documents; retain, but current code still wins.
- `docs/APP_MAP.md`, `FEATURE_MAP.md`, `DATA_FLOW_MAP.md`, `FIREBASE_MAP.md`, `WORKFLOW_V2_MAP.md`, `CHANGE_GUIDE.md`, `CODEX_RULES.md` — current navigation maps.

## Needs review

- `PROJECT_CONTEXT.md` — kept at root because it may be an owner-maintained handoff document, but parts are stale against current source (`D:\CODEX\xuongin` and Hosting target `production` versus the current repository and target `codex`). Only its reference to the moved Workflow V2 report was updated in this task. Decide separately whether to refresh or archive the whole handoff document.

## Safe delete candidates (not deleted)

- `CODEX_PROMPT06_CHECKPOINT.md` — interim state fully superseded by the final Prompt 06 report.
- `CODEX_PROMPT08C_FINAL_BLOCKERS.md` — short status-only duplicate of the Prompt 08 series.
- `CODEX_PROMPT09B_FINAL_VALIDATION.md` — time-bound validation with no unique architectural decision.
- `CODEX_PROMPT13_LITE_WORKFLOW_V2_ACCEPTANCE.md` — time-bound acceptance snapshot superseded by code/current maps.
- `REPORT_V2.5_AUDIT.md` — old PASS matrix superseded by later audits and Workflow V2.
- `REPORT_V3.1_FULL_SYSTEM_AUDIT.md` — old PASS matrix superseded by later Workflow V2 implementation.

No file was permanently deleted.
