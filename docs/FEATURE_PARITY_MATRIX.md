# Feature parity matrix

Canonical scope inventory through Phase 02B. CORE_VERIFIED covers the implemented foundation, not all source feature options. UI visibility is never backend authorization. `legacy/firebase/` is reference only.

| Feature / source owner               | Required invariant                                                                       | SQL phase | Status                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| Login/AuthContext, LoginModal        | Server identity, no PIN fallback or token localStorage                                   | 01        | CORE_VERIFIED                                       |
| First run / BootstrapFirstRun        | One Developer; secret; race-safe; never anonymous takeover                               | 01        | CORE_VERIFIED                                       |
| Staff / provisioning service         | 8 roles; Admin cannot administer Admin/Developer                                         | 01        | CORE_VERIFIED                                       |
| Profile/password/session             | Self fields only; revoke sessions on sensitive changes                                   | 01        | CORE_VERIFIED                                       |
| Settings / ConfigContext             | Authorized writes, explicit remote errors and concurrency                                | 01        | CORE_VERIFIED                                       |
| Permissions / rules + workflowAuth   | Backend action/object policy; specialist roles remain exact                              | 01/02     | FOUNDATION_AND_PRODUCTION_IMPLEMENTED / 02C_PENDING |
| Custom role/user permission editor   | Do not permit UI permission overrides to bypass workflow authority                       | 02/04     | NOT_MIGRATED                                        |
| Customers / customerRepository       | Commercial writes, active identity dedup, soft delete, history, audit                    | 02A       | IMPLEMENTED                                         |
| CSV/XLSX / customer-import           | Normalize, preview, skip or explicit update, actor-scoped job and row results            | 02A       | IMPLEMENTED                                         |
| Sales orders / salesOrderRepository  | Draft, confirm, cancel and audit. Privileged reopen requires a delivered/completed order | 02A/02C   | SALES_IMPLEMENTED / DOWNSTREAM_PENDING              |
| Sales products                       | BAG quantity, stable item UUIDs, explicit production and finishing requirements          | 02A/02C   | SALES_IMPLEMENTED / FULFILLMENT_PENDING             |
| Saved designs                        | Immutable metadata versions, selection and reuse, audit                                  | 02A       | IMPLEMENTED                                         |
| Design image references              | Private registry ID on the design version                                                | 03        | ARCHITECTURE_ONLY                                   |
| Designer queue / QuickOrderComposer  | Technical instruction, priority, paged sources and unique/confident @printer matching    | 02B       | IMPLEMENTED                                         |
| Drafts / recovery                    | Creator-private SQL metadata; memory-only browser state; lost-response recovery          | 02B/03    | SQL_METADATA_IMPLEMENTED / DEVICE_BLOB_DEFERRED_03  |
| Batch official send                  | Idempotent receipts, max20 independent sends, per-row results                            | 02B       | IMPLEMENTED                                         |
| Production items/links               | Standalone, split/merge M:N and late links, immutable run history                        | 02B       | IMPLEMENTED                                         |
| Product allocation                   | Exact BAG quantity; zero TRACE never numeric; capacity and replacement caps              | 02B       | IMPLEMENTED                                         |
| Print images/instructions            | Preserved parser and sheet counts; no fake URL/bytes                                     | 02B/03    | METADATA_IMPLEMENTED / UPLOAD_UNAVAILABLE_03        |
| Plate/new/old/damage/reissue         | Parallel plate state; source action/object authority; history                            | 02B       | IMPLEMENTED                                         |
| Printer assignment/acceptance        | Assigned business user; safe pre-start reassignment                                      | 02B       | IMPLEMENTED                                         |
| Revision ACK/start                   | Exact latest revision; pending cancellation blocks start                                 | 02B       | IMPLEMENTED                                         |
| Print completion                     | Assigned printer; actual sheets and durable PENDING_02C handoffs                         | 02B/02C   | PRINT_IMPLEMENTED / FINISHING_EXECUTION_PENDING_02C |
| Reprint/supplemental runs            | New source-linked run; replacement excluded from requested-output totals                 | 02B       | IMPLEMENTED / ACCEPTANCE_RECONCILIATION_02C         |
| Cancellation                         | Separate request/assigned-printer response; release only own allocations                 | 02B       | IMPLEMENTED                                         |
| Production issues                    | Reporter cancels; selected recipients resolve/reassign; nonblocking                      | 02B       | IMPLEMENTED                                         |
| Urgent flags                         | Order and product metadata, with existing transition policy                              | 02A/B/C   | SALES_IMPLEMENTED / DOWNSTREAM_PENDING              |
| Product finishing / finishing_tasks  | Claim/complete; explicit no-work checkpoint                                              | 02C       | NOT_MIGRATED                                        |
| Legacy order-level finishing         | Reconcile with product-centric V2 before porting; no parallel legacy flow                | 02C       | NOT_MIGRATED                                        |
| Finished goods                       | Aggregate accepted product quantities; exact remaining stock                             | 02C       | NOT_MIGRATED                                        |
| Warehouse issues                     | Observed issue only; supplemental production decided upstream                            | 02C       | NOT_MIGRATED                                        |
| Dispatch                             | WAREHOUSE exact role; all required sibling products ready                                | 02C       | NOT_MIGRATED                                        |
| Shipping/ViettelPost settings        | Legal transition graph; sales authority; inspected returns                               | 02C       | NOT_MIGRATED                                        |
| Comments                             | Conversation cannot replace ACK/issues/cancellation                                      | 02B       | IMPLEMENTED                                         |
| Notifications/sound/voice            | Recipient scoped; private cache never persisted by SW                                    | 03        | NOT_MIGRATED                                        |
| Audit log                            | Transactional Foundation, customers, import, sales, design and production events         | 01/02/03  | FOUNDATION_02A_02B_IMPLEMENTED / 02C_PENDING        |
| Statistics/reports/export            | Backend authorized datasets; Recharts when real reporting exists                         | 02/03     | NOT_MIGRATED                                        |
| Image uploads/read/delete            | Private R2; validated staging; authorized registry                                       | 03        | ARCHITECTURE_ONLY                                   |
| Provider routing/failover            | Explicit new-project R2 config; no Firebase fallback                                     | 03        | ARCHITECTURE_ONLY                                   |
| Image backup/coverage/verify/restore | Bounded jobs; checksums; missing-only restore                                            | 03        | NOT_MIGRATED                                        |
| PWA/install/update/offline           | Public shell only; no private API caching                                                | 01        | CORE_VERIFIED                                       |
| User guide / deployment guide        | Replace Firebase operations with SQL; preserve workflow content                          | 01/04     | SQL_SETUP_DOCUMENTED / BUSINESS_GUIDE_PENDING       |
| Demo/role preview                    | Separate dev environment only; no production mutations                                   | 04        | DISABLED_IN_SQL                                     |
| UI shell/design tokens/themes        | shadcn/Radix, blue neutral enterprise, responsive 6 viewports                            | 01        | CORE_VERIFIED                                       |
| PC/Cloud handoff + CI                | One writer/branch, real DB tests, truthful evidence                                      | 01        | VERIFIED_LOCAL_AND_CI                               |

Phase 01 settings cover company/brand/catalog/threshold/polling fields. Source business feature toggles, custom permission editor, image/provider/backup administration and notification sound/voice remain deferred with their owning modules. R2/avatars are architecture only. Physical PWA/device and Hawk Host checks remain LOCAL_VALIDATION_REQUIRED. Test evidence: TEST_REPORT.md.
