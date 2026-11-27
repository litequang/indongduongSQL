# Project status

PC handoff, 2026-11-27. Task branch `codex/phase-02b-production`, based on accepted Phase 02A `f6490410d9c8b3cf0deb47c527622a8df6384740`. Tested code `d5383080644b06a34cc3f09db78de3196f098e55`. Phase 00/01/UI Foundation and Phase 02A are inherited and locally accepted; Phase 02B production is implemented. This is not a merged main release. See [HANDOFF.md](HANDOFF.md), [PHASE_02A_PC_ACCEPTANCE.md](PHASE_02A_PC_ACCEPTANCE.md) and [PHASE_02B_TEST_REPORT.md](PHASE_02B_TEST_REPORT.md) for actual evidence/CI.

## Delivered

Local verification passes 30/30 real DB/HTTP results and 14/14 browser suites. [GitHub Actions 45926107238](https://github.com/litequang/indongduongSQL/actions/runs/45926107238) completed success at the exact tested code checkpoint above. Detailed PASS/known legacy FAIL/SKIP evidence belongs to TEST_REPORT and its linked reports.

- Phase 00 and Phase 01 with UI Foundation are inherited from the PC branch.
- Customers have commercial CRUD, soft retirement, indexed duplicate identity, contact and external reference fields, server-side search/filter/sort/page, order history, per-record audit and optimistic versions.
- Customer imports support UTF-8 CSV and XLSX, mapped preview, skip or explicit duplicate updates, bounded resumable jobs, per-row outcomes and persisted actor-scoped history.
- Sales covers multi-item draft creation/editing, commercial confirmation and cancellation, unique codes, per-product requirements and quantities, audit and immutable customer/design snapshots. Admin/Developer reopen requires an eligible downstream status.
- Saved designs have searchable metadata, grid/list views, append-only versions, audit and version reuse in sales. Migration 003 and the incremental invalidation feed serve the four modules.
- Production adds paged Designer queue/technical review, quick text parser and unique printer matching, creator-private recoverable SQL drafts, bounded idempotent batch sends, unique codes and independent/split/merged runs with exact M:N BAG allocations.
- Parallel plate lifecycle, assigned-printer workspace/acceptance, technical revision/ACK/start/complete, urgency, recipient-scoped issues, comments and pre-print cancellation are backend-authoritative. Cancellation retains and releases only its allocations; reassignment removes former-printer access and invalidates its view.
- Print completion records actual/spoilage sheets and explicit pending 02C handoffs. Supplemental/reprint runs retain source history and avoid double-counting requested product output. Official standalone runs can be linked after printing with superseded handoff history and exactly-once design usage. Migrations 004/005 follow unchanged 001–003.

## Pending phases

Phase 02C owns finishing/no-work acceptance, stock, sibling readiness, whole-order dispatch and shipment. It is not implemented or authorized by this PC task; [PHASE_02C_HANDOFF.md](PHASE_02C_HANDOFF.md) prepares the next owner. Phase 03 owns private R2, device Blob attachments, notifications and backup. SQL metadata drafts are durable only after acknowledged Save; browser state/cache remains memory-only. Unavailable actions are explicit on UI. Full source parity is not claimed. Real Hawk Host hosting and physical devices remain LOCAL_VALIDATION_REQUIRED. [FEATURE_PARITY_MATRIX.md](FEATURE_PARITY_MATRIX.md) owns detailed coverage.

Local environment: Windows, Node 22.22.2/npm 10.9.7, dedicated MariaDB 11.4.9 at 127.0.0.1:3307, distinct dev/test accounts. Local app URL http://localhost:4100. Test fixtures remain only in the guarded test DB; owner development setup/data is separate. Shared phone identities, import retention, direct-route fulfillment and operational replacement acceptance remain owner decisions.
