import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Printer,
  Layers,
  CheckCircle2,
  Scissors,
  Plus,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Eye,
  Zap,
  ShieldAlert,
  Calendar,
  Check,
  TrendingUp,
  Package,
  FileText,
  BarChart3,
  LayoutDashboard
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getMinutesSince } from '../utils/dateUtils';
import { ProductionOrder } from '../types';
import { canCreateProductionOrder, canViewReports } from '../permissions';
import { ProductionStatistics } from './ProductionStatistics';
import { ResolvedImage } from './ResolvedImage';

interface DashboardOverviewProps {
  onOpenIssueModal?: (orderId: string) => void;
  onOpenFinishPrintModal?: (orderId: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onOpenIssueModal,
  onOpenFinishPrintModal
}) => {
  const {
    currentUser,
    orders,
    setActiveTab,
    setSelectedOrder,
    acceptOrder,
    appConfig
  } = useApp();

  const [overviewMode, setOverviewMode] = useState<'realtime' | 'statistics'>('realtime');
  const hasReportsPermission = canViewReports(currentUser, appConfig);

  const isPrinter = currentUser.role === 'PRINTER';
  const isFinisher = currentUser.role === 'FINISHER';
  const isSale = currentUser.role === 'SALE';
  const isDesigner = currentUser.role === 'DESIGNER';
  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER' || currentUser.role === 'MANAGER';

  // Metrics for General / Admin
  const totalOrders = orders.length;
  const unacceptedOrders = orders.filter(o => o.status === 'WAITING_ACCEPTANCE');
  const missingPlateOrders = orders.filter(o => o.plateStatus === 'NOT_SENT');
  const waitingPlateOrders = orders.filter(o => o.plateStatus === 'SENT');
  const readyPlateOrders = orders.filter(o => o.plateStatus === 'RECEIVED' || o.plateStatus === 'OLD_PLATE');
  const readyToPrintOrders = orders.filter(o => o.status === 'WAITING_PRINT' || (o.status === 'ACCEPTED' && (o.plateStatus === 'RECEIVED' || o.plateStatus === 'OLD_PLATE')));
  const printingOrders = orders.filter(o => o.status === 'PRINTING');
  const printedOrders = orders.filter(o => o.status === 'PRINTED');
  const finishingOrders = orders.filter(o => o.status === 'FINISHING');
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');
  const issueOrders = orders.filter(o => o.issues?.some(i => i.status === 'OPEN'));
  const pendingCancelOrders = orders.filter(o => o.cancellationRequest?.status === 'PENDING' && o.status !== 'CANCELLED');

  // Metrics for Printer
  const myPrinterOrders = orders.filter(o => o.printerId === currentUser.id && o.status !== 'DRAFT');
  const myPrinterUnaccepted = myPrinterOrders.filter(o => o.status === 'WAITING_ACCEPTANCE');
  const myPrinterWaiting = myPrinterOrders.filter(o => o.status === 'WAITING_PRINT' || (o.status === 'ACCEPTED' && (o.plateStatus === 'RECEIVED' || o.plateStatus === 'OLD_PLATE')));
  const myPrinterPrinting = myPrinterOrders.filter(o => o.status === 'PRINTING');
  const myPrinterPrinted = myPrinterOrders.filter(o => o.status === 'PRINTED' || o.status === 'FINISHING' || o.status === 'COMPLETED');
  const myPrinterIssues = myPrinterOrders.filter(o => o.issues?.some(i => i.status === 'OPEN'));
  const myPrinterPendingCancels = myPrinterOrders.filter(o => o.cancellationRequest?.status === 'PENDING' && o.status !== 'CANCELLED');
  const myPrinterPrintedSheets = myPrinterPrinted.reduce((sum, o) => sum + (o.actualPrintedSheets || o.totalSheets || 0), 0);

  // Metrics for Finisher
  const finisherOrders = orders.filter(o => o.status === 'PRINTED' || o.status === 'FINISHING' || o.status === 'COMPLETED');
  const finisherWaiting = orders.filter(o => o.status === 'PRINTED');
  const finisherWorking = orders.filter(o => o.status === 'FINISHING');
  const finisherCompleted = orders.filter(o => o.status === 'COMPLETED');

  // Metrics for Sale
  const saleActive = orders.filter(o => o.status !== 'DRAFT' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');

  // Metrics for Designer
  const designerOrders = orders.filter(o => o.status !== 'DRAFT' || o.createdBy === currentUser.id);
  const designerDrafts = orders.filter(o => o.status === 'DRAFT' && (o.createdBy === currentUser.id || isAdmin));
  const designerMissingPlates = orders.filter(o => o.plateStatus === 'NOT_SENT' && o.status !== 'CANCELLED');

  // Orders to show in the Recent List
  const displayedOrders = isPrinter
    ? myPrinterOrders
    : isFinisher
    ? finisherOrders
    : isSale
    ? saleActive.length > 0 ? saleActive : orders.filter(o => o.status !== 'DRAFT')
    : isDesigner
    ? designerOrders
    : orders;

  // Active Printing Job (for Spotlight)
  const activePrintingOrder = isPrinter ? myPrinterPrinting[0] : printingOrders[0];
  // CẦN TÔI XỬ LÝ
  const myActionRequiredOrders = orders.filter(o => {
    if (o.status === 'COMPLETED' || o.status === 'CANCELLED') return false;

    // Check pending cancellations
    if (o.cancellationRequest?.status === 'PENDING') {
      if (currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER') return true;
      if (o.status === 'FINISHING') {
        if (o.finishing?.finisherId === currentUser.id) return true;
        if (!o.finishing?.finisherId && currentUser.role === 'FINISHER') return true;
      } else {
        if (o.printerId === currentUser.id) return true;
        if (!o.printerId && currentUser.role === 'PRINTER') return true;
      }
    }

    // Check open issues assigned to me
    if (o.issues?.some(i => i.status === 'OPEN' && (i.assignedToUserId === currentUser.id || i.assignedToRole === currentUser.role))) {
      return true;
    }

    return false;
  });


  return (
    <div className="space-y-4 sm:space-y-6">

      {/* 1. COMPACT MODERN ROLE HERO BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl border border-neutral-200/80 shadow-xs">
        {/* Left: Quick Status */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-black text-lg shrink-0">
            {isPrinter ? '🖨️' : isFinisher ? '✂️' : isDesigner ? '🎨' : isSale ? '💼' : '👑'}
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-[13px] sm:text-sm font-black text-neutral-900 leading-none">
              {currentUser.role === 'PRINTER' ? 'Bàn Thợ In'
                : currentUser.role === 'FINISHER' ? 'Tổ Gia Công'
                : currentUser.role === 'DESIGNER' ? 'Thiết Kế'
                : currentUser.role === 'SALE' ? 'Kinh Doanh'
                : 'Quản Lý Xưởng'}
            </span>
            <span className="text-[11px] sm:text-xs font-semibold text-neutral-500 leading-none mt-1.5">
              {currentUser.role === 'PRINTER'
                ? `${myPrinterPrintedSheets.toLocaleString('vi-VN')} tờ đã in`
                : currentUser.role === 'FINISHER'
                ? `${finisherWaiting.length} chờ dán • ${finisherWorking.length} đang làm`
                : currentUser.role === 'DESIGNER'
                ? `${designerMissingPlates.length} kẽm cần xuất`
                : currentUser.role === 'SALE'
                ? `${saleActive.length} đơn đang sản xuất`
                : `${printingOrders.length} máy đang in • ${finishingOrders.length} đơn gia công`}
            </span>
          </div>
        </div>

        {/* Mode Switcher & Quick CTA */}
        <div className="flex items-center gap-2 flex-wrap">
          {hasReportsPermission && (
            <div className="flex bg-neutral-100/80 p-1 rounded-xl border border-neutral-200/60">
              <button
                type="button"
                onClick={() => setOverviewMode('realtime')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  overviewMode === 'realtime'
                    ? 'bg-white text-amber-700 shadow-sm border border-neutral-200/50'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tiến độ xưởng</span>
                <span className="sm:hidden">Tiến độ</span>
              </button>
              <button
                type="button"
                onClick={() => setOverviewMode('statistics')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  overviewMode === 'statistics'
                    ? 'bg-white text-amber-700 shadow-sm border border-neutral-200/50'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Thống kê</span>
                <span className="sm:hidden">Báo cáo</span>
              </button>
            </div>
          )}

          {(isDesigner || isAdmin) && (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-quick-composer'));
              }}
              className="px-3 sm:px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-neutral-950 font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">TẠO LỆNH IN</span>
              <span className="sm:hidden">TẠO LỆNH</span>
            </button>
          )}

          {isPrinter && (
            <button
              type="button"
              onClick={() => setActiveTab(myPrinterUnaccepted.length > 0 ? 'unaccepted' : 'waiting_print')}
              className="px-3 sm:px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-neutral-950 font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm"
            >
              <Printer className="w-4 h-4" />
              <span>{myPrinterUnaccepted.length > 0 ? `NHẬN ${myPrinterUnaccepted.length}` : 'SẴN SÀNG IN'}</span>
            </button>
          )}

          {isFinisher && (
            <button
              type="button"
              onClick={() => setActiveTab(finisherWaiting.length > 0 ? 'printed' : 'finishing')}
              className="px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 active:scale-98 text-white font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs sm:text-sm"
            >
              <Scissors className="w-4 h-4" />
              <span>{finisherWaiting.length > 0 ? `NHẬN ${finisherWaiting.length}` : 'ĐƠN GIA CÔNG'}</span>
            </button>
          )}
        </div>
      </div>

      {/* If in Statistics mode, render dedicated ProductionStatistics component */}
      {hasReportsPermission && overviewMode === 'statistics' && (
        <ProductionStatistics />
      )}

      {/* Real-time Operation Dashboard */}
      {(!hasReportsPermission || overviewMode === 'realtime') && (
        <>

      {/* 2A. Emergency Issues (Cancellations and General Issues) */}
      {(() => {
        const relevantCancelOrders = pendingCancelOrders.filter(o => {
          if (isAdmin) return true;
          if (isPrinter && o.printerId === currentUser.id) return true;
          if (isFinisher && (o.status === 'FINISHING' || o.status === 'PRINTED')) return true;
          return false; // Designer/Sale see them in their own queue, but don't need emergency flash alerts unless they requested it
        });

        const relevantIssueOrders = issueOrders.filter(o => {
          if (isAdmin) return true;
          if (isPrinter && o.printerId === currentUser.id) return true;
          if (isFinisher && o.finishing?.finisherId === currentUser.id) return true;
          if (isDesigner && (o.createdBy === currentUser.id || o.designerId === currentUser.id)) return true;
          if (isSale && (o.createdBy === currentUser.id || o.saleId === currentUser.id)) return true;
          return false;
        });

        if (relevantCancelOrders.length === 0 && relevantIssueOrders.length === 0) return null;

        return (
          <div className="space-y-2 mb-2">
            {/* Render Pending Cancels */}
            {relevantCancelOrders.map(order => (
              <div key={`cancel-${order.id}`} className="bg-[#f06868] rounded-[24px] p-3 sm:p-4 flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-3xl sm:text-4xl shrink-0 drop-shadow-sm">🚨</div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-white/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-0.5 truncate">
                      CẢNH BÁO DỪNG MÁY / HỦY LỆNH
                    </span>
                    <span className="text-white text-xs sm:text-sm font-bold truncate">
                      Lệnh #{order.code} có yêu cầu dừng in ngay!
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(order)}
                  className="shrink-0 bg-white hover:bg-neutral-50 text-[#f06868] font-bold text-xs sm:text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-full shadow-sm transition-transform active:scale-95 text-center cursor-pointer"
                >
                  Kiểm tra ngay
                </button>
              </div>
            ))}

            {/* Render General Issues (excluding ones already in cancel to avoid duplicates) */}
            {relevantIssueOrders.filter(o => !relevantCancelOrders.find(c => c.id === o.id)).map(order => {
              const openIssue = order.issues?.find(i => i.status === 'OPEN');
              if (!openIssue) return null;
              return (
                <div key={`issue-${order.id}`} className="bg-[#f06868] rounded-[24px] p-3 sm:p-4 flex items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-3xl sm:text-4xl shrink-0 drop-shadow-sm">🚨</div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-white/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-0.5 truncate">
                        CẢNH BÁO SỰ CỐ / DỪNG MÁY
                      </span>
                      <span className="text-white text-xs sm:text-sm font-bold truncate">
                        Lệnh #{order.code} {openIssue.message.length > 25 ? openIssue.message.substring(0, 25) + '...' : openIssue.message}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(order)}
                    className="shrink-0 bg-white hover:bg-neutral-50 text-[#f06868] font-bold text-xs sm:text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-full shadow-sm transition-transform active:scale-95 text-center cursor-pointer"
                  >
                    Kiểm tra ngay
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 2B. Role: PRINTER Urgent Unaccepted Action */}
      {isPrinter && myPrinterUnaccepted.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-600 fill-current" />
              Lệnh Mới Chờ Bạn Nhận ({myPrinterUnaccepted.length})
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('unaccepted')}
              className="text-xs font-bold text-amber-800 hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {myPrinterUnaccepted.slice(0, 2).map((ord) => (
              <div
                key={ord.id}
                className="bg-white border border-amber-200 text-neutral-900 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-2.5 hover:border-amber-400 transition-all"
              >
                <div className="min-w-0" onClick={() => setSelectedOrder(ord)}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-neutral-900 truncate">
                      #{ord.code}
                    </span>
                    {ord.isUrgent && (
                      <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.2 rounded">
                        GẤP
                      </span>
                    )}
                    <span className="text-xs font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded">
                      {ord.totalSheets.toLocaleString('vi-VN')} tờ
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                    {ord.paperType} {ord.paperGsm} • {ord.paperWidth}×{ord.paperHeight}cm • Màu: <b>{ord.color}</b>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => acceptOrder(ord.id)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-neutral-950 text-xs font-black rounded-xl shadow-xs transition-all shrink-0 cursor-pointer min-h-[40px]"
                >
                  Nhận lệnh
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2C. Role: FINISHER Urgent Printed Waiting Action */}
      {isFinisher && finisherWaiting.length > 0 && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-3.5 sm:p-4 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-purple-600" />
              Đơn In Xong Chờ Nhận Dán Túi ({finisherWaiting.length})
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('printed')}
              className="text-xs font-bold text-purple-800 hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {finisherWaiting.slice(0, 2).map((ord) => (
              <div
                key={ord.id}
                onClick={() => setSelectedOrder(ord)}
                className="bg-white border border-purple-200 text-neutral-900 rounded-xl p-3 shadow-2xs flex items-center justify-between gap-2.5 hover:border-purple-400 transition-all cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-neutral-900 truncate">
                      #{ord.code}
                    </span>
                    <span className="text-xs font-bold text-purple-900 bg-purple-100 px-1.5 py-0.2 rounded">
                      {ord.totalSheets.toLocaleString('vi-VN')} tờ
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                    Khổ: {ord.paperWidth}×{ord.paperHeight}cm • Thợ in: {ord.printerName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOrder(ord);
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shrink-0 cursor-pointer min-h-[36px]"
                >
                  Nhận dán
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2D. Role: DESIGNER Urgent Missing Plate Callout */}
      {(isDesigner || isAdmin) && designerMissingPlates.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500 text-white rounded-xl shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-red-950">
                CÓ {designerMissingPlates.length} LỆNH IN CHƯA GỬI RA KẼM!
              </h3>
              <p className="text-xs text-red-700 mt-0.5">
                Cần gửi file kẽm cho nhà kẽm để xưởng in kịp tiến độ chạy máy.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('not_sent_plate')}
            className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all shrink-0 cursor-pointer text-center min-h-[40px] flex items-center justify-center"
          >
            Xem lệnh chưa kẽm ({designerMissingPlates.length})
          </button>
        </div>
      )}

      {/* 2E. Active Printing Spotlight (For Printer) */}
      {isPrinter && activePrintingOrder && (
        <div className="bg-white border-2 border-blue-300 rounded-2xl p-3.5 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200">
              <Printer className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                  ĐANG CHẠY TRÊN MÁY
                </span>
                <span className="text-xs sm:text-sm font-black text-neutral-900 truncate">
                  #{activePrintingOrder.code} — {activePrintingOrder.totalSheets.toLocaleString('vi-VN')} tờ
                </span>
              </div>
              <p className="text-xs text-neutral-600 truncate mt-0.5">
                {activePrintingOrder.paperType} {activePrintingOrder.paperGsm} • Khổ: {activePrintingOrder.paperWidth}×{activePrintingOrder.paperHeight}cm • Màu: <b>{activePrintingOrder.color}</b>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => setSelectedOrder(activePrintingOrder)}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-xl transition-colors cursor-pointer min-h-[40px]"
            >
              Xem chi tiết
            </button>
            <button
              type="button"
              onClick={() => {
                if (onOpenFinishPrintModal) {
                  onOpenFinishPrintModal(activePrintingOrder.id);
                } else {
                  setSelectedOrder(activePrintingOrder);
                }
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Báo in xong</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. UNIFIED ROLE-TAILORED PRODUCTION PIPELINE (1 nguồn duy nhất, không trùng lặp) */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neutral-500" />
            {isPrinter
              ? `Tiến Độ Của Bạn (${myPrinterOrders.length} Lệnh)`
              : isFinisher
              ? `Tiến Độ Gia Công (${finisherOrders.length} Đơn)`
              : isSale
              ? `Tiến Độ Đơn Hàng (${saleActive.length} Đơn Đang Chạy)`
              : isDesigner
              ? `Tiến Độ Thiết Kế (${designerOrders.length} Lệnh)`
              : `Tiến Độ Toàn Xưởng (${totalOrders} Lệnh)`}
          </h3>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className="text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 3A. PRINTER PIPELINE TILES */}
        {isPrinter && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Chờ nhận */}
            <div
              onClick={() => setActiveTab('unaccepted')}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                myPrinterUnaccepted.length > 0
                  ? 'bg-amber-50 border-amber-300 hover:bg-amber-100/80 shadow-xs'
                  : 'bg-white border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/50 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600 flex items-center gap-1.5">
                  {myPrinterUnaccepted.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>}
                  Chờ nhận lệnh
                </span>
                <span className="text-sm">📥</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2">
                {myPrinterUnaccepted.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Cần bấm xác nhận</p>
            </div>

            {/* Sẵn sàng in */}
            <div
              onClick={() => setActiveTab('waiting_print')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-blue-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Sẵn sàng in</span>
                <span className="text-sm">⏳</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2">
                {myPrinterWaiting.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Kẽm đã sẵn sàng</p>
            </div>

            {/* Đang in máy */}
            <div
              onClick={() => setActiveTab('printing')}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                myPrinterPrinting.length > 0
                  ? 'bg-blue-50 border-blue-300 hover:bg-blue-100/80 shadow-xs'
                  : 'bg-white border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/50 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600 flex items-center gap-1.5">
                  {myPrinterPrinting.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>}
                  Đang in máy
                </span>
                <span className="text-sm">🖨️</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-2">
                {myPrinterPrinting.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đang chạy máy in</p>
            </div>

            {/* Đã in xong hôm nay */}
            <div
              onClick={() => setActiveTab('printed')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-emerald-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700">Đã in hôm nay</span>
                <span className="text-sm">✅</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
                {myPrinterPrinted.length}
              </div>
              <p className="text-[11px] text-emerald-600 mt-0.5">
                {myPrinterPrintedSheets.toLocaleString('vi-VN')} tờ đã chạy
              </p>
            </div>
          </div>
        )}

        {/* 3B. FINISHER PIPELINE TILES */}
        {isFinisher && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Chờ nhận dán */}
            <div
              onClick={() => setActiveTab('printed')}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                finisherWaiting.length > 0
                  ? 'bg-purple-50 border-purple-300 hover:bg-purple-100/80 shadow-xs'
                  : 'bg-white border-neutral-200/80 hover:border-neutral-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600 flex items-center gap-1.5">
                  {finisherWaiting.length > 0 && <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>}
                  Chờ nhận dán
                </span>
                <span className="text-sm">✂️</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-purple-700 mt-2">
                {finisherWaiting.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">In xong chuyển qua</p>
            </div>

            {/* Đang gia công */}
            <div
              onClick={() => setActiveTab('finishing')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-purple-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Đang dán túi / bế</span>
                <span className="text-sm">📦</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-purple-700 mt-2">
                {finisherWorking.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đang làm tại tổ</p>
            </div>

            {/* Đã hoàn thành */}
            <div
              onClick={() => setActiveTab('completed')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-emerald-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700">Đã đóng gói xong</span>
                <span className="text-sm">✅</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
                {finisherCompleted.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Sẵn sàng xuất xưởng</p>
            </div>

            {/* Tổng đơn gia công */}
            <div
              onClick={() => setActiveTab('all')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Tất cả đơn</span>
                <span className="text-sm">📋</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2">
                {finisherOrders.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đã qua tổ gia công</p>
            </div>
          </div>
        )}

        {/* 3C. DESIGNER PIPELINE TILES */}
        {isDesigner && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Lệnh lưu nháp */}
            <div
              onClick={() => setActiveTab('drafts')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Lệnh lưu nháp</span>
                <span className="text-sm">📝</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2">
                {designerDrafts.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Chưa phát cho thợ</p>
            </div>

            {/* Chưa ra kẽm */}
            <div
              onClick={() => setActiveTab('not_sent_plate')}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                designerMissingPlates.length > 0
                  ? 'bg-red-50 border-red-300 hover:bg-red-100/80 shadow-xs'
                  : 'bg-white border-neutral-200/80 hover:border-neutral-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold ${designerMissingPlates.length > 0 ? 'text-red-700' : 'text-neutral-600'} flex items-center gap-1.5`}>
                  {designerMissingPlates.length > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>}
                  Chưa gửi kẽm
                </span>
                <span className="text-sm">🔴</span>
              </div>
              <div className={`text-2xl sm:text-3xl font-black ${designerMissingPlates.length > 0 ? 'text-red-700' : 'text-neutral-900'} mt-2`}>
                {designerMissingPlates.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Cần gửi nhà kẽm</p>
            </div>

            {/* Chờ thợ nhận */}
            <div
              onClick={() => setActiveTab('unaccepted')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-amber-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Chờ thợ nhận</span>
                <span className="text-sm">⏳</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2">
                {unacceptedOrders.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đã giao cho thợ</p>
            </div>

            {/* Đang in máy */}
            <div
              onClick={() => setActiveTab('printing')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-blue-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Đang in máy</span>
                <span className="text-sm">🖨️</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-2">
                {printingOrders.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đang chạy máy xưởng</p>
            </div>
          </div>
        )}

        {/* 3D. SALE PIPELINE TILES */}
        {isSale && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Đang sản xuất */}
            <div
              onClick={() => setActiveTab('all')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-neutral-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Đang sản xuất</span>
                <span className="text-sm">📊</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 mt-2">
                {saleActive.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Tổng đơn trong xưởng</p>
            </div>

            {/* Đang in */}
            <div
              onClick={() => setActiveTab('printing')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-blue-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Đang in máy</span>
                <span className="text-sm">🖨️</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-2">
                {printingOrders.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đang chạy máy in</p>
            </div>

            {/* Đang gia công */}
            <div
              onClick={() => setActiveTab('finishing')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-purple-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-600">Đang dán túi</span>
                <span className="text-sm">✂️</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-purple-700 mt-2">
                {finishingOrders.length + printedOrders.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Đang dán đáy & bế</p>
            </div>

            {/* Đã hoàn thành */}
            <div
              onClick={() => setActiveTab('completed')}
              className="p-3.5 sm:p-4 rounded-2xl border bg-white border-neutral-200/80 hover:border-emerald-300 hover:bg-neutral-50/50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700">Đã xong xuất xưởng</span>
                <span className="text-sm">🚚</span>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
                {completedOrders.length}
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">Sẵn sàng giao khách</p>
            </div>
          </div>
        )}

        {/* 3E. ADMIN / DEVELOPER FULL FACTORY PIPELINE */}
        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {/* Chưa gửi kẽm */}
            <div
              onClick={() => setActiveTab('not_sent_plate')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                missingPlateOrders.length > 0
                  ? 'bg-red-50 border-red-300 hover:bg-red-100/80'
                  : 'bg-white border-neutral-200/80 hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-600">Chưa gửi kẽm</span>
                <span className="text-xs">🔴</span>
              </div>
              <div className={`text-xl sm:text-2xl font-black ${missingPlateOrders.length > 0 ? 'text-red-700' : 'text-neutral-900'} mt-1.5`}>
                {missingPlateOrders.length}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Cần gửi gấp</p>
            </div>

            {/* Chờ nhận */}
            <div
              onClick={() => setActiveTab('unaccepted')}
              className="p-3.5 rounded-2xl border bg-white border-neutral-200/80 hover:border-amber-300 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-600">Chờ thợ nhận</span>
                <span className="text-xs">🟠</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-neutral-900 mt-1.5">
                {unacceptedOrders.length}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Chờ thợ xác nhận</p>
            </div>

            {/* Sẵn sàng in */}
            <div
              onClick={() => setActiveTab('waiting_print')}
              className="p-3.5 rounded-2xl border bg-white border-neutral-200/80 hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-600">Sẵn sàng in</span>
                <span className="text-xs">⏳</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-neutral-900 mt-1.5">
                {readyToPrintOrders.length}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Kẽm đã sẵn sàng</p>
            </div>

            {/* Đang in */}
            <div
              onClick={() => setActiveTab('printing')}
              className="p-3.5 rounded-2xl border bg-white border-neutral-200/80 hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-600">Đang in máy</span>
                <span className="text-xs">🖨️</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-600 mt-1.5">
                {printingOrders.length}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Đang chạy xưởng</p>
            </div>

            {/* Gia công */}
            <div
              onClick={() => setActiveTab('finishing')}
              className="p-3.5 rounded-2xl border bg-white border-neutral-200/80 hover:border-purple-300 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-neutral-600">Gia công dán</span>
                <span className="text-xs">✂️</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-purple-700 mt-1.5">
                {finishingOrders.length + printedOrders.length}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Dán đáy, bế quai</p>
            </div>

            {/* Hoàn thành */}
            <div
              onClick={() => setActiveTab('completed')}
              className="p-3.5 rounded-2xl border bg-white border-neutral-200/80 hover:border-emerald-300 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-700">Hoàn thành</span>
                <span className="text-xs">✅</span>
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1.5">
                {completedOrders.length}
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Xuất xưởng</p>
            </div>
          </div>
        )}
      </div>

      {/* 4. RECENT & PRIORITY ORDERS (MOBILE-OPTIMIZED LIST) */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-neutral-900">
              {isPrinter ? 'Lệnh In Của Bạn' : isFinisher ? 'Đơn Gia Công Gần Đây' : 'Lệnh Sản Xuất Gần Đây'}
            </h3>
            <p className="text-xs text-neutral-500">
              {isPrinter
                ? 'Các lệnh sản xuất được phân công cho máy in của bạn'
                : isFinisher
                ? 'Các đơn đã in xong cần dán túi hoặc đang đóng gói'
                : 'Theo dõi tiến độ và thông số kỹ thuật từng lệnh'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab(isPrinter ? 'waiting_print' : isFinisher ? 'printed' : 'all')}
            className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 active:scale-95 text-neutral-800 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 min-h-[36px] flex items-center gap-1"
          >
            <span>Xem tất cả</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {displayedOrders.length === 0 ? (
          <div className="text-center py-8 text-neutral-400 text-xs font-medium">
            Hiện không có lệnh nào cần xử lý.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {displayedOrders.slice(0, 6).map((order) => {
              const firstItem = order.items?.[0];
              return (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="py-3 hover:bg-neutral-50/80 rounded-xl px-1.5 sm:px-2 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Bag Thumbnail */}
                    <ResolvedImage
                      image={firstItem?.image}
                      legacyUrl={firstItem?.imageUrl}
                      fallbackUrl="https://images.unsplash.com/photo-1509440159596-0249088772ff?w=120"
                      alt="bag"
                      className="w-12 h-12 rounded-xl object-cover border border-neutral-200 shrink-0 bg-neutral-100"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm text-neutral-900">
                          #{order.code}
                        </span>
                        {order.isUrgent && (
                          <span className="text-[10px] font-black text-white bg-red-600 px-1.5 py-0.5 rounded-md animate-pulse">
                            🔥 GẤP
                          </span>
                        )}
                        <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md">
                          {order.totalSheets.toLocaleString('vi-VN')} tờ
                        </span>
                        <span className="text-xs text-neutral-500 font-medium">
                          {order.paperWidth}×{order.paperHeight}cm
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-neutral-700">
                          {order.paperType} {order.paperGsm}
                        </span>
                        <span>•</span>
                        <span className="text-neutral-500">
                          Màu: <b>{order.color}</b>
                        </span>
                        <span>•</span>
                        <span className="text-neutral-500">
                          Thợ: {order.printerName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Status Badges */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 flex-wrap">
                    {/* Plate Status pill */}
                    {order.plateStatus === 'NOT_SENT' && (
                      <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                        🔴 Chưa kẽm
                      </span>
                    )}
                    {order.plateStatus === 'SENT' && (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                        🟡 Chờ kẽm
                      </span>
                    )}
                    {(order.plateStatus === 'RECEIVED' || order.plateStatus === 'OLD_PLATE') && (
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                        🟢 Đã có kẽm
                      </span>
                    )}

                    {/* Production Status pill */}
                    {order.status === 'WAITING_ACCEPTANCE' && (
                      <span className="text-[11px] font-bold text-orange-800 bg-orange-100 px-2 py-0.5 rounded-lg">
                        Chờ nhận
                      </span>
                    )}
                    {order.status === 'WAITING_PRINT' && (
                      <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-lg">
                        Chờ in
                      </span>
                    )}
                    {order.status === 'PRINTING' && (
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg animate-pulse">
                        Đang in
                      </span>
                    )}
                    {order.status === 'PRINTED' && (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg">
                        Chờ dán túi
                      </span>
                    )}
                    {order.status === 'FINISHING' && (
                      <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-lg">
                        Đang gia công
                      </span>
                    )}
                    {order.status === 'COMPLETED' && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                        Đã xong
                      </span>
                    )}
                    {order.issues?.some(i => i.status === 'OPEN') && (
                      <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg">
                        Sự cố
                      </span>
                    )}

                    <div className="p-1 text-neutral-400 hover:text-neutral-700">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

    </div>
  );
};
