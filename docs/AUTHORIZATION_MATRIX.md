# Authorization matrix

Trusted actor comes from a nonexpired MariaDB session joined to the current active user. No role/body/header or UI preview can change authority. A mutation rechecks the session and role while holding the global state lock; staff changes are effective on the next request. Sensitive changes delete all target sessions. Browser menus only present the same capabilities.

| Action                                                               | Developer                    | Admin                | Manager        | Designer | Sale           | Printer | Finisher | Warehouse |
| -------------------------------------------------------------------- | ---------------------------- | -------------------- | -------------- | -------- | -------------- | ------- | -------- | --------- |
| Health/ready/setup status                                            | public                       | public               | public         | public   | public         | public  | public   | public    |
| First bootstrap                                                      | one-time secret, empty state | —                    | —              | —        | —              | —       | —        | —         |
| Directory/settings read, own session                                 | yes                          | yes                  | yes            | yes      | yes            | yes     | yes      | yes       |
| Self profile/password/logout/revoke own sessions                     | yes                          | yes                  | yes            | yes      | yes            | yes     | yes      | yes       |
| Create/manage/reset/revoke another user                              | all roles                    | only six lower roles | no             | no       | no             | no      | no       | no        |
| Assign Developer/Admin                                               | yes                          | no                   | no             | no       | no             | no      | no       | no        |
| Change own role or lock self                                         | no                           | no                   | no             | no       | no             | no      | no       | no        |
| Company/catalog/workflow settings write                              | yes                          | yes                  | no             | no       | no             | no      | no       | no        |
| Administrative audit read                                            | yes                          | yes                  | no             | no       | no             | no      | no       | no        |
| Bounded users/settings invalidation feed                             | yes                          | yes                  | yes            | yes      | yes            | yes     | yes      | yes       |
| Customer, sales and design reads                                     | yes                          | yes                  | yes            | yes      | yes            | yes     | yes      | yes       |
| Customer create/update/soft delete, batch delete and duplicate check | yes                          | yes                  | yes            | no       | yes            | no      | no       | no        |
| Customer import stage/preview/confirm/process/history                | own jobs                     | own jobs             | own jobs       | no       | own jobs       | no      | no       | no        |
| Sales draft creation, design creation and version updates            | yes                          | yes                  | yes            | yes      | yes            | no      | no       | no        |
| Sales draft edit, confirm and cancel                                 | eligible state               | eligible state       | eligible state | no       | eligible state | no      | no       | no        |
| Sales privileged reopen from delivered or completed                  | reason required              | reason required      | no             | no       | no             | no      | no       | no        |
| Any unmigrated business API                                          | absent                       | absent               | absent         | absent   | absent         | absent  | absent   | absent    |

Admin's six target roles: MANAGER, DESIGNER, SALE, PRINTER, FINISHER, WAREHOUSE. Developer must retain at least one active Developer; self privilege/activation changes are denied. Profile fields allowed: name, phone, machineAssigned (source Rules allowed these self edits); username is immutable after creation in this foundation. Avatar upload is pending private R2 authorization. Self password change requires current password; privileged reset uses expected target version and revokes sessions.

Source authority: `legacy/firebase/firestore.rules` users/settings; `functions/src/staffProvisioningService.ts` lines governing caller/assignable roles; `functions/src/workflows/workflowAuth.ts`; frontend permission helpers. Source Rules read all staff for authenticated active users and allow settings writes to isAdmin (Developer/Admin). The customizable frontend matrix did not override server workflow policy. It remains deferred; SQL does not grant extra rights from browser flags.

Phase 02 policies retained: management = Developer/Admin/Manager; sales authority = those plus Sale; design technical = management + Designer. Assigned Printer alone accepts/ACKs/starts/completes/resolves cancellation where required. Warehouse dispatch authority is exact WAREHOUSE (source helper test expecting MANAGER is obsolete). Product Finisher authority and issue reporter/recipient scope are object-level checks, not inherited specialist powers for management. See WORKFLOW_V2_MAP.md reference and feature matrix before implementing.

Phase 02B implements those production policies. Creator alone reads/edits their SQL drafts. Active users read official production; PRINTER reads only assigned official work, and its change feed uses the same object scope. Commercial/design roles create/dispatch, link sales products, set urgent metadata and request pre-print cancellation. The queue is readable for composing by those roles; only technical roles change its state/instructions. Technical roles revise/reassign before print and send/reissue plates. Technical roles or assigned PRINTER receive a SENT plate. Management or assigned PRINTER report broken/missing plates before printing. No blanket management bypass exists for printer acceptance/ACK/start/complete/cancellation response.

Issue type reporter policy is in shared/production.ts. Recipients are checked against active users and supported roles. Only reporter cancels OPEN issues. Among the seven roles admitted by the source production callable (all except WAREHOUSE), a selected user or recipient role resolves; upward management inheritance only applies to a selected management role. A selected specialist never grants management authority. FINISHER can report GENERAL issues and act on its selected issues. WAREHOUSE reads official production only; warehouse issue/workflow actions belong to 02C. Commercial/design roles and assigned PRINTER can comment; comments confer no workflow authority.

Phase 02A customer, sales and sample reads mirror authenticated-active Firestore reads. Sales rules and callable transitions permit commercial roles across orders. Draft item updates require membership of the target draft. Import jobs and their row payloads are restricted to the actor who staged them, including for management accounts. Roles are derived from the live session. A valid stale version receives a 409 for review.

## Phase 02C fulfillment

| Action | Authority |
| --- | --- |
| Receive, claim, start, complete, confirm no-work, respond to finishing cancellation | FINISHER. An assigned task is restricted to its assigned user. Only the claimant starts, completes or responds. |
| Assign ready task, change priority, request finishing cancellation | Developer, Admin, Manager, Designer or Sale. A claimed task needs its claimant's response. |
| Product acceptance | Sale and management per source callable, or the assigned/claiming FINISHER. Review requires task completion/no-work or an ended finishing cancellation. |
| Stock and dispatch review | WAREHOUSE and commercial roles. FINISHER can view their scoped lots. |
| Execute or reverse whole-order dispatch | Exact WAREHOUSE. |
| Create or advance shipment, inspect returned lines | Sale and management. WAREHOUSE can read delivery status and source slips. |
| Report fulfillment issue | Commercial/design roles or the in-scope FINISHER for finishing. WAREHOUSE or commercial roles for an accepted lot. |
| Close issue | Reporter cancels. Selected user/role resolves. Upward inheritance applies to management recipients only. |

All reads and writes require active sessions. The global fulfillment feed emits an opaque workspace invalidation. The applicable list/detail endpoint separately checks its role and object scope.
