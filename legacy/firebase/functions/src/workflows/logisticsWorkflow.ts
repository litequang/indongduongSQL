import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { addWorkflowAudit } from './workflowAudit';
import { MANAGEMENT_ROLES, requireEnum, requireNumber, requireText, requireWorkflowActor, SALES_ROLES, WAREHOUSE_ROLES, WorkflowActor, WorkflowError } from './workflowAuth';

const DISPATCH_METHODS = ['INTERNAL_DELIVERY', 'CUSTOMER_PICKUP', 'BUS', 'OTHER'] as const;
const SHIPMENT_STATUSES = ['DRAFT', 'READY', 'CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING', 'RETURNED', 'CANCELLED'] as const;
const INSPECTION_RESULTS = ['RESTOCKED', 'SCRAPPED', 'CUSTOMER_HOLD'] as const;

const LEGAL_SHIPMENT_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['READY', 'CREATED', 'CANCELLED'],
  READY: ['CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'CANCELLED'],
  CREATED: ['PICKUP_PENDING', 'PICKED_UP', 'CANCELLED'],
  PICKUP_PENDING: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED', 'DELIVERY_FAILED', 'RETURNING'],
  DELIVERY_FAILED: ['IN_TRANSIT', 'RETURNING'],
  RETURNING: ['RETURNED'],
};

function management(actor: WorkflowActor) { return MANAGEMENT_ROLES.includes(actor.role); }
function numberOrZero(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }

/** Narrow dependency used to derive a parent order after shipment mutations. */
interface SalesOrderDeriver {
  deriveSalesOrder(salesOrderId: string, actor: WorkflowActor): Promise<void>;
}

export class LogisticsWorkflowService {
  constructor(private readonly db: Firestore, private readonly salesOrderDeriver: SalesOrderDeriver) {}

  async createDispatch(firebaseUid: string | undefined, input: { salesOrderId?: unknown; items?: unknown; dispatchMethod?: unknown; note?: unknown; deliveryAddress?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, WAREHOUSE_ROLES);
    const salesOrderId = requireText(input?.salesOrderId, 'Sales order ID', 128);
    const dispatchMethod = requireEnum(input?.dispatchMethod, DISPATCH_METHODS, 'Dispatch method');
    if (!Array.isArray(input?.items) || input.items.length === 0) throw new WorkflowError('invalid-argument', 'At least one finished good is required.');
    const requested = input.items.map((entry: unknown) => {
      const value = entry as { finishedGoodId?: unknown; quantity?: unknown };
      return { finishedGoodId: requireText(value.finishedGoodId, 'Finished good ID', 256), quantity: requireNumber(value.quantity, 'Dispatch quantity', Number.EPSILON) };
    });
    const distinct = new Set(requested.map((item) => item.finishedGoodId));
    if (distinct.size !== requested.length) throw new WorkflowError('invalid-argument', 'Each finished good may appear only once.');
    const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 1000) : undefined;
    const deliveryAddress = typeof input?.deliveryAddress === 'string' ? input.deliveryAddress.trim().slice(0, 500) : undefined;
    const result = await this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('sales_orders').doc(salesOrderId);
      const orderSnapshot = await tx.get(orderRef);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Sales order was not found.');
      if (!['READY_TO_SHIP', 'SHIPPING'].includes(String(orderSnapshot.get('status')))) {
        throw new WorkflowError('failed-precondition', 'The sales order is not ready for dispatch.');
      }
      const [salesItemsSnapshot, allGoodsSnapshot, goods] = await Promise.all([
        tx.get(this.db.collection('sales_order_items').where('salesOrderId', '==', salesOrderId)),
        tx.get(this.db.collection('finished_goods').where('salesOrderId', '==', salesOrderId)),
        Promise.all(requested.map(async (item) => ({ item, snapshot: await tx.get(this.db.collection('finished_goods').doc(item.finishedGoodId)) }))),
      ]);
      const activeSalesItems = salesItemsSnapshot.docs.filter(item => item.get('status') !== 'CANCELLED');
      if (activeSalesItems.length === 0) throw new WorkflowError('failed-precondition', 'The sales order has no active products to dispatch.');
      const acceptedByProduct = new Map<string, number>();
      for (const good of allGoodsSnapshot.docs) {
        const salesOrderItemId = good.get('salesOrderItemId');
        if (typeof salesOrderItemId === 'string') {
          acceptedByProduct.set(salesOrderItemId, (acceptedByProduct.get(salesOrderItemId) || 0) + numberOrZero(good.get('acceptedQuantity')));
        }
      }
      const allProductsReady = activeSalesItems.every(item =>
        ['WAREHOUSE_READY', 'PRODUCTION_COMPLETED'].includes(String(item.get('status'))) &&
        (acceptedByProduct.get(item.id) || 0) >= numberOrZero(item.get('quantity')),
      );
      if (!allProductsReady) {
        throw new WorkflowError('failed-precondition', 'Every product in the sales order must be warehouse-ready before any dispatch can be created.');
      }
      const dispatchRef = this.db.collection('warehouse_dispatches').doc();
      const customer = orderSnapshot.get('customerSnapshot') || {};
      tx.create(dispatchRef, {
        id: dispatchRef.id,
        code: `PX-${dispatchRef.id.slice(0, 8).toUpperCase()}`,
        salesOrderId,
        customerId: orderSnapshot.get('customerId'),
        customerSnapshot: customer,
        ...(deliveryAddress ? { deliveryAddress } : {}),
        status: 'DRAFT',
        dispatchMethod,
        ...(note ? { note } : {}),
        createdBy: actor.businessUserId,
        createdAt: new Date().toISOString(),
      });
      for (const { item, snapshot } of goods) {
        if (!snapshot.exists) throw new WorkflowError('not-found', `Finished good ${item.finishedGoodId} was not found.`);
        if (snapshot.get('salesOrderId') !== salesOrderId || numberOrZero(snapshot.get('remainingQuantity')) < item.quantity) {
          throw new WorkflowError('failed-precondition', 'Finished good is not available for this dispatch.');
        }
        const lineRef = this.db.collection('warehouse_dispatch_items').doc();
        tx.create(lineRef, {
          id: lineRef.id, dispatchId: dispatchRef.id, salesOrderId, salesOrderItemId: snapshot.get('salesOrderItemId') || null,
          finishedGoodId: snapshot.id, productName: snapshot.get('productName') || 'Sản phẩm', quantity: item.quantity,
          quantityUnit: 'BAG', imageUrl: snapshot.get('imageUrl') || null, image: snapshot.get('image') || null, createdAt: new Date().toISOString(),
        });
      }
      addWorkflowAudit(this.db, tx, actor, { action: 'DISPATCH_CREATED', targetType: 'WAREHOUSE_DISPATCH', targetId: dispatchRef.id, targetState: 'DRAFT' });
      return { dispatchId: dispatchRef.id, status: 'DRAFT' };
    });
    return result;
  }

  async confirmDispatch(firebaseUid: string | undefined, input: { dispatchId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, WAREHOUSE_ROLES);
    const dispatchId = requireText(input?.dispatchId, 'Dispatch ID', 128);
    const result = await this.db.runTransaction(async (tx) => {
      const dispatchRef = this.db.collection('warehouse_dispatches').doc(dispatchId);
      const [dispatchSnapshot, linesSnapshot] = await Promise.all([
        tx.get(dispatchRef), tx.get(this.db.collection('warehouse_dispatch_items').where('dispatchId', '==', dispatchId)),
      ]);
      if (!dispatchSnapshot.exists) throw new WorkflowError('not-found', 'Dispatch was not found.');
      if (dispatchSnapshot.get('status') === 'DISPATCHED') return { status: 'DISPATCHED', idempotent: true };
      if (dispatchSnapshot.get('status') !== 'DRAFT') throw new WorkflowError('failed-precondition', 'Only DRAFT dispatches can be confirmed.');
      if (linesSnapshot.empty) throw new WorkflowError('failed-precondition', 'Dispatch has no lines.');
      const goods = await Promise.all(linesSnapshot.docs.map(async (line) => ({ line, snapshot: await tx.get(this.db.collection('finished_goods').doc(line.get('finishedGoodId'))) })));
      for (const { line, snapshot } of goods) {
        if (!snapshot.exists) throw new WorkflowError('not-found', 'Finished good was not found.');
        const quantity = numberOrZero(line.get('quantity'));
        const remaining = numberOrZero(snapshot.get('remainingQuantity'));
        if (quantity <= 0 || remaining < quantity) throw new WorkflowError('failed-precondition', 'Insufficient finished-good inventory.');
        const dispatched = numberOrZero(snapshot.get('dispatchedQuantity')) + quantity;
        const nextRemaining = remaining - quantity;
        tx.update(snapshot.ref, {
          remainingQuantity: nextRemaining,
          dispatchedQuantity: dispatched,
          totalDispatchedQuantity: numberOrZero(snapshot.get('totalDispatchedQuantity')) + quantity,
          status: nextRemaining === 0 ? 'DISPATCHED' : 'PARTIALLY_DISPATCHED',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.update(dispatchRef, { status: 'DISPATCHED', confirmedBy: actor.businessUserId, confirmedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: 'DISPATCH_CONFIRMED', targetType: 'WAREHOUSE_DISPATCH', targetId: dispatchId, sourceState: 'DRAFT', targetState: 'DISPATCHED' });
      return { status: 'DISPATCHED', idempotent: false };
    });
    return result;
  }

  async reverseDispatch(firebaseUid: string | undefined, input: { dispatchId?: unknown; reason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, WAREHOUSE_ROLES);
    const dispatchId = requireText(input?.dispatchId, 'Dispatch ID', 128);
    const reason = requireText(input?.reason, 'Reverse reason', 500);
    return this.db.runTransaction(async (tx) => {
      const dispatchRef = this.db.collection('warehouse_dispatches').doc(dispatchId);
      const [dispatchSnapshot, linesSnapshot, shipmentsSnapshot] = await Promise.all([
        tx.get(dispatchRef),
        tx.get(this.db.collection('warehouse_dispatch_items').where('dispatchId', '==', dispatchId)),
        tx.get(this.db.collection('shipments').where('warehouseDispatchId', '==', dispatchId)),
      ]);
      if (!dispatchSnapshot.exists) throw new WorkflowError('not-found', 'Dispatch was not found.');
      if (dispatchSnapshot.get('status') === 'CANCELLED') return { status: 'CANCELLED', idempotent: true };
      if (dispatchSnapshot.get('status') !== 'DISPATCHED') throw new WorkflowError('failed-precondition', 'Only DISPATCHED dispatches can be reversed.');
      if (shipmentsSnapshot.docs.some((shipment) => !['CANCELLED', 'DELIVERY_FAILED', 'RETURNED'].includes(String(shipment.get('status'))))) {
        throw new WorkflowError('failed-precondition', 'A dispatch with an active shipment cannot be reversed.');
      }
      const goods = await Promise.all(linesSnapshot.docs.map(async (line) => ({
        line,
        good: await tx.get(this.db.collection('finished_goods').doc(line.get('finishedGoodId'))),
      })));
      for (const { line, good } of goods) {
        if (!good.exists) throw new WorkflowError('failed-precondition', 'Finished good is missing; manual remediation is required.');
        const quantity = numberOrZero(line.get('quantity'));
        const dispatched = Math.max(0, numberOrZero(good.get('dispatchedQuantity')) - quantity);
        const remaining = numberOrZero(good.get('remainingQuantity')) + quantity;
        tx.update(good.ref, { remainingQuantity: remaining, dispatchedQuantity: dispatched, status: dispatched === 0 ? 'READY' : 'PARTIALLY_DISPATCHED', updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(dispatchRef, { status: 'CANCELLED', cancelledBy: actor.businessUserId, cancelledAt: FieldValue.serverTimestamp(), cancelReason: reason });
      addWorkflowAudit(this.db, tx, actor, { action: 'DISPATCH_REVERSED', targetType: 'WAREHOUSE_DISPATCH', targetId: dispatchId, sourceState: 'DISPATCHED', targetState: 'CANCELLED', reason });
      return { status: 'CANCELLED', idempotent: false };
    });
  }

  async createShipment(firebaseUid: string | undefined, input: { dispatchId?: unknown; method?: unknown; receiver?: unknown; packageCount?: unknown; weightGrams?: unknown; codAmount?: unknown; note?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, SALES_ROLES);
    const dispatchId = requireText(input?.dispatchId, 'Dispatch ID', 128);
    const method = requireEnum(input?.method, DISPATCH_METHODS, 'Shipment method');
    const receiver = input?.receiver as Record<string, unknown>;
    const receiverSnapshot = { name: requireText(receiver?.name, 'Receiver name', 150), phone: requireText(receiver?.phone, 'Receiver phone', 50), address: requireText(receiver?.address, 'Receiver address', 500) };
    const packageCount = requireNumber(input?.packageCount, 'Package count', 1);
    const weightGrams = requireNumber(input?.weightGrams, 'Weight', 0);
    const codAmount = requireNumber(input?.codAmount, 'COD amount', 0);
    const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 1000) : undefined;
    const result = await this.db.runTransaction(async (tx) => {
      const dispatchRef = this.db.collection('warehouse_dispatches').doc(dispatchId);
      const dispatch = await tx.get(dispatchRef);
      if (!dispatch.exists) throw new WorkflowError('not-found', 'Dispatch was not found.');
      if (dispatch.get('status') !== 'DISPATCHED') throw new WorkflowError('failed-precondition', 'Only a confirmed dispatch can create a shipment.');
      const shipmentRef = this.db.collection('shipments').doc();
      const initial = 'READY';
      tx.create(shipmentRef, {
        id: shipmentRef.id, code: `SHIP-${shipmentRef.id.slice(0, 8).toUpperCase()}`,
        warehouseDispatchId: dispatchId, salesOrderId: dispatch.get('salesOrderId'), customerId: dispatch.get('customerId'),
        method, receiverSnapshot, packageCount, weightGrams, codAmount, ...(note ? { note } : {}), status: initial,
        createdBy: actor.businessUserId, createdAt: new Date().toISOString(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'SHIPMENT_CREATED', targetType: 'SHIPMENT', targetId: shipmentRef.id, targetState: initial });
      return { shipmentId: shipmentRef.id, status: initial, salesOrderId: dispatch.get('salesOrderId') };
    });
    if (typeof result.salesOrderId === 'string') await this.salesOrderDeriver.deriveSalesOrder(result.salesOrderId, actor);
    return result;
  }

  async transitionShipment(firebaseUid: string | undefined, input: { shipmentId?: unknown; targetStatus?: unknown; rawStatus?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, SALES_ROLES);
    const shipmentId = requireText(input?.shipmentId, 'Shipment ID', 128);
    const targetStatus = requireEnum(input?.targetStatus, SHIPMENT_STATUSES, 'Shipment target status');
    const result = await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('shipments').doc(shipmentId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Shipment was not found.');
      const current = String(snapshot.get('status'));
      if (current === targetStatus) return { status: current, idempotent: true, salesOrderId: snapshot.get('salesOrderId') };
      if (!(LEGAL_SHIPMENT_TRANSITIONS[current] || []).includes(targetStatus)) {
        throw new WorkflowError('failed-precondition', `Illegal shipment transition: ${current} -> ${targetStatus}.`);
      }
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status: targetStatus, updatedAt: FieldValue.serverTimestamp() };
      if (typeof input?.rawStatus === 'string') patch.providerRawStatus = input.rawStatus.slice(0, 300);
      if (targetStatus === 'PICKED_UP' || targetStatus === 'IN_TRANSIT') patch.pickedUpAt = now;
      if (targetStatus === 'DELIVERED') patch.deliveredAt = now;
      if (targetStatus === 'DELIVERY_FAILED') patch.failedAt = now;
      if (targetStatus === 'RETURNED') { patch.returnedAt = now; patch.returnInspectionStatus = 'WAITING_INSPECTION'; }
      if (targetStatus === 'CANCELLED') patch.cancelledAt = now;
      tx.update(ref, patch as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
      addWorkflowAudit(this.db, tx, actor, { action: 'SHIPMENT_TRANSITIONED', targetType: 'SHIPMENT', targetId: shipmentId, sourceState: current, targetState: targetStatus });
      return { status: targetStatus, idempotent: false, salesOrderId: snapshot.get('salesOrderId') };
    });
    if (typeof result.salesOrderId === 'string') await this.salesOrderDeriver.deriveSalesOrder(result.salesOrderId, actor);
    return result;
  }

  async inspectReturnedShipment(firebaseUid: string | undefined, input: { shipmentId?: unknown; result?: unknown; note?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, SALES_ROLES);
    const shipmentId = requireText(input?.shipmentId, 'Shipment ID', 128);
    const inspectionResult = requireEnum(input?.result, INSPECTION_RESULTS, 'Inspection result');
    const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 1000) : undefined;
    const outcome = await this.db.runTransaction(async (tx) => {
      const shipmentRef = this.db.collection('shipments').doc(shipmentId);
      const shipment = await tx.get(shipmentRef);
      if (!shipment.exists) throw new WorkflowError('not-found', 'Shipment was not found.');
      if (shipment.get('status') !== 'RETURNED') throw new WorkflowError('failed-precondition', 'Only RETURNED shipments can be inspected.');
      if (shipment.get('returnInspectionStatus') !== 'WAITING_INSPECTION') {
        throw new WorkflowError('failed-precondition', 'This return has already been inspected.');
      }
      const lines = await tx.get(this.db.collection('warehouse_dispatch_items').where('dispatchId', '==', shipment.get('warehouseDispatchId')));
      for (const line of lines.docs) {
        const good = await tx.get(this.db.collection('finished_goods').doc(line.get('finishedGoodId')));
        if (!good.exists) throw new WorkflowError('failed-precondition', 'Finished good is missing; manual remediation is required.');
        const quantity = numberOrZero(line.get('quantity'));
        const dispatched = Math.max(0, numberOrZero(good.get('dispatchedQuantity')) - quantity);
        const patch: Record<string, unknown> = {
          dispatchedQuantity: dispatched,
          returnedQuantity: numberOrZero(good.get('returnedQuantity')) + quantity,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (inspectionResult === 'RESTOCKED') {
          const remaining = numberOrZero(good.get('remainingQuantity')) + quantity;
          patch.remainingQuantity = remaining;
          patch.restockedQuantity = numberOrZero(good.get('restockedQuantity')) + quantity;
          patch.status = dispatched === 0 ? 'READY' : 'PARTIALLY_DISPATCHED';
        }
        tx.update(good.ref, patch as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
      }
      tx.update(shipmentRef, {
        returnInspectionStatus: inspectionResult, returnInspectionResult: inspectionResult, ...(note ? { returnInspectionNote: note } : {}),
        returnInspectedBy: actor.businessUserId, returnInspectedByName: actor.name, returnInspectedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'RETURN_INSPECTED', targetType: 'SHIPMENT', targetId: shipmentId, sourceState: 'WAITING_INSPECTION', targetState: inspectionResult, reason: note });
      return { status: inspectionResult, idempotent: false, salesOrderId: shipment.get('salesOrderId') };
    });
    if (typeof outcome.salesOrderId === 'string') await this.salesOrderDeriver.deriveSalesOrder(outcome.salesOrderId, actor);
    return outcome;
  }
}
