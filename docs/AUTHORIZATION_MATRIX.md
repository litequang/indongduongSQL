# Authorization matrix

Trusted actor comes from a nonexpired MariaDB session joined to the current active user. No role/body/header or UI preview can change authority. A mutation rechecks the session and role while holding the global state lock; staff changes are effective on the next request. Sensitive changes delete all target sessions. Browser menus only present the same capabilities.

| Action | Developer | Admin | Manager | Designer | Sale | Printer | Finisher | Warehouse |
|---|---|---|---|---|---|---|---|---|
| Health/ready/setup status | public | public | public | public | public | public | public | public |
| First bootstrap | one-time secret, empty state | — | — | — | — | — | — | — |
| Directory/settings read, own session | yes | yes | yes | yes | yes | yes | yes | yes |
| Self profile/password/logout/revoke own sessions | yes | yes | yes | yes | yes | yes | yes | yes |
| Create/manage/reset/revoke another user | all roles | only six lower roles | no | no | no | no | no | no |
| Assign Developer/Admin | yes | no | no | no | no | no | no | no |
| Change own role or lock self | no | no | no | no | no | no | no | no |
| Company/catalog/workflow settings write | yes | yes | no | no | no | no | no | no |
| Administrative audit read | yes | yes | no | no | no | no | no | no |
| Bounded users/settings invalidation feed | yes | yes | yes | yes | yes | yes | yes | yes |
| Customer, sales and design reads | yes | yes | yes | yes | yes | yes | yes | yes |
| Customer create/update/soft delete, batch delete and duplicate check | yes | yes | yes | no | yes | no | no | no |
| Customer import stage/preview/confirm/process/history | own jobs | own jobs | own jobs | no | own jobs | no | no | no |
| Sales draft creation, design creation and version updates | yes | yes | yes | yes | yes | no | no | no |
| Sales draft edit, confirm and cancel | eligible state | eligible state | eligible state | no | eligible state | no | no | no |
| Sales privileged reopen from delivered or completed | reason required | reason required | no | no | no | no | no | no |
| Any unmigrated business API | absent | absent | absent | absent | absent | absent | absent | absent |

Admin's six target roles: MANAGER, DESIGNER, SALE, PRINTER, FINISHER, WAREHOUSE. Developer must retain at least one active Developer; self privilege/activation changes are denied. Profile fields allowed: name, phone, machineAssigned (source Rules allowed these self edits); username is immutable after creation in this foundation. Avatar upload is pending private R2 authorization. Self password change requires current password; privileged reset uses expected target version and revokes sessions.

Source authority: `legacy/firebase/firestore.rules` users/settings; `functions/src/staffProvisioningService.ts` lines governing caller/assignable roles; `functions/src/workflows/workflowAuth.ts`; frontend permission helpers. Source Rules read all staff for authenticated active users and allow settings writes to isAdmin (Developer/Admin). The customizable frontend matrix did not override server workflow policy. It remains deferred; SQL does not grant extra rights from browser flags.

Phase 02 policies retained: management = Developer/Admin/Manager; sales authority = those plus Sale; design technical = management + Designer. Assigned Printer alone accepts/ACKs/starts/completes/resolves cancellation where required. Warehouse dispatch authority is exact WAREHOUSE (source helper test expecting MANAGER is obsolete). Product Finisher authority and issue reporter/recipient scope are object-level checks, not inherited specialist powers for management. See WORKFLOW_V2_MAP.md reference and feature matrix before implementing.

Phase 02A customer, sales and sample reads mirror authenticated-active Firestore reads. Sales rules and callable transitions permit commercial roles across orders. Draft item updates require membership of the target draft. Import jobs and their row payloads are restricted to the actor who staged them, including for management accounts. Roles are derived from the live session. A valid stale version receives a 409 for review.
