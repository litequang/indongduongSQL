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
