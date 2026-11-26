import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { DispatchMethod, FinishingType, ShipmentStatus, UserRole } from '../types';
import { getFirebaseApp } from '../config/firebase';

const REGION = 'asia-southeast1';
let emulatorConnected = false;

function client() {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase is not configured.');
  const functions = getFunctions(app, REGION);
  if (!emulatorConnected && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectFunctionsEmulator(functions, (import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1').trim(), Number(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001));
    emulatorConnected = true;
  }
  return functions;
}

async function call<T extends object, R = unknown>(name: string, data: T): Promise<R> {
  const result = await httpsCallable<T, R>(client(), name, { timeout: 30000 })(data);
  return result.data;
}

export const workflowCallableService = {
  reportBrokenPlate: (orderId: string, reason?: string) => call('reportBrokenPlate', { orderId, reason }),
  reviseProductionOrder: (orderId: string, updates: { instructionRaw?: string; printerId?: string }) => call('reviseProductionOrder', { orderId, ...updates }),
  reportProductionIssue: (orderId: string, issueType: string, message: string, recipientUserIds?: string[], recipientRoles?: UserRole[], urgent?: boolean) => call('reportProductionIssue', { orderId, issueType, message, recipientUserIds, recipientRoles, urgent }),
  reissuePlate: (orderId: string, plateDate?: string) => call('reissuePlate', { orderId, plateDate }),
  sendPlate: (orderId: string, plateNote?: string) => call('sendPlate', { orderId, plateNote }),
  receivePlate: (orderId: string) => call('receivePlate', { orderId }),
  resolveProductionIssue: (orderId: string, issueId: string) => call('resolveProductionIssue', { orderId, issueId }),
  cancelProductionIssue: (orderId: string, issueId: string) => call('cancelProductionIssue', { orderId, issueId }),
  handoffToFinishing: (orderId: string, finisherId: string, types: FinishingType[], note?: string) => call('handoffToFinishing', { orderId, finisherId, types, note }),
  startFinishing: (orderId: string) => call('startFinishing', { orderId }),
  completeFinishing: (orderId: string) => call('completeFinishing', { orderId }),
  confirmFinishedGoodQuantity: (finishedGoodId: string, acceptedQuantity: number) => call('confirmFinishedGoodQuantity', { finishedGoodId, acceptedQuantity }),
  confirmSalesOrder: (salesOrderId: string) => call('confirmSalesOrder', { salesOrderId }),
  // `allocatedProductQuantity` is accepted from legacy callers but never used
  // as a Workflow V2 link gate or print-sheet calculation.
  linkProductionOrder: (productionOrderId: string, links?: Array<{ productionItemId: string; salesOrderId: string; salesOrderItemId: string; allocatedProductQuantity?: number }>) => call('linkProductionOrder', { productionOrderId, links }),
  requestProductionCancellation: (orderId: string, reason: string) => call('requestProductionCancellation', { orderId, reason }),
  respondProductionCancellation: (orderId: string, accept: boolean, responseReason?: string) => call('respondProductionCancellation', { orderId, accept, responseReason }),
  completeProductionPrint: (orderId: string, note?: string) => call('completeProductionPrint', { orderId, note }),
  claimFinishingTask: (taskId: string) => call('claimFinishingTask', { taskId }),
  completeFinishingTask: (taskId: string) => call('completeFinishingTask', { taskId }),
  requestFinishingCancellation: (taskId: string, reason?: string) => call('requestFinishingCancellation', { taskId, reason }),
  respondFinishingCancellation: (taskId: string, accept: boolean, responseReason?: string) => call('respondFinishingCancellation', { taskId, accept, responseReason }),
  setFinishingTaskUrgent: (taskId: string, urgent: boolean) => call('setFinishingTaskUrgent', { taskId, urgent }),
  reportWorkflowIssue: (salesOrderItemId: string, stage: 'FINISHING' | 'WAREHOUSE', issueType: string, message: string, recipientUserIds?: string[], recipientRoles?: UserRole[], urgent?: boolean) => call('reportWorkflowIssue', { salesOrderItemId, stage, issueType, message, recipientUserIds, recipientRoles, urgent }),
  resolveWorkflowIssue: (issueId: string) => call('resolveWorkflowIssue', { issueId }),
  cancelWorkflowIssue: (issueId: string) => call('cancelWorkflowIssue', { issueId }),
  cancelSalesOrder: (salesOrderId: string) => call('cancelSalesOrder', { salesOrderId }),
  forceReopenSalesOrder: (salesOrderId: string, reason: string) => call('forceReopenSalesOrder', { salesOrderId, reason }),
  createWarehouseDispatch: (salesOrderId: string, items: Array<{ finishedGoodId: string; quantity: number }>, dispatchMethod: DispatchMethod, note?: string, deliveryAddress?: string) => call<{ salesOrderId: string; items: Array<{ finishedGoodId: string; quantity: number }>; dispatchMethod: DispatchMethod; note?: string; deliveryAddress?: string }, { dispatchId: string }>('createWarehouseDispatch', { salesOrderId, items, dispatchMethod, note, deliveryAddress }),
  confirmWarehouseDispatch: (dispatchId: string) => call('confirmWarehouseDispatch', { dispatchId }),
  reverseWarehouseDispatch: (dispatchId: string, reason: string) => call('reverseWarehouseDispatch', { dispatchId, reason }),
  createShipment: (dispatchId: string, method: DispatchMethod, receiver: { name: string; phone: string; address: string }, packageCount: number, weightGrams: number, codAmount: number, note?: string) => call<{ dispatchId: string; method: DispatchMethod; receiver: { name: string; phone: string; address: string }; packageCount: number; weightGrams: number; codAmount: number; note?: string }, { shipmentId: string; status: string }>('createShipment', { dispatchId, method, receiver, packageCount, weightGrams, codAmount, note }),
  transitionShipment: (shipmentId: string, targetStatus: ShipmentStatus, rawStatus?: string) => call('transitionShipment', { shipmentId, targetStatus, rawStatus }),
  inspectReturnedShipment: (shipmentId: string, result: 'RESTOCKED' | 'SCRAPPED' | 'CUSTOMER_HOLD', note?: string) => call('inspectReturnedShipment', { shipmentId, result, note }),
};
