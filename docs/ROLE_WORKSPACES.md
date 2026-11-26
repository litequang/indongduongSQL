# Role workspaces

All roles share UI tokens and primitives. Actual navigation definitions and priorities are centralized in src/components/workspaces.ts; backend capability checks are in shared/contracts.ts and server routes. Menu visibility does not grant API authority.

| Role | Dashboard and primary navigation | Phase 01 usable actions |
|---|---|---|
| DEVELOPER | System, users, settings, storage, audit | All staff hierarchy management, own profile, settings, audit |
| ADMIN | Overall administration, users, settings, operations | Manage six lower roles, own profile, settings, audit |
| MANAGER | Production control, finishing, warehouse | Directory, own profile/password, read configuration; business queues pending |
| SALE | Customers, sales orders, shipment progress | Directory, profile/password, read configuration; commercial work pending |
| DESIGNER | Design queue, samples/imposition, production/plates | Directory, profile/password, read configuration; design work pending |
| PRINTER | Assigned print work, acceptance/ACK/start/completion, plates | Directory, profile/password, read configuration; task actions pending |
| FINISHER | Per-product finishing queue and explicit confirmation | Directory, profile/password, read configuration; queue pending |
| WAREHOUSE | Finished goods, dispatch and delivery | Directory, profile/password, read configuration; stock actions pending |

The dashboard displays actual account, workshop configuration and directory count. Administrative activity comes from SQL audit rows. There are no fabricated sales totals, throughput charts or task counts. Future modules show 'Phân hệ chưa khả dụng'; notifications and storage are explicitly pending. No role-switch demo mode is mounted in production.

Mobile bottom navigation contains overview, the role's first operational module, profile and an additional menu. Tablet rail retains full menu availability through icon titles; larger desktop supports expanded/collapsed sidebar. Specialist-role backend policies remain exact and do not gain management inheritance from a dashboard.
