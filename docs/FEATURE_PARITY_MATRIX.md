# Feature parity matrix

Canonical scope inventory through local Phase 03 implementation. CORE_VERIFIED covers the implemented foundation, not all source feature options. Live R2 acceptance is LOCAL_VALIDATION_REQUIRED (owner has no dev bucket yet). UI visibility is never backend authorization. `legacy/firebase/` is reference only.

| Feature / source owner               | Required invariant                                                                       | SQL phase | Status                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | --------- | --------------------------------------------------- |
| Login/AuthContext, LoginModal        | Server identity, no PIN fallback or token localStorage                                   | 01        | CORE_VERIFIED                                       |
| First run / BootstrapFirstRun        | One Developer; secret; race-safe; never anonymous takeover                               | 01        | CORE_VERIFIED                                       |
| Staff / provisioning service         | 8 roles; Admin cannot administer Admin/Developer                                         | 01        | CORE_VERIFIED                                       |
| Profile/password/session             | Self fields only; revoke sessions on sensitive changes                                   | 01        | CORE_VERIFIED                                       |
| Settings / ConfigContext             | Authorized writes, explicit remote errors and concurrency                                | 01        | CORE_VERIFIED                                       |
| Permissions / rules + workflowAuth   | Backend action/object policy; specialist roles remain exact                              | 01/02     | IMPLEMENTED_THROUGH_02C |
| Custom role/user permission editor   | Do not permit UI permission overrides to bypass workflow authority                       | 02/04     | NOT_MIGRATED                                        |
| Customers / customerRepository       | Commercial writes, active identity dedup, soft delete, history, audit                    | 02A       | IMPLEMENTED                                         |
| CSV/XLSX / customer-import           | Normalize, preview, skip or explicit update, actor-scoped job and row results            | 02A       | IMPLEMENTED                                         |
| Sales orders / salesOrderRepository  | Draft, confirm, cancel and audit. Privileged reopen requires a delivered/completed order | 02A/02C   | IMPLEMENTED_WITH_FULFILLMENT |
| Sales products                       | BAG quantity, stable item UUIDs, explicit production and finishing requirements          | 02A/02C   | IMPLEMENTED / NON_PRINTING_SOURCE_POLICY_PENDING |
| Saved designs                        | Immutable metadata versions, selection and reuse, audit                                  | 02A       | IMPLEMENTED                                         |
| Design image references              | Private registry ID on the immutable design version                                      | 03        | IMPLEMENTED_LOCAL / LIVE_R2_PENDING |
| Designer queue / QuickOrderComposer  | Technical instruction, priority, paged sources and unique/confident @printer matching    | 02B       | IMPLEMENTED                                         |
| Drafts / recovery                    | SQL metadata; explicit account/target/slot device File drafts; logout purge               | 02B/03    | IMPLEMENTED_LOCAL / PHYSICAL_DEVICE_PENDING |
| Batch official send                  | Idempotent receipts, max20 independent sends, per-row results                            | 02B       | IMPLEMENTED                                         |
| Production items/links               | Standalone, split/merge M:N and late links, immutable run history                        | 02B       | IMPLEMENTED                                         |
| Product allocation                   | Exact BAG quantity; zero TRACE never numeric; capacity and replacement caps              | 02B       | IMPLEMENTED                                         |
| Print images/instructions            | Actual decoded bytes, immutable registry linkage, assigned-printer read scope             | 02B/03    | IMPLEMENTED_LOCAL / LIVE_R2_PENDING |
| Plate/new/old/damage/reissue         | Parallel plate state; source action/object authority; history                            | 02B       | IMPLEMENTED                                         |
| Printer assignment/acceptance        | Assigned business user; safe pre-start reassignment                                      | 02B       | IMPLEMENTED                                         |
| Revision ACK/start                   | Exact latest revision; pending cancellation blocks start                                 | 02B       | IMPLEMENTED                                         |
| Print completion                     | Assigned printer; actual sheets and durable PENDING_02C handoffs                         | 02B/02C   | IMPLEMENTED |
| Reprint/supplemental runs            | New source-linked run; replacement excluded from requested-output totals                 | 02B       | SUPPLEMENTAL_IMPLEMENTED / REPLACEMENT_ACCEPTANCE_PENDING |
| Cancellation                         | Separate request/assigned-printer response; release only own allocations                 | 02B       | IMPLEMENTED                                         |
| Production issues                    | Reporter cancels; selected recipients resolve/reassign; nonblocking                      | 02B       | IMPLEMENTED                                         |
| Urgent flags                         | Order and product metadata, with existing transition policy                              | 02A/B/C   | IMPLEMENTED |
| Product finishing / finishing_tasks  | Claim/complete; explicit no-work checkpoint                                              | 02C       | IMPLEMENTED |
| Legacy order-level finishing         | Reconcile with product-centric V2 before porting; no parallel legacy flow                | 02C       | REPLACED_BY_PRODUCT_WORKFLOW |
| Finished goods                       | Aggregate accepted product quantities; exact remaining stock                             | 02C       | IMPLEMENTED_FOR_ELIGIBLE_OUTPUT |
| Warehouse issues                     | Observed issue only; supplemental production decided upstream                            | 02C       | IMPLEMENTED |
| Dispatch                             | WAREHOUSE exact role; all required sibling products ready                                | 02C       | IMPLEMENTED |
| Shipping/ViettelPost settings        | Legal transition graph; sales authority; inspected returns                               | 02C       | MANUAL_LOGISTICS_IMPLEMENTED / EXTERNAL_API_DEFERRED |
| Comments                             | Conversation cannot replace ACK/issues/cancellation                                      | 02B       | IMPLEMENTED                                         |
| Notifications/sound/voice            | Transactional recipient rows/read state, opt-in sound/speech, no private SW cache          | 03        | IMPLEMENTED_LOCAL / DEVICE_AUDIO_PENDING |
| Audit log                            | Transactional Foundation, business, fulfillment and image administration events          | 01/02/03  | IMPLEMENTED_THROUGH_03 |
| Statistics/reports/export            | Backend authorized datasets; Recharts when real reporting exists                         | 02/03     | NOT_MIGRATED                                        |
| Image uploads/read/delete            | Private R2; 5-minute ticket, full decode, SHA-256, authorized registry                     | 03        | IMPLEMENTED_LOCAL / LIVE_R2_PENDING |
| Provider routing/failover            | Explicit isolated environment/buckets; no implicit alternate provider                    | 03        | IMPLEMENTED / NO_FALLBACK_BY_DESIGN |
| Image backup/coverage/verify/restore | <=500 IDs/job + continuation; one image/request, checksums, missing-only restore           | 03        | IMPLEMENTED_LOCAL / LIVE_R2_PENDING |
| PWA/install/update/offline           | Public shell only; no private API caching                                                | 01        | CORE_VERIFIED                                       |
| User guide / deployment guide        | Replace Firebase operations with SQL; preserve workflow content                          | 01/04     | SQL_SETUP_DOCUMENTED / BUSINESS_GUIDE_PENDING       |
| Demo/role preview                    | Separate dev environment only; no production mutations                                   | 04        | DISABLED_IN_SQL                                     |
| UI shell/design tokens/themes        | shadcn/Radix, blue neutral enterprise, responsive 6 viewports                            | 01        | CORE_VERIFIED                                       |
| PC/Cloud handoff + CI                | One writer/branch, real DB tests, truthful evidence                                      | 01        | VERIFIED_LOCAL_AND_CI                               |

Phase 01 settings cover company/brand/catalog/threshold/polling fields. Business feature toggles, custom permission editor, avatars and advanced reports remain pending. Phase 03 image administration and notification preferences are implemented locally; R2, physical PWA/device/audio and Hawk Host checks remain LOCAL_VALIDATION_REQUIRED. [PRIVATE_OPERATIONS.md](PRIVATE_OPERATIONS.md) owns operations and limits. Test evidence: TEST_REPORT.md.
