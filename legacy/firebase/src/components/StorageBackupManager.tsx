import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { imageBackupAdminClient } from '../services/imageBackupAdminClient';
import { StorageProviderAdminSummary } from '../storage/adminTypes';
import {
  BackupCoverageSummary,
  BackupPolicySummary,
  FailedBackupItemSummary,
  ImageBackupJobDetail,
  ImageBackupJobSummary,
  ImageIntegrityResult,
  ImageReplicaSummary,
} from '../storage/backupAdminTypes';

const FIREBASE_PROVIDER_ID = 'firebase-primary';
const RETRYABLE_ERROR_CODES = new Set(['NETWORK_ERROR', 'TIMEOUT', 'TEMPORARY_PROVIDER_ERROR', 'DESTINATION_RACE']);

interface PolicyDraft {
  policyId?: string;
  displayName: string;
  sourceProviderConfigId: string;
  targetProviderConfigId: string;
  autoBackupNewImages: boolean;
}

function emptyPolicyDraft(): PolicyDraft {
  return {
    displayName: '',
    sourceProviderConfigId: FIREBASE_PROVIDER_ID,
    targetProviderConfigId: '',
    autoBackupNewImages: true,
  };
}

function formatBytes(value: number): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unit).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${units[unit]}`;
}

function formatDate(value?: string): string {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function integrityText(result: ImageIntegrityResult): string {
  return `${result.status}${result.sha256 ? ` · SHA-256 ${result.sha256}` : ''}`;
}

function jobLabel(job: ImageBackupJobSummary): string {
  if (job.jobType === 'BACKFILL') return 'Backfill toàn bộ ảnh hiện có';
  if (job.jobType === 'AUTO') return 'Tự động backup ảnh mới';
  return 'Backup thủ công';
}

export const StorageBackupManager: React.FC<{ providers: StorageProviderAdminSummary[] }> = ({ providers }) => {
  const [policies, setPolicies] = useState<BackupPolicySummary[]>([]);
  const [coverageByPolicy, setCoverageByPolicy] = useState<Record<string, BackupCoverageSummary>>({});
  const [jobs, setJobs] = useState<ImageBackupJobSummary[]>([]);
  const [failedItems, setFailedItems] = useState<FailedBackupItemSummary[]>([]);
  const [replicas, setReplicas] = useState<ImageReplicaSummary[]>([]);
  const [selected, setSelected] = useState<ImageBackupJobDetail | null>(null);
  const [draft, setDraft] = useState<PolicyDraft>(emptyPolicyDraft());
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [imageId, setImageId] = useState('');
  const [manualTargetProviderConfigId, setManualTargetProviderConfigId] = useState(FIREBASE_PROVIDER_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const providerLabels = useMemo(() => {
    const labels: Record<string, string> = { [FIREBASE_PROVIDER_ID]: 'Firebase Storage chính' };
    providers.forEach((provider) => { labels[provider.providerConfigId] = provider.displayName; });
    return labels;
  }, [providers]);

  const sourceProviders = useMemo(() => [
    { id: FIREBASE_PROVIDER_ID, label: providerLabels[FIREBASE_PROVIDER_ID], enabled: true },
    ...providers.map((provider) => ({ id: provider.providerConfigId, label: provider.displayName, enabled: provider.enabled })),
  ], [providerLabels, providers]);

  const targetProviders = useMemo(
    () => sourceProviders.filter((provider) => provider.enabled),
    [sourceProviders],
  );

  const loadDashboard = useCallback(async (selectedJobId?: string) => {
    const [listedPolicies, listedJobs, listedFailures, listedReplicas] = await Promise.all([
      imageBackupAdminClient.policies(),
      imageBackupAdminClient.list(),
      imageBackupAdminClient.failedItems(),
      imageBackupAdminClient.replicas(),
    ]);
    setPolicies(listedPolicies);
    setJobs(listedJobs);
    setFailedItems(listedFailures);
    setReplicas(listedReplicas);
    if (selectedJobId) setSelected(await imageBackupAdminClient.get(selectedJobId));
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      await loadDashboard(selected?.job.jobId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu backup.');
    } finally {
      setBusy(false);
    }
  }, [loadDashboard, selected?.job.jobId]);

  useEffect(() => { void refresh(); }, []);

  const run = async (operation: () => Promise<void>, selectedJobId?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      await loadDashboard(selectedJobId ?? selected?.job.jobId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác backup.');
    } finally {
      setBusy(false);
    }
  };

  const editPolicy = (policy: BackupPolicySummary) => {
    setDraft({
      policyId: policy.policyId,
      displayName: policy.displayName,
      sourceProviderConfigId: policy.sourceProviderConfigId,
      targetProviderConfigId: policy.targetProviderConfigId,
      autoBackupNewImages: policy.autoBackupNewImages,
    });
    setShowPolicyForm(true);
  };

  const savePolicy = () => void run(async () => {
    if (!draft.displayName.trim()) throw new Error('Nhập tên policy.');
    if (!draft.targetProviderConfigId) throw new Error('Chọn provider đích.');
    if (draft.sourceProviderConfigId === draft.targetProviderConfigId) {
      throw new Error('Provider nguồn và đích phải khác nhau.');
    }
    const input = {
      displayName: draft.displayName.trim(),
      sourceProviderConfigId: draft.sourceProviderConfigId,
      targetProviderConfigId: draft.targetProviderConfigId,
      autoBackupNewImages: draft.autoBackupNewImages,
    };
    if (draft.policyId) await imageBackupAdminClient.updatePolicy({ policyId: draft.policyId, ...input });
    else await imageBackupAdminClient.createPolicy(input);
    setDraft(emptyPolicyDraft());
    setShowPolicyForm(false);
    setNotice(draft.policyId ? 'Đã cập nhật policy.' : 'Đã tạo policy ở trạng thái tắt. Kiểm tra cấu hình trước khi bật.');
  });

  const loadCoverage = (policyId: string) => void run(async () => {
    const coverage = await imageBackupAdminClient.coverage(policyId);
    setCoverageByPolicy((current) => ({ ...current, [policyId]: coverage }));
    setNotice('Đã cập nhật số liệu coverage phía máy chủ.');
  });

  const startBackfill = (policy: BackupPolicySummary) => void run(async () => {
    if (!policy.enabled) throw new Error('Bật policy trước khi backfill.');
    const jobId = await imageBackupAdminClient.startBackfill(policy.policyId);
    setSelected(await imageBackupAdminClient.get(jobId));
    setNotice('Đã tạo backfill. Worker nền sẽ tìm và backup ảnh theo từng trang nhỏ.');
  });

  const createManualJob = () => void run(async () => {
    if (!imageId.trim()) throw new Error('Nhập imageId cần backup.');
    const detail = await imageBackupAdminClient.create(imageId.trim(), manualTargetProviderConfigId);
    setSelected(detail);
    setNotice('Đã tạo job thủ công. Bấm “Chạy một bước” để xử lý ảnh.');
  });

  const verifyCanonical = () => void run(async () => {
    if (!imageId.trim()) throw new Error('Nhập imageId cần kiểm tra.');
    setNotice(`Canonical: ${integrityText(await imageBackupAdminClient.verifyCanonical(imageId.trim()))}`);
  });

  const filterReplicas = () => void run(async () => {
    if (!imageId.trim()) throw new Error('Nhập imageId cần tra cứu.');
    setReplicas(await imageBackupAdminClient.replicas(imageId.trim()));
    setNotice('Đã lọc replica theo imageId. Bấm Tải lại để trở về danh sách gần đây.');
  });

  const restore = (replica: ImageReplicaSummary) => {
    const confirmation = window.prompt(
      `Khôi phục replica ${replica.replicaId}\n` +
      `Provider replica: ${providerLabels[replica.providerConfigId] || replica.providerConfigId}\n` +
      'Đích: canonical provider/object trong Image Registry.\n' +
      'Không ghi đè object canonical đang tồn tại.\n\n' +
      `Nhập: RESTORE ${replica.imageId}`,
    );
    if (confirmation === null) return;
    void run(async () => {
      const result = await imageBackupAdminClient.restore(replica.imageId, replica.replicaId, confirmation);
      setNotice(`Restore: ${integrityText(result)}`);
    });
  };

  return (
    <section className="p-4 rounded-2xl border-2 border-violet-200 bg-violet-50/50 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h5 className="font-black text-violet-950 flex items-center gap-2"><ArchiveRestore className="w-5 h-5" /> Backup & Restore</h5>
          <p className="text-[11px] text-violet-900/75 mt-1">Policy tạo replica độc lập; không đổi canonical provider hoặc routing upload.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => { setDraft(emptyPolicyDraft()); setShowPolicyForm(true); }} className="px-3 py-2 rounded-xl bg-violet-700 text-white text-xs font-black disabled:opacity-50 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Tạo policy
          </button>
          <button type="button" disabled={busy} onClick={() => void refresh()} className="px-3 py-2 rounded-xl border border-violet-300 bg-white text-violet-800 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Tải lại
          </button>
        </div>
      </div>

      <p className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-[11px]">
        Bản sao backup tiêu thụ dung lượng trên provider đích. Backfill chỉ chạy khi bạn bấm yêu cầu, xử lý theo trang nhỏ và không giữ worker thường trực.
      </p>
      {error ? <p className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs">{error}</p> : null}
      {notice ? <p className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">{notice}</p> : null}

      {showPolicyForm ? (
        <div className="p-4 rounded-2xl border border-violet-300 bg-white space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h6 className="font-black text-sm text-neutral-900">{draft.policyId ? 'Sửa backup policy' : 'Tạo backup policy'}</h6>
            <button type="button" onClick={() => setShowPolicyForm(false)} className="text-xs font-bold text-neutral-500">Đóng</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs font-bold text-neutral-700">Tên policy
              <input value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 px-3" />
            </label>
            <label className="text-xs font-bold text-neutral-700">Provider nguồn
              <select value={draft.sourceProviderConfigId} onChange={(event) => setDraft((current) => ({ ...current, sourceProviderConfigId: event.target.value }))} className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 px-3 bg-white">
                {sourceProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label} · {provider.id}{provider.enabled ? '' : ' (đang tắt)'}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-neutral-700">Provider đích
              <select value={draft.targetProviderConfigId} onChange={(event) => setDraft((current) => ({ ...current, targetProviderConfigId: event.target.value }))} className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 px-3 bg-white">
                <option value="">Chọn provider đích</option>
                {targetProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label} · {provider.id}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <input type="checkbox" checked={draft.autoBackupNewImages} onChange={(event) => setDraft((current) => ({ ...current, autoBackupNewImages: event.target.checked }))} />
            Tự động backup ảnh mới sau khi canonical được tạo hoàn tất
          </label>
          <button type="button" disabled={busy} onClick={savePolicy} className="px-4 py-2 rounded-xl bg-violet-700 text-white text-xs font-black disabled:opacity-50">Lưu policy</button>
        </div>
      ) : null}

      <div className="space-y-3">
        <h6 className="font-black text-sm text-neutral-900">Backup policies</h6>
        {policies.length === 0 ? <p className="text-xs text-neutral-500">Chưa có policy. Tạo policy để cấu hình backup tự động hoặc backfill.</p> : null}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {policies.map((policy) => {
            const coverage = coverageByPolicy[policy.policyId];
            const activeBackfill = jobs.find((job) => job.policyId === policy.policyId && job.jobType === 'BACKFILL' && ['PENDING', 'RUNNING'].includes(job.status));
            return (
              <article key={policy.policyId} className="p-4 rounded-2xl border border-neutral-200 bg-white space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h6 className="font-black text-neutral-900">{policy.displayName}</h6>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${policy.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'}`}>{policy.enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${policy.autoBackupNewImages ? 'bg-violet-100 text-violet-800' : 'bg-neutral-100 text-neutral-600'}`}>AUTO ẢNH MỚI: {policy.autoBackupNewImages ? 'ON' : 'OFF'}</span>
                    </div>
                    <p className="text-xs text-neutral-700 mt-1">{providerLabels[policy.sourceProviderConfigId] || policy.sourceProviderConfigId} → {providerLabels[policy.targetProviderConfigId] || policy.targetProviderConfigId}</p>
                    <p className="font-mono text-[10px] text-neutral-500 break-all">{policy.sourceProviderConfigId} → {policy.targetProviderConfigId}</p>
                    <p className="font-mono text-[10px] text-neutral-400 break-all mt-1">{policy.policyId}</p>
                  </div>
                  <button type="button" disabled={busy} onClick={() => editPolicy(policy)} className="px-2.5 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 text-xs font-bold disabled:opacity-50"><Pencil className="inline w-3.5 h-3.5 mr-1" />Sửa</button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="p-2 rounded-lg bg-neutral-50"><p className="text-[10px] text-neutral-500">Ảnh hợp lệ</p><b className="text-sm">{coverage?.eligibleImages ?? '—'}</b></div>
                  <div className="p-2 rounded-lg bg-emerald-50"><p className="text-[10px] text-emerald-700">Đã verified</p><b className="text-sm text-emerald-800">{coverage?.verifiedReplicas ?? '—'}</b></div>
                  <div className="p-2 rounded-lg bg-amber-50"><p className="text-[10px] text-amber-700">Thiếu backup</p><b className="text-sm text-amber-800">{coverage?.missingBackup ?? '—'}</b></div>
                  <div className="p-2 rounded-lg bg-red-50"><p className="text-[10px] text-red-700">Replica lỗi</p><b className="text-sm text-red-800">{coverage?.unhealthyReplicas ?? '—'}</b></div>
                  <div className="p-2 rounded-lg bg-violet-50"><p className="text-[10px] text-violet-700">Coverage</p><b className="text-sm text-violet-800">{coverage ? `${coverage.coveragePercent}%` : '—'}</b></div>
                </div>

                {activeBackfill ? <p className="p-2 rounded-lg bg-blue-50 text-blue-800 text-[11px]">Backfill đang chạy: {activeBackfill.completedItems}/{activeBackfill.totalItems} hoàn tất · discovery {activeBackfill.discoveryStatus}</p> : null}
                {policy.lastErrorCode ? <p className="text-[11px] text-red-700">Lỗi gần nhất: {policy.lastErrorCode}</p> : null}
                <p className="text-[10px] text-neutral-500">Hoạt động gần nhất: {formatDate(policy.lastActivityAt)}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void run(async () => { await imageBackupAdminClient.setPolicyEnabled(policy.policyId, !policy.enabled); setNotice(policy.enabled ? 'Đã tắt policy.' : 'Đã bật policy.'); })} className={`px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${policy.enabled ? 'border border-red-300 text-red-700' : 'bg-emerald-700 text-white'}`}>{policy.enabled ? 'Tắt policy' : 'Bật policy'}</button>
                  <button type="button" disabled={busy || !policy.enabled || Boolean(activeBackfill)} onClick={() => startBackfill(policy)} className="px-3 py-2 rounded-xl border border-violet-300 text-violet-800 text-xs font-bold disabled:opacity-50">{activeBackfill ? 'Backfill đang chạy' : 'Backup tất cả ảnh còn thiếu'}</button>
                  <button type="button" disabled={busy} onClick={() => loadCoverage(policy.policyId)} className="px-3 py-2 rounded-xl border border-neutral-300 text-neutral-700 text-xs font-bold disabled:opacity-50">Cập nhật coverage</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h6 className="font-black text-sm text-neutral-900">Jobs gần đây</h6>
          {jobs.length === 0 ? <p className="text-xs text-neutral-500">Chưa có job.</p> : jobs.map((job) => (
            <button key={job.jobId} type="button" onClick={() => void run(async () => setSelected(await imageBackupAdminClient.get(job.jobId)), job.jobId)} className="w-full text-left p-3 rounded-xl border border-neutral-200 bg-white hover:border-violet-300">
              <div className="flex justify-between gap-2"><span className="font-bold text-xs">{jobLabel(job)}</span><span className="text-[10px] font-black">{job.status}</span></div>
              <p className="text-[11px] text-neutral-600 mt-1">{providerLabels[job.sourceProviderConfigId] || job.sourceProviderConfigId} → {providerLabels[job.targetProviderConfigId] || job.targetProviderConfigId}</p>
              <p className="text-[11px] text-neutral-500">{job.completedItems}/{job.totalItems} hoàn tất · {job.failedItems} lỗi · {job.pendingItems} chờ</p>
              {job.jobType === 'BACKFILL' ? <p className="text-[10px] text-neutral-500">Đã duyệt {job.discoveredItems} · bỏ qua {job.skippedVerifiedItems} replica đã verified · discovery {job.discoveryStatus}</p> : null}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <h6 className="font-black text-sm text-neutral-900">Chi tiết job</h6>
          {!selected ? <p className="text-xs text-neutral-500">Chọn một job để xem tối đa 100 item gần nhất.</p> : (
            <div className="p-3 rounded-xl border border-neutral-200 bg-white space-y-3">
              <div className="flex flex-wrap gap-2">
                {selected.job.jobType === 'MANUAL' && ['PENDING', 'RUNNING'].includes(selected.job.status) && !selected.job.cancelRequested ? (
                  <button type="button" disabled={busy} onClick={() => void run(async () => setSelected(await imageBackupAdminClient.runStep(selected.job.jobId)), selected.job.jobId)} className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold disabled:opacity-50">Chạy một bước</button>
                ) : null}
                {['PENDING', 'RUNNING'].includes(selected.job.status) && !selected.job.cancelRequested ? (
                  <button type="button" disabled={busy} onClick={() => void run(async () => setSelected(await imageBackupAdminClient.cancel(selected.job.jobId)), selected.job.jobId)} className="px-3 py-2 rounded-xl border border-red-300 text-red-700 text-xs font-bold disabled:opacity-50"><XCircle className="inline w-3.5 h-3.5 mr-1" />Huỷ job</button>
                ) : null}
              </div>
              {selected.job.cancelRequested && selected.job.status === 'RUNNING' ? <p className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[11px]">Đã yêu cầu huỷ. Item đang giữ lease được phép kết thúc an toàn; worker không nhận item mới.</p> : null}
              {selected.items.map((entry) => (
                <div key={entry.imageId} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px]">
                  <div className="flex justify-between gap-2"><span className="font-bold break-all">{entry.originalFileName || entry.entityId || entry.imageId}</span><b>{entry.status}</b></div>
                  <p className="font-mono text-[10px] text-neutral-500 break-all">{entry.imageId}</p>
                  <p>{formatBytes(entry.actualSizeBytes ?? entry.expectedSizeBytes)} · lần thử {entry.attemptCount}/3</p>
                  {entry.errorCode ? <p className="text-red-700">{entry.errorCode}: {entry.errorMessage}</p> : null}
                  {entry.status === 'FAILED' && entry.attemptCount < 3 && entry.errorCode && RETRYABLE_ERROR_CODES.has(entry.errorCode) ? <button type="button" disabled={busy} onClick={() => void run(async () => setSelected(await imageBackupAdminClient.retry(selected.job.jobId, entry.imageId)), selected.job.jobId)} className="mt-1 text-violet-700 font-bold"><RotateCcw className="inline w-3 h-3 mr-1" />Thử lại</button> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h6 className="font-black text-sm text-neutral-900">Backup cần chú ý ({failedItems.length})</h6>
        {failedItems.length === 0 ? <p className="text-xs text-emerald-700">Không có item lỗi trong danh sách gần đây.</p> : failedItems.map((entry) => (
          <div key={`${entry.jobId}:${entry.imageId}`} className="p-3 rounded-xl border border-red-200 bg-white text-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-black text-neutral-900 break-all">{entry.label}</p>
                <p className="font-mono text-[10px] text-neutral-500 break-all">{entry.imageId}</p>
                <p className="text-neutral-600 mt-1">{providerLabels[entry.sourceProviderConfigId] || entry.sourceProviderConfigId} → {providerLabels[entry.targetProviderConfigId] || entry.targetProviderConfigId}</p>
                <p className="text-neutral-500">Lần thử {entry.attemptCount}/3 · {formatDate(entry.updatedAt)}</p>
                <p className="text-red-700 mt-1">{entry.errorCode}: {entry.errorMessage}</p>
              </div>
              {entry.jobId && entry.attemptCount < 3 && RETRYABLE_ERROR_CODES.has(entry.errorCode) ? <button type="button" disabled={busy} onClick={() => void run(async () => setSelected(await imageBackupAdminClient.retry(entry.jobId, entry.imageId)), entry.jobId)} className="px-2.5 py-1.5 rounded-lg border border-violet-300 text-violet-700 text-xs font-bold disabled:opacity-50"><RotateCcw className="inline w-3.5 h-3.5 mr-1" />Thử lại</button> : <p className="text-[10px] text-neutral-500 sm:text-right">Không tự retry; cần xử lý nguyên nhân trước.</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h6 className="font-black text-sm text-neutral-900">Verified replicas gần đây ({replicas.length})</h6>
        {replicas.length === 0 ? <p className="text-xs text-neutral-500">Không có replica phù hợp.</p> : replicas.map((replica) => (
          <div key={replica.replicaId} className="p-3 rounded-xl border border-neutral-200 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div className="min-w-0 text-[11px]">
                <p className="font-black text-neutral-900">{replica.status} · {providerLabels[replica.providerConfigId] || replica.providerConfigId}</p>
                <p className="font-mono break-all text-neutral-500">{replica.imageId}</p>
                <p>{formatBytes(replica.sizeBytes)} · SHA-256 {replica.checksum.value}</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button type="button" disabled={busy} onClick={() => void run(async () => setNotice(`Replica: ${integrityText(await imageBackupAdminClient.verifyReplica(replica.replicaId))}`))} className="px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-bold disabled:opacity-50"><CheckCircle2 className="inline w-3.5 h-3.5 mr-1" />Verify</button>
                {replica.status === 'VERIFIED' ? <button type="button" disabled={busy} onClick={() => restore(replica)} className="px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-xs font-bold disabled:opacity-50"><ArchiveRestore className="inline w-3.5 h-3.5 mr-1" />Restore missing-only</button> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <details className="rounded-2xl border border-neutral-300 bg-white">
        <summary className="p-4 cursor-pointer text-sm font-black text-neutral-800 flex items-center gap-2"><ChevronDown className="w-4 h-4" /> Advanced / Troubleshooting</summary>
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px] text-neutral-500">Công cụ kỹ thuật theo imageId; không cần dùng trong vận hành policy hằng ngày.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 text-xs font-bold text-neutral-700">Image ID
              <input value={imageId} onChange={(event) => setImageId(event.target.value)} placeholder="Nhập đúng imageId" className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 px-3 font-mono" />
            </label>
            <label className="text-xs font-bold text-neutral-700">Provider đích thủ công
              <select value={manualTargetProviderConfigId} onChange={(event) => setManualTargetProviderConfigId(event.target.value)} className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3">
                {targetProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.label} · {provider.id}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={createManualJob} className="px-3 py-2 rounded-xl bg-violet-700 text-white text-xs font-black disabled:opacity-50">Tạo backup job (1 ảnh)</button>
            <button type="button" disabled={busy} onClick={verifyCanonical} className="px-3 py-2 rounded-xl border border-violet-300 text-violet-800 text-xs font-bold disabled:opacity-50"><ShieldCheck className="inline w-4 h-4 mr-1" />Verify canonical</button>
            <button type="button" disabled={busy} onClick={filterReplicas} className="px-3 py-2 rounded-xl border border-neutral-300 text-neutral-700 text-xs font-bold disabled:opacity-50">Tra replica</button>
          </div>
        </div>
      </details>
    </section>
  );
};
