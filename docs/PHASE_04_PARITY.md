# Phase 04: SQL parity and reference retirement

Scope authorized by the owner's next-task request on 2026-11-27. PC writer: `codex/phase-04-parity-cleanup`, parent `aacd3fb`. Deployment is Phase 05 and remains separately authorized. Executed evidence belongs to TEST_REPORT and HANDOFF.

## Reports

`GET /api/reports/production` and `.csv` use authenticated SQL data with `canViewReports` and, for export, `canExportExcel`. Default ceilings are Developer/Admin/Manager/Designer/Sale. Query requires inclusive `from`/`to` calendar dates, maximum 366 days, interpreted as Vietnam UTC+7 creation-day boundaries. Optional exact printer UUID, paper and official status; pages 1–100000, page size 1–100. Drafts are excluded. Planned sheets include cancelled orders, which are counted separately; actual and spoilage sum recorded values, preserving zero and null in detail. This does not infer sales revenue, costs or product output from sheet counts.

Aggregates operate on production orders, avoiding M:N product/allocation/image fanout. A correlated issue existence test counts affected orders once. Daily chart and tables share filters; printer/paper/creator tables show the first 100 groups by actual sheets, explicitly labelled. CSV is UTF-8 BOM/CRLF, quoted/escaped and formula-prefixed for untrusted text. More than 2000 matches is rejected; no silent truncated export or fake XLSX file. Read-only CSV downloads do not create server files.

## Access and modules

`GET /api/access` returns only the caller's effective permissions/features; only Developer receives the full policy. `PUT /api/access` is Developer-only, Origin/CSRF protected, strict, versioned, serialized and audited. User override > role override > current SQL baseline, always intersected with hard role ceiling and existing action/object checks. Changes in effective permissions revoke every affected user's sessions. Developer's fixed policy administration route stays available to avoid locking out recovery. Role changes still revoke sessions and cannot extend specialist authority.

The sixteen supported keys map to actual SQL actions: staff/settings, draft composition/revision/linking, dispatch including batches, urgent including draft changes, cancellation request/assigned response, assigned printer accept/ACK/wait/start/complete, plates, product finishing, issue report/selected resolution and reports/CSV. UI controls explain inheritance; server is authoritative. Source demo, purge-all, bulk-delete-orders and delete-official-order grants are intentionally retired, rather than exposing ineffective switches or destructive APIs. Old draft deletion is not a production purge contract.

Feature defaults preserve existing SQL availability. Production/finishing are required. Sales depends on customers; warehouse dispatch on sales; shipping on sales and warehouse. Disabled optional modules reject direct module commands and preserve authorized historical reads. Core downstream reconciliation continues so existing production and finishing stay consistent. Saved design image writes use the same library gate. Comments can be paused without replacing ACK/issues/cancellation. Sound/voice remain user opt-in and additionally respect the global sound flag. No API data or policy is persisted in localStorage.

## Private avatars

Migration 008 adds AVATAR registry targets, nullable users.avatar_registry_id with FK, one versioned access-policy row and a creation-time report index. Published migrations 001–007 are unchanged. Avatar targets must exist; users edit themselves, staff administrators remain subject to target-role hierarchy and effective staff permission. Only verified ACTIVE registry IDs for that exact user can link; arbitrary URLs, SVG/data URLs and unverified/stolen uploads are rejected. Unlinked uploads stay owner-private; linked avatars are available to authenticated staff directory viewers through the no-store private proxy. The same image quotas, decode/normalization, checksums, backups and logout/device-draft rules apply. Reference/quota/cleanup queries include current avatars. Removing an avatar unlinks it; bounded orphan cleanup may retire it later. No production bucket is used.

## Retired reference and regression mapping

Sanitized source provenance remains in SOURCE_PROVENANCE.md. The last full reference in this repository is commit `9231886544ec92415e7d9b8dce36f070a76c2489`, tree `legacy/firebase` = `4c5333b6bf1311a5b6ae513ffb3b9847f7843470`, 211 tracked files. It can be inspected with `git ls-tree -r 9231886 -- legacy/firebase` and `git show 9231886:legacy/firebase/<path>`; no private archive or second code copy is necessary. This removal does not modify the original repository.

| Former legacy test group  | SQL replacement or disposition                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth-initialization-state | Foundation HTTP and Playwright session/loading/F5/logout/error/locked user checks; no Firebase identity/profile gate remains                                                                                         |
| developer-demo-preview    | Retired by design: production has no demo/role impersonation route, SDK or persistent demo identity                                                                                                                  |
| production-eligibility    | Real Phase 02B HTTP tests for assigned specialist, ACK, plate parallelism, nonblocking issues, cancellation/start/completion; existing Playwright actions retained                                                   |
| submission-lock           | Ported shared synchronous lock, used by SQL QuickComposer and tested in tests/regression/workflow.test.ts; lost-response/idempotency browser/API checks retained                                                     |
| workflow-v2-local         | Parser, typo-tolerant unique active-printer selection ported regression; SQL drafts/version conflict/idempotency browser/API replace old localStorage-wins repository; intentionally no old local authority fallback |

`test:regression` is canonical; `test:legacy` remains a compatibility alias to SQL regressions only. CI uses the canonical command. No Firebase emulator suite is represented as SQL integration coverage. Runtime validation checks the current source graph, lockfile, compiled artifacts and service worker.

## User guide and session boundaries

The authenticated `#help` workspace provides role-based business instructions for sales, design, printing, finishing, warehouse/logistics, images, reports and administration. The guide does not invent pending stock/replacement policies. Late unauthorized responses carry the request session identity: responses from a prior logout/login cannot erase a new session, and repeated expiry events are idempotent. Foundation logout/password/role checks and a delayed-401 browser regression cover the boundary.

## Remaining gates

This phase completes implemented source parity where policy is defined. It does not close physical non-printing entry, replacement/rejected REPRINT reconciliation, damaged/held returns, shared-phone identity, or import/notification/change/backup retention policies. Dedicated R2 dev acceptance, native hosting compatibility, physical mobile/PWA/audio and Hawk Host account validation remain LOCAL_VALIDATION_REQUIRED. The owner explicitly chose local testing with no R2 dev bucket. External carrier API and live deployment are not introduced.
