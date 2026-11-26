# Decisions

## 2026-11-26 — Independent SQL system

New empty data, stable UUID users and relational core. No data/password migration, Firebase adapters or dual runtime. Keep sanitized source only as isolated Phase 02 reference. Source provenance and removed internal-looking fixtures are documented in SOURCE_PROVENANCE.md.

## 2026-11-26 — Shared hosting monolith

Express REST and static Vite frontend on one origin; MariaDB bounded pool; native scrypt and DB sessions. No native hash addon required on Hawk Host. Explicit checksummed migrations with named lock and durable DDL-failure state. Credentials supplied through environment; no hosting deployment this phase.

## 2026-11-26 — UI redesign supersedes preservation requirement

Modern neutral enterprise shell with configurable blue accent, shadcn/ui / Radix primitives, Tailwind v4, Lucide, TanStack Table/Query. ReUI is a selective free-pattern reference; no wholesale template import. Business semantics and permissions remain unchanged; unfinished modules are clearly unavailable. Recharts reporting awaits real report endpoints.

## 2026-11-26 — Polling consistency

Use commit-ordered transactional sequence guarded by a shared system row. Auto-increment IDs or timestamp-only cursors can miss late commits. Optimistic record versions reject stale edits. Background tabs pause polling and focus/reconnect refetch; private cache is memory-only.

## 2026-11-26 — PC / Cloud

GitHub is canonical. One writer per branch, no force push or automatic untested merge. Tested code checkpoint SHA is recorded by the subsequent handoff documentation commit. CI validates against its own real MariaDB service. Physical devices and hosting remain explicitly LOCAL_VALIDATION_REQUIRED.

## 2026-11-26 — Phase 02A customer identity and imports

Manual create in the reference prevents active phone duplicates. The source import offered both a duplicate-creating option and a broad update that spread incoming cells over stored values. SQL enforces active normalized phone and external namespace/ID uniqueness. The import offers skip or explicit updates from nonempty mapped cells against a unique match and its preview version. Conflicts, rows repeated in the file and ambiguous matches have explicit per-row results. Retired customers retain history and release active identity keys. Duplicate phones for distinct customer records require a separate business decision and data model change.

The selected UTF-8 CSV or first worksheet of XLSX is parsed in the browser. The server persists normalized reviewed candidates, not the raw file, in owner-scoped jobs. Files are bounded to 500 rows, 60 columns and 2 MiB. Staging and execution are capped at 20 rows per mutation. Batches commit independently, and a row conflict can be rolled back with its result recorded while the other rows commit. Import history is durable during Phase 02A. Agree retention before purging row payloads.

## 2026-11-26 — Phase 02A sales workflow authority

The source callable in fulfillmentWorkflow.ts owns confirm/cancel/reopen authority. Its printed lines enter WAITING_DESIGN and the order enters DESIGNING. Its non-printing paths create a finishing task or real available stock. In 02A, record commercial confirmation as CONFIRMED for those lines and for all-non-printing orders. The production and finishing flags and requirements supply the pending route. Phase 02C will advance those paths transactionally when the respective downstream output exists. Keep warehouse anti-partial fulfillment and no-work finishing checks in the owning phases.

Cancel updates the order and all active items atomically with status history, audit and change event. Force reopen mirrors the source state/role/reason preconditions. A 02A user cannot reach a delivered/completed status from the interface. Reopen is covered by a test-only downstream-state fixture. Confirmed and cancelled orders cannot be edited as drafts.

## 2026-11-26 — Phase 02A design snapshots

Library edits append an immutable design version. A draft can choose a specific revision, and the item keeps that version after confirmation and later library edits. Print count and last-print metadata depend on real production. Private image contract uses a registry ID on the version and remains inactive until Phase 03 verification.
