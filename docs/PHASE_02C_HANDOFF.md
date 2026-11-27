# Phase 02C handoff

PC, 2026-11-27. Source branch `codex/phase-02b-production`. Tested code `d5383080644b06a34cc3f09db78de3196f098e55`; exact test/CI evidence is in [PHASE_02B_TEST_REPORT.md](PHASE_02B_TEST_REPORT.md). 02A was accepted locally on Windows before 02B. This document prepares Cloud continuation; **02C is not authorized by the completed PC task**. Claim a separate branch after a new owner request. Do not merge main or PR #1 automatically.

## Receive safely

Fetch origin, inspect status/upstream/history and latest HANDOFF. GitHub is canonical; local .env/DB/screenshots are not shared with Cloud. Use Node 22.22.2/npm 10.9.7, npm ci and a separate MariaDB 11.4.9 dev/test setup. Migrate 001–005 without changing published checksums. Integration/browser tests reset only guarded synthetic test data with ALLOW_TEST_DATABASE=1. One writer per branch; PC releases ownership after the final documentation checkpoint.

## Owning files and data

`server/migrations/004_production.sql`, `005_production_link_handoff.sql`; contracts `shared/production.ts`; production repository/routes and `server/services/production-workflow.ts`; UI `src/components/production/`; integration and Playwright `phase-02b` suites. Full workflow/parity/authority are in DECISIONS, FEATURE_PARITY_MATRIX, AUTHORIZATION_MATRIX, DATABASE_SCHEMA and API_CONTRACT. Read the isolated legacy finishing/fulfillment/warehouse/shipping workflows before implementing.

Production orders are official from WAITING_ACCEPTANCE through PRINTED/CANCELLED. DRAFT is creator-private. Product BAG quantity is not `total_sheets`, print-image sheet_count or actual/spoilage sheets. Allocations are M:N. Only ACTIVE OUTPUT consumes requested production capacity; PROPOSED is a draft, RELEASED preserves cancellation history. TRACE is zero and never numeric output. REPRINT references a PRINTED source OUTPUT allocation and is capped replacement; supplemental OUTPUT fits remaining demand. Never convert legacy zero links to quantities.

Completion writes `production_finishing_handoffs` with status PENDING_02C. A linked row references one allocation and carries exact quantity and the sales product's requires_finishing flag. False still needs the explicit no-work finishing checkpoint. Standalone output can carry a handoff with NULL allocation. Late sales association supersedes that original handoff using superseded_at and creates new per-allocation handoffs; **exclude superseded rows from acceptance**. Keep their history. `production_design_prints` prevents duplicate library usage and retains actual printer/time through late association.

## Required 02C contract

1. Add explicit migrations after 005. Introduce product finishing tasks, accepted output/stock and whole-order dispatch/shipping with FKs, optimistic versions, audit, commit-ordered invalidation and idempotency.
2. Consume each eligible non-superseded pending handoff once. Preserve its source allocation and run; do not derive product output from print sheets. Model acceptance/rejection and replacement provenance explicitly. Reprint output must replace inspected/rejected original output; never add both to accepted stock beyond the ordered cap. Agree operational replacement rules with the owner before enabling acceptance.
3. Printed products pass finishing even when requires_finishing=false, using explicit no-work confirmation. Assigned/claiming FINISHER acts with exact specialist authority. No Admin/Manager blanket bypass. Handle cancellation and sibling readiness transactionally.
4. Non-printing confirmed 02A products remain commercially CONFIRMED; route them to real finishing/stock only when those modules exist. Preserve existing customer/design snapshots and flags. No guessed stock bootstrap.
5. Warehouse dispatch is exact WAREHOUSE authority, all active sibling products ready and enough accepted goods for the entire order. Prevent partial whole-order export and double dispatch. Returns re-enter accepted stock only after inspection.
6. Keep current production ACK/start/plate/issue/cancellation invariants. Technical changes lock after printing begins. Completing print alone is never completion of finishing or shipping.
7. Private R2/uploads/backup/notifications remain 03, physical/Hawk Host validation later. Do not introduce mandatory Redis/Docker/workers/WebSocket or a second database runtime.

## Next commands and owner walk-through

Run npm ci, npm run db:migrate, typecheck, lint, test, test:legacy, test:integration, build, check:runtime, test:restart and test:e2e (DB suites sequential). Fresh schema CI uses its own disposable MariaDB. Check the known obsolete MANAGER dispatch assertion separately; do not change WAREHOUSE policy to satisfy it.

PC app is intended at http://localhost:4100. Dev data is separate from all synthetic tests. If first setup is still open, the owner reads SETUP_SECRET privately from ignored .env and creates their own Developer. Create Designer/Printer/Sale accounts, create/confirm sales products, review the design queue, save/F5/reopen drafts, dispatch, log in as the assigned printer in another browser, accept/ACK/start/complete. Verify PENDING_02C without stock. Test cancellation before printing and reprint from a PRINTED run. Owner decisions remain shared phone identities, import retention, direct-route fulfillment and replacement acceptance operations.
