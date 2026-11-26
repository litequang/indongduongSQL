import { finishedGoodRepository } from '../repositories/finishedGoodRepository';
import { FinishedGood, FinishedGoodStatus, SalesOrderItem, ProductionOrder } from '../types';
import { runTransaction, doc } from 'firebase/firestore';
import { getFirebaseDb } from '../config/firebase';

export const finishedGoodService = {
  getById: async (id: string) => finishedGoodRepository.getById(id),
  getAll: async () => finishedGoodRepository.getAll(),
  subscribe: (onChange: (goods: FinishedGood[]) => void, onError?: (error: Error) => void) => finishedGoodRepository.subscribe(onChange, onError),
  getBySalesOrderId: async (salesOrderId: string) => finishedGoodRepository.getBySalesOrderId(salesOrderId),
  getBySalesOrderItemId: async (itemId: string) => finishedGoodRepository.getBySalesOrderItemId(itemId),

  // Called when finishing confirms finished good quantity
  createOrUpdateFromProduction: async (
    salesOrderItem: SalesOrderItem,
    productionOrders: ProductionOrder[], // Just for reference
    acceptedQuantity: number
  ) => {
    // Basic implementation for demonstration
    // If it's a new finished good
    const newId = doc(getFirebaseDb()!, 'finished_goods', 'new').id; // Generate random ID
    const fg: FinishedGood = {
      id: newId,
      salesOrderId: salesOrderItem.salesOrderId,
      salesOrderItemId: salesOrderItem.id,
      customerId: salesOrderItem.customerId,
      productName: salesOrderItem.productName,
      customerSnapshot: undefined, // Needs to be populated from salesOrder
      imageUrl: salesOrderItem.imageUrl,
      image: salesOrderItem.image,
      bagWidth: salesOrderItem.bagWidth,
      bagLength: salesOrderItem.bagLength,
      bagGusset: salesOrderItem.bagGusset,
      orderedQuantity: salesOrderItem.quantity,
      acceptedQuantity: acceptedQuantity,
      dispatchedQuantity: 0,
      remainingQuantity: acceptedQuantity,
      quantityUnit: 'BAG',
      status: acceptedQuantity > 0 ? 'READY' : 'WAITING',
      createdAt: new Date().toISOString()
    };
    return finishedGoodRepository.createWithId(newId, fg);
  }
};
