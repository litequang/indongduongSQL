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

Phase 01 includes UI Foundation (2026-11-26 change request) with shadcn/ui, Radix primitives, Tailwind v4, TanStack Table/Query, Lucide and light/dark responsive role workspaces. Advanced ReUI patterns and Recharts reporting follow the owning business module. The single primitive system uses free components. PC/Cloud workflow and CI are also Phase 01 scope.

See PROJECT_STATUS.md for progress and TEST_REPORT.md for evidence. Phase 03 is implemented locally; its dedicated-bucket live exit gate remains pending under the owner's explicit local-testing choice. PRIVATE_OPERATIONS.md owns the dev R2 acceptance procedure. PHASE_04_HANDOFF.md prepares future parity/removal work, requiring a new task. Phase 02A preserves stable sales product IDs and explicit flags. Phase 02B implements allocation and production. Phase 02C implements finishing, acceptance, finished stock, whole-order dispatch, manual logistics and inspected returns. Direct non-printing output and replacement acceptance remain owner decisions. This file is the canonical phased roadmap. ROADMAP.md links here.
