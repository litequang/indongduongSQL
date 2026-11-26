# Feature parity matrix

Canonical scope inventory through Phase 02A. CORE_VERIFIED covers the implemented foundation, not all source feature options. UI visibility is never backend authorization. `legacy/firebase/` is reference only.

| Feature / source owner | Required invariant | SQL phase | Status |
|---|---|---|---|
| Login/AuthContext, LoginModal | Server identity, no PIN fallback or token localStorage | 01 | CORE_VERIFIED |
| First run / BootstrapFirstRun | One Developer; secret; race-safe; never anonymous takeover | 01 | CORE_VERIFIED |
| Staff / provisioning service | 8 roles; Admin cannot administer Admin/Developer | 01 | CORE_VERIFIED |
| Profile/password/session | Self fields only; revoke sessions on sensitive changes | 01 | CORE_VERIFIED |
| Settings / ConfigContext | Authorized writes, explicit remote errors and concurrency | 01 | CORE_VERIFIED |
| Permissions / rules + workflowAuth | Backend action/object policy; current specialist roles remain exact | 01/02 | FOUNDATION_VERIFIED / WORKFLOWS_PENDING |
| Custom role/user permission editor | Do not permit UI permission overrides to bypass workflow authority | 02/04 | NOT_MIGRATED |
| Customers / customerRepository | Commercial writes, active identity dedup, soft delete, history, audit | 02A | IMPLEMENTED |
| CSV/XLSX / customer-import | Normalize, preview, skip or explicit update, actor-scoped job and row results | 02A | IMPLEMENTED |
| Sales orders / salesOrderRepository | Draft, confirm, cancel and audit. Privileged reopen requires a delivered/completed order | 02A/02C | SALES_IMPLEMENTED / DOWNSTREAM_PENDING |
| Sales products | BAG quantity, stable item UUIDs, explicit production and finishing requirements | 02A/02C | SALES_IMPLEMENTED / FULFILLMENT_PENDING |
| Saved designs | Immutable metadata versions, selection and reuse, audit | 02A | IMPLEMENTED |
| Design image references | Private registry ID on the design version | 03 | ARCHITECTURE_ONLY |
| Designer queue / QuickOrderComposer | Free technical text and unique/confident @printer matching | 02B | NOT_MIGRATED |
| Device drafts / IndexedDB | Local Blob authority; explicit recovery, no false official success | 02B | NOT_MIGRATED |
| Batch official send | Idempotency and per-row partial success | 02B | NOT_MIGRATED |
| Production items/links | Standalone runs valid; split/merge M:N; supplemental run history | 02B | NOT_MIGRATED |
| Product allocation | Exact quantity; never derive from totalSheets/sheetCount | 02B | NOT_MIGRATED |
| Print images/instructions | Preserve text parser and distinct sheet counts | 02B | NOT_MIGRATED |
| Plate/new/old/damage/reissue | Parallel plate state; ownership and immutable history | 02B | NOT_MIGRATED |
| Printer assignment/acceptance | Assigned business user; safe pre-start reassignment | 02B | NOT_MIGRATED |
| Revision ACK/start | ACK latest revision; pending cancellation blocks start | 02B | NOT_MIGRATED |
| Print completion | Assigned printer; transactional finishing fan-out | 02B | NOT_MIGRATED |
| Reprint/supplemental runs | Link to original product without overwriting prior run | 02B | NOT_MIGRATED |
| Cancellation | Separate workflow; assigned printer responds before start | 02B | NOT_MIGRATED |
| Production issues | Reporter cancels; recipients resolve; current issues non-blocking | 02B | NOT_MIGRATED |
| Urgent flags | Order and product metadata, with existing transition policy | 02A/B/C | SALES_IMPLEMENTED / DOWNSTREAM_PENDING |
| Product finishing / finishing_tasks | Claim/complete; explicit no-work checkpoint | 02C | NOT_MIGRATED |
| Legacy order-level finishing | Reconcile with product-centric V2 before porting; no parallel legacy flow | 02C | NOT_MIGRATED |
| Finished goods | Aggregate accepted product quantities; exact remaining stock | 02C | NOT_MIGRATED |
| Warehouse issues | Observed issue only; supplemental production decided upstream | 02C | NOT_MIGRATED |
| Dispatch | WAREHOUSE exact role; all required sibling products ready | 02C | NOT_MIGRATED |
| Shipping/ViettelPost settings | Legal transition graph; sales authority; inspected returns | 02C | NOT_MIGRATED |
| Comments | Conversation cannot replace ACK/issues/cancellation | 02B | NOT_MIGRATED |
| Notifications/sound/voice | Recipient scoped; private cache never persisted by SW | 03 | NOT_MIGRATED |
| Audit log | Transactional administration, customers, import, sales and design. Additional business stages pending | 01/02/03 | FOUNDATION_AND_02A_IMPLEMENTED |
| Statistics/reports/export | Backend authorized datasets; Recharts when real reporting exists | 02/03 | NOT_MIGRATED |
| Image uploads/read/delete | Private R2; validated staging; authorized registry | 03 | ARCHITECTURE_ONLY |
| Provider routing/failover | Explicit new-project R2 config; no Firebase fallback | 03 | ARCHITECTURE_ONLY |
| Image backup/coverage/verify/restore | Bounded jobs; checksums; missing-only restore | 03 | NOT_MIGRATED |
| PWA/install/update/offline | Public shell only; no private API caching | 01 | CORE_VERIFIED |
| User guide / deployment guide | Replace Firebase operations with SQL; preserve workflow content | 01/04 | SQL_SETUP_DOCUMENTED / BUSINESS_GUIDE_PENDING |
| Demo/role preview | Separate dev environment only; no production mutations | 04 | DISABLED_IN_SQL |
| UI shell/design tokens/themes | shadcn/Radix, blue neutral enterprise, responsive 6 viewports | 01 | CORE_VERIFIED |
| PC/Cloud handoff + CI | One writer/branch, real DB tests, truthful evidence | 01 | VERIFIED_LOCAL_AND_CI |

Phase 01 settings cover company/brand/catalog/threshold/polling fields. Source business feature toggles, custom permission editor, image/provider/backup administration and notification sound/voice remain deferred with their owning modules. R2/avatars are architecture only. Physical PWA/device and Hawk Host checks remain LOCAL_VALIDATION_REQUIRED. Test evidence: TEST_REPORT.md.
