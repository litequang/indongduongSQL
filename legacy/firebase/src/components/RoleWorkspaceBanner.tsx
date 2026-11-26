import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Printer,
  Scissors,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  TrendingUp,
  PackageCheck,
  Plus,
  ArrowRight,
  ShieldAlert,
  Zap,
  Activity,
  Layers,
  Check
} from 'lucide-react';

interface RoleWorkspaceBannerProps {
  onOpenIssueModal?: (orderId: string) => void;
  onOpenFinishPrintModal?: (orderId: string) => void;
}

export const RoleWorkspaceBanner: React.FC<RoleWorkspaceBannerProps> = ({
  onOpenIssueModal,
  onOpenFinishPrintModal
}) => {
  const {
    currentUser,
    orders,
    setActiveTab,
    acceptOrder,
    setSelectedOrder
  } = useApp();

  // ==========================================
  // 1. Role: PRINTER (Thợ In)
  // ==========================================
  if (currentUser.role === 'PRINTER') {
    const myOrders = orders.filter(o => o.printerId === currentUser.id);
    const pendingCancels = myOrders.filter(o => o.cancellationRequest?.status === 'PENDING' && o.status !== 'CANCELLED');
    const unaccepted = myOrders.filter(o => o.status === 'WAITING_ACCEPTANCE');
    const printing = myOrders.filter(o => o.status === 'PRINTING');
    const waitingToPrint = myOrders.filter(o => o.status === 'WAITING_PRINT' || (o.status === 'ACCEPTED' && (o.plateStatus === 'RECEIVED' || o.plateStatus === 'OLD_PLATE')));
    const printedToday = myOrders.filter(o => o.status === 'PRINTED' || o.status === 'COMPLETED' || o.status === 'FINISHING');
    const totalPrintedSheetsToday = printedToday.reduce((sum, o) => sum + (o.actualPrintedSheets || o.totalSheets || 0), 0);

    return (
      <div className="space-y-2.5">
        {/* Pending Cancellation Urgent Callout */}
        {pendingCancels.length > 0 && (
          <div className="bg-red-600 text-white p-3 sm:p-3.5 rounded-2xl border border-red-500 flex items-center justify-between gap-2.5 shadow-md animate-pulse">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0">🚨</span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-black tracking-wider text-red-200">
                  CẢNH BÁO DỪNG MÁY / HỦY LỆNH
                </p>
                <p className="text-xs sm:text-sm font-black truncate">
                  Lệnh #{pendingCancels.map(p => p.code).join(', #')} có yêu cầu dừng in
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedOrder(pendingCancels[0])}
              className="px-3 py-1.5 bg-white text-red-700 font-black text-xs rounded-xl shadow-xs cursor-pointer hover:bg-neutral-100 shrink-0"
            >
              Kiểm tra ngay
            </button>
          </div>
        )}

        {/* Compact Modern Stat Tiles for Printer */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Chờ nhận */}
          <button
            type="button"
            onClick={() => setActiveTab('unaccepted')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              unaccepted.length > 0
                ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold shadow-xs ring-2 ring-amber-400/40'
                : 'bg-white text-neutral-700 border-neutral-200/80 hover:bg-neutral-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold opacity-80 flex items-center gap-1.5">
                {unaccepted.length > 0 && <span className="w-2 h-2 rounded-full bg-neutral-950 animate-ping"></span>}
                Chờ nhận lệnh
              </span>
              <span className="text-xs">📥</span>
            </div>
            <span className="text-lg sm:text-xl font-black mt-1">
              {unaccepted.length} <span className="text-xs font-semibold opacity-70">lệnh</span>
            </span>
          </button>

          {/* Sẵn sàng in */}
          <button
            type="button"
            onClick={() => setActiveTab('waiting_print')}
            className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-500">Sẵn sàng in</span>
              <span className="text-xs">⏳</span>
            </div>
            <span className="text-lg sm:text-xl font-black text-neutral-900 mt-1">
              {waitingToPrint.length} <span className="text-xs font-semibold text-neutral-400">lệnh</span>
            </span>
          </button>

          {/* Đang in */}
          <button
            type="button"
            onClick={() => setActiveTab('printing')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              printing.length > 0
                ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                : 'bg-white text-neutral-800 border-neutral-200/80 hover:bg-neutral-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold ${printing.length > 0 ? 'text-blue-100' : 'text-neutral-500'}`}>
                Đang in máy
              </span>
              <span className="text-xs">🖨️</span>
            </div>
            <span className="text-lg sm:text-xl font-black mt-1">
              {printing.length} <span className="text-xs font-semibold opacity-80">lệnh</span>
            </span>
          </button>

          {/* Đã in hôm nay */}
          <button
            type="button"
            onClick={() => setActiveTab('printed')}
            className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700">Đã in hôm nay</span>
              <span className="text-xs">✅</span>
            </div>
            <span className="text-lg sm:text-xl font-black text-emerald-700 mt-1">
              {totalPrintedSheetsToday.toLocaleString('vi-VN')} <span className="text-xs font-semibold text-emerald-600">tờ</span>
            </span>
          </button>
        </div>

        {/* Quick Action when unaccepted or printing */}
        {unaccepted.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-current" />
                LỆNH MỚI CẦN NHẬN NGAY:
              </span>
              <span className="text-amber-800">{unaccepted.length} lệnh</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {unaccepted.slice(0, 2).map(ord => (
                <div
                  key={ord.id}
                  className="bg-white border border-amber-100 text-neutral-900 rounded-xl p-2.5 shadow-2xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-neutral-900 truncate">
                      #{ord.code} • {ord.totalSheets.toLocaleString('vi-VN')} tờ
                    </p>
                    <p className="text-[11px] text-neutral-500 truncate">
                      {ord.paperType} {ord.paperGsm} ({ord.paperWidth}×{ord.paperHeight}cm)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => acceptOrder(ord.id)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 text-xs font-black rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer min-h-[34px]"
                  >
                    Nhận lệnh
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : printing.length > 0 ? (
          <div className="bg-white text-neutral-900 rounded-2xl p-3 sm:p-3.5 shadow-xs border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200">
                <Printer className="w-4 h-4 animate-pulse text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                    ĐANG IN
                  </span>
                  <span className="text-xs font-black text-neutral-900 truncate">
                    #{printing[0].code} — {printing[0].totalSheets.toLocaleString('vi-VN')} tờ {printing[0].paperType} {printing[0].paperGsm}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                  Màu: <b>{printing[0].color}</b> • Khổ: {printing[0].paperWidth}×{printing[0].paperHeight}cm
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => setSelectedOrder(printing[0])}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-xl transition-colors cursor-pointer min-h-[36px]"
              >
                Chi tiết
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrder(printing[0])}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer min-h-[36px]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Báo in xong</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ==========================================
  // 2. Role: FINISHER (Tổ Gia Công)
  // ==========================================
  if (currentUser.role === 'FINISHER') {
    const printedWaiting = orders.filter(o => o.status === 'PRINTED');
    const finishingInProgress = orders.filter(o => o.status === 'FINISHING');
    const completedToday = orders.filter(o => o.status === 'COMPLETED');

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('printed')}
          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
            printedWaiting.length > 0
              ? 'bg-purple-600 text-white border-purple-700 font-bold shadow-xs ring-2 ring-purple-400/30'
              : 'bg-white text-neutral-800 border-neutral-200/80 hover:bg-neutral-50 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-bold ${printedWaiting.length > 0 ? 'text-purple-100' : 'text-neutral-500'} flex items-center gap-1`}>
              {printedWaiting.length > 0 && <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>}
              Chờ gia công
            </span>
            <span className="text-xs">✂️</span>
          </div>
          <span className="text-lg sm:text-xl font-black mt-1">
            {printedWaiting.length} <span className="text-xs font-semibold opacity-80">đơn</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('finishing')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-neutral-500">Đang dán túi / bế</span>
            <span className="text-xs">📦</span>
          </div>
          <span className="text-lg sm:text-xl font-black text-purple-700 mt-1">
            {finishingInProgress.length} <span className="text-xs font-semibold text-neutral-400">đơn</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700">Đã hoàn thành</span>
            <span className="text-xs">✅</span>
          </div>
          <span className="text-lg sm:text-xl font-black text-emerald-700 mt-1">
            {completedToday.length} <span className="text-xs font-semibold text-emerald-600">đơn</span>
          </span>
        </button>
      </div>
    );
  }

  // ==========================================
  // 3. Role: SALE (Kinh Doanh)
  // ==========================================
  if (currentUser.role === 'SALE') {
    const totalActive = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
    const completedToday = orders.filter(o => o.status === 'COMPLETED').length;
    const printingCount = orders.filter(o => o.status === 'PRINTING').length;
    const finishingCount = orders.filter(o => o.status === 'FINISHING').length;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-neutral-500">Đang sản xuất</span>
          <span className="text-lg sm:text-xl font-black text-neutral-900 mt-1">{totalActive} đơn</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('printing')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-amber-700">Đang in máy</span>
          <span className="text-lg sm:text-xl font-black text-amber-700 mt-1">{printingCount} đơn</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('finishing')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-purple-700">Đang dán túi</span>
          <span className="text-lg sm:text-xl font-black text-purple-700 mt-1">{finishingCount} đơn</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-emerald-700">Đã xong xuất xưởng</span>
          <span className="text-lg sm:text-xl font-black text-emerald-700 mt-1">{completedToday} đơn</span>
        </button>
      </div>
    );
  }

  // ==========================================
  // 4. Role: DEVELOPER (Kỹ Thuật)
  // ==========================================
  if (currentUser.role === 'DEVELOPER') {
    const issues = orders.filter(o => o.issues?.some(i => i.status === 'OPEN')).length;
    const printing = orders.filter(o => o.status === 'PRINTING').length;
    const finishing = orders.filter(o => o.status === 'FINISHING').length;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-neutral-500">Tổng lệnh in</span>
          <span className="text-lg font-black text-neutral-900 mt-1">{orders.length} đơn</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('printing')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-amber-700">Đang in máy</span>
          <span className="text-lg font-black text-amber-700 mt-1">{printing} đơn</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('finishing')}
          className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
        >
          <span className="text-[11px] font-bold text-purple-700">Gia công dán</span>
          <span className="text-lg font-black text-purple-700 mt-1">{finishing} đơn</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('issue')}
          className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer flex flex-col justify-between shadow-2xs ${
            issues > 0 ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-neutral-200/80 text-emerald-700'
          }`}
        >
          <span className="text-[11px] font-bold opacity-80">Sự cố kỹ thuật</span>
          <span className="text-lg font-black mt-1">{issues > 0 ? `⚠️ ${issues} sự cố` : '🟢 Ổn định'}</span>
        </button>
      </div>
    );
  }

  // ==========================================
  // 5. Role: ADMIN & MANAGER (Quản Lý / Sếp)
  // ==========================================
  if (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') {
    const pendingCancels = orders.filter(o => o.cancellationRequest?.status === 'PENDING' && o.status !== 'CANCELLED').length;
    const missingPlates = orders.filter(o => o.plateStatus === 'NOT_SENT').length;
    const issues = orders.filter(o => o.issues?.some(i => i.status === 'OPEN')).length;
    const unaccepted = orders.filter(o => o.status === 'WAITING_ACCEPTANCE').length;
    const printing = orders.filter(o => o.status === 'PRINTING').length;
    const finishing = orders.filter(o => o.status === 'FINISHING').length;

    return (
      <div className="space-y-2.5">
        {/* Urgent Alerts Row if any */}
        {(pendingCancels > 0 || issues > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-red-800 min-w-0">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-bold truncate">
                {pendingCancels > 0 && `${pendingCancels} yêu cầu dừng/hủy lệnh`}
                {pendingCancels > 0 && issues > 0 && ' • '}
                {issues > 0 && `${issues} sự cố sản xuất`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('issue')}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shrink-0 cursor-pointer text-[11px]"
            >
              Xem ngay
            </button>
          </div>
        )}

        {/* Compact Modern Stat Tiles for Admin */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {/* Chưa gửi kẽm */}
          <button
            type="button"
            onClick={() => setActiveTab('not_sent_plate')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              missingPlates > 0
                ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100/80 ring-1 ring-red-300'
                : 'bg-white border-neutral-200/80 text-neutral-800 hover:bg-neutral-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold opacity-80">Chưa gửi kẽm</span>
              <span className="text-xs">🔴</span>
            </div>
            <span className="text-lg sm:text-xl font-black mt-1">
              {missingPlates} <span className="text-xs font-semibold opacity-70">lệnh</span>
            </span>
          </button>

          {/* Chờ thợ nhận */}
          <button
            type="button"
            onClick={() => setActiveTab('unaccepted')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
              unaccepted > 0
                ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80 ring-1 ring-amber-300'
                : 'bg-white border-neutral-200/80 text-neutral-800 hover:bg-neutral-50 shadow-2xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold opacity-80">Chờ thợ nhận</span>
              <span className="text-xs">🟠</span>
            </div>
            <span className="text-lg sm:text-xl font-black mt-1">
              {unaccepted} <span className="text-xs font-semibold opacity-70">lệnh</span>
            </span>
          </button>

          {/* Đang in máy */}
          <button
            type="button"
            onClick={() => setActiveTab('printing')}
            className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 hover:bg-neutral-50 text-left transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-500">Đang in máy</span>
              <span className="text-xs">🖨️</span>
            </div>
            <span className="text-lg sm:text-xl font-black text-blue-600 mt-1">
              {printing} <span className="text-xs font-semibold text-neutral-400">lệnh</span>
            </span>
          </button>

          {/* Đang gia công */}
          <button
            type="button"
            onClick={() => setActiveTab('finishing')}
            className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 hover:bg-neutral-50 text-left transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-500">Đang gia công</span>
              <span className="text-xs">✂️</span>
            </div>
            <span className="text-lg sm:text-xl font-black text-purple-600 mt-1">
              {finishing} <span className="text-xs font-semibold text-neutral-400">lệnh</span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 6. Role: DESIGNER (Thiết Kế)
  // ==========================================
  const missingPlates = orders.filter(o => o.plateStatus === 'NOT_SENT');
  const draftsCount = orders.filter(o => o.status === 'DRAFT').length;
  const unaccepted = orders.filter(o => o.status === 'WAITING_ACCEPTANCE');
  const printingCount = orders.filter(o => o.status === 'PRINTING').length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <button
        type="button"
        onClick={() => setActiveTab('not_sent_plate')}
        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
          missingPlates.length > 0
            ? 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100/80 ring-1 ring-red-300'
            : 'bg-white border-neutral-200/80 text-neutral-800 hover:bg-neutral-50 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold opacity-80 flex items-center gap-1">
            {missingPlates.length > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>}
            Chưa gửi kẽm
          </span>
          <span className="text-xs">🔴</span>
        </div>
        <span className="text-lg sm:text-xl font-black mt-1">
          {missingPlates.length} <span className="text-xs font-semibold opacity-70">lệnh</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('drafts')}
        className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-neutral-500">Lệnh nháp tạm</span>
          <span className="text-xs">📝</span>
        </div>
        <span className="text-lg sm:text-xl font-black text-neutral-900 mt-1">
          {draftsCount} <span className="text-xs font-semibold text-neutral-400">lệnh</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('unaccepted')}
        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
          unaccepted.length > 0
            ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100/80'
            : 'bg-white border-neutral-200/80 text-neutral-800 hover:bg-neutral-50 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold opacity-80">Chờ thợ nhận</span>
          <span className="text-xs">⏳</span>
        </div>
        <span className="text-lg sm:text-xl font-black mt-1">
          {unaccepted.length} <span className="text-xs font-semibold opacity-70">lệnh</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setActiveTab('printing')}
        className="p-3 rounded-2xl border bg-white border-neutral-200/80 text-neutral-800 text-left hover:bg-neutral-50 transition-all cursor-pointer flex flex-col justify-between shadow-2xs"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-neutral-500">Đang in máy</span>
          <span className="text-xs">🖨️</span>
        </div>
        <span className="text-lg sm:text-xl font-black text-blue-600 mt-1">
          {printingCount} <span className="text-xs font-semibold text-neutral-400">lệnh</span>
        </span>
      </button>
    </div>
  );
};
