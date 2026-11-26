# PC / Cloud handoff

Owner: Cloud. Phase 02A. Base `codex/sql-foundation` at `2425a42cf0a6618dac653b2ebbb8010e29edcad1`. Task branch `codex/phase-02a-sales-design`. Tested code checkpoint and CI are recorded in [PHASE_02A_TEST_REPORT.md](PHASE_02A_TEST_REPORT.md). Earlier PC evidence remains in the base branch and historical reports.

## Changes and ownership

- Migration `server/migrations/003_sales_design.sql` follows 001/002. It adds customer identity, import jobs/items, sales orders/items/history, design versions/tags and transactional counters. [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- Domain contracts `shared/business.ts`, Express routes `server/routes/business.ts`, repositories under `server/repositories/`, business UI under `src/components/business/`. React Query listens to the same authenticated invalidation feed as Foundation. [API_CONTRACT.md](API_CONTRACT.md)
- The SQL integration job uses real MariaDB and the browser job uses the built app. Integration and E2E use synthetic fixtures and are run sequentially. [PHASE_02A_TEST_REPORT.md](PHASE_02A_TEST_REPORT.md)

## Resume on PC

1. Run `git fetch origin`. Check `git status --short` and preserve local changes. Use `git switch --track origin/codex/phase-02a-sales-design` when creating a local checkout of the task branch. Review the tested checkpoint and latest CI before deciding on a merge.
2. Use Node.js 22.22.2, npm 10.9.7 and your own MariaDB 11.4.9 development and test databases/accounts. Configure private environment from `.env.example`. Run `npm ci` then `npm run db:migrate` against your Project SQL development database. The migration adds 003 to a database on 001/002 and is safe to rerun when applied.
3. Run `npm run dev` and open the configured local URL. Navigate to **Khách hàng**, **Đơn bán hàng** and **Thư viện mẫu thiết kế**. Commercial roles can open the import from the Customers toolbar.
4. With the dedicated test database configured and `ALLOW_TEST_DATABASE=1`, run `npm run test:integration`, `npm run build`, `npm run check:runtime`, `npm run test:restart`, `npx playwright install chromium` and `npm run test:e2e` in that order. Typecheck, lint, unit and legacy commands are in the report. Run integration and browser suites sequentially for a shared test database.
5. For the next authorized phase, see [PHASE_02B_HANDOFF.md](PHASE_02B_HANDOFF.md), [DECISIONS.md](DECISIONS.md) and [AUTHORIZATION_MATRIX.md](AUTHORIZATION_MATRIX.md).

The legacy manager-dispatch assertion expects a permission superseded by the current exact WAREHOUSE policy. It remains historical evidence. Data policy confirmations for the next milestone are listed in the Phase 02A test report.
