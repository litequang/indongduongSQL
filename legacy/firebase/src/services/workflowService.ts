import { ProductionOrder, ProductionStatus, PlateStatus, AppConfig, User } from '../types';

export const workflowService = {
  // Existing functions
  isUnacceptedDelayed(order: ProductionOrder, config: AppConfig): boolean {
    if (order.status !== 'WAITING_ACCEPTANCE') return false;
    const minutesOld = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60);
    return minutesOld > (config.workflow.printerAcceptanceTimeoutMinutes || 30);
  },

  isPlateDelayed(order: ProductionOrder, config: AppConfig): boolean {
    if (order.plateStatus !== 'NOT_SENT' && order.plateStatus !== 'SENT') return false;
    const minutesOld = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60);
    return minutesOld > (config.workflow.plateWaitingWarningMinutes || 60);
  },

  isPrintingStuck(order: ProductionOrder, config: AppConfig): boolean {
    if (order.status !== 'PRINTING' || !order.printingStartedAt) return false;
    const minutesPrinting = (Date.now() - new Date(order.printingStartedAt).getTime()) / (1000 * 60);
    return minutesPrinting > (config.workflow.printingStuckWarningMinutes || 60);
  },

  getNextStatusAfterPrinting(config: AppConfig): ProductionStatus {
    if (config.features.finishing) {
      return 'PRINTED';
    }
    return 'COMPLETED';
  },

  // Added logic
  canAcceptOrder(order: ProductionOrder, user: User): boolean {
    return user.active && user.role === 'PRINTER' && order.status === 'WAITING_ACCEPTANCE' && order.printerId === user.id;
  },

  canStartPrinting(order: ProductionOrder, user: User): boolean {
    return (
      user.active &&
      user.role === 'PRINTER' &&
      order.printerId === user.id &&
      (order.status === 'ACCEPTED' || order.status === 'WAITING_PRINT') &&
      (order.printerAcknowledgedRevision || 0) >= (order.productionRevision || 1) &&
      order.cancellationRequest?.status !== 'PENDING'
    );
  },

  canCompletePrinting(order: ProductionOrder, user: User): boolean {
    return user.active && user.role === 'PRINTER' && order.status === 'PRINTING' && order.printerId === user.id;
  },

  canMoveToFinishing(order: ProductionOrder): boolean {
    return order.status === 'PRINTED';
  },

  canCancelOrder(order: ProductionOrder): boolean {
    return ['WAITING_ACCEPTANCE', 'WAITING_PLATE', 'ACCEPTED', 'WAITING_PRINT'].includes(order.status)
      && order.cancellationRequest?.status !== 'PENDING';
  }
};
