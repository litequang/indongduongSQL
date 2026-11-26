# SQL architecture

One modular Express application, one MariaDB database, one same-origin React/TypeScript/Vite PWA. Hawk Host cPanel/CloudLinux/Passenger is the deployment target; no Redis, Docker requirement, WebSocket or worker daemon. Node 22 is the local/CI target; account-specific availability remains to be verified.

`server/config` validates environment; `server/database` owns a bounded pool and transactions; migrations are explicit CLI work. Routes validate inputs and invoke authorized services/repositories. Audit and change events are committed with the mutation. The browser never chooses its trusted role. Stable UUID user IDs are business identities, with no Firebase compatibility layer.

Passwords: native Node scrypt with random salts; DB holds only password hashes and hashed opaque session tokens. HttpOnly, SameSite=Lax cookies are Secure in production. Mutations require configured Origin and session-bound CSRF header; setup/login require Origin too. Roles/active state are resolved on every request and revalidated inside mutation transactions. Locking/password/role changes revoke sessions immediately. Developer-only first-run secret is supplied out of band, consumed by locked persistent system state, never bundled or logged.

Core schema: roles/users/sessions/settings/setting_options/audit_logs/system_state/schema_migrations/change_events/auth_rate_limits. No business seed. Normalized business ERD is planned in DATABASE_SCHEMA.md and implemented per Phase 02 module, not as a Firestore document JSON column.

Migrations: ordered immutable files, checksums, MariaDB GET_LOCK, durable running/applied/failed state and statement checkpoint. MariaDB DDL implicitly commits: no false atomic rollback promise. A failed/incomplete migration blocks automatic continuation until an operator inspects partial schema. Successfully applied reruns are no-ops; edited checksums are rejected.

Incremental synchronization: monotonic sequence allocated under system_state row lock before any domain write, retained until commit, avoiding auto-increment commit-order gaps. Events include entity ID/version and deletion tombstone. Bounded cursor pages, role scope and optimistic version preconditions prevent lost updates; visible polling 4 seconds and focus/reconnect refresh, background paused. Unauthorized payloads never enter a global feed.

Frontend: shadcn/ui design tokens and Radix Dialog primitives, TanStack Query in-memory server state, TanStack Table controlled pagination/search/sort/filter. No persistence plugin or production demo mode. Only completed modules mount; unfinished modules are explicit empty/unavailable states. The entire original graph is moved under legacy/firebase and excluded from production compilation/bundling. No Firebase or old JSON-store route executes.

R2 foundation: backend-only env config; separate private development/production buckets; short-lived signed staging upload/download, JPEG/PNG/WebP 5 MiB limit and actual-byte inspection before registry activation. Phase 01 contains configuration/contract only; signing endpoints are absent until relationship authorization, registry and finalize verification ship in 03. Credentials never live in SQL, frontend or Google Secret Manager.

Reference: Thờ Phượng Pro dashboard-preview f065a5c7c721265eccff51b81552ba94379021e8. Reuse small per-process pool/backpressure, same-origin cookies, external env, static production build and Passenger lifecycle. Do not copy song/workspace schema, legacy migration tooling or its semicolon/DDL transaction assumptions. Read-only clone; no original files/database modified. See HAWKHOST_DEPLOYMENT.md for official sources and unverified account limits.
