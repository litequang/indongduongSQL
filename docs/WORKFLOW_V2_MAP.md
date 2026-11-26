# WORKFLOW V2 MAP

This document records current code, not a remembered specification. The trusted transition layer is primarily `functions/src/workflows/*.ts`, with explicitly allowed direct Printer/order writes in `firestore.rules`.

## Roles

Actual roles in frontend/backend types: `DEVELOPER`, `ADMIN`, `MANAGER`, `DESIGNER`, `SALE`, `PRINTER`, `FINISHER`, `WAREHOUSE`.

- Canonical role source: `auth_identities/{uid}.role`, cross-checked against `users/{businessUserId}.role` in Functions.
- Management set: Developer/Admin/Manager.
- Sales set: Developer/Admin/Manager/Sale.
- Warehouse callable authority: Warehouse only for dispatch create/confirm/reverse.
- Client permission matrix: `src/permissions/index.ts`; display/early-validation layer, not trusted workflow authority.

## Sales Order -> Product

Main files: Sales Order components; `src/services/salesOrderService.ts`; `src/repositories/salesOrderRepository.ts`; `functions/src/workflows/fulfillmentWorkflow.ts`.

Firestore fields:

- Parent: `sales_orders.status`, `priority`, `customerId`, `saleId`, timestamps/progress.
- Product: `sales_order_items.status`, `requiresProduction`, `requiresFinishing`, `quantity`, links/history, `finishingTaskIds`, `warehouseReadyAt`, `isUrgent`.

Sales Order states declared: `DRAFT`, `CONFIRMED`, `DESIGNING`, `FULFILLING`, `IN_PRODUCTION`, `PRODUCTION_COMPLETED`, `READY_TO_SHIP`, `SHIPPING`, `DELIVERED`, `COMPLETED`, `CANCELLED`.

Current implementation notes:

- `confirmSalesOrder` accepts only `DRAFT`, then routes each Product.
- Parent target is `DESIGNING` when any Product requires production, `FULFILLING` when only direct finishing remains, otherwise `READY_TO_SHIP`.
- `deriveSalesOrder` derives active parent state from Product/goods/shipment state and writes `DESIGNING`, `FULFILLING`, `IN_PRODUCTION`, `PRODUCTION_COMPLETED`, `READY_TO_SHIP`, `SHIPPING`, or `COMPLETED`.
- `CONFIRMED` and `DELIVERED` exist in the type, but normal confirmed routing/derivation does not use them as steady intermediate targets in the inspected implementation. Shipment `DELIVERED` derives the Sales Order directly to `COMPLETED` when all shipments are delivered/cancelled.

## Product requiring production

Product states declared: `NEW`, `WAITING_DESIGN`, `DESIGNING`, `READY_FOR_PRODUCTION`, `IN_PRODUCTION`, `PRODUCTION_COMPLETED`, `READY_FOR_FINISHING`, `FINISHING`, `WAREHOUSE_READY`, `CANCELLED`.

Actual route:

```text
NEW
  -> confirm Sales Order
  -> WAITING_DESIGN
  -> link Production Item
  -> IN_PRODUCTION
  -> Production print complete
  -> READY_FOR_FINISHING
  -> FINISHING (if claimed)
  -> WAREHOUSE_READY after checkpoint output meets Product quantity
```

`READY_FOR_PRODUCTION` is used when a cancelled production run removes the last link. `PRODUCTION_COMPLETED` is written by the legacy order-level `completeFinishing` integration. Authority is `FulfillmentWorkflowService`; browser lifecycle writes are denied.

## Product not requiring production

Actual `confirmSalesOrder` route:

- `requiresFinishing == true`: create `finishing_tasks/ft_direct_{itemId}`, Product -> `READY_FOR_FINISHING`.
- `requiresFinishing == false`: create `finished_goods/fg_direct_{itemId}` with fully accepted quantity, Product -> `WAREHOUSE_READY`.

Authority: Sales set confirms the order; downstream Finisher/Warehouse functions own transitions.

## Production Order

States: `DRAFT`, `WAITING_ACCEPTANCE`, `WAITING_PLATE`, `ACCEPTED`, `WAITING_PRINT`, `PRINTING`, `PRINTED`, `FINISHING`, `COMPLETED`, `CANCELLED`.

Main files: `src/context/AppContext.tsx`, `src/repositories/productionOrderRepository.ts`, `functions/src/workflows/productionWorkflow.ts`, `fulfillmentWorkflow.ts`, `firestore.rules`.

Key fields: `instructionRaw`, `totalSheets`, `printImages[].sheetCount`, `items[]`, `printerId`, `plateStatus`, `productionRevision`, `printerAcknowledgedRevision`, `cancellationRequest`, `issues`, `isUrgent`.

Actual principal path:

```text
local IndexedDB DRAFT
  -> official WAITING_ACCEPTANCE
  -> assigned Printer ACCEPTED or WAITING_PRINT
  -> ACK latest productionRevision
  -> PRINTING
  -> completeProductionPrint callable
  -> PRINTED
```

Direct Printer acceptance/start is guarded by Firestore Rules. Completion is server-authoritative because it fans out Product checkpoints.

`WAITING_PLATE` is recognized in types/cancellation/server preconditions but no normal production callable inspected sets it. Plate status is tracked separately.

## M:N relationships and supplemental Production Orders

- A Production Order has many `items`.
- A Sales Product can accumulate `linkedProductionItemIds`, `linkedProductionOrderIds`, and `productionHistory` across Production Orders.
- `linkProductionOrder` can attach selected Production Items before or after printing; late linking creates/repairs task/goods associations.
- Production links are traceability, not quantity allocation. `allocatedQuantity` remains unchanged; new history uses `allocatedProductQuantity: 0`.
- A standalone technical Production Order is valid without Sales Product links; it simply does not fan out product-centric finishing tasks.

Main authority: `functions/src/workflows/fulfillmentWorkflow.ts` `linkProductionOrder`.

## Designer

- Draft authority: IndexedDB `production-drafts` through `localProductionDraftRepository`.
- Backup: `production_draft_backups`, owned by creator/recoverable by Designer/management.
- Parser: `parseQuickOrderText`; unique picker: `findUniquePrinterMatch` in Quick composer.
- Official send validates an active Printer, uploads images, resets ACK to 0, creates `WAITING_ACCEPTANCE`, removes local/backup draft.
- Designer/management can revise pre-print instructions; instruction change increments revision. Reassignment returns to `WAITING_ACCEPTANCE` and clears prior acceptance.

## Printer

- Assignment uses `printerId == businessUserId`, never Auth UID.
- Accept: `WAITING_ACCEPTANCE -> ACCEPTED` or `WAITING_PRINT` under current Rules/client handling.
- Revision ACK: sets `printerAcknowledgedRevision` to latest `productionRevision` while pre-print.
- Start: only assigned Printer; from `ACCEPTED`/`WAITING_PRINT`; no pending cancellation; ACK current.
- Complete: only assigned Printer via `completeProductionPrint`; `PRINTING -> PRINTED`.
- Plate receive/report paths are callable and enforce assigned Printer where required.

EXPECTED / CONTEXT vs CURRENT IMPLEMENTATION:

- Context labels suggest “claim/receive”; current Production Order uses fixed `printerId` plus acceptance, not a first-come unassigned claim.
- Plate readiness and open issues are not start-print blockers in current Rules/server policy. The explicit comment says plate/issues are parallel records.

## Revision

- `productionRevision` defaults to 1 for official orders.
- `reviseProductionOrder` permits `WAITING_ACCEPTANCE`, `ACCEPTED`, `WAITING_PRINT` only.
- Instruction edit increments revision; printer-only reassignment does not increment instruction revision but resets ACK.
- Start requires `printerAcknowledgedRevision >= productionRevision` when revision exists.
- No separate revision collection or immutable revision-history documents were found; timeline/audit records carry event history.

## Cancellation

Production:

- Request roles: Sales set + Designer.
- Allowed before print: `WAITING_ACCEPTANCE`, `WAITING_PLATE`, `ACCEPTED`, `WAITING_PRINT`.
- Response: despite initially allowing management/printer/finisher into the method, the transaction explicitly requires the assigned Printer. Accept -> `CANCELLED`; reject leaves status unchanged.
- Accepted cancellation removes only the cancelled run's Product item links and re-derives parents.

Finishing task:

- Request roles: Sales set + Designer.
- `READY`: cancels directly.
- `CLAIMED`: request becomes `PENDING`; the claiming Finisher accepts/rejects.
- Accepted cancellation creates a ready finished good and sets the Product warehouse-ready, representing a bypass/no-work outcome.

Sales Order:

- Sales set may cancel before advanced fulfillment; linked `IN_PRODUCTION`/`PRODUCTION_COMPLETED` blocks cancellation.
- Developer/Admin can force reopen only `DELIVERED`/`COMPLETED`, target `IN_PRODUCTION`, with audit reason.

## Issues

Production issues:

- Embedded in `orders.issues`.
- Canonical types: `PLATE`, `MACHINE`, `PRINT`, `SHIPPING`, `RETURN`, `GENERAL`.
- Policy assigns owner/escalation/reporter roles; selected users/roles can override recipients.
- Recipient resolves; original reporter cancels.
- All current issue policy is non-blocking; `hasBlockingIssue` is maintained false.

Workflow issues:

- Separate `workflow_issues`, entity type `SALES_ORDER_ITEM`, stage `FINISHING` or `WAREHOUSE`.
- Reporter/recipient rules are enforced in `FulfillmentWorkflowService`.
- UI surfaces open issues before task transitions but can continue for non-blocking issues.

## Finishing

Product-centric V2 states: `READY -> CLAIMED -> COMPLETED`, or `READY/CLAIMED -> CANCELLED` through cancellation rules.

- Print completion creates deterministic task IDs per Production Item.
- Required task: only claiming Finisher completes.
- No-work task: any authenticated Finisher may explicitly complete from `READY`.
- Completion creates deterministic `fg_finish_{taskId}`, updates Product based on aggregate accepted output, then re-derives Sales Order.

Legacy/current coexistence:

- Embedded `ProductionOrder.finishing` states `PENDING`, `IN_PROGRESS`, `COMPLETED` still support order-centric handoff.
- Product-centric UI uses `finishing_tasks`. Future changes must determine which path they target rather than mixing them.

## Warehouse

Finished-good states: `WAITING`, `READY`, `PARTIALLY_DISPATCHED`, `DISPATCHED`.

Dispatch states: `DRAFT`, `READY`, `DISPATCHED`, `CANCELLED`; current callable creation emits `DRAFT`, confirmation emits `DISPATCHED`, reversal emits `CANCELLED`. No inspected normal callable sets `READY`.

Anti-partial export:

- `createDispatch` requires the Sales Order to exist and not be cancelled.
- Every non-cancelled Product must be warehouse-ready/production-complete.
- Aggregate accepted finished-good quantity must meet every Product quantity.
- Requested finished goods must belong to that Sales Order and have enough remaining quantity.

Authority: Warehouse role for dispatch lifecycle; Sales set for shipment lifecycle.

## Urgent

- Sales Order: `priority: NORMAL|URGENT`.
- Product: `isUrgent`.
- Production Order: `isUrgent`, reason/setter metadata.
- Finishing task: `urgent`; propagation on task creation and callable toggle.
- Urgent is metadata and UI priority, not a status transition or authorization bypass.

## Shipment extension

Shipment states: `DRAFT`, `READY`, `CREATED`, `PICKUP_PENDING`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `DELIVERY_FAILED`, `RETURNING`, `RETURNED`, `CANCELLED`.

`logisticsWorkflow.ts` contains the legal transition adjacency map. Shipment/return changes call Sales Order derivation. Returned inventory is adjusted only after an inspection result (`RESTOCKED`, `SCRAPPED`, `CUSTOMER_HOLD`).

## Dependency warnings

- Changing Product status affects Finishing, Warehouse, accepted-quantity checks, and Sales Order aggregation.
- Changing Production Order schema/status affects Designer, Printer, Rules, cancellation, issues, images, Product linking, and finishing fan-out.
- Changing canonical identity affects Rules, Storage Rules, Functions, assignments, audits, and frontend permissions.
- Changing quantity semantics must preserve Product bags versus Production print sheets.
- Changing issue blocking behavior affects Printer transitions, Finishing/Warehouse UI, server issue policy, and Rules.
- Changing Warehouse readiness affects dispatch creation, inventory, shipping, and Sales Order status.

