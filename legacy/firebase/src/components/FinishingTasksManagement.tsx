import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Scissors, UserCheck, Zap } from 'lucide-react';
import { FinishingTask } from '../types';
import { finishingTaskRepository } from '../repositories/finishingTaskRepository';
import { workflowCallableService } from '../services/workflowCallableService';
import { useApp } from '../context/AppContext';
import { ProductWorkflowIssueModal } from './ProductWorkflowIssueModal';
import { WorkflowIssuesPanel } from './WorkflowIssuesPanel';
import { OpenIssueTransitionModal, TransitionIssue } from './OpenIssueTransitionModal';
import { workflowIssueRepository } from '../repositories/workflowIssueRepository';
import { WorkflowIssue } from '../types';
import { ResolvedImage } from './ResolvedImage';

export const FinishingTasksManagement: React.FC = () => {
  const { currentUser, reportIssue } = useApp();
  const [tasks, setTasks] = useState<FinishingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [issueTarget, setIssueTarget] = useState<FinishingTask | null>(null);
  const [transition, setTransition] = useState<{ title: string; issues: WorkflowIssue[]; continueAction: () => Promise<void> } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTasks(await finishingTaskRepository.getAll());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => finishingTaskRepository.subscribe(next => {
    setTasks(next);
    setLoading(false);
  }, error => {
    console.error('Finishing task subscription failed', error);
    setLoading(false);
  }), []);

  const run = async (taskId: string, action: 'claim' | 'complete') => {
    if (busyId) return;
    setBusyId(taskId);
    try {
      if (action === 'claim') await workflowCallableService.claimFinishingTask(taskId);
      else await workflowCallableService.completeFinishingTask(taskId);
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể cập nhật công việc gia công.');
    } finally {
      setBusyId('');
    }
  };

  const requestTransition = async (task: FinishingTask, action: 'claim' | 'complete') => {
    const continueAction = () => run(task.id, action);
    if (!task.salesOrderItemId) { await continueAction(); return; }
    try {
      const issues = await workflowIssueRepository.getOpenForEntities([task.salesOrderItemId], 'FINISHING');
      if (!issues.length) { await continueAction(); return; }
      const title = action === 'claim' ? 'nhận việc' : task.requiresFinishing ? 'hoàn thành sản phẩm' : 'xác nhận không gia công';
      setTransition({ title, issues, continueAction });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể kiểm tra sự cố đang mở.');
    }
  };

  const toggleUrgent = async (task: FinishingTask) => {
    if (busyId) return;
    setBusyId(task.id);
    try {
      await workflowCallableService.setFinishingTaskUrgent(task.id, !task.urgent);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể cập nhật ưu tiên sản phẩm.');
    } finally {
      setBusyId('');
    }
  };

  const requestCancellation = async (task: FinishingTask) => {
    const reason = window.prompt('Lý do hủy gia công:');
    if (reason === null) return;
    if (busyId) return;
    setBusyId(task.id);
    try {
      await workflowCallableService.requestFinishingCancellation(task.id, reason.trim() || undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể yêu cầu hủy gia công.');
    } finally {
      setBusyId('');
    }
  };

  const respondCancellation = async (task: FinishingTask, accept: boolean) => {
    const responseReason = accept ? undefined : window.prompt('Lý do từ chối hủy:') || undefined;
    if (busyId) return;
    setBusyId(task.id);
    try {
      await workflowCallableService.respondFinishingCancellation(task.id, accept, responseReason);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể phản hồi yêu cầu hủy.');
    } finally {
      setBusyId('');
    }
  };

  const openIssue = async (task: FinishingTask) => {
    if (task.salesOrderItemId) {
      setIssueTarget(task);
      return;
    }
    if (!task.productionOrderId) return;
    const message = prompt('Mô tả sự cố gia công:');
    if (message?.trim()) await reportIssue(task.productionOrderId, 'Sự cố gia công', message.trim(), undefined, [], ['MANAGER']);
  };

  return (
    <div className="space-y-4">
      <WorkflowIssuesPanel stage="FINISHING" />
      <div className="flex items-center justify-between gap-3 rounded-3xl border border-purple-200 bg-white p-5 shadow-xs">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-neutral-900"><Scissors className="h-5 w-5 text-purple-600" />Gia công theo sản phẩm</h1>
          <p className="mt-1 text-xs text-neutral-500">Mỗi sản phẩm đã in qua một checkpoint riêng: nhận và hoàn thành nếu cần gia công, hoặc xác nhận một lần nếu không cần.</p>
        </div>
        <button onClick={() => void load()} className="rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-neutral-600" title="Tải lại"><RefreshCw className="h-4 w-4" /></button>
      </div>
      {loading ? (
        <div className="p-10 text-center text-sm text-neutral-500">Đang tải công việc gia công...</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">Chưa có sản phẩm chờ gia công.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {tasks.map(task => (
            <article key={task.id} className={`rounded-2xl border bg-white p-4 shadow-xs ${task.urgent ? 'border-orange-400 ring-2 ring-orange-100' : 'border-neutral-200'}`}>
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {task.imageUrl || task.image ? <ResolvedImage image={task.image} legacyUrl={task.imageUrl} alt="" className="h-full w-full object-cover" /> : <Scissors className="m-4 h-6 w-6 text-neutral-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-black text-neutral-900">{task.productName}</h2>
                  <p className="mt-0.5 text-xs text-neutral-500">Đơn {task.salesOrderId || 'độc lập'} · {task.quantity.toLocaleString('vi-VN')} sản phẩm</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${task.status === 'READY' ? 'bg-amber-100 text-amber-800' : task.status === 'CLAIMED' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'}`}>{task.status}</span>
                  <p className="mt-1 text-[11px] font-bold text-neutral-600">{task.requiresFinishing ? 'CẦN GIA CÔNG' : 'KHÔNG CẦN GIA CÔNG'}</p>
                  {task.urgent && <p className="mt-1 flex items-center gap-1 text-[11px] font-black text-orange-700"><Zap className="h-3.5 w-3.5 fill-current" />CẦN GẤP</p>}
                  {task.claimedByName && <p className="mt-1 text-[11px] text-neutral-500">Người nhận: {task.claimedByName}</p>}
                  {task.cancellationRequest?.status === 'PENDING' && <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">ĐANG CHỜ XÁC NHẬN HỦY GIA CÔNG</p>}
                  {task.cancellationRequest?.status === 'REJECTED' && <p className="mt-2 text-[10px] font-bold text-neutral-500">Yêu cầu hủy đã bị từ chối — tiếp tục gia công.</p>}
                </div>
              </div>
              {currentUser.role === 'FINISHER' && task.status === 'READY' && task.requiresFinishing && (
                <button disabled={Boolean(busyId)} onClick={() => void requestTransition(task, 'claim')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><UserCheck className="h-4 w-4" />Nhận gia công</button>
              )}
              {currentUser.role === 'FINISHER' && task.status === 'READY' && !task.requiresFinishing && (
                <button disabled={Boolean(busyId)} onClick={() => void requestTransition(task, 'complete')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Xác nhận không gia công</button>
              )}
              {currentUser.role === 'FINISHER' && task.status === 'CLAIMED' && task.claimedBy === currentUser.id && task.cancellationRequest?.status !== 'PENDING' && (
                <button disabled={Boolean(busyId)} onClick={() => void requestTransition(task, 'complete')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Hoàn thành sản phẩm</button>
              )}
              {currentUser.role === 'FINISHER' && task.status === 'CLAIMED' && task.claimedBy === currentUser.id && task.cancellationRequest?.status === 'PENDING' && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button disabled={Boolean(busyId)} onClick={() => void respondCancellation(task, true)} className="rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">Xác nhận hủy</button>
                  <button disabled={Boolean(busyId)} onClick={() => void respondCancellation(task, false)} className="rounded-xl border border-neutral-300 px-3 py-2 text-[10px] font-black text-neutral-700 disabled:opacity-50">Từ chối — đã làm</button>
                </div>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => void openIssue(task)} className="flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-[10px] font-black text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Báo sự cố</button>
                {['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER'].includes(currentUser.role) && (
                  <button disabled={Boolean(busyId)} onClick={() => void toggleUrgent(task)} className="flex items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-2 py-2 text-[10px] font-black text-orange-700 disabled:opacity-50"><Zap className="h-3.5 w-3.5" />{task.urgent ? 'Bỏ cần gấp' : 'Cần gấp'}</button>
                )}
                {['DEVELOPER', 'ADMIN', 'MANAGER', 'SALE', 'DESIGNER'].includes(currentUser.role) && !['COMPLETED', 'CANCELLED'].includes(task.status) && task.cancellationRequest?.status !== 'PENDING' && (
                  <button disabled={Boolean(busyId)} onClick={() => void requestCancellation(task)} className="flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-[10px] font-black text-rose-700 disabled:opacity-50">Hủy gia công</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {issueTarget?.salesOrderItemId && <ProductWorkflowIssueModal salesOrderItemId={issueTarget.salesOrderItemId} stage="FINISHING" productName={issueTarget.productName} onClose={() => setIssueTarget(null)} />}
      {transition && <OpenIssueTransitionModal title={transition.title} actor={currentUser} issues={transition.issues as TransitionIssue[]} onResolve={(issueId) => workflowCallableService.resolveWorkflowIssue(issueId)} onContinue={transition.continueAction} onClose={() => setTransition(null)} />}
    </div>
  );
};
