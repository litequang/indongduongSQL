# PC / Cloud handoff

Agent: **PC**. Branch: **codex/sql-foundation**. Tested code checkpoint: **71a78ff0901031a8c129d8ae73a39d23e0b36fc2**. This document is committed after that checkpoint so the SHA is immutable. Phase 00 complete; Phase 01 SQL + UI Foundation implemented and locally verified. Code/documentation were pushed; follow-up remote CI verification is in progress; PC retains branch ownership until final handoff update.

## Completed

- Independent clean snapshot from source b1cefcdd65746c0d611c4a53633c83aef4945f5c0, baseline ba007cf; architecture audit 2cc9046.
- MariaDB schema/migration checkpoint 9c37a98; Express/auth/authorization/source isolation 0ecd441; separate UI Foundation 1d36919; integration/browser/CI checkpoint d58e4d0.
- Real MariaDB sessions, one-time secret bootstrap, scrypt, Origin/CSRF, durable rate counters, current-role authorization, employee lifecycle/profile/password, normalized settings, audit and bounded incremental invalidations/version conflicts.
- shadcn/Radix design system, Table/Query, role shell, desktop/tablet/mobile, light/dark, explicit unavailable business modules, 90 screenshots and WCAG scans.
- Backend artifact separated at build/server.cjs; only dist is public. No Firebase SDK or unauthenticated JSON-store API executes in SQL runtime. No hosting or old production database/bucket was contacted.

## Current / pending work

Finalize documentation and observe remote CI after push. Business Phase 02A/B/C, notifications/reporting, real R2 uploads/backup, full source parity and hosting/device acceptance are **not implemented**. Do not start Phase 02 without a new request. Main is still the safe source baseline, not the approved SQL release; do not merge it automatically.

Changed owners: server/{auth,database,middleware,migrations,repositories,routes,services,storage}, shared/contracts; src/{components,context,repositories,services,lib}; entry/build/PWA/config scripts; tests/CI; docs and notices. Original sanitized source moved under legacy/firebase (including reference maps/tests/functions), excluded from runtime/typecheck. APP_MAP identifies current owners.

Added migrations: **001_identity.sql**, **002_configuration_sync.sql**. Both applied from empty local DB; rerun is no-op. Named lock, LF-normalized checksums and running/applied/failed statement checkpoints are verified. No DROP/TRUNCATE. A test-only failure probe table may remain in the test database; it is not in dev or production.

## Evidence / environment

Windows PowerShell 5.1; Git 2.55.0.windows.3; Node 22.22.2; npm 10.9.7; MariaDB 11.4.9, dedicated 127.0.0.1:3307. Separate dev/test accounts and databases; existing MySQL/Thờ Phượng Pro untouched. Local workspace E:\CODE\indongduongSQL; scripts contain no machine-specific absolute paths. Secrets only in ignored .env/private tool config.

Local checks exit **0**: clean npm ci; typecheck; lint; unit **4/4**; preserved workflow groups **5/5**; real MariaDB/HTTP integration **13/13**; browser **4/4**, 6 viewport sizes × both themes including setup/login, 90 PNGs, axe scans; build; runtime/PWA exclusion; compiled startup/private-route/SPA smoke; real compiled Node-process restart; Gitleaks history and staged snapshot; npm audit **0 vulnerabilities**. Detailed commands/limitations: TEST_REPORT.md and linked reports. Remote CI status is not inferred from local tests and will be appended after observation.

Known baseline issue: isolated old test expects MANAGER dispatch although current source policy is WAREHOUSE only; not changed to force parity. Nonblocking npm warning: ESLint 9 deprecated. Live R2, actual Hawk Host Node/DB/proxy/resource limits and physical devices are LOCAL_VALIDATION_REQUIRED. No current local blocker.

## Resume / next owner

1. Confirm this PC task has released ownership. `git fetch origin`, `git status --short`, inspect branch/upstream and this SHA. Preserve local uncommitted work. Concurrent Cloud tasks must use a distinct task branch; never force push.
2. Use Node 22.22.2/npm 10.9.7, `npm ci`, private environment copied from .env.example and your own separate MariaDB dev/test accounts. Cloud cannot access PC .env or database. Run `npm run db:migrate`.
3. `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:legacy`, opt in with ALLOW_TEST_DATABASE=1, then `npm run test:integration`, `npm run build`, `npm run check:runtime`, `npm run test:restart`, `npx playwright install chromium`, `npm run test:e2e`. Do not run integration/E2E concurrently on the same test DB.
4. PC local start: ensure dedicated MariaDB is running (`npm run local:db` uses already-private optional paths), then `npm run dev`; open **http://localhost:4100**. Dev DB remains uninitialized for the owner. Read SETUP_SECRET privately from .env and finish the three-step Developer setup; choose your own username/password. Never commit those values. Production setup has no default account/password.
5. Suggested next authorized scope: Phase 02A customers/import/sales products/designs on the existing SQL services/design system. Read PHASE_02_HANDOFF and feature matrix. Physical/Hawk Host checks stay explicit; no deployment is authorized yet.

## Follow-up checkpoint

71a78ff adds explicit dark-card foreground, full-surface accessibility sampling (the required responsive matrix is unchanged), and test:restart. The latter verifies user/session persistence across two real compiled Node processes on an ephemeral loopback port, with synthetic probe cleanup. Windows typecheck/lint/build/runtime checks, restart smoke and all four browser suites PASS (exit 0). First remote run [45782024438](https://github.com/litequang/indongduongSQL/actions/runs/45782024438) failed only the Linux dark-surface contrast scan; a follow-up remote run is pending. Documentation-only pushes skip CI; PRs and code pushes still execute the complete workflow.
