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

## Phase 02A business API

Authentication, Origin, CSRF and no-store follow the existing contract. Error codes for actionable business conflicts include `CUSTOMER_DUPLICATE`, `VERSION_CONFLICT`, `INVALID_STATUS`, `REQUEST_CONFLICT` and `IMPORT_BATCH_ORDER`. Normal bodies are bounded to 64 KiB. Sales create/update and import staging accept up to 512 KiB of uncompressed JSON after Origin verification. Shared DTO and input schemas live in `shared/business.ts`. Unknown fields, including caller-supplied stage, role, owner, stock, print sheets or image data, are rejected.

| Method and path | Request and response |
|---|---|
| GET /customers | Search by name/code/phone/external ID. Province, active=active/deleted/all, sort=name/code/createdAt and standard paging. Returns Page<Customer>. |
| GET /customers/:id | Returns customer and latest activity. Use the sales list with customerId to page its order history. |
| POST /customers | UUID id and CustomerInput. Same actor and unchanged payload can retry with that UUID. Returns customer on 201. |
| PATCH /customers/:id | Changed CustomerInput fields and expected version. Omitted fields are preserved. Returns the saved customer. |
| POST /customers/check-duplicate | CustomerInput plus optional excludeId. Returns matched IDs, codes and names for commercial roles. The server validates again at save time. |
| POST /customers/:id/delete | Expected version. Soft delete with history preservation. |
| POST /customers/bulk-delete | 1–50 unique id/version pairs. The whole request rolls back if any pair fails. |
| GET /customer-imports | Owner's job history with page/pageSize. |
| POST /customer-imports | id, fileName, CSV_IMPORT/EXCEL_IMPORT source, totalRows 1–500. Same request may be replayed. |
| GET /customer-imports/:id | Job status, version and persisted counts. |
| GET /customer-imports/:id/items | Owner's paginated preview and per-row results. |
| POST /customer-imports/:id/rows | offset plus 1–20 entries of rowNumber and mapped values. Exact replays are safe. Last batch moves the job to REVIEW. |
| POST /customer-imports/:id/confirm | Version and policy SKIP or UPDATE. Starts execution after review. |
| POST /customer-imports/:id/process | Empty JSON. Processes at most 20 pending rows and returns authoritative progress. Completed retry returns the same result. |
| POST /customer-imports/:id/cancel | Expected version in STAGING or REVIEW. |
| GET /sales-orders | Search by order code, customer snapshot or active item name. Filters customerId, status and priority. Sort code/createdAt/expectedDeliveryDate. Returns Page<SalesOrder>. |
| GET /sales-orders/:id | Order, items, most recent status history and action audit. Every item includes its exact design snapshot if selected. |
| POST /sales-orders | Client request UUID, customerId, priority/date/notes and up to 30 items with stable UUIDs. Returns the new draft. |
| PATCH /sales-orders/:id | Complete draft input and expected version. Omitted prior draft items are soft deleted. |
| POST /sales-orders/:id/confirm | Version. DRAFT with at least one active item. Marks required production products WAITING_DESIGN and other items CONFIRMED. |
| POST /sales-orders/:id/cancel | Version. Blocks cancelled, ready-to-ship, shipped, delivered, completed or active/completed production. |
| POST /sales-orders/:id/force-reopen | Version and required reason. Admin/Developer with a delivered or completed order. Eligible states require the downstream implementation. |
| GET /saved-designs | Search name/customer/paper/tag/plate reference. Filters customerId and paperType. Sort productName/updatedAt and standard paging. |
| GET /saved-designs/:id | Current version and latest design audit entries. |
| GET /saved-designs/:id/versions | Page of immutable revisions, newest revision first. |
| POST /saved-designs | Request UUID and design metadata. Creates version 1. |
| PATCH /saved-designs/:id | Complete design metadata plus expected version. Appends a revision and moves the current pointer. |

Lists use `page` (default 1), `pageSize` (default 20, maximum 100), and where documented `direction=asc/desc`. Customer ID links resolve on the backend. Customer updates preserve their import provenance. Quantities count individual BAG units. A design response reserves nullable `image: { registryId }`. Current designs return `null` for images.

`GET /changes` adds invalidations for `customers`, `sales_orders` and `saved_designs`. Customers send a tombstone on retirement. Customer/sales/design events contain opaque entity IDs and versions and use the same authenticated read scope as their endpoints. Import jobs are actor-scoped and are excluded from the global feed.
