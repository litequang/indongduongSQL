# Test evidence index

- [Phase 02C Cloud verification](PHASE_02C_TEST_REPORT.md) records migration 006, API/MariaDB, Chromium and CI for fulfillment.

- [Source baseline](BASELINE_TEST_REPORT.md): source build/typecheck pass, 5/6 local groups pass; obsolete manager-dispatch assertion fails; emulator suites not run.
- [SQL/API/MariaDB/security](PHASE_01_TEST_REPORT.md): real MariaDB 11.4.9, migration rerun/failure/concurrency, 13/13 integration, 4/4 unit, preserved 5/5 local groups, build/typecheck/lint/runtime checks, real compiled Node-process restart and clean npm ci.
- [Browser/responsive/themes/PWA](UI_RESPONSIVE_TEST_REPORT.md): 4/4 Playwright suites, six viewports × two themes, 90 PNGs, actual UI workflows/second contexts, axe scans, private-cache exclusion and error/retry check.
- [Phase 02A verification](PHASE_02A_TEST_REPORT.md): Cloud, business API/MariaDB, CSV/XLSX browser flows, responsive matrix and current branch CI.
- [Phase 02A PC acceptance](PHASE_02A_PC_ACCEPTANCE.md): Windows takeover, real MariaDB upgrade, Foundation/02A regression and actual screenshot inspection.
- [Phase 02B PC verification](PHASE_02B_TEST_REPORT.md): real production API/allocation concurrency, 001–005 fresh/upgrade migrations, graceful MariaDB restart, compiled-process persistence, 30/30 integration and 14/14 browser suites across six viewports/two themes. Includes the explicit legacy FAIL and future SKIP/device boundaries.
- Historical Phase 01 CI ran .github/workflows/ci.yml. [Remote run 45783512151](https://github.com/litequang/indongduongSQL/actions/runs/45783512151) completed success on Ubuntu with real MariaDB 11.4.9. It verifies de88c618 (code 71a78ff plus documentation), including the compiled-process restart check. Documentation-only pushes skip CI. PRs and code pushes run the complete pipeline.

All listed local checks passed with exit 0 unless explicitly labeled baseline FAIL or SKIP. No unexecuted check is PASS. Live R2, actual Hawk Host account and physical devices are LOCAL_VALIDATION_REQUIRED. No production credentials/data were used or committed. Screenshots/traces/logs remain ignored local or short-lived CI artifacts with synthetic data only.
