# Decisions

## 2026-11-27 — Phase 03 local authorization and private operations

After Cloud 02C handoff `5d5af17`, the owner instructed PC to continue the next phase and push a handoff, then explicitly chose local implementation/testing with real R2 dev acceptance pending. PC uses `codex/phase-03-private-operations`; main/PRs are not merged. Phase 04 and deployment remain outside this task.

Same-origin authenticated binary proxy with a five-minute owner ticket replaces the proposed browser presigned URL flow. This keeps current assignment/session checks on every download, hides storage credentials/URLs and avoids CORS. Full decoding/normalization with sharp and conditional S3 writes precede SQL activation. The fixed image registry target and immutable references prevent file UUID substitution. Official production images cannot be edited; new runs clear copied attachment IDs. No provider fallback is added.

Only explicitly selected attachment File blobs may persist in account/target/slot-scoped IndexedDB; SQL metadata/API results/tokens remain memory-only. Logout/confirmed auth expiry purges device files. Acknowledged SQL drafts provide discoverable stable targets; unsaved new forms still require saving before a target can be reopened. This narrow Phase 03 exception supersedes the earlier absolute browser-memory wording for selected attachment drafts, without introducing offline business mutations.

Notifications are transactional recipient rows, reauthorized against current production visibility, with private read-state invalidations and string BIGINT pagination. Fulfillment emits generic workspace alerts rather than leaking task IDs. Sound/voice are opt-in UI choices. Image backup jobs snapshot up to 500 IDs with continuation, run one image/request and verify full bytes before/after copying. Restore is missing-only; corrupt existing objects require a separate operator decision. Image jobs do not replace MariaDB backups. Automatic retention/push messaging/scheduled jobs are not silently introduced.

## 2026-11-27 — Phase 02C downstream transactions

A FINISHER receives a valid print handoff once. The task UUID is the handoff UUID. Numeric late linking remains available until a standalone handoff is received. After receipt, the production transaction rejects supersession and preserves the task and any acceptance. Zero TRACE, RELEASED allocations and superseded rows cannot enter the finishing queue. A single task records either specialist completion or explicit no-work confirmation. Source cancellation can end the finishing task, with a recorded request/response; warehouse quantities still require a separate inspection.

Inspection records accepted, rejected and short quantities whose sum equals the handoff quantity. Rejection or shortage requires a reason. Only accepted quantity creates a lot and a stock movement. One receipt per handoff and the ordered BAG cap apply transactionally. Non-printing items wait for a confirmed physical source. REPRINT rows retain the source allocation and traceable original inspection. Acceptance stays blocked until the owner approves operational replacement rules.

Use whole-order dispatch against locked accepted lots. The server allocates exact demand per active item, in lot creation order. The same transaction writes the numbered slip, snapshot, movements and sales progress. Only WAREHOUSE executes or reverses dispatch. Reversal remains available before possession transfers to a carrier. A cancellation permitted by the shipment graph leaves the existing slip available for a new shipment.

The source commercial roles create shipments, apply the source transition graph and inspect returns. An active dispatch has one effective shipment. Returned lines preserve the quantity on the dispatch and record restock, scrap or hold individually. Only explicit restock increases available quantity. A fully restocked dispatch may be followed by a new whole-order dispatch. A mixed/scrapped/held return keeps the active dispatch for follow-up. The owner must confirm any replacement workflow for stock that cannot be restored. Reopen is blocked when fulfillment history exists.

## 2026-11-27 — Phase 02B quantities and traceability

The PC task authorizes 02B after 02A acceptance. Production quantities are integer BAG units; technical sheets and actual/spoilage sheets remain separate. No sheet-to-product conversion is implemented. A production item can join several sales products, and one sales product can span multiple runs. OUTPUT quantities consume the sales request cap only after dispatch. Draft proposals do not reserve capacity. The state-first transaction lock serializes capacity checks, codes, cancellation reconciliation, audit and invalidations. Cancellation releases only the cancelled run's allocations and retains their rows.

TRACE links have exactly zero quantity and never create numeric sales output. Supplemental runs are new records with a source run and reason; their OUTPUT allocations must fit the remaining requested BAG quantity. REPRINT is explicit replacement, linked to an ACTIVE OUTPUT allocation of a PRINTED source run. It does not increase the requested-output total. Its cumulative active replacement quantity is capped by that original allocation. This conservative numeric contract follows the task's conservation requirements; it does not reinterpret old zero links. Phase 02C must reconcile replacement acceptance against its source, never add both as new accepted output. Workshop policies for additional commercial quantity need a future decision rather than an allocation override.

Official standalone runs can be linked before or after printing. Backend ownership, quantity and immutable design-version checks still apply. A printed standalone handoff is retained with `superseded_at` when numeric sales allocations replace it. New per-allocation handoffs are written in the same transaction. A unique run/design ledger prevents late linking or retries from counting a design print twice; last-printer metadata records the actual assigned printer and original print time.

## 2026-11-27 — Drafts, official send and attachments

SQL drafts are private to their creator and recoverable after F5/backend restart. This adapts the legacy metadata backup to the SQL project's memory-only private browser-cache boundary. Unsaved form input lives in React memory; only an acknowledged Save is durable. There is no production localStorage fallback, private service-worker cache or automatic promotion of a draft into an official run. The UI retains input through failed requests and can recover an official result after a committed send whose response was lost. Stable request UUIDs, actor/hash receipts and a synchronous UI lock make retries safe. A batch contains at most 20 independently committed sends with a result for each row.

No attachment chooser accepts files in 02B. Print-image records hold labels, notes and sheet counts only; registry IDs remain NULL, with no invented URL/base64. The UI identifies the Phase 03 dependency. Blob/device attachment persistence is deferred until that feature is authorized; valid metadata drafts are preserved now.

## 2026-11-27 — Production authority and Phase 02C boundary

Assigned PRINTER alone accepts, ACKs the exact latest revision, waits, starts, completes, or responds to a cancellation. Management has no specialist bypass. Starting requires ACCEPTED/WAITING_PRINT, current ACK and no pending cancellation. Technical revision/reassignment is limited to pre-print; reassignment resets acceptance/ACK. Plate and issue states are parallel and never add a start gate. Broken/missing plate, reissue and receive retain source action/object authority. Issue reporters may cancel their OPEN report; selected recipients may resolve or reassign. Upward management inheritance applies only to selected management roles, never to a selected specialist role/person.

Print completion records actual/spoilage sheets, history and `PENDING_02C` handoffs atomically. Linked handoffs retain the sales product's requires-finishing flag; false still requires a future no-work checkpoint. 02B does not create finishing tasks, accepted stock, warehouse readiness, dispatch or shipments. Partially allocated products remain available for further production; parent lifecycle is derived from actual run/product states. Sales cancellation is blocked while effective production links or downstream work exist.

## 2026-11-26 — Independent SQL system

New empty data, stable UUID users and relational core. No data/password migration, Firebase adapters or dual runtime. Keep sanitized source only as isolated Phase 02 reference. Source provenance and removed internal-looking fixtures are documented in SOURCE_PROVENANCE.md.

## 2026-11-26 — Shared hosting monolith

Express REST and static Vite frontend on one origin; MariaDB bounded pool; native scrypt and DB sessions. No native hash addon required on Hawk Host. Explicit checksummed migrations with named lock and durable DDL-failure state. Credentials supplied through environment; no hosting deployment this phase.

## 2026-11-26 — UI redesign supersedes preservation requirement

Modern neutral enterprise shell with configurable blue accent, shadcn/ui / Radix primitives, Tailwind v4, Lucide, TanStack Table/Query. ReUI is a selective free-pattern reference; no wholesale template import. Business semantics and permissions remain unchanged; unfinished modules are clearly unavailable. Recharts reporting awaits real report endpoints.

## 2026-11-26 — Polling consistency

Use commit-ordered transactional sequence guarded by a shared system row. Auto-increment IDs or timestamp-only cursors can miss late commits. Optimistic record versions reject stale edits. Background tabs pause polling and focus/reconnect refetch; private cache is memory-only.

## 2026-11-26 — PC / Cloud

GitHub is canonical. One writer per branch, no force push or automatic untested merge. Tested code checkpoint SHA is recorded by the subsequent handoff documentation commit. CI validates against its own real MariaDB service. Physical devices and hosting remain explicitly LOCAL_VALIDATION_REQUIRED.

## 2026-11-26 — Phase 02A customer identity and imports

Manual create in the reference prevents active phone duplicates. The source import offered both a duplicate-creating option and a broad update that spread incoming cells over stored values. SQL enforces active normalized phone and external namespace/ID uniqueness. The import offers skip or explicit updates from nonempty mapped cells against a unique match and its preview version. Conflicts, rows repeated in the file and ambiguous matches have explicit per-row results. Retired customers retain history and release active identity keys. Duplicate phones for distinct customer records require a separate business decision and data model change.

The selected UTF-8 CSV or first worksheet of XLSX is parsed in the browser. The server persists normalized reviewed candidates, not the raw file, in owner-scoped jobs. Files are bounded to 500 rows, 60 columns and 2 MiB. Staging and execution are capped at 20 rows per mutation. Batches commit independently, and a row conflict can be rolled back with its result recorded while the other rows commit. Import history is durable during Phase 02A. Agree retention before purging row payloads.

## 2026-11-26 — Phase 02A sales workflow authority

The source callable in fulfillmentWorkflow.ts owns confirm/cancel/reopen authority. Its printed lines enter WAITING_DESIGN and the order enters DESIGNING. Its non-printing paths create a finishing task or real available stock. In 02A, record commercial confirmation as CONFIRMED for those lines and for all-non-printing orders. The production and finishing flags and requirements supply the pending route. Phase 02C will advance those paths transactionally when the respective downstream output exists. Keep warehouse anti-partial fulfillment and no-work finishing checks in the owning phases.

Cancel updates the order and all active items atomically with status history, audit and change event. Force reopen mirrors the source state/role/reason preconditions. A 02A user cannot reach a delivered/completed status from the interface. Reopen is covered by a test-only downstream-state fixture. Confirmed and cancelled orders cannot be edited as drafts.

## 2026-11-26 — Phase 02A design snapshots

Library edits append an immutable design version. A draft can choose a specific revision, and the item keeps that version after confirmation and later library edits. Print count and last-print metadata depend on real production. Private image contract uses a registry ID on the version and remains inactive until Phase 03 verification.
