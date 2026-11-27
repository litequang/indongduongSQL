# Private images and recovery

Phase 03 runs inside the existing Express process. No worker, Redis, filesystem provider fallback or browser API cache is required. Implemented endpoints use current SQL sessions and object authorization. The owner chose local implementation/testing while dedicated R2 development buckets are unavailable; real R2 acceptance remains **LOCAL_VALIDATION_REQUIRED**.

## Configuration and live dev acceptance

Create two **new private development buckets**, with public access disabled, and a token scoped to only those buckets. Store `R2_ENDPOINT`, `R2_BUCKET`, `R2_BACKUP_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_ENVIRONMENT=development` privately in `.env`. `R2_ENVIRONMENT` must equal `NODE_ENV` (development by default); backup and primary names must differ. The production app must have separate buckets/token and `R2_ENVIRONMENT=production`. No credentials, bucket names or bearer URLs are returned to clients. Standard automated tests ignore runtime R2 configuration and inject test-only transport where needed.

Run on the dedicated dev configuration only:

```powershell
$env:ALLOW_R2_DEV_SMOKE = '1'
npm run test:r2-dev
Remove-Item Env:ALLOW_R2_DEV_SMOKE
```

The probe creates synthetic bytes under a random `smoke/<UUID>` in both buckets, verifies full-byte SHA-256, conditional create/retry/conflict, deletion and missing-only restoration, then removes only its own keys. It rejects production/test configuration. Follow with the real UI workflow below. This command has **not** been executed against R2 in this checkpoint. Never use existing production buckets or tokens to complete acceptance.

R2 conditional writes use [Cloudflare's atomic If-None-Match semantics](https://developers.cloudflare.com/r2/reference/consistency/). AWS SDK configuration follows [Cloudflare's SDK v3 reference](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/). Image decoding follows [sharp's constructor limits](https://sharp.pixelplumbing.com/api-constructor/). Native sharp/libvips availability and memory/request limits on Hawk Host need account-specific validation before deployment. The upload path proxies up to 5 MiB rather than issuing browser-facing presigned URLs, preserving immediate session/assignment enforcement and avoiding bucket CORS requirements.

## Image lifecycle and UI

1. A design editor or production composer creates an owner-scoped ticket for its stable target UUID. The ticket expires after five minutes. There can be at most 100 outstanding unreferenced images per user.
2. Binary upload authenticates and checks Origin/CSRF **before** body allocation. At most two concurrent uploads per process, 30/IP per limiter window, 5 MiB body/output and 16 million pixels. JPEG/PNG/WebP must decode fully; animation/SVG/malformed data are rejected. Normalization strips metadata/trailing payloads. MIME is detected from decoded bytes.
3. A conditional write creates immutable bytes at `images/<registry UUID>`. Retry with identical normalized bytes succeeds; different content cannot overwrite. SQL activation follows a fresh session/target/expiry check. A lost DB response is recoverable by retry; failed unreferenced uploads can be cleaned later.
4. Save a new design version or a creator-owned production draft to link the registry ID. A different target or another user's unattached image is rejected. Official production images stay immutable; a changed image requires a new run. Forking supplemental/reprint runs clears old attachment IDs. Sales design-version snapshots retain original references.
5. Reads check the current relationship and role. Production drafts are owner private; PRINTER only reads current assigned official runs. Downloads validate SHA-256 and recheck the session/relationship after storage I/O. Every API response, including bytes, is no-store and excluded from the service worker. Only temporary in-memory Blob URLs display images.
6. An owner may delete only unreferenced images. Developer cleanup processes at most ten unreferenced images older than a day or previously deleted objects. SQL tombstones precede physical deletion; retry cleanup completes failed deletes. Successful cleanup marks the key `retired/<UUID>` to avoid starving later cleanup rows. Backup bytes have separate retention and are not silently purged.

In the composer, save the SQL draft first so its stable target and print-image slot can be reopened. Select an image and choose **Lưu nháp ảnh trên thiết bị** for explicit device persistence. F5/reopen of that same SQL draft recovers the File. Choose **Tải và xác minh ảnh**, then **Lưu nháp**. Design attachments are linked by **Lưu mẫu/Lưu phiên bản**. Quota/storage/network errors leave selected bytes in memory and display a retryable error. Saving a device draft before the first SQL save does not create a discoverable business draft; preserve/open the same target to recover it. IndexedDB contains only selected Files/account-target-slot keys, not API payloads or tokens. Logout and confirmed session expiry clear it; offline F5 requires reconnection to authenticate before recovery. Cross-device synchronization is deliberately through acknowledged SQL/R2 saves.

## Image backup and restore

Developer opens **Lưu trữ hình ảnh**. A job snapshots up to 500 active registry IDs ordered by UUID; a full group exposes a continuation creating the next group after its last ID. Each run handles one image and persists an OK/FAILED outcome and attempt count. Network interruptions can be retried after F5/server restart. Concurrent retries are safe because object writes are conditional.

- BACKUP verifies primary bytes, writes `verified/<image UUID>/<SHA-256>` to the separate backup bucket and reads it back to verify. Existing mismatching backup bytes cause failure.
- VERIFY checks both primary and backup bytes. Coverage counts historical successful backup jobs and is not a claim that the provider still contains all bytes; run VERIFY to audit current integrity.
- RESTORE checks an existing primary object and leaves it unchanged. Only an absent primary is written from a verified backup; read-back verifies it again. Corrupt existing primary or backup bytes cause failure and require an operator's separate decision; the endpoint cannot overwrite either. Retired registry images are never restored.

These are **image** backup jobs. They do not export/restore MariaDB tables, provision databases, schedule automatic purges, or perform a hosting deployment. Protect and test MariaDB logical backups separately under the hosting operations scope. SQL registry/job history is part of that database backup; object copies alone cannot reconstruct business relationships.

## Notifications and incremental sync

Notifications are inserted in the same state-locked transaction as commit-ordered change events. Production recipients are the draft creator, or official creator/current printer/eligible selected open-issue recipients with exact specialist rules. Sales notifications go to the responsible salesperson. Fulfillment sends only a generic workspace alert to active FINISHER/WAREHOUSE accounts, without task payload or identity. Reassignment hides former-printer alerts on read. Each account alone marks its own rows read. A descending BIGINT string cursor pages 30 rows; no numeric precision loss.

The bell polls every four seconds while visible/online through TanStack Query; focus/reconnect refetch. Read changes publish a user-scoped invalidation. Sound and Vietnamese speech are opt-in UI preferences and subject to browser audio/voice support; no browser push permission or external messaging is used. Authentication loss clears the in-memory query cache and device draft store. Notification/change history currently has no automatic retention purge.
