# REST API contract — Phase 01

Same-origin `/api`, JSON only, UTF-8. Every response is `Cache-Control: no-store, private`. No CORS credentials. Error body: `{ "error": { "code": "VERSION_CONFLICT", "message": "..." } }`; validation adds field paths/messages. 400 invalid input, 401 unauthenticated, 403 authority/Origin/CSRF failure, 404 absent endpoint/entity, 409 duplicate/stale version/bootstrap completed, 413 body >64 KiB, 415 non-JSON mutation, 429 rate limit, 503 bounded password worker overload/readiness. No stack, SQL, hash or secret is returned.

All POST/PATCH require exact configured `Origin`. Authenticated mutations additionally require `X-CSRF-Token` from login or `/auth/me`. Cookie is HttpOnly, SameSite=Lax, Path=/, Secure and `__Host-idd_session` name in production; dev/test uses `idd_session`. Auth tokens never appear in response JSON or browser storage. Absolute session lifetime defaults to 12 hours. CSRF value is memory-only in frontend.

| Method / path | Request | Response / authority |
|---|---|---|
| GET /health | — | `{status:"ok"}` process liveness |
| GET /ready | — | `{ready:true}` or 503; exact current schema/checksums, DB reachable |
| GET /setup/status | — | `{initialized,setupEnabled}`; no configuration secrets |
| POST /setup/bootstrap | setupSecret, companyName, name, username, password | 201 `{initialized:true}`; secret and permanently empty setup gate; does not sign in automatically |
| POST /auth/login | username,password | `{user,csrfToken}` + fresh cookie; username and IP counters in MariaDB |
| GET /auth/me | cookie | `{user,csrfToken}` from live user authority |
| POST /auth/logout | `{}` | `{ok:true}`; current session deleted, cookie cleared |
| POST /auth/change-password | currentPassword,newPassword | `{ok:true,reauthenticate:true}`; all own sessions revoked |
| GET /users | page=1,pageSize=20 (max100), search, role, active=true/false, sort=name/username/role/createdAt, direction=asc/desc | `{items,total,page,pageSize}`; authenticated directory |
| POST /users | username,name,role,password; optional phone,machineAssigned,active | 201 `{user}`; Developer/Admin target restrictions |
| PATCH /users/:uuid | version + changed name/phone/machineAssigned/role/active | `{user}`; self nonprivileged fields or authorized target; expected version required |
| POST /users/:uuid/reset-password | password,version | `{ok:true}`; authorized other target, revokes all sessions |
| POST /users/:uuid/revoke-sessions | `{}` | `{ok:true}`; self or authorized target |
| GET /settings | — | `{settings}`; authenticated |
| PATCH /settings | complete typed settings including expected version | `{settings}`; Developer/Admin, atomic normalized replacement |
| GET /changes | cursor=0 decimal string | `{changes,cursor,hasMore}`; max100 events; consume additional pages; cursor bigint string |
| GET /audit | page=1 | `{items,total,page,pageSize:30}`; Developer/Admin; whitelisted event labels/actor/time, no private details |

User DTO: id, username, name, phone, role, machineAssigned, active, version, createdAt, updatedAt. No password hash, email identity mapping or PIN. Username uses 3–64 lowercase ASCII letters/digits/dot/underscore/hyphen; passwords 12–128 characters on creation/change/reset. Unknown request fields are rejected. Each settings field/options/threshold is validated by server/validation.ts; primary colors are a contrast-reviewed palette.

Settings DTO: companyName, shortName, phone, address, website, slogan, primaryColor, acceptanceMinutes, plateMinutes, printingMinutes, pollIntervalMs (3000–30000), printers, paperTypes, colors, finishingTypes, version. Lists max50 unique entries, max100 characters each. Missing data is not silently written locally.

Change events contain sequence, entity(users/settings), entityId, version, deleted. The feed carries invalidations/tombstones only, no universal private payload. Read current bounded endpoint after invalidation. Phase 01 retains events without pruning; future retention requires an explicit cursor-expired/full-refresh protocol. Every publishing mutation takes system_state lock first and retains it through commit, avoiding late-commit gaps. Stale writes receive 409 and must be reviewed/reloaded, never silently retried as a merge.

Production business, image upload, JSON-store sync, AI, bulk overwrite and old unauthenticated `/orders`/`config` APIs are absent. Unfinished UI modules cannot issue a successful fake mutation.
