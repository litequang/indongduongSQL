# Phase 03 PC verification

PC, 2026-11-27; `codex/phase-03-private-operations`, based on Cloud 02C handoff `5d5af17c26ad08fc844ece0c1a6f22e00692248e`. Tested code **9231886544ec92415e7d9b8dce36f070a76c2489**; the following documentation-only checkpoint records its remote CI and final handoff. The owner explicitly selected local implementation/testing while no R2 dev bucket configuration exists. No production credentials/data/provider or hosting account were used.

## Acceptance and environment

GitHub PR #2 is open/draft, base `codex/phase-02b-production`, head `5d5af17`. [Cloud CI 45933985370](https://github.com/litequang/indongduongSQL/actions/runs/45933985370) is success at code `ddf3e88f415a7df0a499bb011c3a2a1b0ef56a95`. PC fetched and inspected history/remotes/clean working tree, then created a distinct Phase 03 branch without changing main or merging either PR. Foundation–02C regression passed 37/37 against real Windows MariaDB while adding schema 007; Cloud implementation files were preserved.

Windows PowerShell; Node 22.22.2, npm 10.9.7; dedicated MariaDB 11.4.9 `127.0.0.1:3307`; isolated dev/test databases and accounts. Initial tests failed because that private instance was stopped; it was started using local:db, without touching the machine's other database servers. Final npm ci installs 690 packages, audits 691 and reports zero vulnerabilities. Ignored `.local` logs/screenshots/traces and synthetic temporary object stores are not Git deliverables.

## Executed checks

| Check | Actual result / exit |
|---|---|
| npm ci; typecheck; lint | PASS, 0 |
| npm test | PASS 5/5, 0; includes actual local HTTP AWS SDK signing/conditional put/412 conflict/backup isolation/404/503 behavior |
| npm run test:legacy | PASS preserved 5/5 groups, 0 |
| npm run test:integration | PASS 46/46, 0; real MariaDB and authenticated HTTP; no mocked DB |
| Fresh Windows MariaDB and 001/002 upgrade, concurrent runners, rerun | PASS, 0; separate disposable instance, schema 001–007, retained sequence probe |
| Dev db:migrate | PASS, 0; applied 006/007 over existing 001–005, preserving dev setup/accounts/business data |
| Build and check:runtime | PASS, 0; compiled server outside static root, no Firebase/JSON-store runtime, API NetworkOnly service worker |
| Compiled Node restart | PASS, 0; own 02C fixture preparation 7/7 followed by two real Node processes, stable session/business/fulfillment/registry/job/read-state snapshots |
| Graceful real MariaDB restart | PASS, 0 after explicit local:db retry; all 53 schema 001–007 table snapshots and sessions have identical SHA-256 |
| Full Playwright regression + final Phase 03 | PASS full 18/18, 0; final Phase 03 3/3, 0 after responsive/quota fixes. CI executes the combined 19-test suite |
| Remote Ubuntu CI 45964530282 at code 9231886 | PASS completed success; API 46/46, Playwright 19/19, all preceding checks/restart and browser artifact upload |
| Gitleaks staged/history and git diff --check | PASS, 0; 193.64 KB staged/new code checkpoint, zero detected secrets |
| Live R2 dev primary/backup, actual devices/audio, Hawk Host | LOCAL_VALIDATION_REQUIRED; no dev buckets yet, owner chose local testing |

The integration file uses actual selected/normalized files on an isolated filesystem object transport. A separate local HTTP S3 fixture exercises the real AWS SDK transport. Neither constitutes live R2 coverage. The ordinary test runtime ignores R2 environment configuration; only the explicit dev smoke command may contact two isolated dev buckets. There is no filesystem runtime fallback.

[Remote CI 45964530282](https://github.com/litequang/indongduongSQL/actions/runs/45964530282) is **completed success**, head **9231886544ec92415e7d9b8dce36f070a76c2489**, verified through GitHub API after artifact upload/cleanup. The subsequent documentation-only handoff does not change tested code. Local final logs are ignored `.local/phase03-api-approved.log`, `phase03-browser-accepted.log` (full regression), `phase03-browser-approved.log` (final three Phase 03 cases), `phase03-unit-approved.log`, `phase03-restart-accepted.log`, `phase03-fresh.log` and `phase03-database-restart-evidence.json`.

## New evidence

- Ticket ownership/target, CSRF before binary parsing, malformed/SVG rejection, >5 MiB rejection, expiry, normalized-byte SHA-256, lost-response identical retry and different-byte immutability.
- Private unattached images; historical design-version references; fixed-target linking rejection; referenced deletion rejection; draft privacy; official current-printer access and revocation after reassignment; official image writes rejected.
- Separate backup bytes, durable one-object steps, per-image result review, full-byte verification, missing-only restore, no overwrite of corrupt existing objects and failure on corrupt backup; old orphan cleanup retains registry history.
- Recipient notifications and own read state, former-printer filtering, private change invalidations; rebuilding the authenticated HTTP application preserves image bytes/metadata/jobs/read state.
- Browser selects a File, explicitly saves its device draft, F5 recovers it, uploads verified bytes and saves SQL, F5 displays the image, and logout clears IndexedDB. The test edits notes while upload is held and verifies those edits survive. Browser backup/read-state flows, six viewport sizes × light/dark and axe checks accompany the inherited workflow matrix. HTTP 5xx is a failure in the Phase 03 browser suite.

## Resolved failures and limits

The unpublished first 007 failed after its first statement because MariaDB's inline column CHECK was not a named table constraint. PC inspected the durable failed checkpoint (`completed_statements=1`) and SHOW CREATE TABLE for both image columns and the new registry; preserved evidence/checksum in ignored local files; left completed DDL intact and explicitly completed only pending statements with MODIFY COLUMN and registry FKs. Published 001–006 were unchanged. Fresh/upgrade/rerun tests then passed; no database DROP/TRUNCATE/reset was used for repair.

The physical MariaDB shutdown/start probe's first Windows respawn did not become ready inside its polling window. PC explicitly started the same dedicated instance with local:db, reconnected with the isolated account and compared every table/session against the saved pre-shutdown SHA-256: all 53 tables matched. This was startup readiness, not a data reset or restore. The development app was then started hidden at localhost:4100; readiness is 200 and setup remains closed.

The first browser regression retained an obsolete 02A assertion for the removed Phase 03 placeholder; it was updated to verify an image-less design without that placeholder. A missing save acknowledgement wait was fixed before F5. The backup coverage endpoint's reserved SQL alias caused background 500 responses; the unused query was removed and API coverage checks plus browser 5xx assertions added. Upload callbacks now update the latest form state so asynchronous completion does not overwrite concurrent input. Optional device-store cleanup failure does not turn a verified upload into a false network failure; a real browser quota-failure simulation verifies that behavior. Manual screenshot review caught left-clipped action buttons at 360 px despite passing document scroll-width checks; wrapping rules and actual button-bound checks now pass. Twelve Phase 03 storage PNGs cover six viewports × light/dark, with axe at 1366 in both themes; the inherited business matrices remain covered.

Image backup jobs do not back up MariaDB. Dedicated bucket acceptance, native sharp on Hawk Host, physical PWA/device/audio behavior and actual hosting/proxy/memory limits are unexecuted. No external logistics API or deployment. Historical standalone legacy prompt14 manager-dispatch assertion remains a known obsolete FAIL from earlier reports and was not rerun; the preserved supported legacy groups pass. Firebase emulator suites SKIP. Existing vendor chunk/Zod annotation/ESLint deprecation/Playwright color warnings remain nonblocking.
