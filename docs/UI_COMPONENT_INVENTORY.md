# UI component inventory

| Requested capability | Implementation | Phase 01 status |
|---|---|---|
| AppShell / ResponsiveSidebar | AppShell.tsx desktop sidebar + tablet rail | Implemented |
| MobileNavigation / additional menu | AppShell.tsx | Implemented; role-based, safe-area aware |
| PageHeader | common.tsx | Implemented |
| GlobalSearch | AppShell.tsx | Navigation search; not global business-data search |
| NotificationCenter | AppShell.tsx | Explicit unavailable state; Phase 03 backend pending |
| DataTable | DataTable.tsx + shadcn table | TanStack, server pagination/sort, column visibility |
| DataToolbar / FilterBar | DataTable.tsx | Employee search/role/activation filter |
| StatusBadge / PriorityBadge | common.tsx | Status used; priority prepared for real workflows |
| EmptyState / LoadingSkeleton / ErrorState | common.tsx | Implemented and used |
| ConfirmDialog / ResponsiveDialog | common.tsx + shadcn Dialog | Radix focus/keyboard; mobile sheet/fullscreen form |
| DetailPanel | common.tsx | Employee detail and authorized actions |
| ActivityTimeline | common.tsx | Real administrative SQL events |
| ImagePreview | common.tsx | Prepared; no upload or R2 signing endpoint |
| QuantityInput | common.tsx | Prepared integer UI; domain quantity validation awaits Phase 02 |
| FormField | common.tsx | Label/input/hint, native validation + server errors |
| ConnectionStatus | common.tsx | Online state and real /ready check |
| Login / BootstrapFirstRun | LoginModal.tsx / BootstrapFirstRun.tsx | New UX, actual SQL auth/setup |
| Users / Profile / Settings | named components matching source owners | New screens with real repositories/API |
| Business tables/kanban/filter/timeline patterns | UI_UX_ARCHITECTURE.md | Documented for Phase 02; no fake production operations |

No wholesale template import, duplicate primitive system, paid component or unsanctioned drag/drop workflow. UI_RESPONSIVE_TEST_REPORT.md records executed evidence; THIRD_PARTY_NOTICES.md records provenance.
