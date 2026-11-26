# Project status

Agent: PC. Updated 2026-11-26. Branch: codex/sql-foundation. Source provenance: SOURCE_PROVENANCE.md. Latest immutable code checkpoint is recorded in HANDOFF.md by the following documentation commit.

Phase 00 completed: safe independent snapshot, architecture/Firebase/workflow/permission/UI/storage audit and roadmap. Phase 01 SQL + UI Foundation implemented and local acceptance verified. Code is pushed; follow-up remote CI verification is in progress; this is not a merged main release. Phase 02 has not started.

Implemented: real Express/MariaDB, ordered checksummed concurrent-safe migrations, one-time secret setup, scrypt passwords, DB cookie sessions + Origin/CSRF/rate limiting, eight-role backend authority, staff lifecycle/profile/password, normalized settings, administrative audit, bounded commit-ordered invalidation feed/optimistic versions, shadcn/Radix responsive light/dark UI, isolated legacy reference, Windows/Cloud scripts, real compiled-process restart smoke and MariaDB CI workflow.

Pending features are explicit unavailable UI: customers/import, sales/design, production/plates/printing, finishing, inventory/dispatch/shipping, notifications, reporting, private R2 uploads/backups. Full source parity is not claimed. FEATURE_PARITY_MATRIX.md owns detailed coverage.

Validated environment: Windows, Node 22.22.2, npm 10.9.7, MariaDB 11.4.9 at 127.0.0.1:3307, separate project dev/test accounts. Existing MySQL and Thờ Phượng Pro were not modified. Local workspace E:\CODE\indongduongSQL; shared scripts are path independent. Local URL http://localhost:4100. Dev DB remains empty for the owner to set up the first Developer; all test accounts live only in the dedicated test DB.

Evidence: TEST_REPORT.md and detailed linked reports. Hawk Host account/runtime/DB/proxy/limits, physical devices and live R2 remain LOCAL_VALIDATION_REQUIRED. No hosting or old Firebase/R2 production access was performed.
