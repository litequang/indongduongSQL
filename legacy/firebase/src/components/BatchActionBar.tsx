import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ResolvedImage } from './ResolvedImage';
import {
  Send,
  Trash2,
  Users,
  X,
  CheckCircle2,
  Layers,
  ChevronDown,
  CheckSquare,
  Square
} from 'lucide-react';

export const BatchActionBar: React.FC = () => {
  const {
    currentUser,
    users,
    orders,
    selectedOrderIds,
    clearSelectedOrders,
    dispatchMultipleOrders,
    markPlatesReadyBatch,
    deleteMultipleDraftOrders,
    deleteMultipleOrders,
    reassignPrintersBatch,
    acceptOrder,
    startPrintingDirect
  } = useApp();

  const [isReassignOpen, setIsReassignOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedOrderIds.length === 0) return null;

  const isDevOrAdmin = currentUser.role === 'DEVELOPER' || currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER' || currentUser.role === 'DESIGNER';
  const selectedOrders = orders.filter(o => selectedOrderIds.includes(o.id));
  const totalSheetsSelected = selectedOrders.reduce((sum, o) => sum + o.totalSheets, 0);
  
  // Counts for Designer/Admin
  const draftCount = selectedOrders.filter(o => o.status === 'DRAFT').length;
  const notSentPlateCount = selectedOrders.filter(o => o.plateStatus === 'NOT_SENT').length;

  // For PRINTER
  const unacceptedPrinterOrders = selectedOrders.filter(o => o.status === 'WAITING_ACCEPTANCE' && currentUser.role === 'PRINTER' && o.printerId === currentUser.id);
  const readyToPrintOrders = selectedOrders.filter(o =>
    (o.status === 'ACCEPTED' || o.status === 'WAITING_PRINT') &&
    (o.printerAcknowledgedRevision || 0) >= Math.max(1, o.productionRevision || 1) &&
    currentUser.role === 'PRINTER' && o.printerId === currentUser.id,
  );

  const printerUsers = users.filter(u => u.role === 'PRINTER' || u.role === 'ADMIN');

  const handleDispatchBatch = () => {
    dispatchMultipleOrders(selectedOrderIds, { markPlateAsSent: false });
  };

  const handleMarkPlatesBatch = () => {
    markPlatesReadyBatch(selectedOrderIds, 'SENT');
  };

  const handleDeleteDraftsBatch = () => {
    if (confirm(`Bạn có chắc muốn xóa ${draftCount} lệnh nháp đã chọn để ghép lại bản in mới?`)) {
      deleteMultipleDraftOrders(selectedOrderIds);
    }
  };

  const handleDeleteAllSelectedBatch = () => {
    if (confirm(`⚠️ XÁC NHẬN XÓA LỆNH (${selectedOrderIds.length} LỆNH ĐÃ CHỌN):\n\nBạn có chắc chắn muốn xóa vĩnh viễn ${selectedOrderIds.length} lệnh sản xuất này khỏi hệ thống không?`)) {
      deleteMultipleOrders(selectedOrderIds);
    }
  };

  const wrapAction = (action: () => Promise<void> | void) => async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await action();
    } finally {
      setIsProcessing(false);
      clearSelectedOrders();
    }
  };

  const handleAcceptPrinterBatch = wrapAction(async () => {
    await Promise.all(unacceptedPrinterOrders.map(o => acceptOrder(o.id)));
  });

  const handleStartPrintingBatch = wrapAction(async () => {
    await Promise.all(readyToPrintOrders.map(o => startPrintingDirect(o.id)));
  });

  return (
    <div
      id="batch-action-bar"
      className="fixed bottom-20 left-4 right-4 lg:bottom-6 md:left-72 md:right-8 z-40 animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="bg-neutral-900/95 backdrop-blur-md text-white rounded-3xl p-3.5 sm:p-4 shadow-2xl border border-neutral-700/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        
        {/* Left: Summary info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
            {selectedOrderIds.length}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-white">
                Đã chọn {selectedOrderIds.length} lệnh sản xuất
              </span>
              {draftCount > 0 && (
                <span className="text-[11px] font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-400/30">
                  {draftCount} chưa gửi thợ
                </span>
              )}
              {notSentPlateCount > 0 && (
                <span className="text-[11px] font-bold bg-red-500/20 text-red-300 px-2 py-0.5 rounded-md border border-red-500/30">
                  {notSentPlateCount} chưa ra kẽm
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Tổng số lượng: <b className="text-amber-400">{totalSheetsSelected.toLocaleString('vi-VN')} tờ in</b>
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* ========================================================= */}
          {/* DESIGNER / ADMIN ACTIONS */}
          {/* ========================================================= */}
          {isDevOrAdmin && (
            <>
              {/* Workflow V2 primary batch action. Plate metadata remains informational. */}
              {draftCount > 0 && (
                <button
                  onClick={handleDispatchBatch} disabled={isProcessing}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 active:scale-98 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  title="Gửi độc lập từng draft hợp lệ sang sản xuất"
                >
                  <Send className="w-4 h-4" />
                  <span>GỬI SANG SẢN XUẤT ({selectedOrderIds.length})</span>
                </button>
              )}

              {/* Mark Plates as Ready for non-drafts or general */}
              {notSentPlateCount > 0 && draftCount === 0 && (
                <button
                  onClick={handleMarkPlatesBatch} disabled={isProcessing}
                  className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-600 active:scale-98 text-white font-bold text-xs rounded-2xl border border-emerald-600 shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Đánh dấu đã ra kẽm cho các lệnh đã chọn"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Đánh dấu Đã ra kẽm</span>
                </button>
              )}

              {/* Reassign Printer Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsReassignOpen(!isReassignOpen)} disabled={isProcessing}
                  className="px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:scale-98 text-neutral-200 hover:text-white font-bold text-xs rounded-2xl border border-neutral-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Đổi thợ in phụ trách cho toàn bộ lệnh đã chọn"
                >
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Đổi thợ in</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isReassignOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 bottom-full mb-2 w-64 bg-white text-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 p-3 z-50 animate-in fade-in origin-bottom-left sm:origin-bottom-right">
                    <p className="text-xs font-black text-neutral-700 mb-2">Chuyển cho thợ in:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {printerUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            reassignPrintersBatch(selectedOrderIds, u.id);
                            setIsReassignOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-xs font-bold rounded-xl hover:bg-amber-50 hover:text-amber-950 flex items-center justify-between cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ResolvedImage image={u.avatarImage} legacyUrl={u.avatar} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                            <span>@{u.name}</span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-normal">{u.role === 'PRINTER' ? 'Thợ in' : 'Quản lý'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* PRINTER ACTIONS */}
          {/* ========================================================= */}
          {unacceptedPrinterOrders.length > 0 && (
            <button
              onClick={handleAcceptPrinterBatch} disabled={isProcessing}
              className="px-3.5 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-98 text-white font-black text-xs rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Nhận tất cả lệnh in đang chờ"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Nhận lệnh ({unacceptedPrinterOrders.length})</span>
            </button>
          )}

          {readyToPrintOrders.length > 0 && (
            <button
              onClick={handleStartPrintingBatch} disabled={isProcessing}
              className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-xs rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Bắt đầu in tất cả lệnh đã chọn"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Bắt đầu in ({readyToPrintOrders.length})</span>
            </button>
          )}

          {/* Delete Batch for Developer / Admin */}
          {isDevOrAdmin && (
            <button
              onClick={handleDeleteAllSelectedBatch} disabled={isProcessing}
              className="px-3.5 py-2.5 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-black text-xs rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Xóa vĩnh viễn các lệnh đã chọn khỏi hệ thống (Developer / Admin)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xóa lệnh ({selectedOrderIds.length})</span>
            </button>
          )}

          {/* Delete Drafts (if any draft selected and not already showing all delete) */}
          {draftCount > 0 && !isDevOrAdmin && (
            <button
              onClick={handleDeleteDraftsBatch} disabled={isProcessing}
              className="px-3 py-2.5 bg-red-950/60 hover:bg-red-900 text-red-200 hover:text-white font-bold text-xs rounded-2xl border border-red-800/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Xóa các lệnh nháp đã chọn để ghép lại bản in mới"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Xóa nháp ({draftCount})</span>
            </button>
          )}

          {/* Clear selection */}
          <button
            onClick={clearSelectedOrders} disabled={isProcessing}
            className="p-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-2xl transition-colors cursor-pointer"
            title="Bỏ chọn tất cả"
          >
            <X className="w-4 h-4" />
          </button>

        </div>

      </div>
    </div>
  );
};
