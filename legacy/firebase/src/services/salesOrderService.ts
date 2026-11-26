import { salesOrderRepository } from '../repositories/salesOrderRepository';
import { SalesOrder, SalesOrderItem, Customer, User } from '../types';
import { imageStorageService, PreparedImage } from './imageStorageService';
import { workflowCallableService } from './workflowCallableService';

export type SalesOrderDraftItem = Partial<SalesOrderItem> & { localImage?: PreparedImage };

export const salesOrderService = {
  async createDraft(saleUser: User, customer: Customer, initialItems: SalesOrderDraftItem[] = [], priority: 'NORMAL' | 'URGENT' = 'NORMAL', expectedDate?: string, notes?: string): Promise<string> {
    const code = `SO-${Date.now().toString().slice(-6)}`;
    const orderId = salesOrderRepository.createOrderId();
    const uploadedImages: Array<{ storagePath: string }> = [];
    try {
      const items = [];
      for (const draft of initialItems) {
        const itemId = salesOrderRepository.createItemId();
        const storedImage = draft.localImage
          ? await imageStorageService.uploadSalesOrderItem(orderId, itemId, draft.localImage, saleUser.id)
          : undefined;
        if (storedImage) uploadedImages.push(storedImage);
        items.push({
          id: itemId,
          salesOrderId: orderId,
          customerId: customer.id,
          productName: draft.productName || 'Chưa đặt tên',
          quantity: draft.quantity || 1,
          requiresProduction: draft.requiresProduction !== false,
          requiresFinishing: draft.requiresFinishing !== false,
          status: 'NEW' as const,
          bagWidth: draft.bagWidth,
          bagLength: draft.bagLength,
          bagGusset: draft.bagGusset,
          imageUrl: storedImage?.downloadUrl,
          image: storedImage,
          sampleId: draft.sampleId,
          note: draft.note,
          linkedProductionItemIds: [],
        });
      }
      const orderData: Omit<SalesOrder, 'createdAt' | 'updatedAt'> = {
        id: orderId,
      code,
      customerId: customer.id,
      saleId: saleUser.id,
      saleNameSnapshot: saleUser.name,
      customerSnapshot: {
        name: customer.name,
        phone: customer.phone,
        address: customer.address
      },
      status: 'DRAFT',
      priority,
      expectedDeliveryDate: expectedDate,
      internalNote: notes,
      totalItems: initialItems.length,
      createdBy: saleUser.id
      };
      await salesOrderRepository.createWithItems(orderData, items);
      return orderId;
    } catch (error) {
      await imageStorageService.cleanupImages(uploadedImages);
      throw error;
    }
  },

  async confirmOrder(orderId: string): Promise<void> {
    await workflowCallableService.confirmSalesOrder(orderId);
  },

  async getOrderWithItems(orderId: string): Promise<{ order: SalesOrder; items: SalesOrderItem[] } | null> {
    const order = await salesOrderRepository.getById(orderId);
    if (!order) return null;
    const items = await salesOrderRepository.getItemsByOrderId(orderId);
    return { order, items };
  },
  
  async addItem(orderId: string, item: Omit<SalesOrderItem, 'id' | 'salesOrderId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const itemId = await salesOrderRepository.createItem({
      ...item,
      salesOrderId: orderId
    });
    
    // Update total items count
    const items = await salesOrderRepository.getItemsByOrderId(orderId);
    await salesOrderRepository.update(orderId, { totalItems: items.length });
    
    return itemId;
  },

  async addItemWithImage(orderId: string, customerId: string, saleUser: User, item: SalesOrderDraftItem): Promise<string> {
    const itemId = salesOrderRepository.createItemId();
    let uploadedImage: Awaited<ReturnType<typeof imageStorageService.uploadSalesOrderItem>> | undefined;
    try {
      if (item.localImage) {
        uploadedImage = await imageStorageService.uploadSalesOrderItem(orderId, itemId, item.localImage, saleUser.id);
      }
      await salesOrderRepository.createItemWithId({
        id: itemId,
        salesOrderId: orderId,
        customerId,
        productName: item.productName || 'Chưa đặt tên',
        quantity: item.quantity || 1,
        requiresProduction: item.requiresProduction !== false,
        requiresFinishing: item.requiresFinishing !== false,
        status: 'NEW',
        bagWidth: item.bagWidth,
        bagLength: item.bagLength,
        bagGusset: item.bagGusset,
        paperPreference: item.paperPreference,
        gsmPreference: item.gsmPreference,
        colorPreference: item.colorPreference,
        imageUrl: uploadedImage?.downloadUrl,
        image: uploadedImage,
        note: item.note,
        linkedProductionItemIds: [],
      });
      const items = await salesOrderRepository.getItemsByOrderId(orderId);
      await salesOrderRepository.update(orderId, { totalItems: items.length });
      return itemId;
    } catch (error) {
      if (uploadedImage) await imageStorageService.cleanupImages([uploadedImage]);
      throw error;
    }
  },
  
  async updateItem(itemId: string, data: Partial<SalesOrderItem>): Promise<void> {
    await salesOrderRepository.updateItem(itemId, data);
  },
  
  async removeItem(orderId: string, itemId: string): Promise<void> {
    await salesOrderRepository.deleteItem(itemId);
    
    // Update total items count
    const items = await salesOrderRepository.getItemsByOrderId(orderId);
    await salesOrderRepository.update(orderId, { totalItems: items.length });
  },

  async cancelOrder(orderId: string): Promise<void> {
    await workflowCallableService.cancelSalesOrder(orderId);
  },

  async forceReopenOrder(orderId: string, reason: string): Promise<void> {
    await workflowCallableService.forceReopenSalesOrder(orderId, reason);
  }
};
