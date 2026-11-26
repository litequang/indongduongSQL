# Feature navigation

This is an owner lookup; implementation status lives only in FEATURE_PARITY_MATRIX.md.

- Accounts/setup/login/profile: src/context/AuthContext.tsx, named account components, server/routes/auth.ts, server/auth.
- Employee directory/lifecycle: UserManagementModal.tsx, DataTable.tsx, userRepository.ts, server/routes/users.ts, shared/contracts.ts.
- Company/catalog/workflow config: ConfigContext.tsx, SettingsModal.tsx, settingsRepository.ts, server/routes/settings.ts.
- Change polling/audit: ConfigContext.tsx, DashboardOverview.tsx, server/services/audit.ts, system_state/change_events/audit_logs migrations.
- UI tokens/responsive/navigation: src/index.css, AppShell.tsx, workspaces.ts, components/ui and common.tsx; see UI_COMPONENT_INVENTORY.md.
- Business modules not yet implemented: FEATURE_PARITY_MATRIX.md and legacy/firebase/docs/FEATURE_MAP.md.

Update this owner map and affected architecture docs when responsibility, flow or authorization changes. Do not duplicate state or invent parity from an available menu.
