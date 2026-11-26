import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductionOrder, UserRole } from '../types';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';

interface IssueReportModalProps {
  order: ProductionOrder | null;
  onClose: () => void;
}

const getIssuesForStatus = (status: string) => {
  switch (status) {
    case 'WAITING_ACCEPTANCE':
    case 'WAITING_PLATE':
    case 'ACCEPTED':
    case 'WAITING_PRINT':
      return [
        'Báo kẽm cũ bị hỏng / Yêu cầu kẽm mới',
        'Thiếu file / thiếu thông tin',
        'Không thể thực hiện công đoạn in',
        'Sự cố khác'
      ];
    case 'PRINTING':
      return [
        'Báo sự cố máy in',
        'Thiếu nguyên liệu (giấy, mực...)',
        'Yêu cầu hỗ trợ',
        'Không thể tiếp tục in',
        'Sự cố khác'
      ];
    case 'PRINTED':
      return [
        'Báo hàng in lỗi',
        'Yêu cầu in lại',
        'Yêu cầu in bù',
        'Sự cố khác'
      ];
    case 'FINISHING':
      return [
        'Báo lỗi gia công',
        'Báo thiếu số lượng',
        'Yêu cầu in lại / in bù (phát hiện lỗi in)',
        'Không thể tiếp tục gia công',
        'Sự cố khác'
      ];
    case 'COMPLETED':
    case 'CANCELLED':
      return [
        'Ghi nhận vấn đề sau hoàn thành (Hậu kiểm)',
        'Báo thiếu số lượng / thất thoát'
      ];
    default:
      return [
        'Không rõ số lượng',
        'Không rõ mẫu in',
        'Máy móc gặp sự cố',
        'Khác'
      ];
  }
};

export const IssueReportModal: React.FC<IssueReportModalProps> = ({ order, onClose }) => {
  const { reportIssue, users } = useApp();
  
  const [issues, setIssues] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [recipientRoles, setRecipientRoles] = useState<UserRole[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [isSubmitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();

  useEffect(() => {
    if (order) {
      const availableIssues = getIssuesForStatus(order.status);
      setIssues(availableIssues);
      setSelectedType(availableIssues[0]);
    }
  }, [order]);

  if (!order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tryAcquireSubmit()) return;
    const finalMsg = customMessage.trim() || `Thợ báo: ${selectedType}`;
    try {
      await reportIssue(order.id, selectedType, finalMsg, undefined, recipientUserIds, recipientRoles, urgent);
      onClose();
    } finally {
      releaseSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-rose-200 overflow-hidden text-neutral-800 flex flex-col max-h-[100dvh]">
        
        {/* Header */}
        <div className="p-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <h3 className="font-extrabold text-base">
              Báo Vấn Đề Lệnh #{order.code}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-2">
                Chọn nhanh loại vấn đề
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {issues.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`p-2 rounded-xl text-xs font-bold text-left transition-all border cursor-pointer ${
                      selectedType === type
                        ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">
                Người / bộ phận nhận xử lý (có thể chọn nhiều)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(['DESIGNER', 'SALE', 'PRINTER', 'FINISHER', 'WAREHOUSE', 'MANAGER', 'ADMIN'] as UserRole[]).map(role => (
                  <label key={role} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11px] font-bold">
                    <input
                      type="checkbox"
                      checked={recipientRoles.includes(role)}
                      onChange={() => setRecipientRoles(current => current.includes(role) ? current.filter(value => value !== role) : [...current, role])}
                    />
                    {role}
                  </label>
                ))}
              </div>
              <div className="max-h-28 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {users.filter(user => user.active).map(user => (
                  <label key={user.id} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={recipientUserIds.includes(user.id)}
                      onChange={() => setRecipientUserIds(current => current.includes(user.id) ? current.filter(value => value !== user.id) : [...current, user.id])}
                    />
                    <span className="truncate">{user.name} · {user.role}</span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500">Nếu để trống, hệ thống tự giao theo loại sự cố.</p>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-1">
                Chi tiết / Ghi chú cụ thể
              </label>
              <textarea
                rows={3}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="VD: Mô tả chi tiết vấn đề đang gặp phải..."
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:border-rose-500 outline-hidden"
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-black text-rose-900">
              <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} />
              KHẨN CẤP — đưa vào khu vực cần xử lý ngay
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white font-extrabold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>GỬI CẢNH BÁO NGAY</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
