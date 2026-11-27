# PC / Cloud handoff

Owner: **PC**, 2026-11-27. Branch: **codex/phase-02b-production**. Base: accepted Cloud Phase 02A `f6490410d9c8b3cf0deb47c527622a8df6384740`. Tested code: **d5383080644b06a34cc3f09db78de3196f098e55**. This documentation-only checkpoint follows that immutable code SHA. PC completes acceptance of 02A and implementation/verification of 02B, then releases branch ownership after this handoff commit. No parallel writer or delegated agent was used. Phase 02C needs a new task and its own branch. Main/PR #1 were not merged; the original Firebase repository and other projects were untouched.

## Delivered and files

- 02A Windows acceptance: npm ci, actual MariaDB upgrade, complete Foundation/02A regression, compiled process persistence, browser screenshots. [PHASE_02A_PC_ACCEPTANCE.md](PHASE_02A_PC_ACCEPTANCE.md). Optional local:db now waits for readiness.
- 02B Designer queue/technical review, quick parser/unique printer matching, owner-private SQL drafts, bounded idempotent batch dispatch, unique LIN codes, independent/split/merged M:N product allocation and late sales linking.
- Assigned-printer accept/ACK/start/complete, technical revisions/reassignment, parallel plate send/receive/damage/reissue, urgent flags, recipient-scoped issues and explicit cancellation request/response, immutable history/comments/audit.
- Actual/spoilage sheets, source-preserving supplemental/reprint runs and pending 02C handoffs. Zero TRACE is never output; replacement does not add ordered product output. Late linking retains superseded handoff history and counts design use once. No fake finishing completion/stock/shipment.
- Owners: shared/production.ts and ported parser/matcher; server/routes/production.ts, repositories/production.ts, services/production-workflow.ts; sales cancellation and scoped invalidations; src/components/production/ and minimal App/module wiring; integration/e2e/reset/restart/CI scripts. DATABASE_SCHEMA/API_CONTRACT/AUTHORIZATION_MATRIX/DECISIONS describe the contract. [FEATURE_PARITY_MATRIX.md](FEATURE_PARITY_MATRIX.md) owns coverage.

## Migrations and environment

Added **004_production.sql** and **005_production_link_handoff.sql** after 003; 001–003 checksums unchanged. 004 creates production, allocation, technical/revision, plates/issues/cancellation, comments, receipts and handoffs; 005 adds superseded handoffs/design-print ledger. Dev DB migrated 001/002 → 003 → 004 → 005; reruns no-op. Fresh and upgrade/concurrent-runner checks pass on a separate real MariaDB 11.4.9 instance. The initial unpublished 004 failure and explicit inspected repair are recorded in the test report; no destructive reset or silent partial-DDL recovery. Cold Windows migrations use a bounded 60-second named-lock wait.

Windows PowerShell, Node 22.22.2/npm 10.9.7, dedicated MariaDB 11.4.9 at 127.0.0.1:3307. Dev/test accounts and schemas differ. Ignored private .env and admin helper files are PC-only; do not copy secrets to Cloud or Git. Fresh-probe credentials are generated and their separate instance is shut down. Main project DB survives an actual graceful shutdown/start with identical snapshots/session count. Existing MySQL and other projects were not modified. Local workspace E:\CODE\indongduongSQL; app URL **http://localhost:4100**. Owner dev data/setup remains separate from synthetic tests.

## Executed evidence

All exit **0**: npm ci; typecheck; lint; unit **4/4**; preserved legacy groups **5/5**; real MariaDB/HTTP integration **30/30**; build; runtime/PWA exclusion; migration fresh/upgrade/concurrency/rerun; graceful MariaDB restart; two compiled Node processes preserving session and customer/sales/design/full production details; Playwright **14/14**, six viewports × two themes and axe. 02B captures 72 synthetic screenshots per matrix run; Foundation and 02A retain their coverage. Gitleaks staged/history and git diff --check pass. Screenshots/logs/traces are ignored local artifacts or short-lived CI artifacts, never private production data. [PHASE_02B_TEST_REPORT.md](PHASE_02B_TEST_REPORT.md)

Remote Ubuntu CI [45926107238](https://github.com/litequang/indongduongSQL/actions/runs/45926107238) **completed success** at exactly `d5383080644b06a34cc3f09db78de3196f098e55`. All steps passed, including real MariaDB, compiled restart, full Playwright and browser-evidence upload. Documentation-only handoff pushes skip CI; this tested code SHA remains the immutable reference.

Known nonblocking baseline: standalone legacy prompt14 permission test FAIL exit 1 because it expects MANAGER warehouse dispatch; the current exact WAREHOUSE policy is intentionally unchanged. Firebase emulator suites SKIP. Vendor size/Zod annotation, deprecated ESLint and Playwright color-environment warnings remain nonblocking. Physical devices, Hawk Host account/runtime/proxy/limits and live R2 are LOCAL_VALIDATION_REQUIRED, not passed by browser emulation.

## Pending and resume

No 02C finishing/stock/dispatch/shipping or Phase 03 upload/notifications/backup execution is included. Device Blob/offline attachment drafts are deferred; acknowledged SQL metadata drafts are implemented and private browser caches remain memory-only. Read [PHASE_02C_HANDOFF.md](PHASE_02C_HANDOFF.md) before the next authorized phase. Owner policies pending: shared-phone identity, import retention, direct non-printing routes and replacement acceptance/rejection operations. None were silently changed.

1. Fetch origin, inspect clean/dirty state, branch/upstream/history and this tested SHA. Preserve local work. Claim a distinct task branch for Cloud; never force-push or auto-merge main/PR #1.
2. Use committed Node version/lockfile and isolated MariaDB credentials. `npm ci`, `npm run db:migrate`. Do not edit published migrations or repair partial DDL without inspecting the checkpoint/schema.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:legacy`. With `ALLOW_TEST_DATABASE=1`, run `npm run test:integration`, then `npm run build`, `npm run check:runtime`, `npm run test:restart`, `npm run test:e2e`. Never integration/E2E concurrently on one test DB.
4. PC local start: `npm run local:db`, `npm run dev`, open http://localhost:4100. If setup is open, owner reads SETUP_SECRET privately from .env and creates their own Developer; no default credential is provided. Create synthetic/local Designer, Printer and Sale accounts for the owner walk-through; do not copy test DB accounts into dev.
5. Walk through sales confirm → Designer queue/technical review → save draft/F5/reopen → dispatch → assigned Printer in a second browser accepts/ACKs/starts/completes. Test revision before start, pending cancellation, plate issue/reissue, partial batch retry and source-linked reprint. PRINTED stops at pending 02C; no stock or shipment should appear.
