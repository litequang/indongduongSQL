import { SalesOrder, SalesOrderItem, SalesOrderStatus, SalesOrderItemStatus, UserRole, ProductionOrder, ProductionItem } from '../types';
import { getFirebaseDb } from '../config/firebase';
import { salesOrderRepository } from '../repositories/salesOrderRepository';
import { productionOrderRepository } from '../repositories/productionOrderRepository';
import { shipmentRepository } from '../repositories/shipmentRepository';
import { warehouseDispatchRepository } from '../repositories/warehouseDispatchRepository';
import { auditRepository } from '../repositories/auditRepository';
import { finishedGoodService } from './finishedGoodService';
import { safeFirestoreRunTransaction } from '../utils/firestoreSafeWrite';
import { doc } from 'firebase/firestore';

export const salesOrderWorkflowService = {
  canEdit(order: SalesOrder, userRole: UserRole): boolean {
    if (order.status !== 'DRAFT') return false;
    return ['SALE', 'MANAGER', 'ADMIN', 'DEVELOPER'].includes(userRole);
  },

  canConfirm(order: SalesOrder, userRole: UserRole, items: SalesOrderItem[]): boolean {
    if (order.status !== 'DRAFT') return false;
    if (items.length === 0) return false;
    return ['SALE', 'MANAGER', 'ADMIN', 'DEVELOPER'].includes(userRole);
  },

  canCancel(order: SalesOrder, items: SalesOrderItem[], userRole: UserRole): { allowed: boolean; reason?: string } {
    if (!['SALE', 'MANAGER', 'ADMIN', 'DEVELOPER'].includes(userRole)) {
      return { allowed: false, reason: 'Không đủ quyền' };
    }
    if (order.status === 'COMPLETED' || order.status === 'DELIVERED') {
      return { allowed: false, reason: 'Không thể hủy đơn đã hoàn thành' };
    }
    if (order.status === 'CANCELLED') {
      return { allowed: false, reason: 'Đơn đã hủy' };
    }
    
    // Check if any item is already in production
    const inProduction = items.some(
      item => item.status === 'IN_PRODUCTION' || item.status === 'PRODUCTION_COMPLETED'
    );
    if (inProduction) {
      return { allowed: false, reason: 'Đơn này đã có lệnh sản xuất đang hoạt động. Cần xử lý các lệnh sản xuất trước.' };
    }
    
    return { allowed: true };
  },

  deriveItemStatus(item: SalesOrderItem, productionLinked: boolean, productionCompleted: boolean): SalesOrderItemStatus {
    if (item.status === 'CANCELLED') return 'CANCELLED';
    
    if (productionCompleted) return 'PRODUCTION_COMPLETED';
    if (productionLinked) return 'IN_PRODUCTION';
    
    // If not linked to production, keep its current status or default logic
    // This will be expanded when integrating with production
    return item.status;
  },

  async linkProductionItemsBatch(productionItems: ProductionItem[], productionOrderId: string) {
    const db = getFirebaseDb();
    const salesOrderIds = new Set<string>();

    if (db) {
      await safeFirestoreRunTransaction(db, async (transaction) => {
        const itemDocs = [];
        for (const pItem of productionItems) {
          if (!pItem.salesOrderId || !pItem.salesOrderItemId) continue;
          salesOrderIds.add(pItem.salesOrderId);
          
          const ref = doc(db, 'sales_order_items', pItem.salesOrderItemId);
          const snap = await transaction.get(ref);
          if (!snap.exists()) {
             throw new Error(`Sales Order Item ${pItem.salesOrderItemId} not found`);
          }
          itemDocs.push({ snap, ref, pItem });
        }

        for (const { snap, ref, pItem } of itemDocs) {
           const data = snap.data() as SalesOrderItem;
           const linkedIds = data.linkedProductionItemIds || [];
           if (!linkedIds.includes(pItem.id)) {
               linkedIds.push(pItem.id);
           }
           
           const newlyAllocated = pItem.allocatedProductQuantity || pItem.quantity || 0;
           const totalAllocated = (data.allocatedQuantity || 0) + newlyAllocated;
           
           let newStatus = data.status;
           if (data.status === 'READY_FOR_PRODUCTION' && totalAllocated >= data.quantity) {
               newStatus = 'IN_PRODUCTION';
           }
           
           transaction.update(ref, {
               linkedProductionItemIds: linkedIds,
               allocatedQuantity: totalAllocated,
               status: newStatus,
               updatedAt: new Date().toISOString()
           });
        }
      });
    } else {
      for (const pItem of productionItems) {
        if (!pItem.salesOrderId || !pItem.salesOrderItemId) continue;
        salesOrderIds.add(pItem.salesOrderId);
        const item = await salesOrderRepository.getItem(pItem.salesOrderId, pItem.salesOrderItemId);
        if (item) {
          const linkedIds = item.linkedProductionItemIds || [];
          if (!linkedIds.includes(pItem.id)) {
            linkedIds.push(pItem.id);
          }
          
          const newlyAllocated = pItem.allocatedProductQuantity || pItem.quantity || 0;
          const totalAllocated = (item.allocatedQuantity || 0) + newlyAllocated;
          
          let newStatus = item.status;
          if (item.status === 'READY_FOR_PRODUCTION' && totalAllocated >= item.quantity) {
              newStatus = 'IN_PRODUCTION';
          }
          
          await salesOrderRepository.updateItem(pItem.salesOrderItemId, {
            linkedProductionItemIds: linkedIds,
            allocatedQuantity: totalAllocated,
            status: newStatus
          });
        }
      }
    }

    for (const salesOrderId of salesOrderIds) {
      const allItems = await salesOrderRepository.getItemsByOrderId(salesOrderId);
      const order = await salesOrderRepository.getOrder(salesOrderId);
      if (order) {
        const newStatus = this.deriveOrderStatus(order, allItems);
        if (newStatus !== order.status) {
          await salesOrderRepository.updateOrder(salesOrderId, { status: newStatus });
        }
      }
    }
  },

  async handleProductionOrderCancelled(productionOrder: ProductionOrder) {
    // Group items by sales order to process them efficiently
    const itemsBySalesOrder = new Map<string, string[]>();
    for (const item of productionOrder.items) {
      if (item.salesOrderId && item.salesOrderItemId) {
        const itemIds = itemsBySalesOrder.get(item.salesOrderId) || [];
        itemIds.push(item.salesOrderItemId);
        itemsBySalesOrder.set(item.salesOrderId, itemIds);
      }
    }

    // Process each affected sales order
    for (const [salesOrderId, itemIds] of itemsBySalesOrder.entries()) {
      for (const itemId of itemIds) {
        const salesItem = await salesOrderRepository.getItem(salesOrderId, itemId);
        if (salesItem) {
          // Remove the cancelled production order from linked items
          const updatedLinks = (salesItem.linkedProductionItemIds || []).filter(
            id => !productionOrder.items.some(pi => pi.id === id)
          );
          
          // Determine new status - if it has no active production links, move back to ready
          // In a real app we'd need to check if the other linked production orders are active
          // For now, if no links remain, it's READY_FOR_PRODUCTION
          const newStatus = updatedLinks.length === 0 ? 'READY_FOR_PRODUCTION' : salesItem.status;
          
          await salesOrderRepository.updateItem(salesOrderId, itemId, {
            linkedProductionItemIds: updatedLinks,
            status: newStatus
          });
        }
      }
      
      // Update the main order status
      const allItems = await salesOrderRepository.getItemsByOrderId(salesOrderId);
      const order = await salesOrderRepository.getOrder(salesOrderId);
      if (order) {
        const newStatus = this.deriveOrderStatus(order, allItems);
        if (newStatus !== order.status) {
          await salesOrderRepository.updateOrder(salesOrderId, { status: newStatus });
        }
      }
    }
  },

  async handleProductionOrderCompleted(productionOrder: ProductionOrder) {
    // Group items by sales order
    const itemsBySalesOrder = new Map<string, string[]>();
    for (const item of productionOrder.items) {
      if (item.salesOrderId && item.salesOrderItemId) {
        const itemIds = itemsBySalesOrder.get(item.salesOrderId) || [];
        itemIds.push(item.salesOrderItemId);
        itemsBySalesOrder.set(item.salesOrderId, itemIds);
      }
    }

    // Process each affected sales order
    for (const [salesOrderId, itemIds] of itemsBySalesOrder.entries()) {
      for (const itemId of itemIds) {
        const salesItem = await salesOrderRepository.getItem(salesOrderId, itemId);
        if (salesItem) {
          // Check if we have remaining quantity to fulfill
          let isAllCompleted = true;
          let hasActive = false;
          
          if (salesItem.linkedProductionItemIds && salesItem.linkedProductionItemIds.length > 0) {
             // We need to check the status of other linked production orders
             // This is a simplified check since we are on the client side
             const allOrders = await productionOrderRepository.getOrders(false);
             
             for (const prodItemId of salesItem.linkedProductionItemIds) {
                const po = allOrders.find(o => o.items.some(i => i.id === prodItemId));
                if (po) {
                   if (po.status !== 'COMPLETED' && po.status !== 'CANCELLED') {
                      isAllCompleted = false;
                      hasActive = true;
                   }
                }
             }
          }
          
          let newStatus = salesItem.status;

          if (isAllCompleted && !hasActive) {
             newStatus = 'PRODUCTION_COMPLETED';
          } else if (hasActive) {
             newStatus = 'IN_PRODUCTION';
          }

          if (newStatus !== salesItem.status) {
             await salesOrderRepository.updateItem(salesOrderId, itemId, {
               status: newStatus
             });
          }

          // Generate FinishedGood record waiting for confirmation
          // Find the production item quantity
          const prodItem = productionOrder.items.find(i => i.salesOrderItemId === itemId);
          if (prodItem) {
             // Create finished good in WAITING status
             const acceptedQty = 0; // Wait for confirmation
             try {
               await finishedGoodService.createOrUpdateFromProduction(
                 salesItem,
                 [productionOrder],
                 acceptedQty
               );
             } catch(err) {
               console.error("Failed to create finished good for item", itemId, err);
             }
          }

        }
      }
      
      // Update main order status
      const allItems = await salesOrderRepository.getItemsByOrderId(salesOrderId);
      const order = await salesOrderRepository.getOrder(salesOrderId);
      if (order) {
        const newStatus = this.deriveOrderStatus(order, allItems);
        if (newStatus !== order.status) {
          await salesOrderRepository.updateOrder(salesOrderId, { status: newStatus });
        }
      }
    }
  },

  
  async syncOrderStatusFromShipment(shipmentId: string) {
    const shipment = await shipmentRepository.getById(shipmentId);
    if (!shipment) return;
    
    const salesOrderId = shipment.salesOrderId;
    const order = await salesOrderRepository.getOrder(salesOrderId);
    if (!order) return;
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return; // Cannot go back naturally here
    
    const allShipments = await shipmentRepository.getBySalesOrderId(salesOrderId);
    
    // Check if any is returning or returned
    if (allShipments.some(s => s.status === 'RETURNING' || s.status === 'RETURNED')) {
      // Keep it as is or something else, but prompt says "hiển thị cần xử lý hàng hoàn". We won't change SO status to DELIVERED.
      return;
    }
    
    // Check if ANY shipment is IN_TRANSIT or PICKED_UP
    const hasActiveShipment = allShipments.some(s => ['CREATED', 'READY', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT'].includes(s.status));
    
    // Sum total ordered quantity
    const orderItems = await salesOrderRepository.getItemsByOrderId(salesOrderId);
    const totalOrdered = orderItems.reduce((sum, item) => sum + item.quantity, 0);

    // Sum total delivered quantity
    const deliveredShipments = allShipments.filter(s => s.status === 'DELIVERED');
    let totalDelivered = 0;
    for (const s of deliveredShipments) {
        const dispatchItems = await warehouseDispatchRepository.getItemsByDispatchId(s.warehouseDispatchId);
        totalDelivered += dispatchItems.reduce((sum, di) => sum + di.quantity, 0);
    }

    let newStatus = order.status;
    if (totalDelivered > 0 && totalDelivered >= totalOrdered) {
        newStatus = 'DELIVERED';
    } else if (hasActiveShipment || (totalDelivered > 0 && totalDelivered < totalOrdered)) {
        newStatus = 'SHIPPING';
    }

    if (newStatus !== order.status) {
      await salesOrderRepository.updateOrder(salesOrderId, { status: newStatus });
    }
  },

  async forceReopenOrder(orderId: string, currentUser: { id: string; name: string; role: UserRole }, reason: string): Promise<void> {
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'DEVELOPER') {
      throw new Error('Chỉ Admin hoặc Developer mới có quyền Force Reopen đơn hàng.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('Vui lòng nhập lý do bắt buộc để mở lại đơn hàng.');
    }

    const order = await salesOrderRepository.getById(orderId);
    if (!order) throw new Error('Không tìm thấy đơn hàng');

    const oldStatus = order.status;
    if (oldStatus !== 'DELIVERED' && oldStatus !== 'COMPLETED') {
      throw new Error('Chỉ đơn hàng đã giao (DELIVERED) hoặc hoàn thành (COMPLETED) mới cần Force Reopen.');
    }

    const newStatus: SalesOrderStatus = 'IN_PRODUCTION';

    await salesOrderRepository.updateOrder(orderId, {
      status: newStatus,
      updatedAt: new Date().toISOString()
    });

    await auditRepository.recordLog({
      action: 'ORDER_FORCE_REOPENED',
      targetType: 'SALES_ORDER',
      targetId: orderId,
      targetCode: order.code,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      reason: reason.trim(),
      oldStatus,
      newStatus
    });
  },

  deriveOrderStatus(order: SalesOrder, items: SalesOrderItem[]): SalesOrderStatus {
    if (order.status === 'DRAFT' || order.status === 'CANCELLED') return order.status;
    if (items.length === 0) return order.status;

    let allCompleted = true;
    let anyInProduction = false;
    let anyDesigning = false;
    let anyWaitingDesign = false;
    
    items.forEach(item => {
      if (item.status !== 'PRODUCTION_COMPLETED' && item.status !== 'CANCELLED') {
        allCompleted = false;
      }
      if (item.status === 'IN_PRODUCTION') anyInProduction = true;
      if (item.status === 'DESIGNING') anyDesigning = true;
      if (item.status === 'WAITING_DESIGN') anyWaitingDesign = true;
    });

    if (allCompleted) return 'PRODUCTION_COMPLETED'; // Requires explicit shipping step to move to completed usually
    if (anyInProduction) return 'IN_PRODUCTION';
    if (anyDesigning || anyWaitingDesign) return 'DESIGNING';

    return order.status; // Fallback
  }
};
