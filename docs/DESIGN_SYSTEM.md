# Design system

React 19 / TypeScript 5.8 / Vite 7 / Tailwind CSS 4.3.3; local shadcn/ui new-york components, Radix primitives, Lucide. Exact versions are locked; npm ci is the environment parity contract. `components.json` maps @/ to src. Tailwind scans only src, preventing legacy styles entering SQL bundles.

## Tokens and density

src/index.css is the canonical token source: background, foreground, card, muted, muted-foreground, border, accent, primary, sidebar, nav-active, success and header. Light uses neutral #f6f7f9/#fff and primary #2563eb; dark uses #101318/#181d24 with readable foreground/muted text. Company primary is selected from a validated five-color palette. No gradients or heavy nested shadows. Glass is limited to navigation; subtle borders separate content.

System typography Inter if locally available, then Segoe UI/Arial supports Vietnamese without external font requests. Page titles 24–28 px, section titles 14–16, form/body 12–14, dense metadata 9–11. Metadata remains secondary; controls grow to 16 px on mobile to avoid iOS focus zoom. Spacing follows 4/8/12/16/20/24/32 px, radius 5–14 px. Focus uses a visible primary outline/ring; status includes text and dot, never color alone.

Comfortable is default. Compact reduces table row/sidebar spacing only; selected density, theme, sidebar and table columns use idd.ui.* preferences in localStorage. Credentials, server payloads and business data are excluded. Theme persists across reload/login/setup; no server-private theme storage required.

## Components and interaction

Use shadcn Button variants for primary/outline/destructive/ghost actions; do not create competing button systems. FormField always associates label/id and hint; unknown backend fields are rejected. Input error messages use role=alert; success uses status. Destructive session/activation changes use a Radix focus-trapped confirmation dialog. Self privilege editing is absent, with backend enforcement.

Table sorts/searches/filters on the server, pagination max100; dynamic CSS card rows on mobile preserve the same DTO/actions. Dialog is centered desktop, a sheet on mobile, full-screen when the staff form needs multiple fields. Maintain safe-area bottom spacing and do not cover saves with bottom nav. Native selects are used for short role/catalog filters, compatible with the single primitive system.

Motion is subtle, disabled by prefers-reduced-motion; no essential animation conveys state. LoadingSkeleton, ErrorState/retry and EmptyState replace silent failure. Important actions have text; icon-only controls have accessible names. Validate visible focus, dialog Escape/tab containment, light/dark contrast, horizontal overflow and touch sizing for each new screen. Browser emulation does not prove physical iOS keyboard/notch/installation behavior.

ReUI paid components are prohibited. Free Radix-compatible patterns can be adapted with source/license attribution. New components must reuse these tokens and boundaries; no Next.js/Base UI/MUI/Ant Design addition without a justified architecture change.

Phase 02A uses server-side tables for customer and sales lists, with compact card rows at mobile widths. Customer details provide contact, order history and audit. Use item fieldsets in the sales editor for quantities and collapsible technical requirements. The design library offers a metadata grid/list and version detail. Its image state identifies the Phase 03 upload dependency. The import dialog keeps file mapping, row preview, duplicate policy, confirmation and committed results as separate steps.

Phase 02B reuses the shell and existing TanStack table, Radix dialog, button/input and theme tokens. Production lists use status/plate/machine filters, compact dashboard totals and mobile card rows. Printer details keep the original instruction prominent, collapse secondary metadata and use 48px workflow buttons. Queue and composer distinguish product BAG quantity from technical sheets. Mutation errors preserve form input and expose reload/recovery actions. Revision, plate, issue, cancellation and comments remain separate controls. No arbitrary drag state transition is provided. Attachment UI explicitly states unavailable Phase 03 support.
