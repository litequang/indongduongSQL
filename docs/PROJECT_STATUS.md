# Project status

PC, 2026-11-27. Branch `codex/phase-03-private-operations` starts at Cloud 02C handoff `5d5af17c26ad08fc844ece0c1a6f22e00692248e`, tested Cloud code `ddf3e88f415a7df0a499bb011c3a2a1b0ef56a95`. Tested PC code **9231886544ec92415e7d9b8dce36f070a76c2489**. Owner authorized the next phase and explicitly selected local implementation/testing with R2 dev acceptance pending. Phase 00, 01, UI Foundation and 02A/B/C are inherited. [HANDOFF.md](HANDOFF.md) records the immutable checkpoint and remote CI; [TEST_REPORT.md](TEST_REPORT.md) indexes evidence.

## Delivered

- Phase 03 local implementation: owner/target-scoped upload tickets, actual image decoding/normalization, immutable conditional R2 writes, active registry FKs and relationship-authorized no-store downloads. Design versions and production print images can hold verified attachments; official runs are immutable and reassignment revokes former-printer image access.
- Explicit device File drafts recover on reopening the same saved SQL draft, with quota/network errors and logout/session-expiry purge. API/session data remain memory-only and outside service-worker caches.
- Transactional recipient notifications with private read state, pagination, focus/reconnect polling and optional sound/speech UI preferences. No external messaging or browser push service.
- Developer image backup/coverage/verify/missing-only restore jobs, bounded 500-ID groups and one image per request, per-image result review, retry/resume and old unreferenced-image cleanup. Migration 007 follows unchanged 001–006. These image jobs do not replace operational MariaDB backups. [PRIVATE_OPERATIONS.md](PRIVATE_OPERATIONS.md) owns lifecycle/limits.

- Phase 00 and Phase 01 with UI Foundation are inherited from the PC branch.
- Customers have commercial CRUD, soft retirement, indexed duplicate identity, contact and external reference fields, server-side search/filter/sort/page, order history, per-record audit and optimistic versions.
- Customer imports support UTF-8 CSV and XLSX, mapped preview, skip or explicit duplicate updates, bounded resumable jobs, per-row outcomes and persisted actor-scoped history.
- Sales covers multi-item draft creation/editing, commercial confirmation and cancellation, unique codes, per-product requirements and quantities, audit and immutable customer/design snapshots. Admin/Developer reopen requires an eligible downstream status.
- Saved designs have searchable metadata, grid/list views, append-only versions, audit and version reuse in sales. Migration 003 and the incremental invalidation feed serve the four modules.
- Production adds paged Designer queue/technical review, quick text parser and unique printer matching, creator-private recoverable SQL drafts, bounded idempotent batch sends, unique codes and independent/split/merged runs with exact M:N BAG allocations.
- Parallel plate lifecycle, assigned-printer workspace/acceptance, technical revision/ACK/start/complete, urgency, recipient-scoped issues, comments and pre-print cancellation are backend-authoritative. Cancellation retains and releases only its allocations; reassignment removes former-printer access and invalidates its view.
- Print completion records actual/spoilage sheets and explicit pending 02C handoffs. Supplemental/reprint runs retain source history and avoid double-counting requested product output. Official standalone runs can be linked after printing with superseded handoff history and exactly-once design usage. Migrations 004/005 follow unchanged 001–003.

- Phase 02C adds explicit once-only receipt of print handoffs, assigned or claimable product finishing, no-work checkpoints, quantity inspection and stock receipts. Standalone lots use their production source. Positive OUTPUT quantities conserve the original order cap.
- Inventory is lot-based with movement history. WAREHOUSE dispatches all active siblings in one transaction. Sales authority creates and advances shipments by command, records failed delivery and inspects each returned line. Available stock increases only for lines confirmed as restockable.
- Sales progress reports source quantities and real stages through delivery. Delivery completes a whole order. Orders with dispatch history retain their history and the prior force-reopen action is blocked.

## Pending phases and owner decisions

Non-printing products remain commercially confirmed and show the required physical source decision. REPRINT handoffs remain traceable and blocked from acceptance until the owner confirms how to reconcile the original, rejected and replacement quantities. Mixed/damaged/held returns keep the outstanding dispatch open for follow-up. Replacement and reconciliation of those held or lost goods need operating instructions.

Phase 03 code is implemented and tested locally with real MariaDB, real selected/decoded files and isolated object transport. Dedicated R2 primary/backup buckets are unavailable by owner confirmation, so live R2 acceptance remains LOCAL_VALIDATION_REQUIRED; the app fails explicitly when storage is unconfigured. Physical devices/audio and Hawk Host/native sharp support also remain LOCAL_VALIDATION_REQUIRED. Phase 04 source removal/full parity and Phase 05 deployment need a new task. Shared customer phone identity and import retention remain owner decisions. [FEATURE_PARITY_MATRIX.md](FEATURE_PARITY_MATRIX.md) records detailed coverage.
