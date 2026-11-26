# Phase 02 handoff from Phase 01 (historical)

For the current handoff after Phase 02A, see [PHASE_02B_HANDOFF.md](PHASE_02B_HANDOFF.md).

Phase 01 provides independent Express/MariaDB auth, roles, users, settings, audit, migration/checksum locking, commit-ordered invalidations, optimistic versions and a new shadcn/Radix shell. It does not implement workshop production modules. Current checkpoint/evidence: HANDOFF.md, PROJECT_STATUS.md, TEST_REPORT.md.

Start with 02A only after user authorization: customers + CSV/Excel import + sales orders/products + saved designs/version history. Read the source owners from legacy/firebase/docs/FEATURE_MAP.md and functions workflows, then introduce normalized migrations and object-level services. Reuse shared/contracts, API validation, state-first transaction helper, audit/changed, Query/Table primitives, Empty/Error/Loading states and the role navigation registry. Do not restore the Firebase provider tree or the old JSON API.

Preserve product units, explicit requiresProduction/requiresFinishing branches, split/merged M:N traceability, standalone production orders and immutable supplemental/reprint history. Source allocations are often zero-valued traceability, not numeric allocation; define/validate exact allocation without inferring bags from sheets. Confirm business-rule ambiguity before changing semantics.

02B then adds free-text parser/@printer matching, local draft Blob authority, safe idempotent partial batch sends, technical revisions and ACK, exact assigned printer acceptance/start/complete, plate/issues/cancellation. 02C adds per-product finishing/no-work confirmation, accepted stock, whole-order readiness/anti-partial dispatch, inspected returns and shipment transitions. Refer to planned ERD and feature matrix; no blanket management bypass for specialist actions.

03 adds real private R2 registry/staging/finalize/signing with server MIME/size/hash/relationship verification, new dedicated buckets, bounded backup jobs and checksum-verified missing-only restore. Notifications and Recharts reporting require real authorized datasets, not preview fixtures. Change-event retention needs explicit cursor-expiry/full-refresh before pruning; state lock serializes all writes and should be load-tested before widening workloads.

04 removes reference dependencies after parity. 05 verifies the actual Hawk Host account/HTTPS/proxy/resource limits and physical mobile installation before rollout. Browser emulation is not a physical-device acceptance result. GitHub Actions and PC/Cloud handoff remain mandatory; one writer per branch, new task branches for parallel environments, no auto-merge main.
