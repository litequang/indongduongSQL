# Project status

Cloud handoff, 2026-11-26. Task branch `codex/phase-02a-sales-design`, based on `codex/sql-foundation` at `2425a42cf0a6618dac653b2ebbb8010e29edcad1`. See [HANDOFF.md](HANDOFF.md) for the tested commit and [PHASE_02A_TEST_REPORT.md](PHASE_02A_TEST_REPORT.md) for test and CI status.

## Delivered

- Phase 00 and Phase 01 with UI Foundation are inherited from the PC branch.
- Customers have commercial CRUD, soft retirement, indexed duplicate identity, contact and external reference fields, server-side search/filter/sort/page, order history, per-record audit and optimistic versions.
- Customer imports support UTF-8 CSV and XLSX, mapped preview, skip or explicit duplicate updates, bounded resumable jobs, per-row outcomes and persisted actor-scoped history.
- Sales covers multi-item draft creation/editing, commercial confirmation and cancellation, unique codes, per-product requirements and quantities, audit and immutable customer/design snapshots. Admin/Developer reopen requires an eligible downstream status.
- Saved designs have searchable metadata, grid/list views, append-only versions, audit and version reuse in sales. Migration 003 and the incremental invalidation feed serve the four modules.

## Pending phases

Phase 02B owns Designer queue, quick composer, production orders, M:N links, revisions and printer workflow. Phase 02C owns finishing, accepted stock and shipment. Phase 03 owns private R2, notifications and backup. Real Hawk Host hosting and physical devices remain LOCAL_VALIDATION_REQUIRED. See [FEATURE_PARITY_MATRIX.md](FEATURE_PARITY_MATRIX.md) and [PHASE_02B_HANDOFF.md](PHASE_02B_HANDOFF.md).
