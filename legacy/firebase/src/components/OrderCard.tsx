import React, { useState } from 'react';
import {
  ProductionOrder,
  PlateStatus,
  ProductionStatus
} from '../types';
import { useApp } from '../context/AppContext';
import { formatRelativeTime, getMinutesSince, getTodayFormatted } from '../utils/dateUtils';
import { canAcceptPrintJob, canCreateProductionOrder, canDeleteOrder, canFinishPrinting, canManageFinishing, canRequestProductionCancellation, canStartPrinting, canToggleUrgent, hasProductionTechnicalAuthority, isPrinter } from '../permissions';
import {
  AlertTriangle,
  Clock,
  Printer,
  Layers,
  MessageSquare,
  Copy,
  Scissors,
  CheckCircle2,
  Play,
  ArrowRight,
  AlertCircle,
  Eye,
  Send,
  ChevronDown,
  ChevronUp,
  User,
  ZoomIn,
  Ban,
  XCircle,
  PackageCheck,
  HelpCircle,
  Check,
  X,
  Sparkles,
  Flame,
  Trash2
} from 'lucide-react';
import { OpenIssueTransitionModal, TransitionIssue } from './OpenIssueTransitionModal';
import { ResolvedImage } from './ResolvedImage';

interface OrderCardProps {
  order: ProductionOrder;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onOpenIssueModal?: (order: ProductionOrder) => void;
  onOpenFinishPrintModal?: (order: ProductionOrder) => void;
  onOpenFinishingModal?: (order: ProductionOrder) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  isExpanded: controlledExpanded,
  onToggleExpand,
  onOpenIssueModal,
  onOpenFinishPrintModal,
  onOpenFinishingModal
}) => {
  const {
    currentUser,
    setSelectedOrder,
    setPreviewImage,
    isOrderSelected,
    toggleSelectOrder,
    dispatchOrder,
    deleteDraftOrder,
    acceptOrder,
    acknowledgeProductionRevision,
    startPrinting,
    startPrintingDirect,
    updatePlateStatus,
    reportMissingOrDamagedPlate,
    reissueNewPlate,
    confirmPlateReceived,
    requestCancelOrder,
    respondCancelOrder,
    startFinishing,
    completeFinishing,
    duplicateOrder,
    toggleUrgentOrder,
    addComment,
    resolveIssue,
    deleteOrder,
    appConfig
  } = useApp();

  const [internalExpanded, setInternalExpanded] = useState(false);
  const [quickComment, setQuickComment] = useState('');
  
  // Cancel Request Dialog state
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');

  // Reject Cancel Dialog state
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('Đã in xong / đang chạy máy');

  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const [isProcessing, setIsProcessing] = useState(false);
  const [productionTransition, setProductionTransition] = useState<{ title: string; action: () => Promise<void> } | null>(null);
  const wrapAction = (action: () => Promise<void> | void) => async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await action();
    } catch(err) {
      // errors are handled in AppContext, just release lock
    } finally {
      setIsProcessing(false);
    }
  };

  const withProductionIssueChoice = async (title: string, action: () => Promise<void>) => {
    if (order.issues?.some((issue) => issue.status === 'OPEN')) {
      setProductionTransition({ title, action });
      return;
    }
    await action();
  };
  const handleAcceptOrder = wrapAction(() => withProductionIssueChoice('nhận lệnh', () => acceptOrder(order.id)));
  const handleAcknowledgeRevision = wrapAction(() => acknowledgeProductionRevision(order.id));
  const handleStartPrintingDirect = wrapAction(() => withProductionIssueChoice('bắt đầu in', () => startPrintingDirect(order.id)));
  const handleConfirmPlateReceived = wrapAction(() => confirmPlateReceived(order.id));
  const handleReissueNewPlate = wrapAction(() => reissueNewPlate(order.id));
  const handleToggleUrgentOrder = wrapAction(() => toggleUrgentOrder(order.id, !order.isUrgent));
  const handleDeleteOrder = wrapAction(async () => {
      if (window.confirm('Bạn có chắc chắn muốn xóa đơn hàng DRAFT này không?')) {
          deleteOrder(order.id);
      }
  });

  const minutesOld = getMinutesSince(order.createdAt);
  const isUnacceptedDelayed = order.status === 'WAITING_ACCEPTANCE' && minutesOld > 30;
  const isMissingPlateDelayed = order.plateStatus === 'NOT_SENT' && minutesOld > 30;
  const hasAcknowledgedLatestRevision = (order.printerAcknowledgedRevision || 0) >= Math.max(1, order.productionRevision || 1);
  const hasPendingCancel = order.cancellationRequest?.status === 'PENDING';

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickComment.trim()) return;
    addComment(order.id, quickComment.trim());
    setQuickComment('');
  };

  const handleConfirmCancelRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReasonInput.trim()) {
      alert('Vui lòng nhập lý do hủy lệnh (vd: Khách đổi kích thước, tạm dừng...)');
      return;
    }
    requestCancelOrder(order.id, cancelReasonInput.trim());
    setIsCancelDialogOpen(false);
    setCancelReasonInput('');
  };

  const handleConfirmRejectCancel = (e: React.FormEvent) => {
    e.preventDefault();
    respondCancelOrder(order.id, false, rejectReasonInput.trim() || 'Đã in xong / đang chạy máy');
    setIsRejectDialogOpen(false);
  };

  // Status visual badge
  const getStatusBadge = () => {
    if (order.status === 'CANCELLED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-neutral-900 text-white shrink-0">
          <Ban className="w-3 h-3 text-red-400" />
          ĐÃ HỦY
        </span>
      );
    }

    if (hasPendingCancel) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-red-600 text-white animate-pulse shadow-xs shrink-0">
          <Ban className="w-3 h-3" />
          BÁO HỦY
        </span>
      );
    }

    switch (order.status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 shrink-0">
            <Clock className="w-3 h-3 text-amber-700" />
            Lệnh tạm
          </span>
        );
      case 'WAITING_ACCEPTANCE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-orange-100 text-orange-900 border border-orange-200 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
            Chờ thợ nhận
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Thợ đã nhận
          </span>
        );
      case 'WAITING_PRINT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
            Sẵn sàng in
          </span>
        );
      case 'PRINTING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-blue-600 text-white shadow-xs shrink-0">
            <Printer className="w-3 h-3 animate-pulse" />
            Đang in
          </span>
        );
      case 'PRINTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Đã in xong
          </span>
        );
      case 'FINISHING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 shrink-0">
            <Scissors className="w-3 h-3 text-purple-600" />
            Gia công
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-600 text-white shrink-0">
            <CheckCircle2 className="w-3 h-3" />
            Hoàn thành
          </span>
        );
      /* case 'ISSUE': removed */
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-rose-600 text-white animate-pulse shrink-0">
            <AlertTriangle className="w-3 h-3" />
            CÓ SỰ CỐ
          </span>
        );
      default:
        return null;
    }
  };

  // Plate Status visual badge
  const getPlateBadge = () => {
    // Hide standard plate status badges if the order is already actively producing or done
    // because at that point, the primary status is enough and plate info is no longer a blocker.
    const isActivelyProducing = ['PRINTING', 'PRINTED', 'FINISHING', 'COMPLETED'].includes(order.status);

    switch (order.plateStatus) {
      case 'PLATE_DAMAGED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-black text-rose-800 bg-rose-100 border border-rose-300 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0 animate-pulse">
            <span>🚨 Hỏng kẽm</span>
          </span>
        );
      case 'NOT_SENT':
        if (isActivelyProducing) return null;
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-red-700 bg-red-100/80 border border-red-200 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
            <span>Chưa kẽm</span>
          </span>
        );
      case 'SENT':
        if (isActivelyProducing) return null;
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-amber-800 bg-amber-100/70 border border-amber-200 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
            <span>Đã gửi kẽm</span>
          </span>
        );
      case 'RECEIVED':
        if (isActivelyProducing) return null;
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-emerald-800 bg-emerald-100/70 border border-emerald-200 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
            <span>Có kẽm</span>
          </span>
        );
      case 'OLD_PLATE':
        if (isActivelyProducing) return null;
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0" title={`Bản kẽm cũ ngày ${order.originalPlateDate || order.plateDate}`}>
            <span>Kẽm cũ</span>
          </span>
        );
      case 'NOT_REQUIRED':
        if (isActivelyProducing) return null;
        return (
          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium text-neutral-600 bg-neutral-100 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
            <span>Không kẽm</span>
          </span>
        );
    }
    return null;
  };

  const firstItem = order.items[0];

  return (
    <div
      id={`order-accordion-${order.code}`}
      className={`bg-white rounded-2xl sm:rounded-3xl border transition-all duration-150 overflow-hidden shadow-xs hover:shadow-md ${
        hasPendingCancel
          ? 'border-red-500 ring-4 ring-red-500/20 bg-red-50/10'
          : order.status === 'CANCELLED'
          ? 'border-neutral-300 opacity-75 bg-neutral-100/50'
          : order.issues?.some(i => i.status === 'OPEN')
          ? 'border-rose-300 ring-2 ring-rose-400/20'
          : order.plateStatus === 'NOT_SENT'
          ? 'border-red-300'
          : isExpanded
          ? 'border-amber-400 ring-2 ring-amber-400/10'
          : 'border-neutral-200/90'
      }`}
    >
      
      {/* If Order is Cancelled */}
      {order.status === 'CANCELLED' && (
        <div className="bg-neutral-900 text-neutral-300 px-4 py-2 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-white font-bold">
            <Ban className="w-4 h-4 text-red-400" />
            <span>LỆNH ĐÃ ĐƯỢC HỦY SẢN XUẤT</span>
          </span>
          <span className="text-neutral-400 text-[11px]">
            {order.cancellationRequest?.responseReason || order.cancellationRequest?.reason || 'Hủy theo yêu cầu'}
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. MINIMALIST 2-LINE ROW (LEFT: IMAGE, RIGHT: 2 CLEAN LINES) */}
      {/* ========================================================================= */}
      <div
        onClick={toggleExpand}
        className={`p-3 sm:p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
          isExpanded ? 'bg-amber-50/40 border-b border-amber-200/60' : 'hover:bg-neutral-50/80'
        }`}
      >
        {/* Left Side: Multi-Select + Thumbnail Image */}
        <div className="flex items-center gap-2.5 shrink-0">
          
          {/* Multi-Select Checkbox for Designers and Admins */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              toggleSelectOrder(order.id);
            }}
            className="p-0.5 cursor-pointer shrink-0"
            title={isOrderSelected(order.id) ? 'Bỏ chọn lệnh này' : 'Chọn lệnh này để xử lý hàng loạt'}
          >
            <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
              isOrderSelected(order.id)
                ? 'bg-amber-500 border-amber-600 text-white shadow-xs scale-105'
                : 'border-neutral-300 hover:border-amber-400 bg-white'
            }`}>
              {isOrderSelected(order.id) && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
          </div>

          {/* Bag Design Thumbnail (Click to zoom) */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              const resolved = e.currentTarget.querySelector('img')?.src || firstItem?.imageUrl;
              if (resolved) setPreviewImage(resolved);
            }}
            className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-neutral-100 border border-neutral-300 overflow-hidden shrink-0 group/img cursor-pointer shadow-2xs"
            title="Bấm để phóng to ảnh mẫu"
          >
            <ResolvedImage
              image={firstItem?.image}
              legacyUrl={firstItem?.imageUrl}
              alt={order.code}
              className="w-full h-full object-cover group-hover/img:scale-110 transition-transform"
              referrerPolicy="no-referrer"
            />
            {order.items.length > 1 && (
              <span className="absolute bottom-0 right-0 bg-neutral-900/85 text-white text-[9px] font-black px-1 rounded-tl">
                +{order.items.length - 1}
              </span>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
              <ZoomIn className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Center: EXACT 2 CLEAN LINES */}
        <div className="min-w-0 flex-1 flex flex-col justify-center gap-1 overflow-hidden">
          
          {/* DÒNG 1: Mã lệnh + Tên sản phẩm + Số lượng */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="text-xs sm:text-sm md:text-base font-black text-neutral-950 tracking-tight shrink-0">
              #{order.code}
            </span>

            {order.isUrgent && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-red-600 text-white shadow-2xs animate-pulse shrink-0">
                <Flame className="w-2.5 h-2.5 fill-current" />
                <span>GẤP</span>
              </span>
            )}

            {/* Tên sản phẩm */}
            <span className="text-xs sm:text-sm font-bold text-neutral-800 truncate flex-1 min-w-0">
              {order.productName || (firstItem ? (firstItem.productName || firstItem.customerName || 'Túi bánh mì') : 'Túi bánh mì')}
            </span>

            {/* Số lượng */}
            <span className="text-[11px] sm:text-xs font-black text-amber-950 bg-amber-100/90 border border-amber-300/80 px-1.5 sm:px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap">
              {order.totalSheets.toLocaleString('vi-VN')} tờ
            </span>

            {order.paperType && (
              <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-1.5 py-0.2 rounded hidden lg:inline-block shrink-0">
                {order.paperType} {order.paperGsm}
              </span>
            )}
          </div>

          {/* DÒNG 2: Các trạng thái của lệnh + Thợ in */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-neutral-600 min-w-0 overflow-x-hidden">
            {/* Cảnh báo sự cố (Tag nhỏ ở đầu) */}
            {order.issues && order.issues.some(i => i.status === 'OPEN') && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black bg-rose-600 text-white animate-pulse shadow-xs shrink-0">
                <AlertTriangle className="w-3 h-3" />
                Sự Cố
              </span>
            )}
            
            {/* Trạng thái sản xuất */}
            {getStatusBadge()}

            {/* Trạng thái bản kẽm */}
            {getPlateBadge()}

            {/* Thợ phụ trách: FINISHING hiển thị Finisher, COMPLETED không hiển thị người phụ trách hiện hành */}
            {order.status === 'COMPLETED' ? null : order.status === 'FINISHING' ? (
              order.finishing?.finisherName && (
                <span className="font-bold text-neutral-800 bg-neutral-100 border border-neutral-200/80 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs flex items-center gap-1 shrink-0 truncate max-w-[110px] sm:max-w-[160px]" title="Thợ gia công">
                  <Scissors className="w-3 h-3 text-neutral-600 shrink-0" />
                  <span className="truncate">@{order.finishing.finisherName}</span>
                </span>
              )
            ) : (
              order.printerName && (
                <span className="font-bold text-neutral-800 bg-neutral-100 border border-neutral-200/80 px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-xs flex items-center gap-1 shrink-0 truncate max-w-[110px] sm:max-w-[160px]" title="Thợ in">
                  <Printer className="w-3 h-3 text-neutral-600 shrink-0" />
                  <span className="truncate">@{order.printerName}</span>
                </span>
              )
            )}

            {order.comments.length > 0 && (
              <span className="text-blue-600 font-bold flex items-center gap-0.5 text-[10px] sm:text-[11px] shrink-0">
                <MessageSquare className="w-3 h-3" />
                {order.comments.length}
              </span>
            )}
          </div>

        </div>

        {/* Right Side: Quick Action Button & Expand Chevron */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          
          {/* Workflow V2 single-draft fallback; batch send remains primary. */}
          {order.status === 'DRAFT' && hasProductionTechnicalAuthority(currentUser) && (
            <button
              onClick={() => dispatchOrder(order.id, { markPlateAsSent: false })}
              className="px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-98 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
              title="Gửi draft này sang sản xuất"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gửi sản xuất</span>
              <span className="sm:hidden">Gửi SX</span>
            </button>
          )}

          {/* Quick printer action */}
          {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && order.status !== 'PRINTED' && !hasPendingCancel && (
            <>
              {order.status === 'WAITING_ACCEPTANCE' && currentUser.role === 'PRINTER' && order.printerId === currentUser.id && canAcceptPrintJob(currentUser, order, appConfig) && (
                <button
                  onClick={handleAcceptOrder} disabled={isProcessing}
                  className="px-2.5 sm:px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Nhận lệnh</span>
                </button>
              )}

              {(order.status === 'ACCEPTED' || order.status === 'WAITING_PRINT') && currentUser.role === 'PRINTER' && order.printerId === currentUser.id && !hasAcknowledgedLatestRevision && canStartPrinting(currentUser, order, appConfig) && (
                <button
                  onClick={handleAcknowledgeRevision} disabled={isProcessing}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Xác nhận hướng dẫn</span>
                </button>
              )}

              {(order.status === 'ACCEPTED' || order.status === 'WAITING_PRINT') && currentUser.role === 'PRINTER' && order.printerId === currentUser.id && hasAcknowledgedLatestRevision && canStartPrinting(currentUser, order, appConfig) && (
                <button
                  onClick={handleStartPrintingDirect} disabled={isProcessing}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                  title="Bấm để bắt đầu in ngay (Tự động xác nhận có kẽm)"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Bắt đầu in</span>
                </button>
              )}

              {order.status === 'PRINTING' && currentUser.role === 'PRINTER' && order.printerId === currentUser.id && canFinishPrinting(currentUser, order, appConfig) && (
                <button
                  onClick={() => onOpenFinishPrintModal && onOpenFinishPrintModal(order)}
                  className="px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>In xong</span>
                </button>
              )}
            </>
          )}

          {/* Expand Chevron Icon */}
          <button
            onClick={toggleExpand}
            className="p-1.5 text-neutral-400 hover:text-amber-700 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer shrink-0"
            title={isExpanded ? 'Thu gọn' : 'Xem chi tiết lệnh'}
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-amber-600 stroke-[2.5]" />
            ) : (
              <ChevronDown className="w-5 h-5 stroke-[2.5]" />
            )}
          </button>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2. ACCORDION BODY (FULL DETAILS - UNFOLDS WHEN CLICKED) */}
      {/* ========================================================================= */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4 bg-neutral-50/40 animate-in fade-in duration-150 border-t border-neutral-100">
          
          {/* Draft Notification & Actions for Designers */}
          {order.status === 'DRAFT' && (
            <div className="bg-amber-500 text-amber-950 p-3.5 sm:p-4 rounded-2xl border border-amber-600 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/30 flex items-center justify-center text-lg font-black shrink-0">
                  📋
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-950">
                    LỆNH IN ĐANG Ở TRẠNG THÁI TẠM THỜI (CHƯA GỬI QUA THỢ IN)
                  </h4>
                  <p className="text-xs font-medium text-amber-900 mt-0.5">
                    Thợ in @{order.printerName} chưa nhìn thấy lệnh này. Bạn có thể kiểm tra kỹ, tạo thêm các lệnh khác rồi chọn gửi hàng loạt, hoặc xóa nháp để ghép lại bản in mới nếu cần.
                  </p>
                </div>
              </div>

              {hasProductionTechnicalAuthority(currentUser) && (
                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    onClick={() => dispatchOrder(order.id)}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>GỬI CHO THỢ IN NGAY</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Bạn có chắc muốn xóa lệnh nháp #${order.code} để ghép lại?`)) {
                        deleteDraftOrder(order.id);
                      }
                    }}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa nháp ghép lại</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick Plate Management & Direct Print Bar for Printers */}
          {order.status !== 'CANCELLED' && currentUser.role === 'PRINTER' && order.printerId === currentUser.id && order.status !== 'PRINTED' && order.status !== 'COMPLETED' && (
            <div className="bg-white p-3.5 rounded-2xl border border-blue-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-blue-600" />
                  Khu vực thao tác thợ in:
                </span>
                <span className="text-xs font-semibold text-neutral-500">
                  {order.plateStatus === 'RECEIVED' ? '🟢 Kẽm đã sẵn sàng' : order.plateStatus === 'SENT' ? '🟡 Kẽm đang trên đường về' : '🔴 Chưa có kẽm'}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Button Bắt đầu in luôn (Bỏ qua xác nhận kẽm nếu đã có) */}
                {(order.status === 'ACCEPTED' || order.status === 'WAITING_PRINT') && !hasAcknowledgedLatestRevision && (
                  <button
                    onClick={handleAcknowledgeRevision} disabled={isProcessing}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>XÁC NHẬN HƯỚNG DẪN MỚI</span>
                  </button>
                )}

                {(order.status === 'ACCEPTED' || order.status === 'WAITING_PRINT') && hasAcknowledgedLatestRevision && (
                  <button
                    onClick={handleStartPrintingDirect} disabled={isProcessing}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>🚀 BẮT ĐẦU IN</span>
                  </button>
                )}

                {/* Button Kẽm đã về xưởng (nếu chưa in ngay) */}
                {order.plateStatus === 'SENT' && (
                  <button
                    onClick={handleConfirmPlateReceived} disabled={isProcessing}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>📦 Kẽm đã về xưởng</span>
                  </button>
                )}

              </div>
            </div>
          )}

          {/* Critical Plate Warning if not sent */}
          {order.plateStatus === 'NOT_SENT' && (
            <div className="bg-red-500 text-white p-3 rounded-2xl text-xs font-bold flex items-center justify-between shadow-xs">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                LỆNH NÀY ĐANG BÁO CHƯA CÓ KẼM TẠI MÁY – VUI LÒNG KIỂM TRA NHÀ KẼM!
              </span>
              {hasProductionTechnicalAuthority(currentUser) && (
                <button
                  onClick={() => updatePlateStatus(order.id, 'SENT', 'Đã gửi file kẽm')}
                  className="bg-white text-red-600 hover:bg-neutral-100 text-xs font-black px-3 py-1 rounded-xl cursor-pointer shrink-0 shadow-2xs"
                >
                  Xác nhận đã gửi kẽm
                </button>
              )}
            </div>
          )}

          {/* Design Images Grid with Zoom */}
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
              <span className="font-bold text-neutral-700">
                Ảnh mẫu thiết kế túi ({order.items.length} mẫu{order.items.length > 1 ? ' ghép' : ''})
              </span>
              <span className="text-[11px] text-amber-600 font-semibold">
                Bấm vào ảnh để xem toàn màn hình
              </span>
            </div>

            <div className={`grid gap-3 ${
              order.items.length === 1 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
            }`}>
              {order.items.map((item, idx) => (
                <div
                  key={item.id || idx}
                  onClick={(event) => setPreviewImage(event.currentTarget.querySelector('img')?.src || item.imageUrl)}
                  className="group relative rounded-2xl overflow-hidden border border-neutral-200 bg-white aspect-4/3 cursor-pointer shadow-xs hover:shadow-md transition-all"
                >
                  <ResolvedImage
                    image={item.image}
                    legacyUrl={item.imageUrl}
                    alt={item.productName || `Mẫu ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent p-2.5 flex flex-col justify-end">
                    <p className="text-white text-xs font-bold truncate">
                      {item.productName || item.customerName || `Mẫu ${idx + 1}`}
                    </p>
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-1 overflow-hidden mt-0.5">
                        {item.tags.map((tag, i) => (
                          <span key={i} className="text-[9px] font-medium bg-blue-500/80 text-white px-1 py-0.5 rounded shrink-0 truncate max-w-[60px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-white/80 text-[11px] font-medium mt-0.5">
                      {item.quantity?.toLocaleString('vi-VN')} tờ {item.color ? `• ${item.color}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Technical Specs Card */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-neutral-200 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Chi Tiết Kỹ Thuật Sản Xuất In Đông Dương
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/70">
                <span className="text-[11px] text-neutral-400 block">Số lượng</span>
                <span className="text-base font-black text-amber-950">
                  {order.totalSheets.toLocaleString('vi-VN')} tờ
                </span>
              </div>
              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/70">
                <span className="text-[11px] text-neutral-400 block">Loại & Định lượng</span>
                <span className="text-xs sm:text-sm font-bold text-neutral-800">
                  {order.paperType} {order.paperGsm}
                </span>
              </div>
              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/70">
                <span className="text-[11px] text-neutral-400 block">Khổ giấy</span>
                <span className="text-xs sm:text-sm font-bold text-neutral-800">
                  {order.paperWidth} × {order.paperHeight} cm
                </span>
              </div>
              <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/70">
                <span className="text-[11px] text-neutral-400 block">Màu mực</span>
                <span className="text-xs sm:text-sm font-bold text-neutral-800">
                  {order.color}
                </span>
              </div>
            </div>

            {order.note && (
              <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-xs text-amber-950 font-medium">
                <span className="font-bold text-amber-900">Ghi chú in:</span> {order.note}
              </div>
            )}

            {order.finishingNote && (
              <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-200 text-xs text-purple-950 font-bold flex items-start gap-2">
                <Scissors className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
                <div>
                  <span className="text-purple-900 font-black text-[11px] uppercase tracking-wider block">Ghi chú cho bộ phận gia công:</span>
                  <span className="text-neutral-900 font-bold">{order.finishingNote}</span>
                </div>
              </div>
            )}

            {/* Plate details & Date */}
            <div className="bg-neutral-50 p-2.5 rounded-xl text-xs space-y-1.5 border border-neutral-200/70">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-bold text-neutral-600">
                  {order.plateType === 'OLD' ? 'Bản kẽm cũ:' : order.plateType === 'NEW' ? 'Kẽm mới xuất:' : 'Kẽm:'}
                </span>
                <span className="font-bold text-neutral-900">
                  {(order.originalPlateDate || order.plateDate) ? `Ngày ${order.originalPlateDate || order.plateDate}` : 'Theo thiết kế'}
                </span>
              </div>
              {order.plateNote && (
                <div className="text-neutral-600 pt-1 border-t border-neutral-200/50">
                  <span className="font-semibold text-neutral-500">Vị trí:</span> {order.plateNote}
                </div>
              )}
            </div>

            {/* Damaged Plate Warning Box */}
            {order.plateStatus === 'PLATE_DAMAGED' && (
              <div className="bg-red-50 p-3 rounded-xl border border-red-200 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-red-900">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Kẽm cũ ngày {order.originalPlateDate || order.plateDate} bị báo hỏng/thiếu. Cần ra kẽm mới!</span>
                </div>
                {hasProductionTechnicalAuthority(currentUser) && (
                  <button
                    onClick={() => reissueNewPlate(order.id, getTodayFormatted())}
                    className="w-full py-1.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>✨ Xác nhận đã ra lại kẽm mới (Hôm nay {getTodayFormatted()})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Issues alert if any */}
          {/* Moved to top level of card */}

          {/* Direct Comments Chat Box */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-neutral-700 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                Trao đổi nội bộ ({order.comments.length})
              </span>
            </div>

            {order.comments.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {order.comments.map((cmt) => (
                  <div key={cmt.id} className="bg-white p-2 rounded-xl text-xs border border-neutral-200/80">
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-0.5">
                      <span className="font-bold text-neutral-800">{cmt.userName}</span>
                      <span>{formatRelativeTime(cmt.createdAt)}</span>
                    </div>
                    <p className="text-neutral-800">{cmt.message}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSendComment} className="flex gap-2">
              <input
                type="text"
                value={quickComment}
                onChange={(e) => setQuickComment(e.target.value)}
                placeholder="Nhắn tin cho thợ / thiết kế về lệnh này..."
                className="flex-1 px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs font-medium focus:border-amber-500 outline-hidden"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-neutral-800 cursor-pointer"
              >
                Gửi
              </button>
            </form>
          </div>

          {/* Full Bottom Action Bar */}
          <div className="pt-3 border-t border-neutral-200/80 flex flex-wrap items-center justify-between gap-2">
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Chức năng in lại: DÀNH CHO THIẾT KẾ, SALE & QUẢN LÝ */}
              {canCreateProductionOrder(currentUser, appConfig) && (
                <button
                  onClick={() => duplicateOrder(order)}
                  className="px-3 py-2 bg-neutral-100 hover:bg-amber-50 text-neutral-700 hover:text-amber-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer border border-neutral-200/70"
                  title="Tạo lệnh in lại từ mẫu này (Kế thừa thông số & kẽm)"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-600" />
                  <span>In lại</span>
                </button>
              )}

              {/* Chức năng báo GẤP: Dành cho Sale, Thiết kế & Quản lý */}
              {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && canToggleUrgent(currentUser, appConfig) && (
                <button
                  onClick={handleToggleUrgentOrder} disabled={isProcessing}
                  className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer border ${
                    order.isUrgent
                      ? 'bg-red-600 hover:bg-red-700 text-white border-red-700 shadow-xs ring-2 ring-red-400/40 animate-pulse'
                      : 'bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-200'
                  }`}
                  title={order.isUrgent ? 'Bấm để gỡ nhãn đơn gấp' : 'Đánh dấu đơn cần gấp để thợ in ưu tiên in trước'}
                >
                  <Flame className={`w-3.5 h-3.5 ${order.isUrgent ? 'fill-current text-white' : 'text-orange-600'}`} />
                  <span>{order.isUrgent ? '🔥 ĐÃ BÁO GẤP (Bấm gỡ)' : '🔥 Báo Cần Gấp'}</span>
                </button>
              )}

              {(order.status !== 'COMPLETED' && order.status !== 'CANCELLED') && (<button
                onClick={() => onOpenIssueModal && onOpenIssueModal(order)}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Báo sự cố</span>
              </button>)}

              {/* Designer / Sale / Admin can Request Cancellation */}
              {['WAITING_ACCEPTANCE', 'WAITING_PLATE', 'ACCEPTED', 'WAITING_PRINT'].includes(order.status) && !hasPendingCancel && canRequestProductionCancellation(currentUser) && (
                <button
                  onClick={() => setIsCancelDialogOpen(true)}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer border border-red-200"
                  title="Gửi thông báo khẩn yêu cầu thợ in dừng máy & hủy lệnh"
                >
                  <Ban className="w-3.5 h-3.5 text-red-600" />
                  <span>Báo hủy lệnh</span>
                </button>
              )}

              {/* Delete Order button for Admin / Developer / Manager */}
              {canDeleteOrder(currentUser, order, appConfig) && (
                <button
                  onClick={() => {
                    if (confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn lệnh in #${order.code}?`)) {
                      deleteOrder(order.id);
                    }
                  }}
                  className="px-2.5 py-2 bg-neutral-100 hover:bg-red-50 text-neutral-500 hover:text-red-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer border border-neutral-200 hover:border-red-200"
                  title="Xóa vĩnh viễn lệnh này khỏi hệ thống"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa lệnh</span>
                </button>
              )}
            </div>

            {/* Workflow Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              
              {/* Designer plate confirmations */}
              {hasProductionTechnicalAuthority(currentUser) && order.plateStatus === 'NOT_SENT' && (
                <button
                  onClick={() => updatePlateStatus(order.id, 'SENT', 'Đã gửi file')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Xác nhận đã gửi kẽm</span>
                </button>
              )}

              {/* Popup Modal button */}
              <button
                onClick={() => setSelectedOrder(order)}
                className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Hộp thoại to</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MODAL: YÊU CẦU HỦY LỆNH (CHO THIẾT KẾ / SALE) */}
      {/* ========================================================================= */}
      {isCancelDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center font-bold text-xl shrink-0">
                🚨
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900 leading-tight">
                  Yêu Cầu Hủy Lệnh #{order.code}
                </h3>
                <p className="text-xs text-neutral-500">
                  Thông báo khẩn cấp sẽ gửi trực tiếp đến chuông thợ in @{order.printerName}
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmCancelRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Lý do hủy lệnh sản xuất: <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  placeholder="Ví dụ: Khách đổi kích thước túi / Đổi mẫu in / Tạm dừng kiểm tra..."
                  className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-xs sm:text-sm font-medium focus:border-red-500 focus:bg-white outline-hidden resize-none"
                  autoFocus
                />
              </div>

              <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <span className="font-bold block">⚠️ Lưu ý quy trình hủy xưởng:</span>
                <p className="opacity-90">
                  Sau khi bấm gửi, thợ in sẽ kiểm tra máy. Nếu thợ chưa chạy máy sẽ bấm <b>Đồng ý hủy</b>. Nếu đã in xong, thợ sẽ phản hồi <b>Không thể hủy</b>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCancelDialogOpen(false)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>Gửi Yêu Cầu Hủy</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL: THỢ IN BÁO KHÔNG THỂ HỦY (ĐÃ IN XONG / ĐANG CHẠY MÁY) */}
      {/* ========================================================================= */}
      {isRejectDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900 leading-tight">
                  Phản Hồi Không Thể Hủy Lệnh #{order.code}
                </h3>
                <p className="text-xs text-neutral-500">
                  Báo lại cho thiết kế & quản lý lý do không dừng máy được
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmRejectCancel} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Lý do không thể hủy:
                </label>
                <div className="space-y-2">
                  {[
                    'Đã in xong rồi, chuẩn bị chuyển gia công',
                    'Máy đang chạy dở dang hơn 80% rồi',
                    'Đã pha mực & lên giấy cuộn xong',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectReasonInput(preset)}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium transition-all ${
                        rejectReasonInput === preset
                          ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold'
                          : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}

                  <input
                    type="text"
                    value={rejectReasonInput}
                    onChange={(e) => setRejectReasonInput(e.target.value)}
                    placeholder="Hoặc nhập lý do khác..."
                    className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:border-amber-500 outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRejectDialogOpen(false)}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                  <span>Xác Nhận Báo Không Hủy Được</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* (MODAL KẼM ĐÃ BỊ XÓA - DÙNG CHUNG Ở ISSUE REPORT MODAL) */}

      {productionTransition && <OpenIssueTransitionModal title={productionTransition.title} actor={currentUser} issues={order.issues.filter((issue) => issue.status === 'OPEN') as TransitionIssue[]} onResolve={(issueId) => resolveIssue(order.id, issueId)} onContinue={productionTransition.action} onClose={() => setProductionTransition(null)} />}
    </div>
  );
};
