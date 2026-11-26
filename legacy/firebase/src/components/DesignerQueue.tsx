import React, { useState, useEffect } from 'react';
import { SalesOrderItem, ProductionItem, ProductionOrder } from '../types';
import { salesOrderRepository } from '../repositories/salesOrderRepository';
import { CheckSquare, Filter, Layers, Plus, Search, Scissors, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '../context/AppContext';
import { ResolvedImage } from './ResolvedImage';

export const DesignerQueue: React.FC = () => {
  const { setPrefilledOrderData, setIsCreateModalOpen } = useApp();
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaper, setFilterPaper] = useState('ALL');
  const [filterPlate, setFilterPlate] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      // In a real implementation, we would query specifically for READY_FOR_PRODUCTION
      // For now, fetch active orders and extract their items
      const orders = await salesOrderRepository.getActiveOrders();
      let allItems: SalesOrderItem[] = [];
      for (const order of orders) {
        const orderItems = await salesOrderRepository.getItemsByOrderId(order.id);
        const readyItems = orderItems.filter(item => 
          item.requiresProduction !== false && (
            item.status === 'READY_FOR_PRODUCTION' || 
            item.status === 'WAITING_DESIGN' || 
            item.status === 'DESIGNING'
          )
        );
        allItems = [...allItems, ...readyItems];
      }
      setItems(allItems);
    } catch (error) {
      console.error('Failed to load items', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedItemIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItemIds(newSet);
  };

  const handleCreateProductionOrder = () => {
    if (selectedItemIds.size === 0) return;
    
    const selectedSalesItems = items.filter(item => selectedItemIds.has(item.id));
    
    const productionItems = selectedSalesItems.map(item => ({
      id: 'pi-' + Date.now() + Math.random().toString(36).slice(2, 6),
      imageUrl: item.imageUrl || '',
      image: item.image,
      customerId: undefined,
      customerName: `Khách hàng (Từ đơn ${item.salesOrderId})`,
      productName: item.productName,
      quantity: item.quantity,
      requiresFinishing: item.requiresFinishing !== false,
      bagWidth: item.bagWidth,
      bagLength: item.bagLength,
      bagGusset: item.bagGusset,
      color: '',
      salesOrderId: item.salesOrderId,
      salesOrderItemId: item.id,
      sourceType: 'SALES_ORDER' as const,
      sampleId: item.sampleId,
      sampleVersionId: item.sampleVersionId,
    }));

    setPrefilledOrderData({
      items: productionItems
    });
    setIsCreateModalOpen(true);
    
    // Clear selection after opening
    setSelectedItemIds(newSet => {
      newSet.clear();
      return newSet;
    });
  };

  const filteredItems = items.filter(item => {
    let matches = true;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      matches = matches && (
        item.productName?.toLowerCase().includes(q) || 
        item.salesOrderId?.toLowerCase().includes(q)
      );
    }

    if (filterPaper !== 'ALL') {
      matches = matches && (item.paperPreference?.includes(filterPaper) || false);
    }

    if (filterPlate !== 'ALL') {
      const isOld = !!item.sampleId;
      if (filterPlate === 'OLD') matches = matches && isOld;
      if (filterPlate === 'NEW') matches = matches && !isOld;
    }

    return matches;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Mẫu chờ ghép in</h1>
          <p className="text-sm text-neutral-500 mt-1">Các sản phẩm đã chốt, chờ thiết kế tạo lệnh sản xuất</p>
        </div>
        
        <button 
          className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm ${
            selectedItemIds.size > 0 
              ? 'bg-amber-500 hover:bg-amber-600 text-white' 
              : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
          }`}
          onClick={handleCreateProductionOrder}
          disabled={selectedItemIds.size === 0}
        >
          <Layers className="w-5 h-5" />
          <span>Tạo lệnh in ghép ({selectedItemIds.size})</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-100 flex flex-col sm:flex-row gap-4 justify-between bg-neutral-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input 
              type="text"
              placeholder="Tìm theo tên mẫu, mã đơn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-neutral-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none transition-all text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 border rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${showFilters ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}
            >
              <Filter className="w-4 h-4" />
              <span>Lọc nâng cao</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="p-4 bg-white border-b border-neutral-100 flex flex-wrap gap-4 animate-in slide-in-from-top-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-500 uppercase">Loại giấy</label>
              <select
                value={filterPaper}
                onChange={(e) => setFilterPaper(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-hidden focus:border-amber-500"
              >
                <option value="ALL">Tất cả giấy</option>
                <option value="Kraft">Kraft</option>
                <option value="OP">OP</option>
                <option value="MG">MG</option>
                <option value="Fort">Fort</option>
                <option value="Duplex">Duplex</option>
                <option value="Couche">Couche</option>
                <option value="Ivory">Ivory</option>
                <option value="BB">BB</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-neutral-500 uppercase">Loại kẽm</label>
              <select
                value={filterPlate}
                onChange={(e) => setFilterPlate(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-hidden focus:border-amber-500"
              >
                <option value="ALL">Tất cả kẽm</option>
                <option value="OLD">Kẽm cũ (Đã có mẫu)</option>
                <option value="NEW">Cần xuất kẽm mới</option>
              </select>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-neutral-500 font-medium">Đang tải danh sách mẫu...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
              <Scissors className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900 mb-1">Không có mẫu chờ in</h3>
            <p className="text-neutral-500 text-sm max-w-sm">
              Tất cả các sản phẩm đã được ghép lệnh hoặc chưa có đơn hàng nào được chốt.
            </p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map(item => {
              const isSelected = selectedItemIds.has(item.id);
              
              return (
                <div 
                  key={item.id}
                  onClick={() => toggleSelection(item.id)}
                  className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col gap-3 ${
                    isSelected 
                      ? 'border-amber-500 bg-amber-50/30' 
                      : 'border-neutral-200 hover:border-amber-300 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                        Mã đơn: {item.salesOrderId}
                      </div>
                      <h4 className="font-bold text-neutral-900 leading-tight">
                        {item.productName}
                      </h4>
                    </div>
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${
                      isSelected ? 'bg-amber-500 border-amber-500' : 'bg-white border-neutral-300'
                    }`}>
                      {isSelected && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-neutral-100 rounded-lg overflow-hidden border border-neutral-200 shrink-0">
                      {item.imageUrl || item.image ? (
                        <ResolvedImage image={item.image} legacyUrl={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs font-medium">
                          No IMG
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Số lượng:</span>
                        <span className="font-bold text-neutral-900">{item.quantity.toLocaleString()} túi</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Giấy đề xuất:</span>
                        <span className="font-medium text-neutral-900">{item.paperPreference || item.gsmPreference ? `${item.paperPreference || ''} ${item.gsmPreference || ''}` : '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-500">Kẽm:</span>
                        <span className="font-medium text-neutral-900">{item.sampleId ? 'Mẫu cũ' : 'Cần kẽm mới'}</span>
                      </div>
                    </div>
                  </div>
                  
                  {item.status !== 'READY_FOR_PRODUCTION' && (
                    <div className="mt-auto pt-2 border-t border-neutral-100">
                      <div className="flex items-center gap-1.5 text-orange-600 bg-orange-50 px-2 py-1 rounded text-xs font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Mẫu đang chờ thiết kế, cần xác nhận trước khi in.</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
