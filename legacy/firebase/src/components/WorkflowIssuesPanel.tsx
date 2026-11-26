import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { workflowIssueRepository } from '../repositories/workflowIssueRepository';
import { workflowCallableService } from '../services/workflowCallableService';
import { WorkflowIssue, WorkflowIssueStage } from '../types';
import { hasIssueRecipientAuthority, isIssueReporter } from '../permissions';

export const WorkflowIssuesPanel: React.FC<{ stage: WorkflowIssueStage }> = ({ stage }) => {
  const { currentUser } = useApp();
  const [issues, setIssues] = useState<WorkflowIssue[]>([]);
  const [busyId, setBusyId] = useState('');

  useEffect(() => workflowIssueRepository.subscribe(setIssues, error => console.error('Workflow issue subscription failed', error)), []);

  const visible = useMemo(() => issues.filter(issue => issue.stage === stage && (
    isIssueReporter(currentUser, issue) || hasIssueRecipientAuthority(currentUser, issue)
  )).sort((left, right) => Number(right.status === 'OPEN' && right.urgent) - Number(left.status === 'OPEN' && left.urgent)), [currentUser.id, currentUser.role, issues, stage]);

  if (!visible.length) return null;

  const mutate = async (issue: WorkflowIssue, action: 'resolve' | 'cancel') => {
    if (busyId) return;
    setBusyId(issue.id);
    try {
      if (action === 'resolve') await workflowCallableService.resolveWorkflowIssue(issue.id);
      else await workflowCallableService.cancelWorkflowIssue(issue.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể cập nhật sự cố.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="space-y-2 rounded-3xl border border-rose-200 bg-rose-50/70 p-4">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase text-rose-800"><AlertTriangle className="h-4 w-4" />{visible.some(issue => issue.status === 'OPEN' && issue.urgent) ? 'Sự cố khẩn cấp cần xử lý' : 'Sự cố sản phẩm'}</h2>
      {visible.map(issue => {
        const canResolve = issue.status === 'OPEN' && hasIssueRecipientAuthority(currentUser, issue);
        const canCancel = issue.status === 'OPEN' && isIssueReporter(currentUser, issue);
        const reporterOnly = canCancel && !canResolve;
        return (
          <article key={issue.id} className={`rounded-xl border bg-white p-3 ${issue.status === 'OPEN' && issue.urgent ? 'border-rose-500 shadow-sm' : 'border-rose-100'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-neutral-900">{issue.urgent ? 'KHẨN CẤP · ' : ''}{issue.issueType}</p>
                <p className="mt-0.5 text-xs text-neutral-600">{issue.message}</p>
                <p className="mt-1 text-[10px] text-neutral-500">{issue.salesOrderId} · {issue.status} · báo bởi {issue.reportedByName}</p>
                {reporterOnly && issue.status === 'OPEN' && <p className="mt-1 text-[10px] font-black text-amber-700">SỰ CỐ ĐÃ BÁO · ĐANG CHỜ XỬ LÝ</p>}
                {canResolve && issue.status === 'OPEN' && <p className="mt-1 text-[10px] font-black text-rose-700">{issue.urgent ? 'CẦN XỬ LÝ NGAY' : 'CẦN XỬ LÝ'}</p>}
              </div>
              <div className="flex gap-1.5">
                {canResolve && <button disabled={busyId === issue.id} onClick={() => void mutate(issue, 'resolve')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-black text-white"><CheckCircle2 className="h-3.5 w-3.5" />Đã xử lý</button>}
                {canCancel && <button disabled={busyId === issue.id} onClick={() => void mutate(issue, 'cancel')} className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-[10px] font-black text-neutral-700"><XCircle className="h-3.5 w-3.5" />Hủy báo</button>}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
};
