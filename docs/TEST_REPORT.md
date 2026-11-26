# Test evidence index

- [Source baseline](BASELINE_TEST_REPORT.md): source build/typecheck pass, 5/6 local groups pass; obsolete manager-dispatch assertion fails; emulator suites not run.
- [SQL/API/MariaDB/security](PHASE_01_TEST_REPORT.md): real MariaDB 11.4.9, migration rerun/failure/concurrency, 13/13 integration, 4/4 unit, preserved 5/5 local groups, build/typecheck/lint/runtime checks, real compiled Node-process restart and clean npm ci.
- [Browser/responsive/themes/PWA](UI_RESPONSIVE_TEST_REPORT.md): 4/4 Playwright suites, six viewports × two themes, 90 PNGs, actual UI workflows/second contexts, axe scans, private-cache exclusion and error/retry check.
- CI definition: .github/workflows/ci.yml. Remote run outcome is recorded in HANDOFF.md after push; a local workflow definition alone is not a green remote run.

All listed local checks passed with exit 0 unless explicitly labeled baseline FAIL or SKIP. No unexecuted check is PASS. Live R2, actual Hawk Host account and physical devices are LOCAL_VALIDATION_REQUIRED. No production credentials/data were used or committed. Screenshots/traces/logs remain ignored local or short-lived CI artifacts with synthetic data only.
