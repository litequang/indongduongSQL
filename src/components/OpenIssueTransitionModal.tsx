import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { User, UserRole } from '../types';
import { hasIssueRecipientAuthority } from '../permissions';

export type TransitionIssue = {
  id: string;
  type?: string;
  issueType?: string;
  message: string;
  urgent?: boolean;
  priority?: string;
  recipientUserIds?: string[];
  recipientRoles?: UserRole[];
};

interface Props {
  title: string;
  actor: User;
  issues: TransitionIssue[];
  onResolve: (issueId: string) => Promise<unknown>;
  onContinue: () => Promise<unknown>;
  onClose: () => void;
}

/** A lightweight choice, not a workflow blocker: users may continue with OPEN
 * issues, and may resolve only issues they are already authorized to resolve. */
export const OpenIssueTransitionModal: React.FC<Props> = ({ title, actor, issues, onResolve, onContinue, onClose }) => {
  const resolvable = useMemo(() => issues.filter((issue) => hasIssueRecipientAuthority(actor, issue)), [actor, issues]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const proceed = async (resolveSelected: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (resolveSelected) {
        for (const issueId of selected) await onResolve(issueId);
      }
      await onContinue();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tiếp tục transition.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-rose-100 bg-rose-50 px-5 py-4"><div><h2 className="flex items-center gap-2 text-sm font-black text-rose-950"><AlertTriangle className="h-5 w-5 text-rose-600" />Sự cố đang mở</h2><p className="mt-1 text-xs leading-5 text-rose-800">Trước khi {title}, bạn có thể xử lý các sự cố thuộc quyền của mình hoặc vẫn tiếp tục công việc.</p></div><button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1 text-neutral-500 hover:bg-white"><X className="h-5 w-5" /></button></header>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto p-5">{issues.map((issue) => { const canResolve = hasIssueRecipientAuthority(actor, issue); return <label key={issue.id} className={`block rounded-xl border p-3 ${issue.urgent || issue.priority === 'URGENT' ? 'border-rose-300 bg-rose-50' : 'border-neutral-200 bg-white'}`}><div className="flex gap-3"><input type="checkbox" disabled={!canResolve || busy} checked={selected.has(issue.id)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(issue.id); else next.delete(issue.id); return next; })} className="mt-1 h-4 w-4 accent-emerald-600 disabled:cursor-not-allowed" /><div className="min-w-0 flex-1"><p className="text-xs font-black text-neutral-900">{issue.urgent || issue.priority === 'URGENT' ? 'KHẨN CẤP · ' : ''}{issue.issueType || issue.type || 'Sự cố'}</p><p className="mt-1 text-xs leading-5 text-neutral-600">{issue.message}</p><p className="mt-1 text-[10px] font-semibold text-neutral-500">Người/bộ phận xử lý: {[...(issue.recipientUserIds || []), ...(issue.recipientRoles || [])].join(', ') || 'Theo policy'}</p>{!canResolve && <p className="mt-1 text-[10px] font-black text-amber-700">CHỈ XEM — bạn không có quyền xử lý sự cố này</p>}</div></div></label>; })}</div>
      {error && <p className="mx-5 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</p>}
      <footer className="flex flex-col gap-2 border-t border-neutral-100 p-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => void proceed(false)} className="rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-black text-neutral-700 disabled:opacity-50">VẪN CÒN SỰ CỐ — TIẾP TỤC CÔNG VIỆC</button>{resolvable.length > 0 && <button type="button" disabled={busy || selected.size === 0} onClick={() => void proceed(true)} className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />ĐÃ XỬ LÝ SỰ CỐ VÀ TIẾP TỤC</button>}</footer>
    </div>
  </div>;
};
