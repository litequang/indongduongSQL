# Start here — In Đông Dương SQL

Read `docs/PROJECT_STATUS.md`, `docs/HANDOFF.md`, `docs/DECISIONS.md`, then the relevant architecture/feature document before edits. Code and executed evidence override old reports. GitHub `litequang/indongduongSQL` is the authoritative source.

## Boundaries

- Modular monolith: Node.js 22 + Express + MariaDB 11.4, React + TypeScript + Vite PWA. Hawk Host shared hosting / cPanel / Passenger target; one bounded DB pool per process. No mandatory VPS, Redis, Docker, workers or WebSocket.
- UI: Tailwind CSS v4, shadcn/ui with Radix primitives, Lucide, TanStack Query/Table. ReUI free compatible patterns selectively; Recharts for real reports. No paid components, Next.js or second primitive framework. Record exact sources/licenses in THIRD_PARTY_NOTICES.md.
- SQL runtime must not import `legacy/firebase`, Firebase SDKs or the former JSON-store server. No Firebase data/account/password migration, dual database, Firestore adapter or production fallback to localStorage.
- Preserve existing business rules and eight roles. Product quantity differs from sheets; sales products and print runs are M:N. Product finishing/no-work confirmation, warehouse sibling readiness, revision ACK and cancellation invariants are mandatory. No arbitrary Kanban state dragging.
- Phase 00, Phase 01, UI Foundation and Phase 02A/B are inherited. The owner authorized Phase 02C on `codex/phase-02c-fulfillment`, based on `codex/phase-02b-production`. Phase 03 and deployment require separate authorization.

## Security

- Validate inputs, prepared statements, backend role/object authorization, server sessions, scrypt hashes, Origin/CSRF checks. Never trust frontend role or user ID claims.
- Revoke active sessions on lock/password/role changes. One-time secret-protected first Developer setup must be serialized and permanently closed after success.
- No secrets, real staff/customer data, uploads, DB files, backups or private screenshots in Git. No production Firebase/R2/DB/hosting access. New isolated dev/test/CI credentials only.
- Never DROP/TRUNCATE an existing database. Migration DDL is not transactional in MariaDB; preserve checksums and failure checkpoints, inspect partial state before repair.
- API data is no-store; service worker must exclude /api. Browser cache is memory-only and cleared across sessions. Browser preferences may store only UI choices.

## Git / PC–Cloud handoff

1. Before a new task: `git fetch origin`, `git status --short`, inspect branch/upstream/history. Preserve uncommitted changes; never reset/overwrite another agent's work.
2. One writer per branch. PC and Cloud working concurrently use distinct task branches/worktrees and coordinate ownership in HANDOFF.md. Never assume another environment shares local DB/state.
3. `main` is the stable tested release target. The initial source snapshot records provenance. Cloud Phase 02C uses `codex/phase-02c-fulfillment`, based on production handoff `54e1450`. Never force-push or auto-merge untested code. Merging main or PR #1 needs user review.
4. Never edit/push/deploy `litequang/indongduong` or Thờ Phượng Pro. Check remotes/diff/secrets before every push. Meaningful checkpoints only, push the assigned target branch.
5. Before handoff update PROJECT_STATUS, HANDOFF, FEATURE_PARITY_MATRIX and TEST_REPORT with actual state. Record PC/CLOUD, branch, immutable checkpoint SHA, phase, completed/in-progress/pending work, files, migrations, environment, test commands/results/exit codes, known errors/blockers and next commands. A documentation-only handoff commit references the preceding tested code SHA, avoiding a circular self-SHA.

## Validation

Use the committed npm lockfile, `.node-version` and scripts on Windows/Cloud/CI. `npm ci`, typecheck, lint, build, unit tests, real MariaDB integration tests, migration rerun/concurrency checks and Playwright on implemented flows. No mocked DB counts as integration coverage. CI uses its dedicated disposable MariaDB service and synthetic secrets; never production credentials. Do not report PASS unless executed; mark unrun checks SKIP. Device/Hawk Host checks awaiting physical/account validation are LOCAL_VALIDATION_REQUIRED.

## Documentation ownership

PROJECT_STATUS is the current implementation state; FEATURE_PARITY_MATRIX owns feature coverage; SQL_MIGRATION_ROADMAP owns phases (ROADMAP links there); TEST_REPORT indexes detailed baseline/SQL/responsive reports; HANDOFF is the latest cross-environment checkpoint; DECISIONS records durable choices. Historical source maps describe reference code only. Avoid duplicate competing status lists.
