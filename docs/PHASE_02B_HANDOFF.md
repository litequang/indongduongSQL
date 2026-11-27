# Phase 02B handoff

Historical incoming Cloud → PC handoff at Phase 02A `f649041`. PC has since implemented and verified 02B. Current state is PROJECT_STATUS/HANDOFF; next-phase preparation is [PHASE_02C_HANDOFF.md](PHASE_02C_HANDOFF.md). The original input guidance below is retained for provenance, not as a new pending-work list.

Start Phase 02B after authorization. Base work on the assessed Phase 02A branch or its reviewed successor. The tested code, CI and resume commands are in [HANDOFF.md](HANDOFF.md) and [PHASE_02A_TEST_REPORT.md](PHASE_02A_TEST_REPORT.md).

## Data and workflow to preserve

- Migration 003 creates customers, import jobs/items, sales orders/items, status history and immutable design versions/tags. A sales line has a stable UUID, an exact positive BAG quantity, optional immutable design version, urgent metadata and explicit production/finishing flags.
- Sales confirmation marks print-bound lines WAITING_DESIGN. Support selection of those lines in the future Designer queue. Other lines are commercially CONFIRMED. Phase 02C owns direct finishing/stock creation and resulting stages. Preserve historical customer and design snapshots and keep drafts separate from downstream execution.
- Design versions reference a future private image registry ID. Image upload and signing belong to Phase 03. Production use and real print completion will own print metadata.
- Model `production_allocations` as a join from sales line UUID to production item UUID. A run may combine lines from multiple orders, and a sales line may span multiple runs. Independent runs have no sales allocation. In bổ sung/in lại require a reference and a new history record. Represent explicit quantity in BAG and use equality/conservation checks. Audit the source zero-quantity links as traceability and agree numeric allocation before accepting them as allocation.
- Apply new schema migrations after 003. Retain the state-first transaction ordering and commit audit and invalidations with relational writes.

## Phase 02B implementation sequence

1. Audit the source quick composer, local drafts, parser/@printer unique matching, production workflow, exact assigned-printer permissions and revisions. Use [WORKFLOW_V2_MAP.md](WORKFLOW_V2_MAP.md) and the isolated Firebase source.
2. Design production orders, items, images, plates, revision/ACK, status/cancellation and association schema. Establish behavior for standalone, split/merged, supplemental and reprint cases.
3. Port the bounded idempotent send path and preserve partial successes. Keep local draft Blob authority until the real storage stage; expose any unavailable attachment action.
4. Cover assigned printer acceptance/start/complete, plate issue and reassignment, latest revision ACK and cancellation preconditions with real SQL/API tests. Expand Playwright across roles and the Foundation viewport/theme matrix.
5. Leave finishing/no-work, verified stock/whole-order dispatch and shipping to Phase 02C. Verify Phase 02A confirmation, immutable sales snapshots and import idempotency as regressions.
