# SQL app map

Start with AGENTS.md, PROJECT_STATUS.md and HANDOFF.md. Feature coverage is authoritative in FEATURE_PARITY_MATRIX.md; source Firebase maps are under legacy/firebase/docs and never describe the active runtime.

| Boundary | Owner |
|---|---|
| Runtime / static SPA / graceful shutdown | server.ts, app.cjs |
| Env validation / deployment | server/config.ts, .env.example, HAWKHOST_DEPLOYMENT.md |
| Express middleware / safe errors | server/app.ts, server/middleware/http.ts, server/errors.ts |
| DB / transaction / DDL lifecycle | server/database, server/migrations |
| Session / CSRF / password / rate limits | server/auth |
| Auth/setup routes | server/routes/auth.ts |
| Staff routes | server/routes/users.ts |
| Settings/change feed/audit routes | server/routes/settings.ts |
| DTO repositories / audit + sequence publishing | server/repositories, server/services/audit.ts |
| Shared role + DTO contracts / validation | shared/contracts.ts, server/validation.ts |
| Browser boot / cache boundary | src/main.tsx, src/App.tsx, src/services/api.ts |
| Identity/config/polling | src/context/AuthContext.tsx, ConfigContext.tsx |
| UI shell/navigation/themes | src/components/AppShell.tsx, workspaces.ts, src/index.css |
| Completed account/config screens | LoginModal, BootstrapFirstRun, UserManagementModal, UserProfileModal, SettingsModal |
| Reusable UI/table/state components | src/components/ui, common.tsx, DataTable.tsx |
| Test/CI | tests/unit, tests/integration, tests/e2e, .github/workflows/ci.yml |

Phase 02A business routes are in `server/routes/business.ts`. Database access is in `server/repositories/{customers,customer-import,sales,designs}.ts`. Shared contracts are in `shared/business.ts` and UI workspaces are in `src/components/business/`. Production, finishing, logistics, private R2 and reporting remain scoped to their owning phases.
