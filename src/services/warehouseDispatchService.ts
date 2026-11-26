import { DispatchMethod, FinishedGood } from '../types';
import { workflowCallableService } from './workflowCallableService';

/** Browser facade; stock and lifecycle changes are callable transactions. */
export const warehouseDispatchService = {
  async createDraft(
    salesOrderId: string,
    itemsToDispatch: { finishedGood: FinishedGood; dispatchQuantity: number }[],
    dispatchMethod: DispatchMethod,
    note?: string,
    deliveryAddress?: string,
    _userId?: string,
  ): Promise<string> {
    const result = await workflowCallableService.createWarehouseDispatch(
      salesOrderId,
      itemsToDispatch.map(({ finishedGood, dispatchQuantity }) => ({ finishedGoodId: finishedGood.id, quantity: dispatchQuantity })),
      dispatchMethod,
      note,
      deliveryAddress,
    );
    return result.dispatchId;
  },

  async confirmDispatch(dispatchId: string, _userId?: string): Promise<void> {
    await workflowCallableService.confirmWarehouseDispatch(dispatchId);
  },

  async reverseDispatch(dispatchId: string, _userId: string | undefined, reason: string): Promise<void> {
    await workflowCallableService.reverseWarehouseDispatch(dispatchId, reason);
  },
};
