import { DispatchMethod, Shipment, WarehouseDispatch } from '../types';
import { workflowCallableService } from './workflowCallableService';

/** Browser facade; shipping state is mutated only by callable workflows. */
export const shippingService = {
  async createShipment(
    dispatch: WarehouseDispatch,
    method: DispatchMethod,
    receiverSnapshot: Shipment['receiverSnapshot'],
    packageCount: number,
    weightGrams: number,
    codAmount: number,
    note: string,
    _userId?: string,
  ): Promise<Pick<Shipment, 'id' | 'status'>> {
    const result = await workflowCallableService.createShipment(dispatch.id, method, receiverSnapshot, packageCount, weightGrams, codAmount, note);
    return { id: result.shipmentId, status: result.status as Shipment['status'] };
  },

  async updateStatus(shipmentId: string, newStatus: Shipment['status'], _userId?: string, rawStatus?: string): Promise<void> {
    await workflowCallableService.transitionShipment(shipmentId, newStatus, rawStatus);
  },

  async performReturnInspection(
    shipmentId: string,
    inspectionResult: 'RESTOCKED' | 'SCRAPPED' | 'CUSTOMER_HOLD',
    note: string,
    _currentUser?: { id: string; name: string; role: string },
  ): Promise<void> {
    await workflowCallableService.inspectReturnedShipment(shipmentId, inspectionResult, note);
  },

  async cancelShipment(shipment: Shipment, _userId?: string): Promise<void> {
    await workflowCallableService.transitionShipment(shipment.id, 'CANCELLED');
  },
};
