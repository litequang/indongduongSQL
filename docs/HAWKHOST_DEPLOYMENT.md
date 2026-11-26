# Hawk Host shared-hosting deployment — preparation only

Status: LOCAL_VALIDATION_REQUIRED. No account was accessed and nothing was deployed. The code is prepared for cPanel / CloudLinux / LiteSpeed / Passenger, but account-specific runtime, process, memory, CPU, connection and database versions are unverified.

Official references checked 2026-11-26: [Hawk Host Node.js app setup](https://www.hawkhost.com/kb/programming/nodejs/how-to-create-a-nodejs-application/) documents mod_passenger and the Setup Node.js App interface; [cPanel Node.js application guide](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/) documents startup-file configuration and Passenger-controlled listening. These support the proposed deployment path, not a claim that this account has the required versions.

## Before packaging

- Verify Node 22.22.2 (or a reviewed Node 22 runtime compatible with the lockfile), npm 10, MariaDB 11.4 or test the exact account DB version against migrations/integration tests. Do not assume MySQL 8 and MariaDB are identical.
- Verify SSH/Node Selector availability, application root outside public upload storage, process count, database connections, memory/CPU limits, outbound R2 HTTPS, and how LiteSpeed/Cloudflare forward HTTPS/client IP.
- Verify APP_ORIGIN is the final HTTPS origin and the app is mounted at `/`. Subpath hosting needs a reviewed Vite base/API/cookie/SW routing change; it is not currently claimed supported.

## Artifact and startup

Build locally/CI with `npm ci`, checks and `npm run build`. Upload app.cjs, build/server.cjs, dist/, package.json, package-lock.json, server/migrations, and runtime CLI source (server/, shared/) if migrating through tsx on host. Do not upload `.env` from PC, .git, legacy/, .local, fixtures, tests, reports, MariaDB binaries/datadir, backups or node_modules from Windows.

Production startup file is `app.cjs`, which requires `build/server.cjs`. Install production dependencies on host using `npm ci --omit=dev`. Application source is bundled; Vite is imported only in development. Migrations are a separate deploy step: temporarily install dev tools to run the checked-in tsx migration CLI before switching to production-only dependencies, or execute migrations from a trusted matching build environment with direct DB access. Do not run migrations automatically inside Passenger startup.

Create a new cPanel database/account with account prefix; set DB_NAME and DB_EXPECTED_NAME to the exact prefixed name. Create a separate test database if testing on staging. Never point at an existing workshop or worship database. Apply migrations with schema privileges; runtime uses restricted DML privileges. Capture backup before any future schema upgrade.

Configure NODE_ENV=production, APP_ORIGIN=https://chosen-origin, HOST/PORT as required by Passenger, DB_HOST/PORT/NAME/EXPECTED_NAME/USER/PASSWORD, DB_POOL_LIMIT=4 (or lower to fit limits), DB_POOL_QUEUE_LIMIT=20, SESSION_HOURS=12 and one-time random SETUP_SECRET. R2 variables remain blank until dedicated private buckets/credentials are authorized. No VITE secret variables.

Passenger controls the listening endpoint; the server accepts environment PORT (number or socket), with a development fallback, and has no production-only fixed port 3000. Confirm the provider's prescribed setting. Node scrypt uses native crypto, no platform addon. One pool per process; maximum DB demand is pool limit × Passenger process count. Password hashing is bounded to two operations per process; measure memory and lower concurrency/cost only after security review on the actual plan.

## Routing, HTTPS and caching

Express serves `/api` first, then hashed static dist assets, then SPA index fallback for extensionless routes. Unknown APIs return JSON 404. Serve all routes through Passenger; do not let a static rewrite send /api to index.html. Never serve server.cjs, source, env or migration files as static files.

Enforce HTTPS in the hosting/CDN configuration. Secure __Host- cookies require HTTPS with path=/ and no Domain. Verify trusted proxy topology before setting TRUST_PROXY_HOPS=1 or 2; keep 0 unless the forwarding path is controlled. Validate request IP against spoofed forwarded headers and verify rate limiting in staging. Origin checks require exact configured origin. No wildcard CORS.

Disable LiteSpeed/Cloudflare caching for /api and authenticated responses; honor no-store/private. SW explicitly routes /api NetworkOnly and excludes it from SPA navigation fallback. Inspect real response headers, cookie flags and CacheStorage after deployment. Static assets under /assets have immutable hashes; index/manifest/SW use no-cache/no-store policies.

## Operations

Use cPanel application restart (or provider-documented restart control); do not add PM2 or a daemon manager. SIGTERM/SIGINT close HTTP and pool. Check /api/health and /api/ready separately; ready verifies DB/schema/checksums. Application logs contain generic error categories without SQL/credentials; cPanel access/error logs remain private. Store DB backups outside webroot, restrict permissions, test restore into a separate database; never commit dumps. Session/rate cleanup is request-driven and bounded; future large audit/change retention and image backup work needs explicit maintenance/cron design.

After uploading: verify schema readiness, first-run setup with secret, login/session/revocation, all role restrictions, static/SPA paths, HTTPS cookies/Origin/CSRF, PWA API exclusion, reverse-proxy rate behavior, restart persistence, private backup and resource consumption. No production rollout is authorized in Phase 01. Physical iPhone/iPad/Android installation, keyboard/safe-area behavior and account-specific hosting limits remain LOCAL_VALIDATION_REQUIRED.
