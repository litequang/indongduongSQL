# Phase 01 executed test report

Date 2026-11-26, agent PC. Windows PowerShell 5.1, Git 2.55.0.windows.3, Node 22.22.2, npm 10.9.7, MariaDB 11.4.9-MariaDB. Portable DB binds 127.0.0.1:3307 with project-specific data directory and separate dev/test DB accounts. Existing MySQL and Thờ Phượng Pro were untouched. No Firebase production, old R2 bucket or hosting endpoint was contacted.

| Check | Actual result | Exit |
|---|---|---|
| Fresh dev DB + migrate 001/002 | PASS; created from empty project DB | 0 |
| Second migration invocation | PASS; schema already up to date | 0 |
| Final npm ci | PASS; committed lockfile, 651 packages, audit 0 | 0 |
| TypeScript / lint | PASS after final implementation and clean install | 0 / 0 |
| Unit security/config/policy tests | 4 PASS, 0 FAIL | 0 |
| Valuable preserved local workflow suites | 5 PASS, 0 FAIL | 0 |
| Real MariaDB + real HTTP integration | 13 PASS, 0 FAIL (12 acceptance groups plus parent) | 0 |
| Vite + bundled Express build | PASS; 744.52 KiB PWA precache, no Firebase chunk | 0 |
| SQL runtime/PWA exclusion check | PASS; backend artifact separated from static dist | 0 |
| Browser acceptance + 12 responsive combinations | 4 suites PASS; 90 PNGs; WCAG axe checks; detailed UI_RESPONSIVE_TEST_REPORT | 0 |
| npm audit / audit --omit=dev | 0 vulnerabilities after compatible dependency updates/overrides | 0 |
| R2 live upload/backup | SKIP; architecture/config only, no dedicated credentials requested | not run |
| Hawk Host live deployment / physical devices | LOCAL_VALIDATION_REQUIRED; outside this phase | not run |
| GitHub Actions | Definition prepared; remote execution status pending push | not yet established |

Integration exercises: DB name isolation/version; concurrent migration lock and safe rerun; public health/ready/status; anonymous protected reads; bootstrap wrong Origin/secret and concurrent race/second-call denial; correct/wrong password; HttpOnly/SameSite/no-store/CSRF; creation and reads across all eight roles; forbidden role headers/self escalation/Admin→Developer; server paging/filter/sort; settings writes by role; optimistic user/settings races; ordered invalidation feed; backend close/restart with persistent session/data; role/lock/reset/revoke invalidation; own password invalidating both sessions; old/new password; logout; durable username/IP brute-force counters; partial-DDL failed state, statement checkpoint and changed-checksum rejection.

The only injected backend response is a deliberate browser error-state check, separately identified in the UI report; it never substitutes for MariaDB persistence tests. Test fixture cleanup is opt-in DELETE only on an allowlisted dedicated test DB; no DROP/TRUNCATE or production account.

The source's obsolete MANAGER-dispatch helper assertion remains a known baseline failure in isolated reference code; source frontend/functions build and typecheck passed after both lockfiles were installed. No unrelated workflow policy was changed to make that assertion pass. Firebase emulator-specific suites are not SQL acceptance tests and were not run against production.

Remaining limits: account-specific Hawk Host Node/DB/proxy/limits and physical browser devices unverified; DB rate-counter/change/audit retention needs future maintenance policy at scale; the global sequence lock deliberately serializes mutations and needs workload measurement as business modules expand. R2, business workflows, notifications and reporting remain absent. No claim of full Firebase feature parity.

Compiled startup smoke (`NODE_ENV=test`, `node app.cjs`, separate port): health/ready 200; private users 401; setup remains uninitialized in dev; backend /server.cjs and /build/server.cjs 404; extensionless SPA path 200. No TLS/hosting claim is inferred from this local static-build check. Backend artifact is build/server.cjs, frontend is dist/.

Nonblocking tooling note: npm reports ESLint 9 as deprecated; lint itself passes and npm audit reports zero advisories. The obsolete isolated source permission assertion is documented in BASELINE_TEST_REPORT, not silently included as SQL success.
