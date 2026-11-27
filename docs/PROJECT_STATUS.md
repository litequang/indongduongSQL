# Project status

Cloud, 2026-11-27. Branch `codex/phase-02c-fulfillment` starts at the Phase 02B production handoff `54e14508acb40033ac5005eb64990007b22c1632`. Phase 00, 01, UI Foundation and 02A/B are inherited. See [HANDOFF.md](HANDOFF.md) and [PHASE_02C_TEST_REPORT.md](PHASE_02C_TEST_REPORT.md) for the code checkpoint and executed evidence.

## Delivered

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

Phase 03 owns private R2, Blob drafts, backups and notifications. Physical devices and Hawk Host remain LOCAL_VALIDATION_REQUIRED. Shared customer phone identity and import retention remain owner decisions. [FEATURE_PARITY_MATRIX.md](FEATURE_PARITY_MATRIX.md) records detailed coverage.
