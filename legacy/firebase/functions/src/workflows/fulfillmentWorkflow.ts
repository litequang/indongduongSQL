import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { addWorkflowAudit } from './workflowAudit';
import { hasManagementRecipientAuthority, MANAGEMENT_ROLES, requireNumber, requireText, requireWorkflowActor, SALES_ROLES, WorkflowActor, WorkflowError } from './workflowAuth';
import { isUserRole, UserRole } from '../types';

const numberOrZero = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

function sourceFinishedGoodId(orderId: string, itemId: string): string {
  return `fg_${orderId}_${itemId}`;
}

function appendTimeline(order: FirebaseFirestore.DocumentData, actor: WorkflowActor, content: string, type: string) {
  return [...(Array.isArray(order.timeline) ? order.timeline : []), {
    id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
    author: actor.name,
    content,
    type,
  }];
}

export class FulfillmentWorkflowService {
  constructor(private readonly db: Firestore) {}

  /** Undo only the allocation belonging to the cancelled production run. */
  private async reconcileCancelledProductionItems(
    tx: FirebaseFirestore.Transaction,
    order: FirebaseFirestore.DocumentData,
  ): Promise<Set<string>> {
    const salesOrderIds = new Set<string>();
    const productionItems = Array.isArray(order.items) ? order.items : [];
    const groupedItems = new Map<string, FirebaseFirestore.DocumentData[]>();
    for (const productionItem of productionItems) {
      if (typeof productionItem?.id !== 'string' || typeof productionItem?.salesOrderId !== 'string' || typeof productionItem?.salesOrderItemId !== 'string') continue;
      const group = groupedItems.get(productionItem.salesOrderItemId) || [];
      group.push(productionItem);
      groupedItems.set(productionItem.salesOrderItemId, group);
    }
    const itemSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const salesOrderItemId of groupedItems.keys()) {
      const itemRef = this.db.collection('sales_order_items').doc(salesOrderItemId);
      itemSnapshots.set(salesOrderItemId, await tx.get(itemRef));
    }
    for (const [salesOrderItemId, linkedProductionItems] of groupedItems) {
      const itemSnapshot = itemSnapshots.get(salesOrderItemId);
      if (!itemSnapshot?.exists) continue;
      const salesOrderId = linkedProductionItems[0].salesOrderId;
      if (linkedProductionItems.some((item) => item.salesOrderId !== salesOrderId) || itemSnapshot.get('salesOrderId') !== salesOrderId) continue;
      const linked = Array.isArray(itemSnapshot.get('linkedProductionItemIds')) ? itemSnapshot.get('linkedProductionItemIds') : [];
      const cancelledIds = new Set(linkedProductionItems.map((item) => item.id));
      const nextLinked = linked.filter((id: unknown) => !cancelledIds.has(id));
      // Product links are traceability only in Workflow V2. Legacy allocation
      // fields are retained but sheet quantities must never change them.
      const nextAllocated = numberOrZero(itemSnapshot.get('allocatedQuantity'));
      tx.update(itemSnapshot.ref, {
        linkedProductionItemIds: nextLinked,
        allocatedQuantity: nextAllocated,
        status: itemSnapshot.get('status') === 'CANCELLED' ? 'CANCELLED' : (nextLinked.length ? 'IN_PRODUCTION' : 'READY_FOR_PRODUCTION'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      salesOrderIds.add(salesOrderId);
    }
    return salesOrderIds;
  }

  /** Request a cancellation without allowing browser clients to mutate production state. */
  async requestProductionCancellation(firebaseUid: string | undefined, input: { orderId?: unknown; reason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...SALES_ROLES, 'DESIGNER'] as const);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const reason = typeof input?.reason === 'string' && input.reason.trim()
      ? input.reason.trim().slice(0, 500)
      : 'Khách đổi ý / tạm dừng sản xuất.';
    const result = await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      if (['CANCELLED', 'COMPLETED'].includes(order.status)) throw new WorkflowError('failed-precondition', 'This production order has already ended.');
      if (!['WAITING_ACCEPTANCE', 'WAITING_PLATE', 'ACCEPTED', 'WAITING_PRINT'].includes(order.status)) {
        throw new WorkflowError('failed-precondition', 'Normal cancellation is available only before printing starts.');
      }
      if (order.cancellationRequest?.status === 'PENDING') throw new WorkflowError('failed-precondition', 'A cancellation request is already pending.');
      const now = new Date().toISOString();
      const cancellationRequest = {
        requestedBy: actor.businessUserId,
        requestedByName: actor.name,
        requestedRole: actor.role,
        requestedAt: now,
        reason,
        status: 'PENDING',
      };
      tx.update(ref, {
        cancellationRequest,
        timeline: appendTimeline(order, actor, `Yêu cầu hủy lệnh: ${reason}`, 'cancel_request'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, {
        action: 'PRODUCTION_CANCELLATION_REQUESTED',
        targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: String(order.status), targetState: String(order.status), reason,
      });
      return { status: String(order.status), cancellationStatus: cancellationRequest.status, salesOrderIds: [] as string[] };
    });
    for (const salesOrderId of result.salesOrderIds) await this.deriveSalesOrder(salesOrderId, actor);
    return result;
  }

  /** Resolve a pending cancellation using the assigned operational worker or management. */
  async respondProductionCancellation(firebaseUid: string | undefined, input: { orderId?: unknown; accept?: unknown; responseReason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...MANAGEMENT_ROLES, 'PRINTER', 'FINISHER'] as const);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    if (typeof input?.accept !== 'boolean') throw new WorkflowError('invalid-argument', 'Cancellation acceptance is required.');
    const accept = input.accept;
    const responseReason = typeof input?.responseReason === 'string' && input.responseReason.trim()
      ? input.responseReason.trim().slice(0, 500)
      : accept ? 'Đã dừng kịp thời, đồng ý hủy lệnh.' : 'Không thể dừng công việc tại thời điểm này.';
    const result = await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      if (order.cancellationRequest?.status !== 'PENDING') throw new WorkflowError('failed-precondition', 'No cancellation request is pending.');
      if (actor.role !== 'PRINTER' || order.printerId !== actor.businessUserId) {
        throw new WorkflowError('permission-denied', 'Only the assigned printer can accept or reject this cancellation.');
      }
      const now = new Date().toISOString();
      const cancellationRequest = {
        ...order.cancellationRequest,
        status: accept ? 'ACCEPTED' : 'REJECTED',
        respondedBy: actor.businessUserId,
        respondedByName: actor.name,
        respondedAt: now,
        responseReason,
      };
      const salesOrderIds = accept ? await this.reconcileCancelledProductionItems(tx, order) : new Set<string>();
      tx.update(ref, {
        ...(accept ? { status: 'CANCELLED' } : {}),
        cancellationRequest,
        timeline: appendTimeline(order, actor, accept ? `Đã xác nhận hủy: ${responseReason}` : `Đã từ chối hủy: ${responseReason}`, accept ? 'cancel_done' : 'cancel_rejected'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, {
        action: accept ? 'PRODUCTION_CANCELLATION_ACCEPTED' : 'PRODUCTION_CANCELLATION_REJECTED',
        targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: String(order.status), targetState: accept ? 'CANCELLED' : String(order.status), reason: responseReason,
      });
      return { status: accept ? 'CANCELLED' : String(order.status), cancellationStatus: cancellationRequest.status, salesOrderIds: [...salesOrderIds] };
    });
    for (const salesOrderId of result.salesOrderIds) await this.deriveSalesOrder(salesOrderId, actor);
    return result;
  }

  /** Printing completion fans out into one Finishing checkpoint per product.
   * A no-finishing product is still explicitly confirmed by that department.
   * Print sheets are deliberately never reconciled with product quantities. */
  async completeProductionPrint(firebaseUid: string | undefined, input: { orderId?: unknown; note?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['PRINTER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const note = typeof input?.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : undefined;
    const result = await this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('orders').doc(orderId);
      const orderSnapshot = await tx.get(orderRef);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = orderSnapshot.data() || {};
      if (order.status === 'PRINTED') return { status: 'PRINTED', idempotent: true, salesOrderIds: [] as string[] };
      if (order.status !== 'PRINTING') throw new WorkflowError('failed-precondition', 'Only a PRINTING order can be completed.');
      if (order.printerId !== actor.businessUserId) {
        throw new WorkflowError('permission-denied', 'Only the assigned printer can complete this print run.');
      }
      const items = Array.isArray(order.items) ? order.items : [];
      // A ProductionOrder can be independent of Sales. Only linked Products
      // fan out into finishing tasks; technical print images alone are valid.
      const linkedItems = items.filter((item: FirebaseFirestore.DocumentData) => typeof item?.salesOrderItemId === 'string' && item.salesOrderItemId);

      const salesItemSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const item of linkedItems) {
        if (typeof item?.salesOrderItemId === 'string' && item.salesOrderItemId && !salesItemSnapshots.has(item.salesOrderItemId)) {
          salesItemSnapshots.set(item.salesOrderItemId, await tx.get(this.db.collection('sales_order_items').doc(item.salesOrderItemId)));
        }
      }
      const taskSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const item of linkedItems) {
        if (typeof item?.id !== 'string' || !item.id) throw new WorkflowError('failed-precondition', 'Production item identity is invalid.');
        const salesItem = typeof item.salesOrderItemId === 'string' ? salesItemSnapshots.get(item.salesOrderItemId) : undefined;
        if (item.salesOrderItemId && !salesItem?.exists) throw new WorkflowError('failed-precondition', 'A linked sales-order product was not found.');
        const taskRef = this.db.collection('finishing_tasks').doc(`ft_${orderId}_${item.id}`);
        taskSnapshots.set(item.id, await tx.get(taskRef));
      }

      const now = new Date().toISOString();
      const salesOrderIds = new Set<string>();
      const salesItemPatches = new Map<string, { status: string; finishingTaskIds: string[]; warehouseReadyAt?: string }>();
      for (const item of linkedItems) {
        const salesItem = typeof item.salesOrderItemId === 'string' ? salesItemSnapshots.get(item.salesOrderItemId) : undefined;
        // Product quantity is business output for the linked Product only.
        // Never fall back to legacy allocation metadata or print-sheet fields.
        const quantity = salesItem?.exists ? numberOrZero(salesItem.get('quantity')) : 0;
        const salesOrderId = typeof item.salesOrderId === 'string' ? item.salesOrderId : salesItem?.get('salesOrderId');
        if (typeof salesOrderId === 'string') salesOrderIds.add(salesOrderId);
        const taskRef = this.db.collection('finishing_tasks').doc(`ft_${orderId}_${item.id}`);
        const requiresFinishing = typeof item.requiresFinishing === 'boolean'
          ? item.requiresFinishing
          : salesItem?.get('requiresFinishing') !== false;
        if (!taskSnapshots.get(item.id)?.exists) {
          tx.create(taskRef, {
            id: taskRef.id,
            salesOrderId: salesOrderId || null,
            salesOrderItemId: item.salesOrderItemId || null,
            productionOrderId: orderId,
            productionItemId: item.id,
            productName: item.productName || order.productName || 'Sản phẩm',
            customerId: item.customerId || salesItem?.get('customerId') || null,
            customerName: item.customerName || item.customerNameSnapshot || null,
            imageUrl: item.imageUrl || null,
            image: item.image || null,
            quantity,
            requiresFinishing,
            urgent: Boolean(item.isUrgent || salesItem?.get('isUrgent') || order.isUrgent),
            status: 'READY',
            createdAt: now,
          });
        }
        if (salesItem?.exists) {
          const current = salesItemPatches.get(salesItem.id) || {
            status: 'READY_FOR_FINISHING',
            finishingTaskIds: Array.isArray(salesItem.get('finishingTaskIds')) ? salesItem.get('finishingTaskIds') : [],
          };
          if (!current.finishingTaskIds.includes(taskRef.id)) current.finishingTaskIds.push(taskRef.id);
          current.status = 'READY_FOR_FINISHING';
          salesItemPatches.set(salesItem.id, current);
        }
      }
      for (const [salesItemId, patch] of salesItemPatches) {
        tx.update(this.db.collection('sales_order_items').doc(salesItemId), { ...patch, updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(orderRef, {
        status: 'PRINTED',
        printedNote: note || null,
        printingCompletedAt: now,
        timeline: appendTimeline(order, actor, `Xác nhận in xong theo hướng dẫn gốc: ${String(order.instructionRaw || order.code || orderId)}`, 'print_done'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'PRODUCTION_PRINT_COMPLETED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'PRINTING', targetState: 'PRINTED' });
      return { status: 'PRINTED', idempotent: false, salesOrderIds: [...salesOrderIds] };
    });
    for (const salesOrderId of result.salesOrderIds) await this.deriveSalesOrder(salesOrderId, actor);
    return result;
  }

  async claimFinishingTask(firebaseUid: string | undefined, input: { taskId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['FINISHER']);
    const taskId = requireText(input?.taskId, 'Finishing task ID', 256);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('finishing_tasks').doc(taskId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Finishing task was not found.');
      if (snapshot.get('status') === 'CLAIMED' && snapshot.get('claimedBy') === actor.businessUserId) return { status: 'CLAIMED', idempotent: true };
      if (snapshot.get('status') !== 'READY') throw new WorkflowError('failed-precondition', 'Only a READY finishing task can be claimed.');
      if (snapshot.get('requiresFinishing') === false) throw new WorkflowError('failed-precondition', 'This product needs confirmation only and must not be claimed.');
      tx.update(ref, { status: 'CLAIMED', claimedBy: actor.businessUserId, claimedByName: actor.name, claimedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (typeof snapshot.get('salesOrderItemId') === 'string') {
        tx.update(this.db.collection('sales_order_items').doc(snapshot.get('salesOrderItemId')), { status: 'FINISHING', updatedAt: FieldValue.serverTimestamp() });
      }
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_TASK_CLAIMED', targetType: 'FINISHING_TASK', targetId: taskId, sourceState: 'READY', targetState: 'CLAIMED' });
      return { status: 'CLAIMED', idempotent: false };
    });
  }

  async completeFinishingTask(firebaseUid: string | undefined, input: { taskId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['FINISHER']);
    const taskId = requireText(input?.taskId, 'Finishing task ID', 256);
    const result = await this.db.runTransaction(async (tx) => {
      const taskRef = this.db.collection('finishing_tasks').doc(taskId);
      const taskSnapshot = await tx.get(taskRef);
      if (!taskSnapshot.exists) throw new WorkflowError('not-found', 'Finishing task was not found.');
      const task = taskSnapshot.data() || {};
      if (task.status === 'COMPLETED') return { status: 'COMPLETED', idempotent: true, salesOrderId: task.salesOrderId as string | undefined };
      if (task.cancellationRequest?.status === 'PENDING') {
        throw new WorkflowError('failed-precondition', 'A finishing cancellation request must be answered before completion.');
      }
      const requiresFinishing = task.requiresFinishing !== false;
      if (requiresFinishing && (task.status !== 'CLAIMED' || task.claimedBy !== actor.businessUserId)) {
        throw new WorkflowError('permission-denied', 'Only the finisher who claimed this product can complete it.');
      }
      if (!requiresFinishing && task.status !== 'READY') {
        throw new WorkflowError('failed-precondition', 'A no-finishing product can only be confirmed from READY.');
      }
      const goodRef = this.db.collection('finished_goods').doc(`fg_finish_${taskId}`);
      const goodSnapshot = await tx.get(goodRef);
      const salesItemRef = typeof task.salesOrderItemId === 'string' ? this.db.collection('sales_order_items').doc(task.salesOrderItemId) : null;
      const salesItemSnapshot = salesItemRef ? await tx.get(salesItemRef) : null;
      const relatedGoods = salesItemRef
        ? await tx.get(this.db.collection('finished_goods').where('salesOrderItemId', '==', salesItemRef.id))
        : null;
      const relatedTasks = salesItemRef
        ? await tx.get(this.db.collection('finishing_tasks').where('salesOrderItemId', '==', salesItemRef.id))
        : null;
      const now = new Date().toISOString();
      const quantity = numberOrZero(task.quantity);
      if (!goodSnapshot.exists) {
        tx.create(goodRef, {
          id: goodRef.id,
          sourceProductionOrderId: task.productionOrderId || null,
          sourceProductionItemId: task.productionItemId || null,
          sourceFinishingTaskId: taskId,
          salesOrderId: task.salesOrderId || null,
          salesOrderItemId: task.salesOrderItemId || null,
          customerId: task.customerId || salesItemSnapshot?.get('customerId') || null,
          productName: task.productName || salesItemSnapshot?.get('productName') || 'Sản phẩm',
          customerSnapshot: task.customerName ? { name: task.customerName } : null,
          imageUrl: task.imageUrl || salesItemSnapshot?.get('imageUrl') || null,
          image: task.image || salesItemSnapshot?.get('image') || null,
          orderedQuantity: quantity,
          producedQuantity: quantity,
          acceptedQuantity: quantity,
          dispatchedQuantity: 0,
          totalDispatchedQuantity: 0,
          returnedQuantity: 0,
          restockedQuantity: 0,
          remainingQuantity: quantity,
          quantityUnit: 'BAG',
          status: 'READY',
          createdAt: now,
        });
      }
      tx.update(taskRef, { status: 'COMPLETED', completedBy: actor.businessUserId, completedByName: actor.name, completedAt: now, updatedAt: FieldValue.serverTimestamp() });
      if (salesItemRef && salesItemSnapshot?.exists) {
        const existingReadyQuantity = relatedGoods?.docs.reduce((total, good) => total + numberOrZero(good.get('acceptedQuantity')), 0) || 0;
        const readyQuantity = existingReadyQuantity + (goodSnapshot.exists ? 0 : quantity);
        const warehouseReady = readyQuantity >= numberOrZero(salesItemSnapshot.get('quantity'));
        const anotherClaimedTask = relatedTasks?.docs.some(candidate => candidate.id !== taskId && candidate.get('status') === 'CLAIMED') || false;
        tx.update(salesItemRef, {
          status: warehouseReady ? 'WAREHOUSE_READY' : anotherClaimedTask ? 'FINISHING' : 'READY_FOR_FINISHING',
          ...(warehouseReady ? { warehouseReadyAt: now } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      addWorkflowAudit(this.db, tx, actor, { action: requiresFinishing ? 'FINISHING_TASK_COMPLETED' : 'FINISHING_NO_WORK_CONFIRMED', targetType: 'FINISHING_TASK', targetId: taskId, sourceState: String(task.status), targetState: 'COMPLETED' });
      return { status: 'COMPLETED', idempotent: false, salesOrderId: typeof task.salesOrderId === 'string' ? task.salesOrderId : undefined };
    });
    if (result.salesOrderId) await this.deriveSalesOrder(result.salesOrderId, actor);
    return result;
  }

  /** Cancellation is deliberately separate from Issues: before a claim it is
   * immediate; after a claim, only the claiming Finisher may accept/reject. */
  async requestFinishingCancellation(firebaseUid: string | undefined, input: { taskId?: unknown; reason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...SALES_ROLES, 'DESIGNER'] as const);
    const taskId = requireText(input?.taskId, 'Finishing task ID', 256);
    const reason = typeof input?.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 500) : 'Không cần gia công nữa.';
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('finishing_tasks').doc(taskId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Finishing task was not found.');
      const task = snapshot.data() || {};
      if (['COMPLETED', 'CANCELLED'].includes(String(task.status))) throw new WorkflowError('failed-precondition', 'This finishing task has already ended.');
      if (task.cancellationRequest?.status === 'PENDING') throw new WorkflowError('failed-precondition', 'A finishing cancellation request is already pending.');
      const now = new Date().toISOString();
      const request = { requestedBy: actor.businessUserId, requestedByName: actor.name, requestedRole: actor.role, requestedAt: now, reason, status: 'PENDING' };
      if (task.status === 'CLAIMED') {
        tx.update(ref, { cancellationRequest: request, updatedAt: FieldValue.serverTimestamp() });
        addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_CANCELLATION_REQUESTED', targetType: 'FINISHING_TASK', targetId: taskId, sourceState: 'CLAIMED', targetState: 'CLAIMED', reason });
        return { status: 'PENDING', direct: false };
      }
      await this.finishCancelledTask(tx, ref, task, actor, request, now);
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_CANCELLED_BEFORE_CLAIM', targetType: 'FINISHING_TASK', targetId: taskId, sourceState: 'READY', targetState: 'CANCELLED', reason });
      return { status: 'CANCELLED', direct: true };
    });
  }

  async respondFinishingCancellation(firebaseUid: string | undefined, input: { taskId?: unknown; accept?: unknown; responseReason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['FINISHER']);
    const taskId = requireText(input?.taskId, 'Finishing task ID', 256);
    if (typeof input?.accept !== 'boolean') throw new WorkflowError('invalid-argument', 'Cancellation response is required.');
    const responseReason = typeof input?.responseReason === 'string' ? input.responseReason.trim().slice(0, 500) : undefined;
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('finishing_tasks').doc(taskId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Finishing task was not found.');
      const task = snapshot.data() || {};
      const request = task.cancellationRequest;
      if (task.status !== 'CLAIMED' || task.claimedBy !== actor.businessUserId || request?.status !== 'PENDING') {
        throw new WorkflowError('permission-denied', 'Only the claiming finisher may answer this pending cancellation.');
      }
      const now = new Date().toISOString();
      const response = { ...request, status: input.accept ? 'ACCEPTED' : 'REJECTED', respondedBy: actor.businessUserId, respondedByName: actor.name, respondedAt: now, responseReason: responseReason || null };
      if (!input.accept) {
        tx.update(ref, { cancellationRequest: response, updatedAt: FieldValue.serverTimestamp() });
        addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_CANCELLATION_REJECTED', targetType: 'FINISHING_TASK', targetId: taskId, sourceState: 'CLAIMED', targetState: 'CLAIMED', reason: responseReason });
        return { status: 'CLAIMED', cancellationStatus: 'REJECTED' };
      }
      await this.finishCancelledTask(tx, ref, task, actor, response, now);
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_CANCELLATION_ACCEPTED', targetType: 'FINISHING_TASK', targetId: taskId, sourceState: 'CLAIMED', targetState: 'CANCELLED', reason: responseReason });
      return { status: 'CANCELLED', cancellationStatus: 'ACCEPTED' };
    });
  }

  private async finishCancelledTask(tx: FirebaseFirestore.Transaction, taskRef: FirebaseFirestore.DocumentReference, task: FirebaseFirestore.DocumentData, actor: WorkflowActor, cancellationRequest: FirebaseFirestore.DocumentData, now: string) {
    const goodRef = this.db.collection('finished_goods').doc(`fg_finish_${taskRef.id}`);
    const [good, salesItem] = await Promise.all([
      tx.get(goodRef),
      typeof task.salesOrderItemId === 'string' ? tx.get(this.db.collection('sales_order_items').doc(task.salesOrderItemId)) : Promise.resolve(null),
    ]);
    const quantity = numberOrZero(task.quantity);
    if (!good.exists) tx.create(goodRef, {
      id: goodRef.id, sourceProductionOrderId: task.productionOrderId || null, sourceProductionItemId: task.productionItemId || null,
      sourceFinishingTaskId: taskRef.id, salesOrderId: task.salesOrderId || null, salesOrderItemId: task.salesOrderItemId || null,
      customerId: task.customerId || salesItem?.get('customerId') || null, productName: task.productName || salesItem?.get('productName') || 'Sản phẩm',
      customerSnapshot: task.customerName ? { name: task.customerName } : null, imageUrl: task.imageUrl || salesItem?.get('imageUrl') || null, image: task.image || salesItem?.get('image') || null,
      orderedQuantity: quantity, producedQuantity: quantity, acceptedQuantity: quantity, dispatchedQuantity: 0, totalDispatchedQuantity: 0, returnedQuantity: 0, restockedQuantity: 0, remainingQuantity: quantity, quantityUnit: 'BAG', status: 'READY', createdAt: now,
    });
    tx.update(taskRef, { status: 'CANCELLED', cancellationRequest, cancelledBy: actor.businessUserId, cancelledByName: actor.name, cancelledAt: now, updatedAt: FieldValue.serverTimestamp() });
    if (salesItem?.exists) tx.update(salesItem.ref, { status: 'WAREHOUSE_READY', warehouseReadyAt: now, updatedAt: FieldValue.serverTimestamp() });
  }

  async setFinishingTaskUrgent(firebaseUid: string | undefined, input: { taskId?: unknown; urgent?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...SALES_ROLES, 'DESIGNER'] as const);
    const taskId = requireText(input?.taskId, 'Finishing task ID', 256);
    if (typeof input?.urgent !== 'boolean') throw new WorkflowError('invalid-argument', 'Urgent flag is required.');
    const urgent = input.urgent;
    return this.db.runTransaction(async (tx) => {
      const taskRef = this.db.collection('finishing_tasks').doc(taskId);
      const task = await tx.get(taskRef);
      if (!task.exists) throw new WorkflowError('not-found', 'Finishing task was not found.');
      const salesItemRef = typeof task.get('salesOrderItemId') === 'string'
        ? this.db.collection('sales_order_items').doc(task.get('salesOrderItemId'))
        : null;
      const salesItem = salesItemRef ? await tx.get(salesItemRef) : null;
      tx.update(taskRef, { urgent, urgentSetBy: actor.businessUserId, updatedAt: FieldValue.serverTimestamp() });
      if (salesItemRef && salesItem?.exists) tx.update(salesItemRef, { isUrgent: urgent, updatedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: urgent ? 'FINISHING_PRODUCT_MARKED_URGENT' : 'FINISHING_PRODUCT_URGENCY_CLEARED', targetType: 'FINISHING_TASK', targetId: taskId });
      return { urgent };
    });
  }

  async reportWorkflowIssue(firebaseUid: string | undefined, input: { salesOrderItemId?: unknown; stage?: unknown; issueType?: unknown; message?: unknown; recipientUserIds?: unknown; recipientRoles?: unknown; urgent?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER', 'WAREHOUSE']);
    const salesOrderItemId = requireText(input?.salesOrderItemId, 'Sales-order item ID', 128);
    const stage = requireText(input?.stage, 'Issue stage', 32).toUpperCase();
    if (!['FINISHING', 'WAREHOUSE'].includes(stage)) throw new WorkflowError('invalid-argument', 'Issue stage must be FINISHING or WAREHOUSE.');
    const issueType = requireText(input?.issueType, 'Issue type', 100);
    const message = requireText(input?.message, 'Issue message', 1000);
    const recipientUserIds = Array.isArray(input?.recipientUserIds)
      ? [...new Set(input.recipientUserIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))].slice(0, 20)
      : [];
    const requestedRoles = Array.isArray(input?.recipientRoles)
      ? [...new Set(input.recipientRoles.filter((value): value is UserRole => isUserRole(value)))].slice(0, 7)
      : [];
    const recipientRoles: UserRole[] = recipientUserIds.length === 0 && requestedRoles.length === 0
      ? ['SALE', 'DESIGNER', 'MANAGER']
      : requestedRoles;
    if (recipientUserIds.length > 0) {
      const recipients = await Promise.all(recipientUserIds.map(userId => this.db.collection('users').doc(userId).get()));
      if (recipients.some(recipient => !recipient.exists || recipient.get('active') === false)) {
        throw new WorkflowError('failed-precondition', 'Every selected issue recipient must be an active user.');
      }
    }
    const item = await this.db.collection('sales_order_items').doc(salesOrderItemId).get();
    if (!item.exists) throw new WorkflowError('not-found', 'Sales-order product was not found.');
    const issueRef = this.db.collection('workflow_issues').doc();
    const urgent = input?.urgent === true;
    const issue = {
      id: issueRef.id,
      entityType: 'SALES_ORDER_ITEM',
      entityId: salesOrderItemId,
      salesOrderId: String(item.get('salesOrderId')),
      stage,
      issueType,
      message,
      recipientUserIds,
      recipientRoles,
      urgent,
      priority: urgent ? 'URGENT' : 'NORMAL',
      status: 'OPEN',
      reportedBy: actor.businessUserId,
      reportedByName: actor.name,
      reportedByRole: actor.role,
      createdAt: new Date().toISOString(),
    };
    await issueRef.create(issue);
    return { issueId: issueRef.id, status: 'OPEN' };
  }

  async resolveWorkflowIssue(firebaseUid: string | undefined, input: { issueId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER', 'WAREHOUSE']);
    const issueId = requireText(input?.issueId, 'Issue ID', 128);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('workflow_issues').doc(issueId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Workflow issue was not found.');
      if (snapshot.get('status') === 'RESOLVED') return { status: 'RESOLVED', idempotent: true };
      if (snapshot.get('status') !== 'OPEN') throw new WorkflowError('failed-precondition', 'Only an OPEN issue can be resolved.');
      const userRecipients = Array.isArray(snapshot.get('recipientUserIds')) ? snapshot.get('recipientUserIds') : [];
      const roleRecipients = Array.isArray(snapshot.get('recipientRoles')) ? snapshot.get('recipientRoles') : [];
      const roleMatch = roleRecipients.includes(actor.role) || hasManagementRecipientAuthority(actor.role, roleRecipients);
      if (!userRecipients.includes(actor.businessUserId) && !roleMatch) throw new WorkflowError('permission-denied', 'Only a selected recipient can resolve this issue.');
      const now = new Date().toISOString();
      tx.update(ref, { status: 'RESOLVED', resolvedBy: actor.businessUserId, resolvedByName: actor.name, resolvedAt: now, updatedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: 'WORKFLOW_ISSUE_RESOLVED', targetType: 'WORKFLOW_ISSUE', targetId: issueId, sourceState: 'OPEN', targetState: 'RESOLVED' });
      return { status: 'RESOLVED', idempotent: false };
    });
  }

  async cancelWorkflowIssue(firebaseUid: string | undefined, input: { issueId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER', 'WAREHOUSE']);
    const issueId = requireText(input?.issueId, 'Issue ID', 128);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('workflow_issues').doc(issueId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Workflow issue was not found.');
      if (snapshot.get('status') === 'CANCELLED') return { status: 'CANCELLED', idempotent: true };
      if (snapshot.get('status') !== 'OPEN') throw new WorkflowError('failed-precondition', 'Only an OPEN issue can be cancelled.');
      if (snapshot.get('reportedBy') !== actor.businessUserId) throw new WorkflowError('permission-denied', 'Only the reporter can cancel this issue.');
      const now = new Date().toISOString();
      tx.update(ref, { status: 'CANCELLED', cancelledBy: actor.businessUserId, cancelledByName: actor.name, cancelledAt: now, updatedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: 'WORKFLOW_ISSUE_CANCELLED', targetType: 'WORKFLOW_ISSUE', targetId: issueId, sourceState: 'OPEN', targetState: 'CANCELLED' });
      return { status: 'CANCELLED', idempotent: false };
    });
  }

  /** Complete finishing and materialize exactly one FG per production item in one transaction. */
  async completeFinishing(firebaseUid: string | undefined, input: { orderId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['FINISHER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    return this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('orders').doc(orderId);
      const orderSnapshot = await tx.get(orderRef);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = orderSnapshot.data() || {};
      if (order.status === 'COMPLETED') return { status: 'COMPLETED', idempotent: true };
      if (order.status !== 'FINISHING' || !order.finishing || order.finishing.status !== 'IN_PROGRESS') {
        throw new WorkflowError('failed-precondition', 'Only an IN_PROGRESS finishing job can be completed.');
      }
      if (order.finishing.finisherId !== actor.businessUserId) {
        throw new WorkflowError('permission-denied', 'Only the assigned finisher can complete this job.');
      }
      const items = Array.isArray(order.items) ? order.items : [];
      if (!items.length) throw new WorkflowError('failed-precondition', 'Production order has no production items.');
      const now = new Date().toISOString();
      const salesItemRefs: FirebaseFirestore.DocumentReference[] = [];
      for (const item of items) {
        if (typeof item?.salesOrderItemId === 'string' && item.salesOrderItemId) {
          salesItemRefs.push(this.db.collection('sales_order_items').doc(item.salesOrderItemId));
        }
      }
      const salesItemSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const itemRef of salesItemRefs) salesItemSnapshots.set(itemRef.path, await tx.get(itemRef));
      const finishedGoodSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const item of items) {
        if (typeof item?.id !== 'string' || !item.id) throw new WorkflowError('failed-precondition', 'Production item identity is invalid.');
        const fgRef = this.db.collection('finished_goods').doc(sourceFinishedGoodId(orderId, item.id));
        finishedGoodSnapshots.set(fgRef.path, await tx.get(fgRef));
      }
      for (const item of items) {
        if (typeof item?.id !== 'string' || !item.id) throw new WorkflowError('failed-precondition', 'Production item identity is invalid.');
        const fgRef = this.db.collection('finished_goods').doc(sourceFinishedGoodId(orderId, item.id));
        const existingFg = finishedGoodSnapshots.get(fgRef.path);
        if (!existingFg?.exists) {
          const quantity = typeof item.quantity === 'number' && item.quantity >= 0 ? item.quantity : 0;
          tx.create(fgRef, {
            id: fgRef.id,
            sourceProductionOrderId: orderId,
            sourceProductionItemId: item.id,
            sourceProductionOrderIds: [orderId],
            sourceProductionItemIds: [item.id],
            salesOrderId: typeof item.salesOrderId === 'string' ? item.salesOrderId : null,
            salesOrderItemId: typeof item.salesOrderItemId === 'string' ? item.salesOrderItemId : null,
            customerId: typeof item.customerId === 'string' ? item.customerId : null,
            productName: item.productName || order.productName || 'Sản phẩm chưa đặt tên',
            customerSnapshot: item.customerNameSnapshot ? { name: item.customerNameSnapshot } : null,
            imageUrl: item.imageUrl || null,
            image: item.image || null,
            bagWidth: item.bagWidth || null,
            bagLength: item.bagLength || null,
            bagGusset: item.bagGusset || null,
            orderedQuantity: quantity,
            producedQuantity: quantity,
            acceptedQuantity: 0,
            dispatchedQuantity: 0,
            totalDispatchedQuantity: 0,
            returnedQuantity: 0,
            restockedQuantity: 0,
            remainingQuantity: 0,
            quantityUnit: 'BAG',
            status: 'WAITING',
            createdAt: now,
            integrationStatus: 'COMPLETED',
          });
        }
      }
      for (const itemRef of salesItemRefs) {
        const itemSnapshot = salesItemSnapshots.get(itemRef.path);
        if (itemSnapshot?.exists && itemSnapshot.get('status') !== 'CANCELLED') {
          tx.update(itemRef, { status: 'PRODUCTION_COMPLETED', updatedAt: FieldValue.serverTimestamp() });
        }
      }
      tx.update(orderRef, {
        status: 'COMPLETED',
        completedAt: now,
        finishing: { ...order.finishing, status: 'COMPLETED', completedAt: now },
        workflowIntegration: { status: 'COMPLETED', completedAt: now, finishedGoodsCreated: true },
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_COMPLETED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'IN_PROGRESS', targetState: 'COMPLETED' });
      return { status: 'COMPLETED', idempotent: false };
    });
  }

  async confirmFinishedGoodQuantity(firebaseUid: string | undefined, input: { finishedGoodId?: unknown; acceptedQuantity?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...SALES_ROLES, 'FINISHER'] as const);
    const finishedGoodId = requireText(input?.finishedGoodId, 'Finished good ID', 256);
    const acceptedQuantity = requireNumber(input?.acceptedQuantity, 'Accepted quantity', 0);
    const result = await this.db.runTransaction(async (tx) => {
      const fgRef = this.db.collection('finished_goods').doc(finishedGoodId);
      const fgSnapshot = await tx.get(fgRef);
      if (!fgSnapshot.exists) throw new WorkflowError('not-found', 'Finished good was not found.');
      const fg = fgSnapshot.data() || {};
      if (fg.status !== 'WAITING') {
        if (fg.acceptedQuantity === acceptedQuantity) return { salesOrderId: fg.salesOrderId, idempotent: true };
        throw new WorkflowError('failed-precondition', 'Finished-good quantity has already been confirmed.');
      }
      const produced = typeof fg.producedQuantity === 'number' ? fg.producedQuantity : fg.orderedQuantity;
      if (typeof produced === 'number' && acceptedQuantity > produced) {
        throw new WorkflowError('failed-precondition', 'Accepted quantity cannot exceed produced quantity.');
      }
      tx.update(fgRef, {
        acceptedQuantity,
        remainingQuantity: acceptedQuantity,
        status: acceptedQuantity > 0 ? 'READY' : 'WAITING',
        acceptedBy: actor.businessUserId,
        acceptedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHED_GOOD_CONFIRMED', targetType: 'FINISHED_GOOD', targetId: finishedGoodId, sourceState: 'WAITING', targetState: acceptedQuantity > 0 ? 'READY' : 'WAITING' });
      return { salesOrderId: typeof fg.salesOrderId === 'string' ? fg.salesOrderId : undefined, idempotent: false };
    });
    if (result.salesOrderId) await this.deriveSalesOrder(result.salesOrderId, actor);
    return result;
  }

  async confirmSalesOrder(firebaseUid: string | undefined, input: { salesOrderId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, SALES_ROLES);
    const salesOrderId = requireText(input?.salesOrderId, 'Sales order ID', 128);
    return this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('sales_orders').doc(salesOrderId);
      const [orderSnapshot, itemSnapshots] = await Promise.all([
        tx.get(orderRef),
        tx.get(this.db.collection('sales_order_items').where('salesOrderId', '==', salesOrderId)),
      ]);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Sales order was not found.');
      const order = orderSnapshot.data() || {};
      if (order.status !== 'DRAFT') {
        if (order.status !== 'CANCELLED') return { status: order.status, idempotent: true };
        throw new WorkflowError('failed-precondition', 'Only DRAFT sales orders can be confirmed.');
      }
      if (itemSnapshots.empty) throw new WorkflowError('failed-precondition', 'A sales order needs at least one item before confirmation.');
      const directFinishedGoodSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const directFinishingTaskSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const item of itemSnapshots.docs) {
        const requiresProduction = item.get('requiresProduction') !== false;
        if (requiresProduction) continue;
        if (item.get('requiresFinishing') === false) {
          const goodRef = this.db.collection('finished_goods').doc(`fg_direct_${item.id}`);
          directFinishedGoodSnapshots.set(item.id, await tx.get(goodRef));
        } else {
          const taskRef = this.db.collection('finishing_tasks').doc(`ft_direct_${item.id}`);
          directFinishingTaskSnapshots.set(item.id, await tx.get(taskRef));
        }
      }
      let hasProduction = false;
      const now = new Date().toISOString();
      for (const item of itemSnapshots.docs) {
        if (item.get('status') !== 'NEW') continue;
        const requiresProduction = item.get('requiresProduction') !== false;
        const requiresFinishing = item.get('requiresFinishing') !== false;
        if (requiresProduction) {
          hasProduction = true;
          tx.update(item.ref, { requiresProduction, requiresFinishing, status: 'WAITING_DESIGN', updatedAt: FieldValue.serverTimestamp() });
          continue;
        }
        const quantity = numberOrZero(item.get('quantity'));
        if (requiresFinishing) {
          const taskRef = this.db.collection('finishing_tasks').doc(`ft_direct_${item.id}`);
          if (!directFinishingTaskSnapshots.get(item.id)?.exists) {
            tx.create(taskRef, {
              id: taskRef.id,
              salesOrderId,
              salesOrderItemId: item.id,
              productionOrderId: null,
              productionItemId: null,
              productName: item.get('productName') || 'Sản phẩm',
              customerId: item.get('customerId') || order.customerId || null,
              customerName: order.customerSnapshot?.name || null,
              imageUrl: item.get('imageUrl') || null,
              image: item.get('image') || null,
              quantity,
              requiresFinishing: true,
              urgent: Boolean(item.get('isUrgent') || order.priority === 'URGENT'),
              status: 'READY',
              createdAt: now,
            });
          }
          tx.update(item.ref, {
            requiresProduction: false,
            requiresFinishing: true,
            finishingTaskIds: [taskRef.id],
            status: 'READY_FOR_FINISHING',
            updatedAt: FieldValue.serverTimestamp(),
          });
          continue;
        }
        const goodRef = this.db.collection('finished_goods').doc(`fg_direct_${item.id}`);
        if (!directFinishedGoodSnapshots.get(item.id)?.exists) {
          tx.create(goodRef, {
            id: goodRef.id,
            sourceType: 'DIRECT_SALES',
            salesOrderId,
            salesOrderItemId: item.id,
            customerId: item.get('customerId') || order.customerId || null,
            productName: item.get('productName') || 'Sản phẩm',
            customerSnapshot: order.customerSnapshot || null,
            imageUrl: item.get('imageUrl') || null,
            image: item.get('image') || null,
            orderedQuantity: quantity,
            producedQuantity: quantity,
            acceptedQuantity: quantity,
            dispatchedQuantity: 0,
            totalDispatchedQuantity: 0,
            returnedQuantity: 0,
            restockedQuantity: 0,
            remainingQuantity: quantity,
            quantityUnit: 'BAG',
            status: 'READY',
            createdAt: now,
          });
        }
        tx.update(item.ref, { requiresProduction: false, requiresFinishing: false, status: 'WAREHOUSE_READY', warehouseReadyAt: now, updatedAt: FieldValue.serverTimestamp() });
      }
      const hasDirectFinishing = itemSnapshots.docs.some(item => item.get('requiresProduction') === false && item.get('requiresFinishing') !== false);
      const targetStatus = hasProduction ? 'DESIGNING' : hasDirectFinishing ? 'FULFILLING' : 'READY_TO_SHIP';
      tx.update(orderRef, { status: targetStatus, confirmedAt: FieldValue.serverTimestamp(), confirmedBy: actor.businessUserId, updatedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: 'SALES_ORDER_CONFIRMED', targetType: 'SALES_ORDER', targetId: salesOrderId, sourceState: 'DRAFT', targetState: targetStatus });
      return { status: targetStatus, idempotent: false };
    });
  }

  /** Sales-order cancellation is transactional so parent and item state cannot diverge. */
  async cancelSalesOrder(firebaseUid: string | undefined, input: { salesOrderId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, SALES_ROLES);
    const salesOrderId = requireText(input?.salesOrderId, 'Sales order ID', 128);
    return this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('sales_orders').doc(salesOrderId);
      const [orderSnapshot, itemSnapshots] = await Promise.all([
        tx.get(orderRef),
        tx.get(this.db.collection('sales_order_items').where('salesOrderId', '==', salesOrderId)),
      ]);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Sales order was not found.');
      const order = orderSnapshot.data() || {};
      if (order.status === 'CANCELLED') return { status: 'CANCELLED', idempotent: true };
      if (['COMPLETED', 'DELIVERED', 'SHIPPING', 'READY_TO_SHIP'].includes(order.status)) {
        throw new WorkflowError('failed-precondition', 'This sales order can no longer be cancelled.');
      }
      if (itemSnapshots.docs.some((item) => ['IN_PRODUCTION', 'PRODUCTION_COMPLETED'].includes(item.get('status')))) {
        throw new WorkflowError('failed-precondition', 'Resolve linked production before cancelling this sales order.');
      }
      for (const item of itemSnapshots.docs) {
        if (item.get('status') !== 'CANCELLED') tx.update(item.ref, { status: 'CANCELLED', updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(orderRef, { status: 'CANCELLED', cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: 'SALES_ORDER_CANCELLED', targetType: 'SALES_ORDER', targetId: salesOrderId, sourceState: String(order.status), targetState: 'CANCELLED' });
      return { status: 'CANCELLED', idempotent: false };
    });
  }

  /** Privileged recovery for legacy delivered/completed orders, with server audit. */
  async forceReopenSalesOrder(firebaseUid: string | undefined, input: { salesOrderId?: unknown; reason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN']);
    const salesOrderId = requireText(input?.salesOrderId, 'Sales order ID', 128);
    const reason = requireText(input?.reason, 'Reopen reason', 500);
    return this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('sales_orders').doc(salesOrderId);
      const orderSnapshot = await tx.get(orderRef);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Sales order was not found.');
      const order = orderSnapshot.data() || {};
      if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
        throw new WorkflowError('failed-precondition', 'Only delivered or completed sales orders can be force-reopened.');
      }
      tx.update(orderRef, {
        status: 'IN_PRODUCTION',
        forceReopenedAt: FieldValue.serverTimestamp(),
        forceReopenedBy: actor.businessUserId,
        forceReopenReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'SALES_ORDER_FORCE_REOPENED', targetType: 'SALES_ORDER', targetId: salesOrderId, sourceState: String(order.status), targetState: 'IN_PRODUCTION', reason });
      return { status: 'IN_PRODUCTION' };
    });
  }

  /** Link a newly-created production run without allowing browser lifecycle writes. */
  async linkProductionOrder(firebaseUid: string | undefined, input: { productionOrderId?: unknown; links?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...SALES_ROLES, 'DESIGNER'] as const);
    const productionOrderId = requireText(input?.productionOrderId, 'Production order ID', 128);
    const requestedLinks = Array.isArray(input?.links) ? input.links.map((entry: unknown) => {
      const value = entry as { productionItemId?: unknown; salesOrderId?: unknown; salesOrderItemId?: unknown };
      return {
        productionItemId: requireText(value.productionItemId, 'Production item ID', 128),
        salesOrderId: requireText(value.salesOrderId, 'Sales order ID', 128),
        salesOrderItemId: requireText(value.salesOrderItemId, 'Sales order item ID', 128),
      };
    }) : [];
    const salesOrderIds = new Set<string>();
    await this.db.runTransaction(async (tx) => {
      const production = await tx.get(this.db.collection('orders').doc(productionOrderId));
      if (!production.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const sourceItems = Array.isArray(production.get('items')) ? production.get('items') : [];
      const linkByProductionItem = new Map(requestedLinks.map(link => [link.productionItemId, link]));
      for (const link of requestedLinks) {
        if (!sourceItems.some((item: FirebaseFirestore.DocumentData) => item?.id === link.productionItemId)) {
          throw new WorkflowError('failed-precondition', `Production item ${link.productionItemId} was not found.`);
        }
      }
      const items = sourceItems.map((item: FirebaseFirestore.DocumentData) => {
        const link = linkByProductionItem.get(item?.id);
        return link ? {
          ...item,
          salesOrderId: link.salesOrderId,
          salesOrderItemId: link.salesOrderItemId,
          sourceType: 'SALES_ORDER',
        } : item;
      });
      const groupedItems = new Map<string, FirebaseFirestore.DocumentData[]>();
      for (const productionItem of items) {
        if (typeof productionItem?.salesOrderId !== 'string' || typeof productionItem?.salesOrderItemId !== 'string') continue;
        const group = groupedItems.get(productionItem.salesOrderItemId) || [];
        group.push(productionItem);
        groupedItems.set(productionItem.salesOrderItemId, group);
      }
      const itemSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const salesOrderItemId of groupedItems.keys()) {
        itemSnapshots.set(salesOrderItemId, await tx.get(this.db.collection('sales_order_items').doc(salesOrderItemId)));
      }
      const taskSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const completedGoodSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      const existingGoodsBySalesItem = new Map<string, FirebaseFirestore.QuerySnapshot>();
      for (const link of requestedLinks) {
        const taskId = `ft_${productionOrderId}_${link.productionItemId}`;
        const taskSnapshot = await tx.get(this.db.collection('finishing_tasks').doc(taskId));
        taskSnapshots.set(link.productionItemId, taskSnapshot);
        completedGoodSnapshots.set(link.productionItemId, await tx.get(this.db.collection('finished_goods').doc(`fg_finish_${taskId}`)));
      }
      for (const salesOrderItemId of groupedItems.keys()) {
        existingGoodsBySalesItem.set(salesOrderItemId, await tx.get(this.db.collection('finished_goods').where('salesOrderItemId', '==', salesOrderItemId)));
      }
      for (const [salesOrderItemId, productionItems] of groupedItems) {
        const item = itemSnapshots.get(salesOrderItemId);
        const salesOrderId = productionItems[0].salesOrderId;
        if (!item?.exists || productionItems.some((productionItem) => productionItem.salesOrderId !== salesOrderId) || item.get('salesOrderId') !== salesOrderId) {
          throw new WorkflowError('failed-precondition', 'The linked sales-order item is missing or invalid.');
        }
        if (item.get('requiresProduction') === false) {
          throw new WorkflowError('failed-precondition', 'A direct-route sales product cannot be linked to production.');
        }
        const linked = Array.isArray(item.get('linkedProductionItemIds')) ? item.get('linkedProductionItemIds') : [];
        const linkedOrders = Array.isArray(item.get('linkedProductionOrderIds')) ? item.get('linkedProductionOrderIds') : [];
        const history = Array.isArray(item.get('productionHistory')) ? item.get('productionHistory') : [];
        const newProductionItems = productionItems.filter((productionItem) => !history.some((entry: FirebaseFirestore.DocumentData) =>
          entry?.productionOrderId === productionOrderId && entry?.productionItemId === productionItem.id,
        ));
        if (newProductionItems.length === 0) {
          salesOrderIds.add(salesOrderId);
          continue;
        }
        const allocated = numberOrZero(item.get('allocatedQuantity'));
        const finishingTaskIds = Array.isArray(item.get('finishingTaskIds')) ? item.get('finishingTaskIds') : [];
        let readyQuantity = existingGoodsBySalesItem.get(salesOrderItemId)?.docs.reduce(
          (total, good) => total + numberOrZero(good.get('acceptedQuantity')),
          0,
        ) || 0;
        let hasClaimedTask = false;
        if (production.get('status') === 'PRINTED') {
          for (const productionItem of newProductionItems) {
            const taskRef = this.db.collection('finishing_tasks').doc(`ft_${productionOrderId}_${productionItem.id}`);
            const taskSnapshot = taskSnapshots.get(productionItem.id);
            const quantity = numberOrZero(item.get('quantity'));
            const requiresFinishing = typeof productionItem.requiresFinishing === 'boolean'
              ? productionItem.requiresFinishing
              : item.get('requiresFinishing') !== false;
            const taskLinkPatch = {
              salesOrderId,
              salesOrderItemId,
              customerId: item.get('customerId') || null,
              quantity,
              requiresFinishing,
              updatedAt: FieldValue.serverTimestamp(),
            };
            if (taskSnapshot?.exists) {
              tx.update(taskRef, taskLinkPatch);
              hasClaimedTask ||= taskSnapshot.get('status') === 'CLAIMED';
            } else {
              tx.create(taskRef, {
                id: taskRef.id,
                ...taskLinkPatch,
                productionOrderId,
                productionItemId: productionItem.id,
                productName: productionItem.productName || item.get('productName') || 'Sản phẩm',
                customerName: productionItem.customerName || null,
                imageUrl: productionItem.imageUrl || item.get('imageUrl') || null,
                image: productionItem.image || item.get('image') || null,
                status: 'READY',
                createdAt: new Date().toISOString(),
              });
            }
            if (!finishingTaskIds.includes(taskRef.id)) finishingTaskIds.push(taskRef.id);
            if (taskSnapshot?.get('status') === 'COMPLETED') {
              const goodRef = this.db.collection('finished_goods').doc(`fg_finish_${taskRef.id}`);
              const goodSnapshot = completedGoodSnapshots.get(productionItem.id);
              if (goodSnapshot?.exists) {
                const wasAlreadyLinkedToThisProduct = goodSnapshot.get('salesOrderItemId') === salesOrderItemId;
                tx.update(goodRef, {
                  salesOrderId,
                  salesOrderItemId,
                  customerId: item.get('customerId') || null,
                  orderedQuantity: quantity,
                  producedQuantity: quantity,
                  acceptedQuantity: quantity,
                  remainingQuantity: Math.max(0, quantity - numberOrZero(goodSnapshot.get('dispatchedQuantity'))),
                });
                if (!wasAlreadyLinkedToThisProduct) readyQuantity += quantity;
              }
            }
          }
        }
        const warehouseReady = production.get('status') === 'PRINTED' && readyQuantity >= numberOrZero(item.get('quantity'));
        const status = item.get('status') === 'CANCELLED'
          ? 'CANCELLED'
          : production.get('status') !== 'PRINTED'
            ? 'IN_PRODUCTION'
            : warehouseReady
              ? 'WAREHOUSE_READY'
              : hasClaimedTask ? 'FINISHING' : 'READY_FOR_FINISHING';
        tx.update(item.ref, {
          linkedProductionItemIds: [...new Set([...linked, ...newProductionItems.map((productionItem) => productionItem.id)])],
          linkedProductionOrderIds: linkedOrders.includes(productionOrderId) ? linkedOrders : [...linkedOrders, productionOrderId],
          productionHistory: [...history, ...newProductionItems.map((productionItem) => ({
            productionOrderId,
            productionItemId: productionItem.id,
            allocatedProductQuantity: 0,
            linkedAt: new Date().toISOString(),
            linkedBy: actor.businessUserId,
          }))],
          allocatedQuantity: allocated,
          finishingTaskIds,
          status,
          ...(warehouseReady ? { warehouseReadyAt: new Date().toISOString() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        salesOrderIds.add(salesOrderId);
      }
      if (requestedLinks.length > 0) {
        tx.update(production.ref, { items, updatedAt: FieldValue.serverTimestamp() });
      }
      addWorkflowAudit(this.db, tx, actor, { action: 'PRODUCTION_LINKED_TO_SALES', targetType: 'PRODUCTION_ORDER', targetId: productionOrderId });
    });
    for (const salesOrderId of salesOrderIds) await this.deriveSalesOrder(salesOrderId, actor);
    return { linkedSalesOrders: salesOrderIds.size };
  }

  /** Derive, never trust a browser-supplied parent lifecycle state. */
  async deriveSalesOrder(salesOrderId: string, actor: WorkflowActor): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('sales_orders').doc(salesOrderId);
      const [orderSnapshot, itemsSnapshot, goodsSnapshot, shipmentsSnapshot] = await Promise.all([
        tx.get(orderRef),
        tx.get(this.db.collection('sales_order_items').where('salesOrderId', '==', salesOrderId)),
        tx.get(this.db.collection('finished_goods').where('salesOrderId', '==', salesOrderId)),
        tx.get(this.db.collection('shipments').where('salesOrderId', '==', salesOrderId)),
      ]);
      if (!orderSnapshot.exists) return;
      const order = orderSnapshot.data() || {};
      if (order.status === 'DRAFT' || order.status === 'CANCELLED') return;
      const items = itemsSnapshot.docs.map((item) => item.data());
      const shipments = shipmentsSnapshot.docs.map((shipment) => shipment.data());
      const hasReturned = shipments.some((shipment) => ['RETURNING', 'RETURNED'].includes(shipment.status));
      const hasActiveShipment = shipments.some((shipment) => ['READY', 'CREATED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERY_FAILED'].includes(shipment.status));
      const allDelivered = shipments.length > 0 && shipments.every((shipment) => shipment.status === 'DELIVERED' || shipment.status === 'CANCELLED');
      let next = order.status;
      if (hasReturned) next = 'SHIPPING';
      else if (allDelivered) next = 'COMPLETED';
      else if (hasActiveShipment) next = 'SHIPPING';
      else if (items.some((item) => item.status === 'IN_PRODUCTION')) next = 'IN_PRODUCTION';
      else if (items.some((item) => ['WAITING_DESIGN', 'DESIGNING', 'NEW', 'READY_FOR_PRODUCTION'].includes(item.status))) next = 'DESIGNING';
      else if (items.some((item) => ['READY_FOR_FINISHING', 'FINISHING'].includes(item.status))) next = 'FULFILLING';
      else {
        const allProductionItemsComplete = items.length > 0 && items.every((item) => ['PRODUCTION_COMPLETED', 'WAREHOUSE_READY', 'CANCELLED'].includes(item.status));
        // A linked item stays IN_PRODUCTION until every required production run
        // is completed. The production completion transaction is the only
        // writer of PRODUCTION_COMPLETED, so this is the authoritative active-run guard.
        const hasActiveProduction = items.some((item) => item.status === 'IN_PRODUCTION');
        const goodsByItem = new Map<string, number>();
        for (const fg of goodsSnapshot.docs) {
          const itemId = fg.get('salesOrderItemId');
          if (typeof itemId === 'string') goodsByItem.set(itemId, (goodsByItem.get(itemId) || 0) + Number(fg.get('acceptedQuantity') || 0));
        }
        const allAccepted = items.filter((item) => item.status !== 'CANCELLED').every((item) => (goodsByItem.get(item.id) || 0) >= Number(item.quantity || 0));
        const allWarehouseReady = items.filter((item) => item.status !== 'CANCELLED').every((item) => item.status === 'WAREHOUSE_READY' || item.status === 'PRODUCTION_COMPLETED');
        if (allProductionItemsComplete && allWarehouseReady && allAccepted && !hasActiveProduction) next = 'READY_TO_SHIP';
        else if (allProductionItemsComplete) next = 'PRODUCTION_COMPLETED';
      }
      if (next !== order.status) {
        tx.update(orderRef, { status: next, updatedAt: FieldValue.serverTimestamp() });
        addWorkflowAudit(this.db, tx, actor, { action: 'SALES_ORDER_STATUS_DERIVED', targetType: 'SALES_ORDER', targetId: salesOrderId, sourceState: String(order.status), targetState: next });
      }
    });
  }
}
