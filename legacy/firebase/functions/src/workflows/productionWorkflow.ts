import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { addWorkflowAudit } from './workflowAudit';
import { hasManagementRecipientAuthority, MANAGEMENT_ROLES, requireEnum, requireText, requireWorkflowActor, SALES_ROLES, WorkflowActor, WorkflowError } from './workflowAuth';
import { getIssuePolicy, normalizeIssueType } from './issuePolicy';
import { isUserRole, UserRole } from '../types';

const FINISHING_TYPES = ['Dán', 'Cắt', 'Bế', 'Xén', 'Đục lỗ', 'Đóng gói', 'Khác'] as const;
const READY_PLATE_STATUSES = ['RECEIVED', 'OLD_PLATE', 'NOT_REQUIRED'] as const;
const numberOrOne = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;

function isManagement(actor: WorkflowActor): boolean {
  return MANAGEMENT_ROLES.includes(actor.role);
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

export class ProductionWorkflowService {
  constructor(private readonly db: Firestore) {}

  async reviseProductionOrder(firebaseUid: string | undefined, input: { orderId?: unknown; instructionRaw?: unknown; printerId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const hasInstruction = typeof input?.instructionRaw === 'string';
    const instructionRaw = hasInstruction ? requireText(input.instructionRaw, 'Production instruction', 5000) : undefined;
    const printerId = typeof input?.printerId === 'string' && input.printerId.trim() ? input.printerId.trim().slice(0, 128) : undefined;
    if (!hasInstruction && !printerId) throw new WorkflowError('invalid-argument', 'An instruction or printer assignment is required.');
    return this.db.runTransaction(async (tx) => {
      const orderRef = this.db.collection('orders').doc(orderId);
      const orderSnapshot = await tx.get(orderRef);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = orderSnapshot.data() || {};
      if (!['WAITING_ACCEPTANCE', 'ACCEPTED', 'WAITING_PRINT'].includes(order.status)) {
        throw new WorkflowError('failed-precondition', 'Production instructions and printer assignment are locked after printing starts.');
      }
      const printerSnapshot = printerId ? await tx.get(this.db.collection('users').doc(printerId)) : null;
      if (printerSnapshot && (!printerSnapshot.exists || printerSnapshot.get('active') === false || printerSnapshot.get('role') !== 'PRINTER')) {
        throw new WorkflowError('failed-precondition', 'The selected printer is not active.');
      }
      const instructionChanged = hasInstruction && instructionRaw !== String(order.instructionRaw || '');
      const printerChanged = Boolean(printerId && printerId !== order.printerId);
      if (!instructionChanged && !printerChanged) return { productionRevision: numberOrOne(order.productionRevision), idempotent: true };
      const revision = instructionChanged ? numberOrOne(order.productionRevision) + 1 : numberOrOne(order.productionRevision);
      const nextStatus = printerChanged ? 'WAITING_ACCEPTANCE' : order.status;
      const patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        ...(instructionChanged ? { instructionRaw, productionRevision: revision } : {}),
        ...(printerChanged ? {
          printerId,
          printerName: printerSnapshot?.get('name') || printerId,
          printerAcknowledgedRevision: 0,
          status: nextStatus,
          acceptedAt: FieldValue.delete(),
        } : {}),
        timeline: appendTimeline(order, actor, instructionChanged
          ? `Cập nhật hướng dẫn sản xuất lên phiên bản ${revision}`
          : `Chuyển lệnh cho thợ in ${printerSnapshot?.get('name') || printerId}`,
        instructionChanged ? 'other' : 'dispatch'),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.update(orderRef, patch);
      addWorkflowAudit(this.db, tx, actor, {
        action: instructionChanged ? 'PRODUCTION_INSTRUCTION_REVISED' : 'PRODUCTION_PRINTER_REASSIGNED',
        targetType: 'PRODUCTION_ORDER',
        targetId: orderId,
        sourceState: String(order.status),
        targetState: String(nextStatus),
      });
      return { productionRevision: revision, status: nextStatus, idempotent: false };
    });
  }

  async reportBrokenPlate(firebaseUid: string | undefined, input: { orderId?: unknown; reason?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, [...SALES_ROLES, 'PRINTER'] as const);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const suppliedReason = typeof input?.reason === 'string' && input.reason.trim() ? input.reason.trim().slice(0, 500) : undefined;
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      if (!isManagement(actor) && (actor.role !== 'PRINTER' || order.printerId !== actor.businessUserId)) {
        throw new WorkflowError('permission-denied', 'Only the assigned printer or management can report a broken plate.');
      }
      const isNotSent = order.plateStatus === 'NOT_SENT';
      if (!['WAITING_ACCEPTANCE', 'ACCEPTED', 'WAITING_PRINT', 'WAITING_PLATE'].includes(order.status)) {
        throw new WorkflowError('failed-precondition', 'A broken plate can be reported only before printing starts.');
      }
      const issueType = isNotSent ? 'PLATE_NOT_SENT' : 'PLATE_DAMAGED';
      const reason = suppliedReason || (isNotSent
        ? 'Chưa có kẽm tại máy in; cần thiết kế gửi kẽm.'
        : 'Kẽm hỏng, thiếu hoặc không thể sử dụng.');
      const existingIssue = (Array.isArray(order.issues) ? order.issues : []).find((candidate: FirebaseFirestore.DocumentData) =>
        candidate?.status !== 'RESOLVED' && (candidate.issueType === issueType || candidate.type === issueType),
      );
      if (existingIssue) return { issueId: existingIssue.id, plateStatus: order.plateStatus, alreadyReported: true };
      const issue = {
        id: `plate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: issueType,
        issueType,
        message: reason,
        createdBy: actor.businessUserId,
        createdByName: actor.name,
        assignedToRole: 'DESIGNER',
        ownerRole: 'DESIGNER',
        priority: 'URGENT',
        isBlocking: false,
        status: 'OPEN',
        createdAt: new Date().toISOString(),
      };
      const issues = [...(Array.isArray(order.issues) ? order.issues : []), issue];
      tx.update(ref, {
        ...(isNotSent ? {} : { plateStatus: 'PLATE_DAMAGED' }),
        hasBlockingIssue: false,
        issues,
        timeline: appendTimeline(order, actor, isNotSent ? `Báo chưa có kẽm: ${reason}` : `Báo kẽm hỏng: ${reason}`, 'plate'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      for (const role of ['DESIGNER', 'ADMIN', 'MANAGER']) {
        tx.create(this.db.collection('notifications').doc(), {
          targetRole: role,
          orderId,
          orderCode: order.code || orderId,
          title: `Kẽm cần xử lý #${order.code || orderId}`,
          message: reason,
          type: isNotSent ? 'plate_not_sent' : 'plate_damaged',
          issueId: issue.id,
          actionRequired: true,
          priority: 'URGENT',
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      addWorkflowAudit(this.db, tx, actor, { action: isNotSent ? 'PLATE_NOT_SENT_REPORTED' : 'PLATE_DAMAGED_REPORTED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: String(order.plateStatus), targetState: isNotSent ? 'NOT_SENT' : 'PLATE_DAMAGED', reason });
      return { issueId: issue.id, plateStatus: isNotSent ? 'NOT_SENT' : 'PLATE_DAMAGED', alreadyReported: false };
    });
  }

  async reportIssue(firebaseUid: string | undefined, input: { orderId?: unknown; issueType?: unknown; message?: unknown; recipientUserIds?: unknown; recipientRoles?: unknown; urgent?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const issueType = normalizeIssueType(input?.issueType);
    const policy = getIssuePolicy(issueType);
    if (!policy.reporterRoles.includes(actor.role)) throw new WorkflowError('permission-denied', 'This role cannot report that issue type.');
    const message = requireText(input?.message, 'Issue message', 1000);
    const requestedUserIds = Array.isArray(input?.recipientUserIds)
      ? [...new Set(input.recipientUserIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))].slice(0, 20)
      : [];
    const requestedRoles = Array.isArray(input?.recipientRoles)
      ? [...new Set(input.recipientRoles.filter((value): value is UserRole => isUserRole(value)))].slice(0, 7)
      : [];
    const urgent = input?.urgent === true;
    const recipientRoles: UserRole[] = requestedUserIds.length === 0 && requestedRoles.length === 0
      ? [...new Set([policy.ownerRole, ...policy.escalationRoles])]
      : requestedRoles;
    if (requestedUserIds.length > 0) {
      const recipientSnapshots = await Promise.all(requestedUserIds.map(userId => this.db.collection('users').doc(userId).get()));
      if (recipientSnapshots.some(snapshot => !snapshot.exists || snapshot.get('active') === false)) {
        throw new WorkflowError('failed-precondition', 'Every selected issue recipient must be an active user.');
      }
    }
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId); const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      const defaultCreatorRecipient = requestedUserIds.length === 0 && requestedRoles.length === 0 && issueType === 'PLATE' && typeof order.createdBy === 'string'
        ? [order.createdBy]
        : [];
      const issue = { id: `iss-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, issueType, type: issueType, ownerRole: policy.ownerRole, escalationRoles: policy.escalationRoles, recipientUserIds: requestedUserIds.length ? requestedUserIds : defaultCreatorRecipient, recipientRoles, priority: urgent ? 'URGENT' : 'NORMAL', urgent, isBlocking: false, status: 'OPEN', reportedBy: actor.businessUserId, reportedByRole: actor.role, createdBy: actor.businessUserId, createdByName: actor.name, message, createdAt: new Date().toISOString() };
      const issues = [issue, ...(Array.isArray(order.issues) ? order.issues : [])];
      tx.update(ref, { issues, hasBlockingIssue: false, timeline: appendTimeline(order, actor, `Reported ${issueType} issue: ${message}`, 'issue'), updatedAt: FieldValue.serverTimestamp() });
      return { issueId: issue.id, issueType, ownerRole: policy.ownerRole, isBlocking: policy.isBlocking };
    });
  }

  async reissuePlate(firebaseUid: string | undefined, input: { orderId?: unknown; plateDate?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const plateDate = typeof input?.plateDate === 'string' && input.plateDate.trim() ? input.plateDate.trim().slice(0, 50) : new Date().toISOString().slice(0, 10);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      const hasOpenPlateIssue = (Array.isArray(order.issues) ? order.issues : []).some((issue: FirebaseFirestore.DocumentData) =>
        issue.status === 'OPEN' && ['PLATE_DAMAGED', 'PLATE_NOT_SENT'].includes(issue.type || issue.issueType),
      );
      if (order.plateStatus !== 'PLATE_DAMAGED' || !hasOpenPlateIssue) {
        throw new WorkflowError('failed-precondition', 'Only an unresolved damaged plate can be reissued.');
      }
      tx.update(ref, {
        plateType: 'NEW',
        plateStatus: 'SENT',
        plateDate,
        plateSentAt: FieldValue.serverTimestamp(),
        hasBlockingIssue: false,
        timeline: appendTimeline(order, actor, `Ra lại kẽm mới, đã gửi: ${plateDate}`, 'plate'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'PLATE_REISSUED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'PLATE_DAMAGED', targetState: 'SENT' });
      return { plateStatus: 'SENT' };
    });
  }

  /** Initial plate hand-off is authoritative too; browser clients may not mark
   * a production order SENT with a direct Firestore write. */
  async sendPlate(firebaseUid: string | undefined, input: { orderId?: unknown; plateNote?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const plateNote = typeof input?.plateNote === 'string' ? input.plateNote.trim().slice(0, 500) : undefined;
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      if (order.plateStatus !== 'NOT_SENT') {
        throw new WorkflowError('failed-precondition', 'Only a NOT_SENT plate can be sent through the initial-plate workflow.');
      }
      tx.update(ref, {
        plateStatus: 'SENT',
        ...(plateNote ? { plateNote } : {}),
        plateSentAt: FieldValue.serverTimestamp(),
        timeline: appendTimeline(order, actor, 'Đã gửi kẽm sang xưởng.', 'plate'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'PLATE_SENT', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'NOT_SENT', targetState: 'SENT' });
      return { plateStatus: 'SENT' };
    });
  }

  async receivePlate(firebaseUid: string | undefined, input: { orderId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'PRINTER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      if (!isManagement(actor) && actor.role === 'PRINTER' && order.printerId !== actor.businessUserId) {
        throw new WorkflowError('permission-denied', 'Only the assigned printer can receive this plate.');
      }
      if (order.plateStatus !== 'SENT') {
        throw new WorkflowError('failed-precondition', 'A reissued plate must be SENT before it can be received.');
      }
      tx.update(ref, {
        plateStatus: 'RECEIVED',
        plateReceivedAt: FieldValue.serverTimestamp(),
        hasBlockingIssue: false,
        timeline: appendTimeline(order, actor, 'Đã nhận kẽm mới; có thể bắt đầu in.', 'plate'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'PLATE_RECEIVED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'SENT', targetState: 'RECEIVED' });
      return { plateStatus: 'RECEIVED' };
    });
  }

  async handoffToFinishing(firebaseUid: string | undefined, input: { orderId?: unknown; finisherId?: unknown; types?: unknown; note?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, MANAGEMENT_ROLES);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const finisherId = requireText(input?.finisherId, 'Finisher ID', 128);
    const types = Array.isArray(input?.types) && input.types.length > 0
      ? input.types.map((value) => requireEnum(value, FINISHING_TYPES, 'Finishing type'))
      : (() => { throw new WorkflowError('invalid-argument', 'At least one finishing type is required.'); })();
    const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 500) : undefined;
    return this.db.runTransaction(async (tx) => {
      const [orderSnapshot, finisherSnapshot] = await Promise.all([
        tx.get(this.db.collection('orders').doc(orderId)),
        tx.get(this.db.collection('users').doc(finisherId)),
      ]);
      if (!orderSnapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      if (!finisherSnapshot.exists || finisherSnapshot.get('active') === false || finisherSnapshot.get('role') !== 'FINISHER') {
        throw new WorkflowError('failed-precondition', 'The selected finisher is not active.');
      }
      const order = orderSnapshot.data() || {};
      if (order.status !== 'PRINTED') throw new WorkflowError('failed-precondition', 'Only PRINTED orders can be handed to finishing.');
      const finisherName = typeof finisherSnapshot.get('name') === 'string' ? finisherSnapshot.get('name') : finisherId;
      tx.update(orderSnapshot.ref, {
        status: 'FINISHING',
        finishing: { id: `fin-${orderId}`, finisherId, finisherName, types, status: 'PENDING', ...(note ? { note } : {}), assignedAt: new Date().toISOString() },
        timeline: appendTimeline(order, actor, `Chuyển ${finisherName} gia công`, 'other'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_HANDED_OFF', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'PRINTED', targetState: 'FINISHING' });
      return { status: 'FINISHING', finishingStatus: 'PENDING' };
    });
  }

  async startFinishing(firebaseUid: string | undefined, input: { orderId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['FINISHER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      if (order.status !== 'FINISHING' || !order.finishing || order.finishing.status !== 'PENDING') {
        throw new WorkflowError('failed-precondition', 'Finishing must be PENDING before it can start.');
      }
      if (order.finishing.finisherId !== actor.businessUserId) {
        throw new WorkflowError('permission-denied', 'Only the assigned finisher can start this job.');
      }
      tx.update(ref, { finishing: { ...order.finishing, status: 'IN_PROGRESS', startedAt: new Date().toISOString() }, timeline: appendTimeline(order, actor, 'Bắt đầu gia công.', 'finish_start'), updatedAt: FieldValue.serverTimestamp() });
      addWorkflowAudit(this.db, tx, actor, { action: 'FINISHING_STARTED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: 'PENDING', targetState: 'IN_PROGRESS' });
      return { status: 'FINISHING', finishingStatus: 'IN_PROGRESS' };
    });
  }

  /** Any selected recipient can resolve an issue. Resolution never mutates
   * the production lifecycle, including for plate-related issues. */
  async resolveIssue(firebaseUid: string | undefined, input: { orderId?: unknown; issueId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const issueId = requireText(input?.issueId, 'Issue ID', 128);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      const issues = Array.isArray(order.issues) ? order.issues : [];
      const issue = issues.find((candidate: FirebaseFirestore.DocumentData) => candidate?.id === issueId);
      if (!issue) throw new WorkflowError('not-found', 'Production issue was not found.');
      if (issue.status === 'RESOLVED') return { status: 'RESOLVED', alreadyResolved: true };
      const recipientUserIds = Array.isArray(issue.recipientUserIds) ? issue.recipientUserIds : [];
      const recipientRoles = Array.isArray(issue.recipientRoles)
        ? issue.recipientRoles
        : [issue.ownerRole, ...(Array.isArray(issue.escalationRoles) ? issue.escalationRoles : [])];
      const matchesRecipientRole = recipientRoles.includes(actor.role) || hasManagementRecipientAuthority(actor.role, recipientRoles);
      if (!recipientUserIds.includes(actor.businessUserId) && !matchesRecipientRole) {
        throw new WorkflowError('permission-denied', 'Only an assigned issue recipient can resolve this issue.');
      }
      const resolvedIssues = issues.map((candidate: FirebaseFirestore.DocumentData) => candidate?.id === issueId
        ? { ...candidate, status: 'RESOLVED', resolvedBy: actor.businessUserId, resolvedByName: actor.name, resolvedAt: new Date().toISOString() }
        : candidate);
      tx.update(ref, {
        issues: resolvedIssues,
        hasBlockingIssue: false,
        timeline: appendTimeline(order, actor, `Resolved issue: ${String(issue.type || issueId)}`, 'issue_resolved'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'PRODUCTION_ISSUE_RESOLVED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: String(order.status), targetState: String(order.status) });
      return { status: 'RESOLVED', alreadyResolved: false };
    });
  }

  async cancelIssue(firebaseUid: string | undefined, input: { orderId?: unknown; issueId?: unknown }) {
    const actor = await requireWorkflowActor(this.db, firebaseUid, ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER', 'PRINTER', 'FINISHER']);
    const orderId = requireText(input?.orderId, 'Order ID', 128);
    const issueId = requireText(input?.issueId, 'Issue ID', 128);
    return this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new WorkflowError('not-found', 'Production order was not found.');
      const order = snapshot.data() || {};
      const issues = Array.isArray(order.issues) ? order.issues : [];
      const issue = issues.find((candidate: FirebaseFirestore.DocumentData) => candidate?.id === issueId);
      if (!issue) throw new WorkflowError('not-found', 'Production issue was not found.');
      if (issue.status === 'CANCELLED') return { status: 'CANCELLED', idempotent: true };
      if (issue.status === 'RESOLVED') throw new WorkflowError('failed-precondition', 'A resolved issue cannot be cancelled.');
      if ((issue.reportedBy || issue.createdBy) !== actor.businessUserId) {
        throw new WorkflowError('permission-denied', 'Only the reporter can cancel this issue.');
      }
      const cancelledIssues = issues.map((candidate: FirebaseFirestore.DocumentData) => candidate?.id === issueId
        ? { ...candidate, status: 'CANCELLED', cancelledBy: actor.businessUserId, cancelledByName: actor.name, cancelledAt: new Date().toISOString() }
        : candidate);
      tx.update(ref, {
        issues: cancelledIssues,
        hasBlockingIssue: false,
        timeline: appendTimeline(order, actor, `Cancelled issue: ${String(issue.type || issueId)}`, 'issue'),
        updatedAt: FieldValue.serverTimestamp(),
      });
      addWorkflowAudit(this.db, tx, actor, { action: 'PRODUCTION_ISSUE_CANCELLED', targetType: 'PRODUCTION_ORDER', targetId: orderId, sourceState: String(order.status), targetState: String(order.status) });
      return { status: 'CANCELLED', idempotent: false };
    });
  }
}

export { READY_PLATE_STATUSES };
