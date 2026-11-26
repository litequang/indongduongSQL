export interface ProductionEligibilityInput {
  status: string;
  // Retained for callers displaying these parallel signals. They do not gate
  // the core production lifecycle in Workflow V2.
  plateStatus?: string;
  hasBlockingIssue?: boolean;
  issues?: Array<{ isBlocking?: boolean; status?: string; issueType?: string; type?: string }>;
  productionRevision?: number;
  printerAcknowledgedRevision?: number;
}
export function getProductionEligibility(order: ProductionEligibilityInput) {
  const canAccept = order.status === 'WAITING_ACCEPTANCE';
  const revision = Math.max(1, order.productionRevision || 1);
  const hasAcknowledgedLatestRevision = (order.printerAcknowledgedRevision || 0) >= revision;
  const canStartPrint = ['ACCEPTED', 'WAITING_PRINT'].includes(order.status) && hasAcknowledgedLatestRevision;
  const canCompletePrint = order.status === 'PRINTING';
  return { canAccept, canStartPrint, canCompletePrint };
}
