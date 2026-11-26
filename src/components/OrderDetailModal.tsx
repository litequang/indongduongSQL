import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Play,
  Scissors,
  Layers,
  Clock,
  MessageSquare,
  Send,
  Copy,
  Image as ImageIcon,
  User,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Ban,
  PackageCheck,
  Check,
  Sparkles,
  Flame,
  Trash2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductionOrder, PlateStatus } from '../types';
import { formatRelativeTime, getTodayFormatted } from '../utils/dateUtils';
import { canAcceptPrintJob, canCreateProductionOrder, canDeleteOrder, canFinishPrinting, canManageFinishing, canRequestProductionCancellation, canStartPrinting, canToggleUrgent, hasIssueRecipientAuthority, hasProductionTechnicalAuthority, isIssueReporter, isPrinter } from '../permissions';
import { OpenIssueTransitionModal, TransitionIssue } from './OpenIssueTransitionModal';
import { ResolvedImage } from './ResolvedImage';

interface OrderDetailModalProps {
  onOpenIssueModal: (order: ProductionOrder) => void;
  onOpenFinishPrintModal: (order: ProductionOrder) => void;
  onOpenFinishingModal: (order: ProductionOrder) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  onOpenIssueModal,
  onOpenFinishPrintModal,
  onOpenFinishingModal
}) => {
  const {
    currentUser,
    selectedOrder,
    setSelectedOrder,
    setPreviewImage,
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
    resolveIssue,
    cancelIssue,
    addComment,
    duplicateOrder,
    toggleUrgentOrder,
    updateFinishingNote,
    reviseProductionInstruction,
    deleteOrder,
    appConfig,
    orders
  } = useApp();

  const [commentText, setCommentText] = useState('');
  const [isCancelBoxOpen, setIsCancelBoxOpen] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [isRejectBoxOpen, setIsRejectBoxOpen] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('Đã in xong / đang chạy máy');
  const [isPlateDamagedBoxOpen, setIsPlateDamagedBoxOpen] = useState(false);
  const [plateDamagedReason, setPlateDamagedReason] = useState('Không còn kẽm cũ / Kẽm cũ bị rách');
  const [isEditingFinishingNote, setIsEditingFinishingNote] = useState(false);
  const [finishingNoteInput, setFinishingNoteInput] = useState(selectedOrder?.finishingNote || '');
  const [isEditingInstruction, setIsEditingInstruction] = useState(false);
  const [instructionInput, setInstructionInput] = useState(selectedOrder?.instructionRaw || selectedOrder?.note || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [productionTransition, setProductionTransition] = useState<{ title: string; action: () => Promise<void> } | null>(null);

  const wrapAction = (action: () => Promise<void> | void) => async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await action();
    } catch(err) {
    } finally {
      setIsProcessing(false);
    }
  };

  const withProductionIssueChoice = async (title: string, action: () => Promise<void>) => {
    if (selectedOrder?.issues.some((issue) => issue.status === 'OPEN')) {
      setProductionTransition({ title, action });
      return;
    }
    await action();
  };
  const handleAcceptOrder = wrapAction(() => withProductionIssueChoice('nhận lệnh', () => acceptOrder(selectedOrder!.id)));
  const handleAcknowledgeRevision = wrapAction(() => acknowledgeProductionRevision(selectedOrder!.id));
  const handleStartPrintingDirect = wrapAction(() => withProductionIssueChoice('bắt đầu in', () => startPrintingDirect(selectedOrder!.id)));
  const handleConfirmPlateReceived = wrapAction(() => confirmPlateReceived(selectedOrder!.id));
  const handleReissueNewPlate = wrapAction(() => reissueNewPlate(selectedOrder!.id, getTodayFormatted()));
  const handleToggleUrgentOrder = wrapAction(() => toggleUrgentOrder(selectedOrder!.id, !selectedOrder!.isUrgent));
  const handleDeleteOrder = wrapAction(async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa đơn hàng DRAFT này không?')) {
      deleteOrder(selectedOrder!.id);
      setSelectedOrder(null);
    }
  });

  const lineageOrders = React.useMemo(() => {
    if (!selectedOrder?.items || selectedOrder.items.length === 0) return [];
    const targetImageUrl = selectedOrder.items[0].imageUrl;
    if (!targetImageUrl) return [];

    const related = orders.filter(o => 
      o.items && o.items.some(it => it.imageUrl === targetImageUrl) && o.status !== 'CANCELLED' && o.status !== 'DRAFT'
    );
    
    return related.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedOrder, orders]);

  useEffect(() => {
    if (selectedOrder) {
      setFinishingNoteInput(selectedOrder.finishingNote || '');
      setInstructionInput(selectedOrder.instructionRaw || selectedOrder.note || '');
    }
  }, [selectedOrder?.id, selectedOrder?.finishingNote, selectedOrder?.instructionRaw, selectedOrder?.note]);

  if (!selectedOrder) return null;

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    addComment(selectedOrder.id, commentText.trim());
    setCommentText('');
  };

  const handleSendCancelRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReasonInput.trim()) return;
    requestCancelOrder(selectedOrder.id, cancelReasonInput.trim());
    setIsCancelBoxOpen(false);
    setCancelReasonInput('');
  };

  const hasPendingCancel = selectedOrder.cancellationRequest?.status === 'PENDING';
  const hasAcknowledgedLatestRevision = (selectedOrder.printerAcknowledgedRevision || 0) >= Math.max(1, selectedOrder.productionRevision || 1);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92dvh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden my-auto text-neutral-800">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/70">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
                #{selectedOrder.code}
              </span>

              {selectedOrder.isUrgent && (
                <span className="text-xs font-black text-white bg-red-600 px-2.5 py-1 rounded-xl shadow-xs flex items-center gap-1 animate-pulse">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>🔥 CẦN GẤP (IN TRƯỚC)</span>
                </span>
              )}

              <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-xl">
                {selectedOrder.totalSheets.toLocaleString('vi-VN')} tờ {selectedOrder.paperType} {selectedOrder.paperGsm}
              </span>
              <span className="text-xs font-bold text-neutral-600 bg-neutral-200/70 px-2 py-1 rounded-xl hidden sm:inline-block">
                {selectedOrder.paperWidth} × {selectedOrder.paperHeight} cm
              </span>
              {selectedOrder.isReprint && (
                <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-xl flex items-center gap-1">
                  <span>🔁 In lại từ #{selectedOrder.reprintFromCode}</span>
                </span>
              )}
            </div>
            {selectedOrder.productName && (
              <p className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
                <span className="text-neutral-400 font-normal">Sản phẩm:</span>
                <span className="text-neutral-900">{selectedOrder.productName}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Chức năng in lại: CHỈ DÀNH CHO THIẾT KẾ & ADMIN */}
            {canCreateProductionOrder(currentUser, appConfig) && (
              <button
                onClick={async () => {
                  duplicateOrder(selectedOrder);
                  setSelectedOrder(null);
                }}
                className="p-2 sm:px-3 sm:py-2 text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-xl transition-colors flex items-center gap-1.5 text-xs font-black cursor-pointer shadow-xs"
                title="Sao chép toàn bộ thông tin & tự động chọn kẽm cũ ngày tương ứng để in lại"
              >
                <Copy className="w-4 h-4 text-amber-700" />
                <span>IN LẠI LỆNH NÀY</span>
              </button>
            )}

            {/* Chức năng xóa lệnh: ADMIN, DEVELOPER, MANAGER */}
            {canDeleteOrder(currentUser, selectedOrder, appConfig) && (
              <button
                onClick={() => {
                  if (confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn lệnh in #${selectedOrder.code}?`)) {
                    deleteOrder(selectedOrder.id);
                    setSelectedOrder(null);
                  }
                }}
                className="p-2 sm:px-3 sm:py-2 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                title="Xóa vĩnh viễn lệnh này khỏi hệ thống"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span className="hidden sm:inline">Xóa Lệnh</span>
              </button>
            )}

            <button
              onClick={() => setSelectedOrder(null)}
              className="p-2 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cancellation Alert Header inside Modal */}
        {hasPendingCancel && (
          <div className="bg-red-600 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black uppercase tracking-wider block">
                🚨 YÊU CẦU HỦY LỆNH TỪ {selectedOrder.cancellationRequest?.requestedByName}
              </span>
              <p className="text-sm font-bold mt-0.5">
                Lý do: &quot;{selectedOrder.cancellationRequest?.reason}&quot;
              </p>
            </div>
            {currentUser.role === 'PRINTER' && selectedOrder.printerId === currentUser.id && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    respondCancelOrder(selectedOrder.id, true, 'Dừng máy kịp, đã hủy');
                    setSelectedOrder(null);
                  }}
                  className="px-3 py-1.5 bg-white text-red-700 font-black text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  ✅ Đồng ý hủy (Dừng máy)
                </button>
                <button
                  onClick={() => setIsRejectBoxOpen(!isRejectBoxOpen)}
                  className="px-3 py-1.5 bg-red-950 text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  ⚠️ Không thể hủy (Đã in)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Open Issues Action Block */}
        {selectedOrder.issues?.some(i => i.status === 'OPEN') && (
          <div className="bg-rose-50 border-y border-rose-200 p-4">
            <h4 className="text-xs font-black text-rose-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Sự cố chưa xử lý
            </h4>
            <div className="space-y-2">
              {selectedOrder.issues.filter(i => i.status === 'OPEN').map(issue => {
                const canResolve = hasIssueRecipientAuthority(currentUser, issue);
                const canCancel = isIssueReporter(currentUser, issue);
                return (
                  <div key={issue.id} className="bg-white border border-rose-200 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          {issue.priority === 'CRITICAL' ? 'CRITICAL' : (issue.priority === 'URGENT' ? 'URGENT' : 'SỰ CỐ')}
                        </span>
                        <span className="text-[10px] font-bold text-neutral-500">
                          Người báo: {issue.createdByName}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-neutral-800">
                        {issue.type}
                      </p>
                      {issue.message && (
                        <p className="text-xs font-medium text-neutral-600 mt-0.5">
                          {issue.message}
                        </p>
                      )}
                      <p className="text-[10px] font-medium text-rose-600 mt-1">
                        Giao xử lý: {[...(issue.recipientRoles || []), ...(issue.recipientUserIds || [])].join(', ') || issue.assignedToRole || 'Theo chính sách sự cố'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                    {canResolve && (
                      <button
                        onClick={() => {
                          const note = prompt('Ghi chú xử lý (không bắt buộc):');
                          if (note !== null) {
                            resolveIssue(selectedOrder.id, issue.id); // note was removed from the API
                          }
                        }}
                        className="shrink-0 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                      >
                        ✅ XÁC NHẬN ĐÃ XỬ LÝ
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => cancelIssue(selectedOrder.id, issue.id)}
                        className="shrink-0 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-xl transition-colors"
                      >
                        HỦY BÁO CÁO
                      </button>
                    )}
                    {!canResolve && !canCancel && (
                      <span className="shrink-0 text-xs font-medium text-neutral-500 italic">
                        Chờ người khác xử lý
                      </span>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {isRejectBoxOpen && (
          <div className="bg-amber-50 p-4 border-b border-amber-200 space-y-2">
            <span className="text-xs font-bold text-amber-900 block">Lý do không hủy được:</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={rejectReasonInput}
                onChange={(e) => setRejectReasonInput(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs"
              />
              <button
                onClick={() => {
                  respondCancelOrder(selectedOrder.id, false, rejectReasonInput);
                  setIsRejectBoxOpen(false);
                }}
                className="px-4 py-1.5 bg-amber-600 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Gửi phản hồi
              </button>
            </div>
          </div>
        )}

        {/* Modal Scroll Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* 1. Large Design Preview Images Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                Mẫu thiết kế In Đông Dương ({selectedOrder.items.length} mẫu)
              </h4>
              <span className="text-[11px] text-amber-600 font-semibold">
                Bấm vào ảnh để xem toàn màn hình
              </span>
            </div>

            <div className={`grid gap-3 ${
              selectedOrder.items.length === 1 ? 'grid-cols-1' : selectedOrder.items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}>
              {selectedOrder.items.map((item, idx) => (
                <div key={item.id || idx} className="group relative rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100 flex flex-col shadow-xs h-full">
                  <div
                    onClick={(event) => setPreviewImage(event.currentTarget.querySelector('img')?.src || item.imageUrl)}
                    className="relative aspect-4/3 cursor-pointer overflow-hidden shrink-0"
                  >
                    <ResolvedImage
                      image={item.image}
                      legacyUrl={item.imageUrl}
                      alt="bag design"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent p-3 flex flex-col justify-end">
                      <p className="text-white text-sm font-bold truncate">
                        {item.productName || item.customerName || `Mẫu ${idx + 1}`}
                      </p>
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex gap-1 overflow-hidden mt-1">
                          {item.tags.map((tag, i) => (
                            <span key={i} className="text-[10px] font-medium bg-blue-500/80 text-white px-1.5 py-0.5 rounded shrink-0 truncate max-w-[80px]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-white/80 text-xs font-medium mt-1">
                        {item.quantity?.toLocaleString('vi-VN')} {item.sourceType === 'SALES_ORDER' ? 'túi' : 'tờ'} {item.color ? `• ${item.color}` : ''}
                      </p>
                    </div>
                  </div>
                  
                  {item.salesOrderId && (
                    <div className="p-2.5 bg-white flex flex-col gap-1 text-xs border-t border-neutral-100">
                      <div className="flex justify-between items-center text-neutral-600">
                        <span className="font-medium text-neutral-500">Từ đơn Sale:</span>
                        <span className="font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{item.salesOrderId}</span>
                      </div>
                      {item.bagWidth && item.bagLength && (
                        <div className="flex justify-between items-center text-neutral-600">
                          <span className="font-medium text-neutral-500">Kích thước:</span>
                          <span className="font-medium">{item.bagWidth}x{item.bagLength}{item.bagGusset ? `x${item.bagGusset}` : ''}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2. Technical Production Specs Card */}
          <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 space-y-3">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Thông Số Kỹ Thuật Lệnh In
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-white p-3 rounded-xl border border-neutral-200/60 shadow-2xs">
                <span className="text-xs text-neutral-400 block">Số lượng tờ</span>
                <span className="text-lg font-black text-amber-900">
                  {selectedOrder.totalSheets.toLocaleString('vi-VN')}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-neutral-200/60 shadow-2xs">
                <span className="text-xs text-neutral-400 block">Loại & Định lượng</span>
                <span className="text-sm font-bold text-neutral-800">
                  {selectedOrder.paperType} {selectedOrder.paperGsm}
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-neutral-200/60 shadow-2xs">
                <span className="text-xs text-neutral-400 block">Khổ giấy</span>
                <span className="text-sm font-bold text-neutral-800">
                  {selectedOrder.paperWidth} × {selectedOrder.paperHeight} cm
                </span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-neutral-200/60 shadow-2xs">
                <span className="text-xs text-neutral-400 block">Màu mực in</span>
                <span className="text-sm font-bold text-neutral-800">
                  {selectedOrder.color}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-200/60 text-xs">
              <div>
                <span className="text-neutral-500">Thợ in phụ trách:</span>{' '}
                <span className="font-bold text-neutral-900">@{selectedOrder.printerName}</span>
              </div>
              <div>
                <span className="text-neutral-500">Người tạo lệnh:</span>{' '}
                <span className="font-bold text-neutral-900">{selectedOrder.createdByName}</span>
              </div>
              {selectedOrder.note && (
                <div className="w-full bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-amber-950 font-medium">
                  <span className="font-bold text-amber-900">Ghi chú in:</span> {selectedOrder.note}
                </div>
              )}
              <div className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-950">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">Hướng dẫn sản xuất gốc · phiên bản {Math.max(1, selectedOrder.productionRevision || 1)}</span>
                  {['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER'].includes(currentUser.role) && ['DRAFT', 'WAITING_ACCEPTANCE', 'ACCEPTED', 'WAITING_PRINT'].includes(selectedOrder.status) && (
                    <button type="button" onClick={() => setIsEditingInstruction(current => !current)} className="text-[11px] font-bold text-blue-700 underline">
                      {isEditingInstruction ? 'Đóng' : 'Chỉnh sửa'}
                    </button>
                  )}
                </div>
                {isEditingInstruction ? (
                  <div className="mt-2 space-y-2">
                    <textarea value={instructionInput} onChange={(event) => setInstructionInput(event.target.value)} rows={4} className="w-full rounded-xl border border-blue-200 bg-white p-2 text-xs" />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await reviseProductionInstruction(selectedOrder.id, instructionInput);
                          setIsEditingInstruction(false);
                        } catch (error) {
                          alert(error instanceof Error ? error.message : 'Không thể cập nhật hướng dẫn.');
                        }
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Lưu phiên bản mới
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-xs">{selectedOrder.instructionRaw || selectedOrder.note || 'Chưa có hướng dẫn dạng văn bản.'}</p>
                )}
              </div>
            </div>
          </div>

          {/* 2.2 Lịch Sử Tái Sản Xuất (Gia phả) */}
          {lineageOrders.length > 0 && (
            <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider">
                  Lịch Sử Tái Sản Xuất Mẫu Này
                </h4>
                <span className="ml-auto text-xs font-bold bg-white text-blue-800 border border-blue-200 px-2 py-0.5 rounded-lg shadow-xs">
                  Tổng: {lineageOrders.length} lần in
                </span>
              </div>
              <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs divide-y divide-blue-50">
                {lineageOrders.map((o, idx) => (
                  <div key={o.id} className={`p-3 flex items-center justify-between hover:bg-blue-50/30 transition-colors ${o.id === selectedOrder.id ? 'bg-blue-50/70 border-l-2 border-blue-500' : ''}`}>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-neutral-900">
                        {o.id === selectedOrder.id ? (
                          <span className="text-blue-700">▶ Lệnh hiện tại (#{o.code})</span>
                        ) : (
                          `Lần ${lineageOrders.length - idx}: #${o.code}`
                        )}
                      </span>
                      <span className="text-[11px] text-neutral-500 mt-0.5">
                        Ngày {o.createdAt.split('T')[0].split('-').reverse().join('/')}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-bold text-neutral-800">
                        {o.totalSheets.toLocaleString('vi-VN')} tờ
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${
                        o.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 
                        o.status === 'PRINTING' ? 'bg-blue-100 text-blue-800' : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {o.status === 'COMPLETED' ? 'Đã hoàn thành' : o.status === 'PRINTING' ? 'Đang in' : 'Đang xử lý'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2.5 GHI CHÚ BỘ PHẬN GIA CÔNG (Sale / Thiết kế / Thợ in / Gia công) */}
          <div className="bg-purple-50/80 rounded-2xl p-4 border border-purple-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-purple-950 uppercase tracking-wider">
                    Ghi Chú Cho Bộ Phận Gia Công
                  </h4>
                  <p className="text-[11px] text-purple-700">
                    (Túi bế miệng, dán xong để riêng từng thùng, xếp hông, đóng gói...)
                  </p>
                </div>
              </div>

              {!isEditingFinishingNote && (
                <button
                  onClick={() => {
                    setFinishingNoteInput(selectedOrder.finishingNote || '');
                    setIsEditingFinishingNote(true);
                  }}
                  className="px-3 py-1 bg-white hover:bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  {selectedOrder.finishingNote ? '✏️ Chỉnh sửa ghi chú' : '+ Thêm ghi chú gia công'}
                </button>
              )}
            </div>

            {isEditingFinishingNote ? (
              <div className="space-y-2.5 pt-1 border-t border-purple-200">
                <input
                  type="text"
                  value={finishingNoteInput}
                  onChange={(e) => setFinishingNoteInput(e.target.value)}
                  placeholder="VD: Túi bế miệng, dán xong để riêng mỗi loại 1 thùng, xếp hông 5cm..."
                  className="w-full px-3.5 py-2 bg-white border-2 border-purple-300 focus:border-purple-600 rounded-xl text-xs font-bold text-neutral-900 outline-hidden"
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setFinishingNoteInput(prev => prev ? `${prev}, Túi bế miệng` : 'Túi bế miệng')}
                      className="px-2 py-0.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-md text-[11px] font-bold cursor-pointer"
                    >
                      + Bế miệng
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinishingNoteInput(prev => prev ? `${prev}, Để riêng mỗi loại 1 thùng` : 'Để riêng mỗi loại 1 thùng')}
                      className="px-2 py-0.5 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-md text-[11px] font-bold cursor-pointer"
                    >
                      + Riêng mỗi loại 1 thùng
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsEditingFinishingNote(false)}
                      className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateFinishingNote(selectedOrder.id, finishingNoteInput);
                        setIsEditingFinishingNote(false);
                      }}
                      className="px-3.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
                    >
                      Lưu ghi chú
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-3 rounded-xl border border-purple-200/80">
                {selectedOrder.finishingNote ? (
                  <p className="text-sm font-bold text-purple-950 flex items-center gap-2">
                    <span>✂️</span>
                    <span>{selectedOrder.finishingNote}</span>
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400 italic">
                    Chưa có ghi chú gia công (Sale hoặc Thiết kế có thể bấm nút trên để thêm).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 3. Plate Status Box & Quick Actions */}
          <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                Tình Trạng Bản Kẽm In
              </h4>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                selectedOrder.plateStatus === 'PLATE_DAMAGED'
                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                  : selectedOrder.plateStatus === 'RECEIVED'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : selectedOrder.plateStatus === 'OLD_PLATE'
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : selectedOrder.plateStatus === 'SENT'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-neutral-200 text-neutral-800 border-neutral-300'
              }`}>
                {selectedOrder.plateStatus === 'PLATE_DAMAGED'
                  ? '🚨 KHÔNG CÒN KẼM CŨ / BẢN HỎNG'
                  : selectedOrder.plateStatus === 'RECEIVED'
                  ? '🟢 Đã có kẽm tại xưởng'
                  : selectedOrder.plateStatus === 'OLD_PLATE'
                  ? `🟢 Kẽm cũ (Ngày ${selectedOrder.originalPlateDate || selectedOrder.plateDate || 'cũ'})`
                  : selectedOrder.plateStatus === 'SENT'
                  ? '🟡 Đã gửi file cho nhà kẽm'
                  : selectedOrder.plateStatus === 'NOT_REQUIRED'
                  ? '⚪ Không cần kẽm'
                  : '🔴 Chưa gửi kẽm'}
              </span>
            </div>

            {/* Plate details date badge */}
            <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-semibold text-neutral-600">
                  Phân loại kẽm:
                </span>
                <span className="font-bold text-neutral-900">
                  {selectedOrder.plateType === 'OLD' ? 'In kẽm cũ' : selectedOrder.plateType === 'NEW' ? 'Kẽm mới xuất' : 'Không dùng kẽm'}
                </span>
              </div>

              {(selectedOrder.originalPlateDate || selectedOrder.plateDate) && (
                <div className="flex items-center justify-between flex-wrap gap-1 pt-1 border-t border-neutral-100">
                  <span className="font-semibold text-neutral-600">
                    📅 Ngày ra kẽm (Mốc gốc):
                  </span>
                  <span className="font-bold text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    {selectedOrder.originalPlateDate || selectedOrder.plateDate}
                  </span>
                </div>
              )}

              {selectedOrder.plateNote && (
                <div className="pt-1 border-t border-neutral-100">
                  <span className="text-neutral-500">Ghi chú kẽm:</span>{' '}
                  <span className="font-medium text-neutral-800">{selectedOrder.plateNote}</span>
                </div>
              )}
            </div>

            {/* Damaged Alert Banner */}
            {selectedOrder.plateStatus === 'PLATE_DAMAGED' && (
              <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 text-red-900 font-bold">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Thợ in báo không còn kẽm ngày {selectedOrder.originalPlateDate || selectedOrder.plateDate}. Thiết kế cần ra lại kẽm mới!</span>
                </div>
                {hasProductionTechnicalAuthority(currentUser) && (
                  <button
                    onClick={handleReissueNewPlate} disabled={isProcessing}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>✨ XÁC NHẬN ĐÃ RA LẠI KẼM MỚI (HÔM NAY {getTodayFormatted()})</span>
                  </button>
                )}
              </div>
            )}

            {/* Damaged Plate Form */}
            {isPlateDamagedBoxOpen && (
              <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl space-y-2 text-xs">
                <label className="font-bold text-red-900 block">
                  Lý do không còn kẽm / hỏng kẽm cũ:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={plateDamagedReason}
                    onChange={(e) => setPlateDamagedReason(e.target.value)}
                    placeholder="VD: Không tìm thấy kẽm cũ trong kho, kẽm bị móp rách..."
                    className="flex-1 px-3 py-1.5 bg-white border border-red-300 rounded-lg text-xs"
                  />
                  <button
                    onClick={() => {
                      reportMissingOrDamagedPlate(selectedOrder.id, plateDamagedReason);
                      setIsPlateDamagedBoxOpen(false);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-xs"
                  >
                    Báo thiết kế
                  </button>
                </div>
              </div>
            )}

            {/* Quick action buttons for Plate */}
            <div className="flex items-center gap-2 flex-wrap">
              {((isPrinter(currentUser) && selectedOrder.printerId === currentUser.id) || hasProductionTechnicalAuthority(currentUser)) && (
                <>
                  {selectedOrder.plateStatus !== 'RECEIVED' && selectedOrder.plateStatus !== 'PLATE_DAMAGED' && selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'PRINTING' && selectedOrder.status !== 'PRINTED' && selectedOrder.status !== 'FINISHING' && selectedOrder.status !== 'COMPLETED' && (
                    <button
                      onClick={handleConfirmPlateReceived} disabled={isProcessing}
                      className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <PackageCheck className="w-4 h-4" />
                      <span>XÁC NHẬN ĐÃ CÓ KẼM</span>
                    </button>
                  )}

                </>
              )}

              {hasProductionTechnicalAuthority(currentUser) && selectedOrder.plateStatus === 'NOT_SENT' && (
                <button
                  onClick={() => updatePlateStatus(selectedOrder.id, 'SENT', 'Đã gửi file kẽm')}
                  className="py-2 px-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>XÁC NHẬN ĐÃ GỬI FILE KẼM</span>
                </button>
              )}
            </div>
          </div>

          {/* 4. Production Progress & Simple Mini-Timeline */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Lịch sử & Tiến độ (Mini-Timeline)
            </h4>

            <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 space-y-2.5">
              {selectedOrder.timeline.map((evt, idx) => (
                <div key={evt.id || idx} className="flex items-start gap-2.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                  <div className="flex-1">
                    <span className="font-bold text-neutral-700">{evt.time}</span> –{' '}
                    <span className="text-neutral-800">{evt.content}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Zalo-like Comments & Discussion */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              Trao đổi nội bộ ({selectedOrder.comments.length})
            </h4>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {selectedOrder.comments.length === 0 ? (
                <p className="text-xs text-neutral-400 italic py-2">
                  Chưa có trao đổi nào cho lệnh in này.
                </p>
              ) : (
                selectedOrder.comments.map((cmt) => (
                  <div
                    key={cmt.id}
                    className={`p-2.5 rounded-xl text-xs ${
                      cmt.userId === currentUser.id
                        ? 'bg-amber-50 border border-amber-200 ml-6'
                        : 'bg-neutral-100 border border-neutral-200/70 mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
                      <span className="font-bold text-neutral-800">{cmt.userName}</span>
                      <span>{formatRelativeTime(cmt.createdAt)}</span>
                    </div>
                    <p className="text-neutral-800">{cmt.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Comment Form */}
            <form onSubmit={handleSendComment} className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Nhắn tin trao đổi (VD: Kẽm này bên cũ nhé anh)..."
                className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:border-amber-500 outline-hidden"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Gửi
              </button>
            </form>
          </div>

        </div>

        {/* Modal Bottom Workflow Action Bar */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200/90 flex flex-wrap items-center justify-between gap-3">
          
          {/* Left Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Chức năng báo GẤP: Dành cho Sale, Thiết kế & Quản lý */}
            {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'COMPLETED' && canToggleUrgent(currentUser, appConfig) && (
              <button
                onClick={handleToggleUrgentOrder} disabled={isProcessing}
                className={`px-3.5 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border ${
                  selectedOrder.isUrgent
                    ? 'bg-red-600 hover:bg-red-700 text-white border-red-700 shadow-xs ring-2 ring-red-400/40 animate-pulse'
                    : 'bg-orange-50 hover:bg-orange-100 text-orange-800 border-orange-200'
                }`}
                title={selectedOrder.isUrgent ? 'Bấm để gỡ nhãn đơn gấp' : 'Đánh dấu đơn cần gấp để thợ in ưu tiên in trước'}
              >
                <Flame className={`w-4 h-4 ${selectedOrder.isUrgent ? 'fill-current text-white' : 'text-orange-600'}`} />
                <span>{selectedOrder.isUrgent ? '🔥 ĐÃ BÁO GẤP (BẤM GỠ)' : '🔥 ĐÁNH DẤU GẤP'}</span>
              </button>
            )}

            {(selectedOrder.status !== 'COMPLETED' && selectedOrder.status !== 'CANCELLED') && (<button
              onClick={() => onOpenIssueModal(selectedOrder)}
              className="px-3.5 py-2.5 bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <AlertCircle className="w-4 h-4" />
              <span>BÁO VẤN ĐỀ</span>
            </button>)}

            {['WAITING_ACCEPTANCE', 'WAITING_PLATE', 'ACCEPTED', 'WAITING_PRINT'].includes(selectedOrder.status) && !hasPendingCancel && canRequestProductionCancellation(currentUser) && (
              <button
                onClick={() => setIsCancelBoxOpen(!isCancelBoxOpen)}
                className="px-3.5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Ban className="w-4 h-4 text-red-600" />
                <span>BÁO HỦY LỆNH</span>
              </button>
            )}

            {/* Xóa lệnh vĩnh viễn: Dành cho Developer / Admin hoặc Thiết kế (khi đơn là nháp) */}
            {canDeleteOrder(currentUser, selectedOrder, appConfig) && (
              <button
                onClick={() => {
                  if (confirm(`⚠️ Bạn có chắc chắn muốn xóa vĩnh viễn lệnh in #${selectedOrder.code} khỏi hệ thống?`)) {
                    deleteOrder(selectedOrder.id);
                  }
                }}
                className="px-3.5 py-2.5 bg-neutral-100 hover:bg-red-600 text-neutral-600 hover:text-white border border-neutral-300 hover:border-red-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="Xóa vĩnh viễn lệnh này khỏi cơ sở dữ liệu"
              >
                <Trash2 className="w-4 h-4" />
                <span>XÓA LỆNH</span>
              </button>
            )}
          </div>

          {/* Right Workflow Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* 1. THỢ XÁC NHẬN NHẬN LỆNH */}
            {selectedOrder.status === 'WAITING_ACCEPTANCE' && currentUser.role === 'PRINTER' && selectedOrder.printerId === currentUser.id && canAcceptPrintJob(currentUser, selectedOrder, appConfig) && (
              <button
                disabled={isProcessing}
                onClick={async (e) => {
                  await handleAcceptOrder(e);
                  setSelectedOrder(null);
                }}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>NHẬN LỆNH</span>
              </button>
            )}

            {/* 2. BẮT ĐẦU IN (1 Chạm: Tự động có kẽm + In luôn) */}
            {(selectedOrder.status === 'ACCEPTED' || selectedOrder.status === 'WAITING_PRINT') && currentUser.role === 'PRINTER' && selectedOrder.printerId === currentUser.id && !hasAcknowledgedLatestRevision && canStartPrinting(currentUser, selectedOrder, appConfig) && (
              <button
                disabled={isProcessing}
                onClick={handleAcknowledgeRevision}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>XÁC NHẬN HƯỚNG DẪN MỚI</span>
              </button>
            )}

            {selectedOrder.status !== 'CANCELLED' && (selectedOrder.status === 'ACCEPTED' || selectedOrder.status === 'WAITING_PRINT') && currentUser.role === 'PRINTER' && selectedOrder.printerId === currentUser.id && hasAcknowledgedLatestRevision && canStartPrinting(currentUser, selectedOrder, appConfig) && (
              <button
                disabled={isProcessing}
                onClick={async (e) => {
                  await handleStartPrintingDirect(e);
                  setSelectedOrder(null);
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>🚀 BẮT ĐẦU IN (IN LUÔN)</span>
              </button>
            )}

            {/* 3. IN XONG */}
            {selectedOrder.status === 'PRINTING' && currentUser.role === 'PRINTER' && selectedOrder.printerId === currentUser.id && canFinishPrinting(currentUser, selectedOrder, appConfig) && (
              <button
                onClick={() => {
                  onOpenFinishPrintModal(selectedOrder);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>XÁC NHẬN IN XONG</span>
              </button>
            )}

          </div>

        </div>

        {/* Cancel form dropdown in modal */}
        {isCancelBoxOpen && (
          <form onSubmit={handleSendCancelRequest} className="p-4 bg-red-50 border-t border-red-200 flex gap-2">
            <input
              type="text"
              required
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              placeholder="Nhập lý do hủy lệnh sản xuất..."
              className="flex-1 px-3 py-2 bg-white border border-red-300 rounded-xl text-xs"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Gửi yêu cầu hủy
            </button>
          </form>
        )}

      </div>
      {productionTransition && selectedOrder && <OpenIssueTransitionModal title={productionTransition.title} actor={currentUser} issues={selectedOrder.issues.filter((issue) => issue.status === 'OPEN') as TransitionIssue[]} onResolve={(issueId) => resolveIssue(selectedOrder.id, issueId)} onContinue={productionTransition.action} onClose={() => setProductionTransition(null)} />}

    </div>
  );
};
