import React, { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductionOrder } from '../types';
import { OpenIssueTransitionModal, TransitionIssue } from './OpenIssueTransitionModal';

interface PrintCompletionModalProps {
  order: ProductionOrder | null;
  onClose: () => void;
}

export const PrintCompletionModal: React.FC<PrintCompletionModalProps> = ({ order, onClose }) => {
  const { finishPrinting, setSelectedOrder, currentUser, resolveIssue } = useApp();
  const [note, setNote] = useState('');
  const [showIssueChoice, setShowIssueChoice] = useState(false);

  if (!order) return null;

  const complete = async () => {
    await finishPrinting(order.id, order.totalSheets, 0, note.trim() || undefined);
    setSelectedOrder(null);
    onClose();
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (order.issues.some((issue) => issue.status === 'OPEN')) { setShowIssueChoice(true); return; }
    void complete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-emerald-200 overflow-hidden text-neutral-800">
        
        {/* Header */}
        <div className="p-4 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/70">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h3 className="font-extrabold text-base">
              Xác Nhận In Xong #{order.code}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          
          <div className="bg-neutral-50 p-3 rounded-2xl border border-neutral-200 text-xs">
            <span className="text-neutral-500">Lệnh in:</span>{' '}
            <span className="font-bold text-neutral-900">
              {order.totalSheets.toLocaleString('vi-VN')} tờ {order.paperType} {order.paperGsm} ({order.paperWidth}x{order.paperHeight} cm)
            </span>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
            Xác nhận đã in xong đúng hướng dẫn gốc. Hệ thống không yêu cầu nhập số lượng thực tế.
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">
              Ghi chú cho tổ gia công
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Đã xả mép, xếp 100 tờ/chồng..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:border-emerald-500 outline-hidden"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-extrabold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>XÁC NHẬN IN XONG THỰC TẾ</span>
          </button>
        </form>

      </div>
      {showIssueChoice && <OpenIssueTransitionModal title="xác nhận in xong" actor={currentUser} issues={order.issues.filter((issue) => issue.status === 'OPEN') as TransitionIssue[]} onResolve={(issueId) => resolveIssue(order.id, issueId)} onContinue={complete} onClose={() => setShowIssueChoice(false)} />}
    </div>
  );
};
