import React, { useState, useEffect } from 'react';
import { SalesOrder, SalesOrderItem } from '../types';
import { useConfig } from '../context/ConfigContext';
import { salesOrderRepository } from '../repositories/salesOrderRepository';
import { Plus, Search, Filter, Clock, CheckCircle2, FileText, AlertTriangle, Edit3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SalesOrderDetailModal } from './SalesOrderDetailModal';
import { CreateSalesOrderModal } from './CreateSalesOrderModal';
import { canCreateSalesOrderDraft } from '../permissions';

export const SalesOrderManagement: React.FC = () => {
  const { appConfig } = useConfig();
  const { currentUser } = useApp();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<SalesOrder | null>(null);
  
  const formatDate = (dateStr: string) => {
    try {
      return new Intl.DateTimeFormat('vi-VN', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      }).format(new Date(dateStr));
    } catch (e) {
      return dateStr;
    }
  };
  
  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    const unsubscribe = salesOrderRepository.subscribeActiveOrders(
      (data) => {
        setOrders(data);
        setLoadError(null);
        setIsLoading(false);
      },
      (error) => {
        setLoadError(error.message || 'Không thể tải danh sách đơn hàng.');
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, []);
  
  const loadOrders = async () => {
    setLoadError(null);
  };

  const filteredOrders = orders.filter(order => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      order.code.toLowerCase().includes(lowerQuery) ||
      order.customerSnapshot.name.toLowerCase().includes(lowerQuery) ||
      (order.customerSnapshot.phone && order.customerSnapshot.phone.includes(lowerQuery))
    );
  });
  
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'DRAFT': return 'bg-neutral-100 text-neutral-600';
      case 'CONFIRMED': return 'bg-blue-100 text-blue-700';
      case 'DESIGNING': return 'bg-purple-100 text-purple-700';
      case 'IN_PRODUCTION': return 'bg-amber-100 text-amber-700';
      case 'PRODUCTION_COMPLETED': return 'bg-emerald-100 text-emerald-700';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };
  
  const getStatusText = (status: string) => {
    switch(status) {
      case 'DRAFT': return 'Bản nháp';
      case 'CONFIRMED': return 'Đã chốt';
      case 'DESIGNING': return 'Đang thiết kế';
      case 'IN_PRODUCTION': return 'Đang sản xuất';
      case 'PRODUCTION_COMPLETED': return 'Sản xuất xong';
      case 'READY_TO_SHIP': return 'Chờ giao';
      case 'SHIPPING': return 'Đang giao';
      case 'DELIVERED': return 'Đã giao';
      case 'COMPLETED': return 'Hoàn thành';
      case 'CANCELLED': return 'Đã hủy';
      default: return status;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Đơn Hàng Sale</h1>
          <p className="text-sm text-neutral-500 mt-1">Quản lý đơn hàng đặt từ Khách hàng</p>
        </div>
        
        {canCreateSalesOrderDraft(currentUser) && <button 
          className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          onClick={() => { setOrderToEdit(null); setIsCreateModalOpen(true); }}
        >
          <Plus className="w-5 h-5" />
          <span>Tạo Đơn Hàng</span>
        </button>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex flex-col sm:flex-row gap-4 justify-between bg-neutral-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input 
              type="text"
              placeholder="Tìm theo mã, tên khách, SĐT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-neutral-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition-all text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Lọc</span>
            </button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-neutral-500 font-medium">Đang tải danh sách đơn hàng...</p>
          </div>
        ) : loadError ? (
          <div className="p-12 text-center">
            <h3 className="text-lg font-bold text-red-800 mb-1">Không thể tải danh sách đơn hàng</h3>
            <p className="text-red-700 text-sm">{loadError}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-1">Không có đơn hàng nào</h3>
            <p className="text-neutral-500 text-sm max-w-sm">
              {searchQuery ? 'Không tìm thấy đơn hàng phù hợp với từ khóa tìm kiếm.' : 'Chưa có đơn hàng nào được tạo trên hệ thống.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/80 border-b border-neutral-100 text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Mã Đơn</th>
                  <th className="px-4 py-3 font-semibold">Khách Hàng</th>
                  <th className="px-4 py-3 font-semibold">Sản Phẩm</th>
                  <th className="px-4 py-3 font-semibold text-center">Trạng Thái</th>
                  <th className="px-4 py-3 font-semibold">Ngày Đặt</th>
                  <th className="px-4 py-3 font-semibold">Giao Dự Kiến</th>
                  <th className="px-4 py-3 font-semibold text-right">Phụ Trách</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-neutral-50/50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900">{order.code}</span>
                        {order.priority === 'URGENT' && (
                          <span className="bg-red-100 text-red-700 text-[9px] px-1.5 py-0.5 rounded font-bold">GẤP</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-900">{order.customerSnapshot.name}</div>
                      {order.customerSnapshot.phone && (
                        <div className="text-xs text-neutral-500 mt-0.5">{order.customerSnapshot.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 font-medium">
                      {order.totalItems} sản phẩm
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {formatDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-xs font-medium text-neutral-700 bg-neutral-100 px-2 py-1 rounded-md inline-block">
                        {order.saleNameSnapshot || 'Unknown'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrder && (
        <SalesOrderDetailModal 
          order={selectedOrder} 
          onClose={() => { setSelectedOrder(null); loadOrders(); }} 
          onEditDraft={(order) => {
            setSelectedOrder(null);
            setOrderToEdit(order);
            setIsCreateModalOpen(true);
          }}
        />
      )}

      {isCreateModalOpen && (
        <CreateSalesOrderModal
          editingOrder={orderToEdit}
          onClose={() => { setIsCreateModalOpen(false); setOrderToEdit(null); }}
          onSuccess={() => {
            setIsCreateModalOpen(false);
            setOrderToEdit(null);
            loadOrders();
          }}
        />
      )}
    </div>
  );
};
