# PC / Cloud handoff

Agent: PC. Branch: codex/sql-foundation. Current checkpoint: ba007cf (sanitized baseline, not SQL release). Phase 00 audit is active. Do not start another writer on this branch while the PC task is running.

Completed: empty-target verification, source main checkout/provenance, Gitleaks history/snapshot scan, sanitized baseline pushed, baseline build/local tests, static architecture/workflow/permission/storage/UI audit, UI reference/license inventory.

In progress: Phase 00 documentation and MariaDB preparation. Pending: Phase 01 backend/migrations/auth/UI, real DB/browser validation, CI and final checkpoint. Changed modules: docs and safe source snapshot. Added SQL migrations: none yet.

Tests/environment: see BASELINE_TEST_REPORT.md; Windows/Node 22.22.2/npm 10.9.7. Baseline permission assertion fails; no production service contacted. No blocking user input at present. Secrets stay in ignored environment files, never in handoff.

When the PC checkpoint is finished: fetch origin; inspect git status; switch/pull the assigned branch without overwriting local changes; run npm ci; copy .env.example to a private .env; provide a new dedicated DB/user; npm run db:migrate; npm run lint; npm test; npm run test:integration; npm run build; npm run test:e2e. Do not begin Phase 02 until requested.
