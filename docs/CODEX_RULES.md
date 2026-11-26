# CODEX RULES

## Required navigation rules

1. Read `docs/FEATURE_MAP.md` and `docs/CHANGE_GUIDE.md` before a broad repository search.
2. For a feature change:
   - identify the feature in `docs/FEATURE_MAP.md`;
   - inspect the listed primary files;
   - inspect direct dependencies only.
3. Do not scan the whole repository unless:
   - the map is missing information;
   - the map appears stale;
   - the architecture changed; or
   - the user explicitly requests an audit.
4. Actual code always overrides documentation.
5. If map and code disagree, follow the code and update the affected map after implementation.
6. Do not modify unrelated modules.
7. Preserve canonical identity:

   ```text
   Firebase Auth UID
     -> auth_identities/{uid}
     -> businessUserId
     -> users/{businessUserId}
   ```

8. Preserve Workflow V2 unless the task explicitly changes it.
9. Do not perform destructive data migration during app startup.
10. After every meaningful feature implementation, update only the affected map sections.

## Mandatory map maintenance rule

> EVERY FUTURE CODE CHANGE MUST UPDATE THE RELEVANT APP MAP DOCUMENTATION IF:
>
> - a file moved;
> - responsibility changed;
> - a new service was added;
> - a new Firestore collection was added;
> - a new Cloud Function was added;
> - a data flow changed;
> - feature dependencies changed; or
> - authorization logic changed.

Do not regenerate all maps after every change. Patch only the affected sections.

## Safety and authority boundaries

- Frontend permission helpers control presentation and early validation; `firestore.rules`, `storage.rules`, and `functions/src/workflows/workflowAuth.ts` are the production authorization boundaries.
- Never replace business user IDs in persisted relationships with Firebase Auth UIDs.
- Lifecycle fields for Sales Orders, Sales Order Items, finishing tasks, finished goods, workflow issues, warehouse dispatches, and shipments are server-authoritative callable writes.
- Production drafts are local-first. IndexedDB is authoritative when a device-local draft exists; `production_draft_backups` is disaster recovery.
- Production Firestore writes use acknowledged safe-write helpers. Do not introduce an offline-success fallback for official workflow state.
- Product quantity and print sheet count are distinct. Do not derive product allocation from `ProductionOrder.totalSheets` or `PrintImage.sheetCount`.
- Preserve product-centric finishing checkpoints, including explicit no-work confirmation when `requiresFinishing == false`.
- Preserve warehouse order-readiness checks and the anti-partial-export rule.
- Storage accepts only validated JPEG/PNG/WebP blobs in documented namespaces; never persist preview object URLs or data URIs as production records.
- Role-preview mode is authenticated, UI-only, and inert for production data. It is not authorization.
- Do not treat `server.ts` JSON persistence as the Workflow V2 production source without an explicit architecture change.

## Historical document policy

During normal feature work, do **not** scan `docs/archive/codex-reports/`.

Use these first:

1. `docs/APP_MAP.md`
2. `docs/FEATURE_MAP.md`
3. `docs/CHANGE_GUIDE.md`
4. `docs/DATA_FLOW_MAP.md`
5. `docs/FIREBASE_MAP.md`
6. `docs/WORKFLOW_V2_MAP.md`
7. `docs/PROJECT_HISTORY.md`

Inspect an archived Codex report only when:

- investigating a historical regression;
- tracing why an architectural decision was made;
- the user explicitly asks; or
- current documentation points to a specific archived report.

Do not use archived reports as current source of truth. Current source code always wins.

Documentation hierarchy:

```text
CURRENT CODE
  -> APP / FEATURE MAPS
  -> PROJECT_HISTORY
  -> LEGACY_REPORT_INDEX
  -> ARCHIVED RAW REPORTS
```
