import React, { useState, useEffect } from 'react';
import { SalesOrder, SalesOrderItem, ProductionOrder } from '../types';
import { salesOrderRepository } from '../repositories/salesOrderRepository';
import { salesOrderService } from '../services/salesOrderService';
import { salesOrderWorkflowService } from '../services/salesOrderWorkflowService';
import { X, Calendar, Package, Info, Tag, Printer, Layers, Lock, Unlock, Edit3, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { toast } from 'react-hot-toast';
import { workflowCallableService } from '../services/workflowCallableService';
import { canEditCommercialSalesOrder } from '../permissions';

interface Props {
  order: SalesOrder;
  onClose: () => void;
  onEditDraft?: (order: SalesOrder) => void;
}

export const SalesOrderDetailModal: React.FC<Props> = ({ order: initialOrder, onClose, onEditDraft }) => {
  const [order, setOrder] = useState<SalesOrder>(initialOrder);
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isReopenDialogOpen, setIsReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [linkQuantities, setLinkQuantities] = useState<Record<string, number>>({});

  const { orders, setSelectedOrder, currentUser } = useApp();

  useEffect(() => {
    loadItems();
  }, [order.id]);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const data = await salesOrderRepository.getItemsByOrderId(order.id);
      setItems(data);
    } catch (error) {
      console.error('Failed to load items', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!window.confirm(`Xác nhận chốt đơn hàng ${order.code}? Đơn sẽ được chuyển sang quy trình sản xuất.`)) return;
    setIsActionLoading(true);
    try {
      await salesOrderService.confirmOrder(order.id);
      toast.success('Đã chốt đơn hàng thành công!');
      const updated = await salesOrderRepository.getById(order.id);
      if (updated) setOrder(updated);
    } catch (err: any) {
      toast.error('Lỗi khi chốt đơn: ' + (err.message || ''));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    const check = salesOrderWorkflowService.canCancel(order, items, currentUser.role);
    if (!check.allowed) {
      toast.error(check.reason || 'Không thể hủy đơn hàng này');
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn hủy đơn hàng ${order.code}?`)) return;
    setIsActionLoading(true);
    try {
      await salesOrderService.cancelOrder(order.id);
      toast.success('Đã hủy đơn hàng');
      const updated = await salesOrderRepository.getById(order.id);
      if (updated) setOrder(updated);
    } catch (err: any) {
      toast.error('Lỗi khi hủy đơn: ' + (err.message || ''));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleForceReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      toast.error('Vui lòng nhập lý do mở lại đơn hàng (Bắt buộc để lưu vết Audit Log)');
      return;
    }
    setIsActionLoading(true);
    try {
      await salesOrderService.forceReopenOrder(order.id, reopenReason.trim());
      toast.success('Đã Force Reopen đơn hàng thành công!');
      setIsReopenDialogOpen(false);
      const updated = await salesOrderRepository.getById(order.id);
      if (updated) setOrder(updated);
    } catch (err: any) {
      toast.error('Lỗi khi mở lại đơn: ' + (err.message || ''));
    } finally {
      setIsActionLoading(false);
    }
  };

  const isLocked = order.status === 'DELIVERED' || order.status === 'COMPLETED';
  const canForceReopen = (currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER') && isLocked;
  const canLinkProduction = ['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER'].includes(currentUser.role);
  const independentProductionItems = orders.flatMap(productionOrder => productionOrder.items
    .filter(productionItem => !productionItem.salesOrderItemId)
    .map(productionItem => ({ productionOrder, productionItem, key: `${productionOrder.id}::${productionItem.id}` })));

  const handleLinkIndependentProduction = async (salesItem: SalesOrderItem) => {
    const selected = independentProductionItems.find(candidate => candidate.key === linkSelections[salesItem.id]);
    if (!selected) return;
    setIsActionLoading(true);
    try {
      await workflowCallableService.linkProductionOrder(selected.productionOrder.id, [{
        productionItemId: selected.productionItem.id,
        salesOrderId: salesItem.salesOrderId,
        salesOrderItemId: salesItem.id,
        allocatedProductQuantity: linkQuantities[salesItem.id] || salesItem.quantity,
      }]);
      toast.success('Đã liên kết lệnh sản xuất độc lập với sản phẩm.');
      await loadItems();
    } catch (error: any) {
      toast.error(error?.message || 'Không thể liên kết lệnh sản xuất.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NEW': return 'bg-neutral-100 text-neutral-600';
      case 'WAITING_DESIGN': return 'bg-amber-100 text-amber-700';
      case 'DESIGNING': return 'bg-orange-100 text-orange-700';
      case 'READY_FOR_PRODUCTION': return 'bg-purple-100 text-purple-700';
      case 'IN_PRODUCTION': return 'bg-blue-100 text-blue-700';
      case 'PRODUCTION_COMPLETED': return 'bg-green-100 text-green-700';
      case 'READY_FOR_FINISHING': return 'bg-purple-100 text-purple-700';
      case 'FINISHING': return 'bg-fuchsia-100 text-fuchsia-700';
      case 'WAREHOUSE_READY': return 'bg-emerald-100 text-emerald-800';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };
  
  const getStatusText = (status: string) => {
    switch (status) {
      case 'NEW': return 'Mới tạo';
      case 'WAITING_DESIGN': return 'Chờ thiết kế';
      case 'DESIGNING': return 'Đang thiết kế';
      case 'READY_FOR_PRODUCTION': return 'Sẵn sàng in';
      case 'IN_PRODUCTION': return 'Đang sản xuất';
      case 'PRODUCTION_COMPLETED': return 'Sản xuất xong';
      case 'READY_FOR_FINISHING': return 'Chờ gia công';
      case 'FINISHING': return 'Đang gia công';
      case 'WAREHOUSE_READY': return 'Sẵn sàng kho';
      case 'CANCELLED': return 'Đã hủy';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-100 bg-neutral-50/70">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-black text-neutral-900">Chi tiết đơn hàng {order.code}</h2>
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wider ${
                order.status === 'CONFIRMED' ? 'bg-blue-100 text-blue-700' :
                order.status === 'DELIVERED' || order.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                'bg-neutral-100 text-neutral-700'
              }`}>
                {order.status}
              </span>
              {order.priority === 'URGENT' && (
                <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded font-black">
                  GẤP
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-500 font-medium">
              Khách hàng: <strong className="text-neutral-800">{order.customerSnapshot.name}</strong> 
              {order.customerSnapshot.phone && ` • SĐT: ${order.customerSnapshot.phone}`}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-200/60 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-neutral-50/50 flex-1 space-y-6">
          
          {/* DELIVERED / COMPLETED Lock Banner */}
          {isLocked && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center font-black">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-950">
                    Đơn hàng đã {order.status === 'DELIVERED' ? 'GIAO THÀNH CÔNG' : 'HOÀN THÀNH'} (Đã khóa)
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Hệ thống đã khóa các thao tác sửa đổi nghiệp vụ để bảo toàn dữ liệu đối soát.
                  </p>
                </div>
              </div>

              {canForceReopen && (
                <button
                  type="button"
                  onClick={() => setIsReopenDialogOpen(true)}
                  className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <Unlock className="w-4 h-4 text-amber-400" />
                  Mở lại đơn (Force Reopen)
                </button>
              )}
            </div>
          )}

          {/* DRAFT Actions Banner */}
          {order.status === 'DRAFT' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center font-black">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-amber-950">Đơn hàng ở trạng thái Bản Nháp (DRAFT)</h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Bạn có thể chỉnh sửa lại danh sách sản phẩm hoặc chốt đơn để chuyển sang sản xuất.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onEditDraft && canEditCommercialSalesOrder(currentUser) && (
                  <button
                    type="button"
                    onClick={() => onEditDraft(order)}
                    className="px-3.5 py-2 bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Sửa thông tin
                  </button>
                )}
                {canEditCommercialSalesOrder(currentUser) && <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleConfirmOrder}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> Chốt đơn ngay
                </button>}
              </div>
            </div>
          )}

          {/* Items Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                Danh sách sản phẩm ({items.length})
              </h3>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center p-10">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 bg-white rounded-2xl border border-neutral-200 text-sm">
                Chưa có sản phẩm nào trong đơn hàng này.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {items.map(item => (
                  <div key={item.id} className="bg-white rounded-2xl border border-neutral-200 p-4 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-base font-black text-neutral-900">{item.productName}</h4>
                        <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <span>Số lượng: <strong className="text-neutral-900">{item.quantity.toLocaleString()} túi</strong></span>
                          {(item.bagWidth || item.bagLength) && (
                            <span>Kích thước: <strong>{item.bagWidth} x {item.bagLength}{item.bagGusset ? ` x ${item.bagGusset}` : ''} cm</strong></span>
                          )}
                          {item.paperPreference && (
                            <span>Chất liệu: <strong className="text-neutral-700">{item.paperPreference}</strong></span>
                          )}
                        </div>
                        {item.note && (
                          <div className="text-xs text-neutral-600 bg-neutral-50 px-2.5 py-1 rounded-md mt-2">
                            Ghi chú: {item.note}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black ${item.requiresProduction !== false ? 'bg-blue-100 text-blue-800' : 'bg-neutral-100 text-neutral-700'}`}>
                            {item.requiresProduction !== false ? 'CẦN SẢN XUẤT' : 'KHÔNG QUA SẢN XUẤT'}
                          </span>
                          <span className={`rounded-md px-2 py-1 text-[10px] font-black ${item.requiresProduction === false ? 'bg-emerald-100 text-emerald-800' : item.requiresFinishing !== false ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'}`}>
                            {item.requiresProduction === false ? 'ĐI THẲNG KHO' : item.requiresFinishing !== false ? 'CẦN GIA CÔNG' : 'GIA CÔNG XÁC NHẬN'}
                          </span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${getStatusBadge(item.status)}`}>
                        {getStatusText(item.status)}
                      </span>
                    </div>

                    {canLinkProduction && item.requiresProduction !== false && order.status !== 'DRAFT' && independentProductionItems.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 sm:grid-cols-[1fr_130px_auto]">
                        <select
                          value={linkSelections[item.id] || ''}
                          onChange={(event) => setLinkSelections(current => ({ ...current, [item.id]: event.target.value }))}
                          className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="">Chọn lệnh sản xuất độc lập để liên kết...</option>
                          {independentProductionItems.map(candidate => (
                            <option key={candidate.key} value={candidate.key}>{candidate.productionOrder.code} · {candidate.productionItem.productName || candidate.productionItem.id}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={linkQuantities[item.id] || item.quantity}
                          onChange={(event) => setLinkQuantities(current => ({ ...current, [item.id]: Number(event.target.value) }))}
                          className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs"
                          aria-label={`Số lượng phân bổ ${item.productName}`}
                        />
                        <button
                          type="button"
                          disabled={!linkSelections[item.id] || isActionLoading}
                          onClick={() => void handleLinkIndependentProduction(item)}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                        >
                          Liên kết
                        </button>
                      </div>
                    )}

                    {/* Linked Production Orders */}
                    {item.linkedProductionItemIds && item.linkedProductionItemIds.length > 0 && (
                      <div className="pt-3 border-t border-neutral-100">
                        <div className="text-[11px] font-bold text-neutral-400 uppercase mb-2 flex items-center gap-1.5">
                          <Printer className="w-3.5 h-3.5" />
                          Lệnh sản xuất liên kết
                        </div>
                        <div className="space-y-2">
                          {item.linkedProductionItemIds.map(prodItemId => {
                            const prodOrder = orders.find(o => o.items.some(i => i.id === prodItemId));
                            if (!prodOrder) return null;
                            const prodItem = prodOrder.items.find(i => i.id === prodItemId);
                            
                            return (
                              <div key={prodItemId} className="flex items-center justify-between bg-neutral-50 p-2.5 rounded-xl border border-neutral-100 text-xs">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-neutral-900">{prodOrder.code}</span>
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-neutral-200 text-neutral-700 rounded">
                                      {prodOrder.status}
                                    </span>
                                  </div>
                                  <div className="text-neutral-500 mt-0.5">
                                    Ghép in: <strong>{prodItem?.allocatedProductQuantity?.toLocaleString()} túi</strong> • Thợ: @{prodOrder.printerName}
                                  </div>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOrder(prodOrder);
                                  }}
                                  className="px-3 py-1 bg-white border border-neutral-200 hover:border-amber-400 rounded-lg font-bold text-amber-700 transition-colors"
                                >
                                  Xem Lệnh
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-neutral-100 bg-neutral-50/80 flex items-center justify-between">
          <div>
            {canEditCommercialSalesOrder(currentUser) && order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && order.status !== 'COMPLETED' && (
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={isActionLoading}
                className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Hủy đơn hàng
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-neutral-900 text-white hover:bg-neutral-800 rounded-xl text-sm font-bold transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>

      {/* Force Reopen Dialog */}
      {isReopenDialogOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <Unlock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900">
                  Mở Lại Đơn Hàng #{order.code}
                </h3>
                <p className="text-xs text-neutral-500">
                  Thao tác đặc quyền của Admin/Developer (bắt buộc lưu Audit Log)
                </p>
              </div>
            </div>

            <form onSubmit={handleForceReopen} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Lý do mở lại đơn (Bắt buộc) <span className="text-red-500">*</span>:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="VD: Khách báo hàng thiếu 200 túi cần in bù thêm..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full p-3 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsReopenDialogOpen(false)}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !reopenReason.trim()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors shadow-md disabled:opacity-50"
                >
                  {isActionLoading ? 'Đang mở lại...' : 'Xác nhận mở lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
