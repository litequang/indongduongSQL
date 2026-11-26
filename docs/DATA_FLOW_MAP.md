# SQL data flows

Browser form → API client (same-origin cookie + in-memory CSRF) → JSON/Origin validation → route schema → current DB session/role → transaction holding system-state lock → repository writes/version/audit/change event → commit → canonical DTO → Query cache. A stale expected version yields 409; keep user edits for explicit review.

Login: username/password → bounded scrypt verification → recheck user/password under lock → random cookie token, SHA-256 token in sessions → live user DTO/CSRF. Refresh resolves /auth/me; role/activation/password changes revoke DB sessions. Logout clears cookie/cache and revokes the row.

Bootstrap: public status → out-of-band secret → password hash → state lock + initialized/user-count check → first Developer + normalized settings + state + audit/events → commit → explicit login. Never auto-provision from an open website.

Sync: visible/focus/reconnect → bounded /changes(cursor) → invalidation of authorized users/settings queries → current DTO; sequence allocated with write transaction and held through commit. Deletes use tombstones. Hidden tabs pause; optimistic versions reject overwrites. The feed does not contain business/private document payloads.

PWA: public assets and shell precached; /api is NetworkOnly and no-store, excluded from navigation fallback. Server data remains in memory, UI preferences only in localStorage. No Firebase import or JSON-store data path in this graph.
