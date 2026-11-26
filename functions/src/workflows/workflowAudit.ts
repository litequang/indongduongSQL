import { FieldValue, Firestore, WriteBatch } from 'firebase-admin/firestore';
import { WorkflowActor } from './workflowAuth';

/** Audit writes live in the same batch/transaction as the authoritative transition. */
export function addWorkflowAudit(db: Firestore, batch: WriteBatch | FirebaseFirestore.Transaction, actor: WorkflowActor, details: {
  action: string;
  targetType: string;
  targetId: string;
  sourceState?: string;
  targetState?: string;
  reason?: string;
  extra?: Record<string, unknown>;
}): void {
  batch.create(db.collection('audit_logs').doc(), {
    action: details.action,
    targetType: details.targetType,
    targetId: details.targetId,
    userId: actor.businessUserId,
    userName: actor.name,
    userRole: actor.role,
    actorBusinessUserId: actor.businessUserId,
    sourceState: details.sourceState || null,
    targetState: details.targetState || null,
    ...(details.reason ? { reason: details.reason } : {}),
    ...(details.extra || {}),
    timestamp: FieldValue.serverTimestamp(),
  });
}
