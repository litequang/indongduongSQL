# Third-party notices

Audited 2026-11-26. Only free, commercially permitted source/dependencies are used. No paid template is imported. Preserve the linked original copyright/license text when redistributing. The application itself is user-owned; this file does not relicense the source repository.

Phase 03 additions audited 2026-11-27: [AWS SDK JS v3](https://github.com/aws/aws-sdk-js-v3), locked client-s3 3.1178.0, Apache-2.0; [sharp](https://github.com/lovell/sharp) 0.35.5, Apache-2.0. sharp's prebuilt Windows native dependency notices and exact codec versions are retained in [native notices](docs/licenses/sharp-win32-x64-dependencies.md) and [versions](docs/licenses/sharp-win32-x64-versions.json), including libvips 8.18.7 LGPLv3 and the listed free codec licenses. Hosting redistribution must retain the notices shipped for its installed Linux platform too. No binary or user image is copied into Git.

| Source | Audited commit | License | Use |
|---|---|---|---|
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | `a156d9b90519348c4d71f0f0e6fcea179c49a43f` | [MIT](docs/licenses/satnaing-shadcn-admin.txt) | App-shell/grouped-navigation reference only; no template wholesale copy |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | `0e5b2e621a9ee4cf6a604bbe6c5c0d5b70561eb4` | [MIT](docs/licenses/shadcn-ui-ui.txt) | Six adapted local primitives: Button, Input, Label, Badge, Table, Dialog; imports and responsive positioning adapted |
| [keenthemes/reui](https://github.com/keenthemes/reui) | `067aa0dc7f8bbfec1cd76fc5ad31f842be5f569a` | [MIT](docs/licenses/keenthemes-reui.txt) | Free Radix data-grid/timeline patterns reviewed; own simplified business components; no paid assets copied |
| [shadcndashboard/shadcndashboard](https://github.com/shadcndashboard/shadcndashboard) | `a9fecfad7d4cf440769255b6c99f38f8c0671b71` | [MIT](docs/licenses/shadcndashboard-shadcndashboard.txt) | Dashboard/table UX reference; Base UI implementation not imported |
| [TanStack/table](https://github.com/TanStack/table) | `6d48b56fa6391526b9e38214e13b46e90d5e9501` | [MIT](docs/licenses/TanStack-table.txt) | Installed React Table v8; controlled server data tables |
| [TanStack/query](https://github.com/TanStack/query) | `18b1aded329058c074cda6b1c1a08aba73fdc914` | [MIT](docs/licenses/TanStack-query.txt) | Installed React Query v5; in-memory private server state |
| [recharts/recharts](https://github.com/recharts/recharts) | `47b54cdf852e5976871a55a373b38ec8b722436a` | [MIT](docs/licenses/recharts-recharts.txt) | Locked 3.11.1 used for Phase 04 real SQL production charts; official [API](https://recharts.github.io/en-US/api/) ResponsiveContainer/BarChart/Bar patterns, own report UI; license retained |
| [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | `9fcde889d8ed0c6f739cff76e086c27e072e83ec` | [ISC + MIT (Feather-derived icons)](docs/licenses/lucide-icons-lucide.txt) | Installed Lucide React icons; ISC and Feather-derived MIT notices retained |

## Locked direct dependencies

| Package | Version | License |
|---|---|---|
| @axe-core/playwright | 4.14.1 | MPL-2.0 |
| @aws-sdk/client-s3 | 3.1178.0 | [Apache-2.0](docs/licenses/aws-sdk-client-s3-package.txt) |
| @eslint/js | 9.39.5 | MIT |
| @playwright/test | 1.62.1 | Apache-2.0 |
| @tailwindcss/vite | 4.3.3 | MIT |
| @tanstack/react-query | 5.108.4 | MIT |
| @tanstack/react-table | 8.21.3 | MIT |
| @types/express | 4.17.25 | MIT |
| @types/papaparse | 5.5.2 | MIT |
| @types/node | 22.20.1 | MIT |
| @types/react | 19.2.18 | MIT |
| @types/react-dom | 19.2.4 | MIT |
| @vitejs/plugin-react | 5.2.0 | MIT |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| dotenv | 17.4.2 | BSD-2-Clause |
| esbuild | 0.25.12 | MIT |
| eslint | 9.39.5 | MIT |
| express | 4.22.3 | MIT |
| fflate (test fixture generation) | 0.8.3 | [MIT](docs/licenses/fflate-package.txt) |
| globals | 16.5.0 | MIT |
| helmet | 8.3.0 | MIT |
| lucide-react | 0.546.0 | ISC |
| mysql2 | 3.24.6 | MIT |
| papaparse | 5.7.1 | [MIT](docs/licenses/papaparse-package.txt) |
| prettier | 3.10.1 | MIT |
| radix-ui | 1.8.1 | MIT |
| react | 19.2.8 | MIT |
| react-dom | 19.2.8 | MIT |
| read-excel-file | 9.3.20 | [MIT](docs/licenses/read-excel-file-package.txt) |
| recharts | 3.11.1 | MIT |
| tailwind-merge | 3.7.1 | MIT |
| sharp | 0.35.5 | [Apache-2.0](docs/licenses/sharp-package.txt) |
| tailwindcss | 4.3.3 | MIT |
| tsx | 4.23.12 | MIT |
| typescript | 5.8.3 | Apache-2.0 |
| typescript-eslint | 8.74.0 | MIT |
| vite | 7.3.8 | MIT |
| vite-plugin-pwa | 1.3.0 | MIT |
| zod | 4.6.7 | MIT |

Compatibility verified by npm install/ci lockfile resolution, TypeScript/build and real browser tests: React 19.2.8, Vite 7.3.8, Tailwind 4.3.3, Radix 1.8.1, Table 8.21.3, Query 5.108.4. React peer ranges and native Node 22 runtime are satisfied. ReUI root includes both Base and Radix; only the Radix reference was selected. Shadcn Admin app/sidebar organization is referenced without its router/auth/demo/business template.

glob 14.0.6 and minimatch 11.0.9 are overridden in package.json to address transitive build-tool advisories; tested PWA output remains compatible. npm audit was zero after resolution. Keep npm lockfile and these overrides reviewed together.

Transitive dependency notices remain in installed package distributions; retain them when redistributing bundled software. Build/hosting tooling is not a license to reuse any paid ReUI/Keenthemes product.
