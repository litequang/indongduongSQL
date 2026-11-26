# SQL migration roadmap

Migration means replacing the application architecture and versioning SQL schemas. It never means importing old Firebase data.

| Phase | Scope | Exit gate |
|---|---|---|
| 00 | Safe independent fork; code, workflow, permission, storage and UI audit | Baseline evidence and architecture checkpoint |
| 01 | Express/MariaDB foundation; sessions; users; settings; polling; redesigned UI; PC/Cloud CI | Real MariaDB/API/browser checks and target branch pushed |
| 02A | Customers, CSV/Excel import, sales orders/products, saved designs | Product quantities, permissions and M:N traceability verified |
| 02B | Production, plate, printer assignment/ACK/start/complete/reprint/cancellation | Workflow transactions, idempotency and concurrency verified |
| 02C | Product finishing, finished goods, warehouse, dispatch, logistics | Readiness, anti-partial export and quantity conservation verified |
| 03 | Incremental sync expansion, notifications, private R2, backups/restore | Dedicated buckets and integrity checks |
| 04 | Remove reference Firebase code; full feature parity | Matrix complete, no Firebase dependency |
| 05 | Hawk Host staging/deployment and workshop acceptance | Account-specific limits and real devices validated |

Phase 01 now includes UI Foundation (2026-11-26 change request): shadcn/ui, Radix primitives, Tailwind v4, TanStack Table/Query, Lucide, light/dark responsive role workspaces. Advanced ReUI patterns and Recharts reporting follow the owning business module; no paid component or second primitive framework. PC/Cloud workflow and CI are also Phase 01 scope. Do not begin Phase 02 during this task.

See PROJECT_STATUS.md for actual progress, TEST_REPORT.md for evidence, and PHASE_02_HANDOFF.md for the next module. This file is the canonical phased roadmap; ROADMAP.md is an entry link.
