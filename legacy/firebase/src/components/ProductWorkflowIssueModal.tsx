import React, { useState } from 'react';
import { AlertTriangle, Send, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { workflowCallableService } from '../services/workflowCallableService';
import { UserRole, WorkflowIssueStage } from '../types';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';

interface Props {
  salesOrderItemId: string;
  stage: WorkflowIssueStage;
  productName: string;
  onClose: () => void;
}

const ISSUE_TYPES: Record<WorkflowIssueStage, string[]> = {
  FINISHING: ['Thiếu số lượng', 'Lỗi sản phẩm', 'Sai sản phẩm', 'Khác'],
  WAREHOUSE: ['Thiếu số lượng', 'Hỏng', 'Sai hàng', 'Sai khách / sai đơn', 'Khác'],
};

export const ProductWorkflowIssueModal: React.FC<Props> = ({ salesOrderItemId, stage, productName, onClose }) => {
  const { users } = useApp();
  const [issueType, setIssueType] = useState(ISSUE_TYPES[stage][0]);
  const [message, setMessage] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [recipientRoles, setRecipientRoles] = useState<UserRole[]>([]);
  const [submitting, tryAcquire, release] = useSynchronousSubmissionLock();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tryAcquire()) return;
    try {
      await workflowCallableService.reportWorkflowIssue(
        salesOrderItemId,
        stage,
        issueType,
        message.trim() || `${issueType}: ${productName}`,
        recipientUserIds,
        recipientRoles,
        urgent,
      );
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể gửi sự cố.');
    } finally {
      release();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[95dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-rose-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-black text-rose-800"><AlertTriangle className="h-5 w-5" />Báo sự cố · {stage === 'FINISHING' ? 'Gia công' : 'Kho'}</h2>
            <p className="mt-1 text-xs font-bold text-neutral-600">{productName}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ISSUE_TYPES[stage].map(type => (
            <button key={type} type="button" onClick={() => setIssueType(type)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${issueType === type ? 'border-rose-700 bg-rose-600 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}>{type}</button>
          ))}
        </div>

        <textarea value={message} onChange={event => setMessage(event.target.value)} rows={3} placeholder="Mô tả điều bạn thực tế quan sát được..." className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs outline-none focus:border-rose-500" />

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase text-neutral-500">Người / bộ phận nhận (có thể chọn nhiều)</p>
          <div className="flex flex-wrap gap-1.5">
            {(['SALE', 'DESIGNER', 'FINISHER', 'WAREHOUSE', 'MANAGER', 'ADMIN'] as UserRole[]).map(role => (
              <label key={role} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-1.5 text-[11px] font-bold">
                <input type="checkbox" checked={recipientRoles.includes(role)} onChange={() => setRecipientRoles(current => current.includes(role) ? current.filter(value => value !== role) : [...current, role])} />
                {role}
              </label>
            ))}
          </div>
          <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-neutral-200 p-2">
            {users.filter(user => user.active).map(user => (
              <label key={user.id} className="flex items-center gap-1.5 truncate rounded-lg px-2 py-1 text-[11px] hover:bg-neutral-50">
                <input type="checkbox" checked={recipientUserIds.includes(user.id)} onChange={() => setRecipientUserIds(current => current.includes(user.id) ? current.filter(value => value !== user.id) : [...current, user.id])} />
                <span className="truncate">{user.name} · {user.role}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500">Để trống sẽ gợi ý Sale + Designer + Management.</p>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-black text-rose-900">
          <input type="checkbox" checked={urgent} onChange={event => setUrgent(event.target.checked)} />
          KHẨN CẤP
        </label>

        <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black text-white disabled:opacity-50"><Send className="h-4 w-4" />GỬI SỰ CỐ</button>
      </form>
    </div>
  );
};
