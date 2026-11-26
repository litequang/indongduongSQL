import React, { useState, useMemo, useEffect } from 'react';
import { X, Layers, Copy, Search, Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SavedDesign, ProductionOrder } from '../types';

export const LibraryModal: React.FC = () => {
  const {
    currentUser,
    orders,
    isLibraryModalOpen,
    setIsLibraryModalOpen,
    setIsCreateModalOpen,
    setPrefilledOrderData,
    setPreviewImage,
    users,
    appConfig
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterPaper, setFilterPaper] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterCreator, setFilterCreator] = useState('ALL');
  const [filterPrinter, setFilterPrinter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expandedDesignId, setExpandedDesignId] = useState<string | null>(null);

  // Dynamic paper types from appConfig
  const availablePaperTypes = useMemo(() => {
    const list = appConfig?.production?.paperTypes?.length
      ? appConfig.production.paperTypes
      : ['Kraft', 'OP', 'MG', 'Fort', 'Duplex', 'BB', 'Ivory', 'Couche'];
    return ['ALL', ...list];
  }, [appConfig]);

  // Dynamically compute saved designs from orders
  const dynamicSavedDesigns: SavedDesign[] = [];
  const printHistory: Record<string, ProductionOrder[]> = {};
  
  // First pass: collect print history by image URL
  orders.forEach(order => {
    if (order.status === 'CANCELLED' || order.status === 'DRAFT') return;
    order.items.forEach(item => {
      if (item.imageUrl) {
        if (!printHistory[item.imageUrl]) printHistory[item.imageUrl] = [];
        // Prevent duplicate orders for the same image (if an order has multiple identical items somehow)
        if (!printHistory[item.imageUrl].find(o => o.id === order.id)) {
            printHistory[item.imageUrl].push(order);
        }
      }
    });
  });

  const seenImageUrls = new Set<string>();

  // Second pass: build library
  orders.forEach(order => {
    if (order.status === 'CANCELLED' || order.status === 'DRAFT') return;

    order.items.forEach(item => {
      if (!item.imageUrl) return;
      if (seenImageUrls.has(item.imageUrl)) return;
      seenImageUrls.add(item.imageUrl);
      
      const tagsStr = item.tags && item.tags.length > 0 ? item.tags.join(', ') : '';
      const fallbackName = item.customerName || tagsStr || `Mẫu từ lệnh #${order.code}`;

      dynamicSavedDesigns.push({
        id: item.id || `des-${order.id}-${Math.random()}`,
        imageUrl: item.imageUrl,
        image: item.image,
        customerName: item.customerName || tagsStr || '',
        productName: item.productName || fallbackName,
        tags: item.tags,
        bagSize: `${order.paperWidth} × ${order.paperHeight} cm`,
        paperType: order.paperType,
        paperGsm: order.paperGsm,
        color: item.color || order.color,
        plateReference: order.plateNote || (order.plateType === 'OLD' ? `Kẽm cũ ngày ${order.originalPlateDate || order.plateDate}` : `Kẽm mới ngày ${order.plateDate}`),
        lastPrintedAt: order.createdAt,
        printCount: printHistory[item.imageUrl]?.length || 1,
        creatorId: order.createdBy,
        printerId: order.printerId
      });
    });

    // Also include printed photo if printer uploaded one
    if (order.printedImageUrl && !seenImageUrls.has(order.printedImageUrl)) {
      seenImageUrls.add(order.printedImageUrl);
      dynamicSavedDesigns.push({
        id: `des-printed-${order.id}`,
        imageUrl: order.printedImageUrl,
        image: order.printedImage,
        customerName: order.productName || 'Ảnh chụp thực tế in xong',
        productName: `Ảnh thực tế lệnh #${order.code}`,
        bagSize: `${order.paperWidth} × ${order.paperHeight} cm`,
        paperType: order.paperType,
        paperGsm: order.paperGsm,
        color: order.color,
        plateReference: order.plateNote || (order.plateType === 'OLD' ? `Kẽm cũ ngày ${order.originalPlateDate || order.plateDate}` : `Kẽm mới ngày ${order.plateDate}`),
        lastPrintedAt: order.printingCompletedAt || order.updatedAt || order.createdAt,
        printCount: 1,
        creatorId: order.createdBy,
        printerId: order.printerId
      });
    }
  });

  // Apply Filters
  let filtered = dynamicSavedDesigns.filter(d => 
    d.customerName.toLowerCase().includes(search.toLowerCase()) ||
    d.productName.toLowerCase().includes(search.toLowerCase()) ||
    d.paperType.toLowerCase().includes(search.toLowerCase()) ||
    d.plateReference.toLowerCase().includes(search.toLowerCase()) ||
    (d.tags && d.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
  );

  if (filterPaper !== 'ALL') {
    filtered = filtered.filter(d => d.paperType === filterPaper);
  }

  if (filterCreator !== 'ALL') {
    filtered = filtered.filter(d => d.creatorId === filterCreator);
  }

  if (filterPrinter !== 'ALL') {
    filtered = filtered.filter(d => d.printerId === filterPrinter);
  }

  if (dateFilter !== 'ALL') {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - (now.getDay() * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    filtered = filtered.filter(d => {
      const time = new Date(d.lastPrintedAt).getTime();
      switch (dateFilter) {
        case 'TODAY': return time >= todayStart;
        case 'YESTERDAY': return time >= yesterdayStart && time < todayStart;
        case 'THIS_WEEK': return time >= weekStart;
        case 'THIS_MONTH': return time >= monthStart;
        case 'CUSTOM': {
          if (!startDate && !endDate) return true;
          const sTime = startDate ? new Date(startDate).getTime() : 0;
          // Set to end of day for end date
          const eTime = endDate ? new Date(endDate).getTime() + 86399999 : Infinity;
          return time >= sTime && time <= eTime;
        }
        default: return true;
      }
    });
  }

  // Sort by newest first
  filtered.sort((a, b) => new Date(b.lastPrintedAt).getTime() - new Date(a.lastPrintedAt).getTime());

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  
  // Ensure current page is within bounds when filters change
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
    if (currentPage < 1) setCurrentPage(1);
  }, [filtered.length, pageSize, totalPages, currentPage]);

  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleReorder = (design: SavedDesign, order?: ProductionOrder) => {
    const sizeParts = design.bagSize.replace(/cm/i, '').split(/[x×*]/);
    const width = sizeParts[0]?.trim() || '25';
    const height = sizeParts[1]?.trim() || '48';

    const defaultPrinter = users.find(u => u.role === 'PRINTER') || users[0];
    const dateMatch = design.plateReference.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const extractedPlateDate = dateMatch ? dateMatch[1] : '12/02/2025';

    setPrefilledOrderData({
      productName: order?.productName || design.productName,
      paperType: (order?.paperType || design.paperType || 'Kraft') as any,
      paperGsm: order?.paperGsm || design.paperGsm || '70',
      paperWidth: order?.paperWidth || width,
      paperHeight: order?.paperHeight || height,
      totalSheets: order?.totalSheets || 5150,
      color: order?.color || design.color || 'Nâu',
      note: order ? `In lại từ #${order.code}` + (order.note ? ` - ${order.note}` : '') : `In lại theo mẫu thư viện: ${design.productName}`,
      plateType: 'OLD',
      plateStatus: 'OLD_PLATE',
      plateDate: order?.plateDate || extractedPlateDate,
      originalPlateDate: order?.originalPlateDate || extractedPlateDate,
      isReprint: true,
      reprintFromCode: order?.code,
      reprintFromDate: order?.createdAt.split('T')[0],
      plateNote: order?.plateNote || design.plateReference || `Kẽm cũ ngày ${extractedPlateDate}`,
      printerId: order?.printerId || defaultPrinter.id,
      printerName: order?.printerName || defaultPrinter.name,
      items: order?.items ? order.items.map(it => ({...it, id: 'item-' + Math.random()})) : [
        {
          id: 'item-reorder-' + Date.now(),
          imageUrl: design.imageUrl,
          image: design.image,
          customerName: design.customerName,
          productName: design.productName,
          quantity: 5150,
          color: design.color,
          oldPlateReference: design.plateReference
        }
      ]
    });
    setIsLibraryModalOpen(false);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90dvh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800 my-auto">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              <h3 className="font-extrabold text-base sm:text-lg text-neutral-900">
                Thư Viện Mẫu Đã In ({filtered.length} mẫu)
              </h3>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Khách in lại chỉ cần 1 click – Giữ nguyên kẽm cũ, thông số & ảnh mẫu
            </p>
          </div>

          <button
            onClick={() => setIsLibraryModalOpen(false)}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Filters */}
        <div className="px-4 py-3 border-b border-neutral-100 bg-white shrink-0 flex flex-col sm:flex-row gap-3">
          <div className="flex flex-wrap gap-2 items-center w-full">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên khách, loại túi, mã kẽm..."
                className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:bg-white focus:border-amber-500 outline-hidden transition-colors"
              />
            </div>
            
            <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
              {/* Người tạo lệnh */}
              <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 hover:bg-white focus-within:border-amber-500 transition-colors cursor-pointer w-full sm:w-auto min-w-[140px]">
                <Filter className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <select 
                  value={filterCreator}
                  onChange={(e) => setFilterCreator(e.target.value)}
                  className="bg-transparent text-xs font-bold text-neutral-700 outline-hidden w-full cursor-pointer appearance-none"
                >
                  <option value="ALL">Người tạo lệnh</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Thợ in */}
              <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 hover:bg-white focus-within:border-amber-500 transition-colors cursor-pointer w-full sm:w-auto min-w-[140px]">
                <Filter className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <select 
                  value={filterPrinter}
                  onChange={(e) => setFilterPrinter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-neutral-700 outline-hidden w-full cursor-pointer appearance-none"
                >
                  <option value="ALL">Thợ in phụ trách</option>
                  {users.filter(u => u.role === 'PRINTER').map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Giấy */}
              <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 hover:bg-white focus-within:border-amber-500 transition-colors cursor-pointer w-full sm:w-auto min-w-[140px]">
                <Filter className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <select 
                  value={filterPaper}
                  onChange={(e) => setFilterPaper(e.target.value)}
                  className="bg-transparent text-xs font-bold text-neutral-700 outline-hidden w-full cursor-pointer appearance-none"
                >
                  {availablePaperTypes.map(p => (
                    <option key={p} value={p}>{p === 'ALL' ? 'Tất cả loại giấy' : `Giấy ${p}`}</option>
                  ))}
                </select>
              </div>

              {/* Thời gian */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 hover:bg-white focus-within:border-amber-500 transition-colors cursor-pointer w-full sm:w-auto min-w-[140px]">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <select 
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as any)}
                    className="bg-transparent text-xs font-bold text-neutral-700 outline-hidden w-full cursor-pointer appearance-none"
                  >
                    <option value="ALL">Tất cả thời gian</option>
                    <option value="TODAY">Hôm nay</option>
                    <option value="YESTERDAY">Hôm qua</option>
                    <option value="THIS_WEEK">Tuần này</option>
                    <option value="THIS_MONTH">Tháng này</option>
                    <option value="CUSTOM">Tùy chọn...</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          {/* Custom Date Range Picker */}
          {dateFilter === 'CUSTOM' && (
            <div className="flex items-center gap-2 mt-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl w-full">
              <span className="text-xs font-bold text-neutral-700 whitespace-nowrap">Từ ngày:</span>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-medium outline-hidden focus:border-amber-500 flex-1"
              />
              <span className="text-xs font-bold text-neutral-700 whitespace-nowrap ml-2">Đến ngày:</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-medium outline-hidden focus:border-amber-500 flex-1"
              />
            </div>
          )}
        </div>

        {/* Grid of designs */}
        <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 bg-neutral-50/50">
          {paginated.length > 0 ? (
            paginated.map((design, index) => (
              <React.Fragment key={`${design.id}-${index}`}>
                <div
                  className={`bg-white border ${expandedDesignId === design.id ? 'border-amber-400 shadow-md ring-2 ring-amber-100' : 'border-neutral-200/90'} rounded-2xl p-3.5 flex gap-3.5 items-start transition-all hover:shadow-md hover:border-amber-300`}
                >
                  {/* Bag Image */}
                <div
                  onClick={() => setPreviewImage(design.imageUrl)}
                  className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl bg-neutral-100 overflow-hidden shrink-0 border border-neutral-200 relative group cursor-pointer"
                >
                  <img
                    src={design.imageUrl}
                    alt={design.productName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-1 right-1 text-[9px] bg-black/60 backdrop-blur-sm text-white px-1.5 py-0.5 rounded font-bold">
                    Phóng to
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                  <div>
                    <h4 className="font-extrabold text-xs sm:text-sm text-neutral-900 truncate">
                      {design.productName}
                    </h4>
                    {design.tags && design.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {design.tags.map((tag, i) => (
                          <span key={i} className="text-[10px] font-bold bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                        {design.paperType} {design.paperGsm}
                      </span>
                      <span className="text-[10px] font-semibold bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded border border-neutral-200/60">
                        {design.bagSize}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-medium mt-1.5 truncate">
                      🟢 {design.plateReference}
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-neutral-100 mt-2">
                    <span className="text-[10px] text-neutral-400 font-medium cursor-pointer hover:text-amber-600" onClick={() => setExpandedDesignId(expandedDesignId === design.id ? null : design.id)}>
                      Đã in {design.printCount} lần {design.printCount > 0 ? (expandedDesignId === design.id ? '▲' : '▼') : ''}
                    </span>
                    
                    {['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'SALE'].includes(currentUser.role) ? (
                      <button
                        onClick={() => {
                          const history = printHistory[design.imageUrl] || [];
                          if (history.length > 0) {
                            setExpandedDesignId(expandedDesignId === design.id ? null : design.id);
                          } else {
                            handleReorder(design);
                          }
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                        title="Thiết kế ra lệnh in lại dựa trên mẫu kẽm cũ này"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>IN LẠI</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-neutral-400 font-medium">
                        Mẫu lưu trữ
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Expanded History */}
              {expandedDesignId === design.id && (printHistory[design.imageUrl] || []).length > 0 && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 bg-blue-50/50 border border-blue-100 rounded-2xl p-4 -mt-2 mb-2 animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-blue-700" />
                    <h5 className="text-xs font-black text-blue-900 uppercase">Gia phả in lại mẫu này ({printHistory[design.imageUrl].length} lệnh)</h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {printHistory[design.imageUrl].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((o, idx) => (
                      <div key={o.id} className="bg-white border border-blue-100 p-3 rounded-xl flex flex-col justify-between hover:shadow-md transition-all group">
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-neutral-900">#{o.code}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {o.status === 'COMPLETED' ? 'Đã xong' : 'Đang xử lý'}
                            </span>
                          </div>
                          <span className="text-[11px] text-neutral-500 mt-1 block">Ngày: {o.createdAt.split('T')[0].split('-').reverse().join('/')}</span>
                          <span className="text-[11px] text-neutral-700 font-medium block">Số lượng: {o.totalSheets.toLocaleString('vi-VN')} tờ</span>
                        </div>
                        {['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'SALE'].includes(currentUser.role) && (
                          <button
                            onClick={() => handleReorder(design, o)}
                            className="mt-2 w-full py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 text-xs font-bold rounded-lg transition-colors cursor-pointer border border-blue-200 hover:border-blue-600 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            In lại từ lệnh này
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))
        ) : (
            <div className="col-span-full text-center py-16">
              <Layers className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-neutral-900">Không tìm thấy mẫu in nào</h3>
              <p className="text-xs text-neutral-500 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-neutral-100 bg-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-500 hidden sm:inline">Hiển thị</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 text-xs font-bold text-neutral-700 outline-hidden hover:bg-white transition-colors cursor-pointer"
              >
                <option value={10}>10 mẫu</option>
                <option value={20}>20 mẫu</option>
                <option value={50}>50 mẫu</option>
                <option value={100}>100 mẫu</option>
              </select>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex items-center px-2">
                <span className="text-xs font-bold text-neutral-700">Trang {currentPage} / {totalPages}</span>
              </div>
              
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};
