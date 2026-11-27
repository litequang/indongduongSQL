# SQL app map

Start with AGENTS.md, PROJECT_STATUS.md and HANDOFF.md. Feature coverage is authoritative in FEATURE_PARITY_MATRIX.md; retired source Firebase maps are available at `9231886:legacy/firebase/docs` in Git history and never describe the active runtime. SOURCE_PROVENANCE and PHASE_04_PARITY own the retirement mapping.

| Boundary                                       | Owner                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Runtime / static SPA / graceful shutdown       | server.ts, app.cjs                                                                  |
| Env validation / deployment                    | server/config.ts, .env.example, HAWKHOST_DEPLOYMENT.md                              |
| Express middleware / safe errors               | server/app.ts, server/middleware/http.ts, server/errors.ts                          |
| DB / transaction / DDL lifecycle               | server/database, server/migrations                                                  |
| Session / CSRF / password / rate limits        | server/auth                                                                         |
| Auth/setup routes                              | server/routes/auth.ts                                                               |
| Staff routes                                   | server/routes/users.ts                                                              |
| Settings/change feed/audit routes              | server/routes/settings.ts                                                           |
| DTO repositories / audit + sequence publishing | server/repositories, server/services/audit.ts                                       |
| Shared role + DTO contracts / validation       | shared/contracts.ts, server/validation.ts                                           |
| Browser boot / cache boundary                  | src/main.tsx, src/App.tsx, src/services/api.ts                                      |
| Identity/config/polling                        | src/context/AuthContext.tsx, ConfigContext.tsx                                      |
| UI shell/navigation/themes                     | src/components/AppShell.tsx, workspaces.ts, src/index.css                           |
| Completed account/config screens               | LoginModal, BootstrapFirstRun, UserManagementModal, UserProfileModal, SettingsModal |
| Reusable UI/table/state components             | src/components/ui, common.tsx, DataTable.tsx                                        |
| Test/CI                                        | tests/unit, tests/integration, tests/e2e, .github/workflows/ci.yml                  |

Phase 02A business routes are in `server/routes/business.ts`. Database access is in `server/repositories/{customers,customer-import,sales,designs}.ts`. Shared contracts are in `shared/business.ts` and UI workspaces are in `src/components/business/`. Later production, finishing, logistics, private R2 and reporting are described by their current owners below.

Phase 02B production routes are in `server/routes/production.ts`, SQL reads/draft/queue writes in `server/repositories/production.ts`, authoritative transitions/allocation/handoffs in `server/services/production-workflow.ts`. Contracts and ported parser/matcher are under `shared/production.ts`, `quick-order-parser.ts`, `printer-matching.ts`. `src/components/production/` owns DesignerQueue, QuickComposer, production list/detail, printer/plate/revision/issues/cancellation and late linking. Tests use real MariaDB/HTTP and Playwright `phase-02b` suites. Migrations 004/005 implement production; migrations 006-008 implement the later workflows and private operations/access below.

Phase 02C: `server/routes/fulfillment.ts`, `repositories/fulfillment.ts`, fulfillment services, shared/fulfillment.ts and src/components/fulfillment own product receipt/finishing/acceptance/stock/whole-order dispatch/logistics. Phase 03: routes/private-operations.ts, storage/, services/notifications.ts and frontend private/ plus services/device-drafts.ts own private objects, device Files, backup jobs and notifications. PRIVATE_OPERATIONS defines external validation.

Phase 04: routes/{access,reports}.ts, services/access.ts, shared/{access,reports}.ts and frontend Reports/AccessSettings/UserGuide implement real reporting, bounded policy/features and help. User repository/routes/validation and storage/registry implement avatar references; frontend private/Avatar and UserProfile display/edit them. shared/submission-lock.ts is used by QuickComposer and SQL regression tests. Runtime graph validation rejects a restored Firebase dependency/reference. The canonical coverage remains FEATURE_PARITY_MATRIX.
