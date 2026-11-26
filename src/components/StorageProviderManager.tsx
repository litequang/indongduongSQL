import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  HardDrive,
  Key,
  Pencil,
  Plus,
  PowerOff,
  RefreshCw,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { canManageSystemSettings } from '../permissions';
import { storageProviderAdminClient } from '../services/storageProviderAdminClient';
import { StorageBackupManager } from './StorageBackupManager';
import {
  StorageProviderAdminSummary,
  StorageProviderHealthStatus,
  StorageProviderRuntimeStatus,
  StorageRuntimeConfig,
} from '../storage/adminTypes';

type ProviderAction = 'testing' | 'disabling' | 'enabling';

interface ProviderFormState {
  providerConfigId: string;
  displayName: string;
  accountId: string;
  bucket: string;
  endpoint: string;
  deliveryBaseUrl: string;
  priority: string;
  softLimitGb: string;
}

const EMPTY_FORM: ProviderFormState = {
  providerConfigId: '',
  displayName: '',
  accountId: '',
  bucket: '',
  endpoint: '',
  deliveryBaseUrl: '',
  priority: '100',
  softLimitGb: '',
};

const HEALTH_PRESENTATION: Record<StorageProviderHealthStatus, {
  label: string;
  detail: string;
  badge: string;
}> = {
  NOT_TESTED: {
    label: 'CHƯA KIỂM TRA',
    detail: 'Chưa có kết quả kiểm tra kết nối từ backend.',
    badge: 'bg-neutral-100 text-neutral-700 border-neutral-300',
  },
  HEALTHY: {
    label: 'HOẠT ĐỘNG TỐT',
    detail: 'Backend đã xác minh quyền truy cập bucket tại lần kiểm tra gần nhất.',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  AUTH_FAILED: {
    label: 'SAI CREDENTIAL',
    detail: 'R2 từ chối Access Key hoặc Secret Access Key.',
    badge: 'bg-red-100 text-red-800 border-red-300',
  },
  BUCKET_NOT_FOUND: {
    label: 'KHÔNG TÌM THẤY BUCKET',
    detail: 'Kiểm tra tên bucket và tài khoản Cloudflare.',
    badge: 'bg-red-100 text-red-800 border-red-300',
  },
  PERMISSION_DENIED: {
    label: 'THIẾU QUYỀN',
    detail: 'Credential không có đủ quyền đọc/ghi/xóa đối tượng kiểm tra.',
    badge: 'bg-red-100 text-red-800 border-red-300',
  },
  INVALID_CONFIG: {
    label: 'CẤU HÌNH CHƯA HỢP LỆ',
    detail: 'Kiểm tra Account ID, endpoint, bucket và trạng thái credential.',
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  NETWORK_ERROR: {
    label: 'LỖI MẠNG',
    detail: 'Backend chưa thể kết nối tới nhà cung cấp.',
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  UNKNOWN_ERROR: {
    label: 'CHƯA XÁC ĐỊNH',
    detail: 'Kiểm tra lại cấu hình hoặc thử lại sau.',
    badge: 'bg-neutral-200 text-neutral-800 border-neutral-300',
  },
};

function formatDate(value?: string): string {
  if (!value) return 'Chưa có';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function priority(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : null;
}

function softLimitBytes(value: string): number | null | undefined {
  if (!value.trim()) return undefined;
  const gb = Number(value);
  if (!Number.isFinite(gb) || gb <= 0) return null;
  const bytes = Math.round(gb * 1024 * 1024 * 1024);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function formatBytes(value: number): string {
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unit).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${units[unit]}`;
}

function sortProviders(items: StorageProviderAdminSummary[]): StorageProviderAdminSummary[] {
  return [...items].sort((left, right) =>
    left.priority - right.priority || left.providerConfigId.localeCompare(right.providerConfigId));
}

function Dialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white border border-neutral-200 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5 bg-white border-b border-neutral-200">
          <div>
            <h4 className="font-black text-neutral-950">{title}</h4>
            <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required,
  readOnly,
  type = 'text',
  maxLength,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  type?: 'text' | 'number' | 'url';
  maxLength?: number;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-neutral-700">
        {label}{required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        maxLength={maxLength}
        min={type === 'number' ? 0 : undefined}
        max={type === 'number' ? 10000 : undefined}
        className={`w-full min-h-[40px] px-3 py-2 rounded-xl border text-xs outline-hidden ${
          readOnly
            ? 'bg-neutral-100 border-neutral-200 text-neutral-600 font-mono'
            : 'bg-white border-neutral-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
        }`}
      />
      {hint ? <span className="block text-[10px] text-neutral-500 leading-relaxed">{hint}</span> : null}
    </label>
  );
}

export const StorageProviderManager: React.FC = () => {
  const { realAuthenticatedUser, isDemoActive, isRolePreviewActive } = useApp();
  const authorized = !isDemoActive && !isRolePreviewActive && canManageSystemSettings(realAuthenticatedUser);
  const [providers, setProviders] = useState<StorageProviderAdminSummary[]>([]);
  const [runtime, setRuntime] = useState<StorageRuntimeConfig | null>(null);
  const [runtimeStatuses, setRuntimeStatuses] = useState<Record<string, StorageProviderRuntimeStatus>>({});
  const [savingRuntime, setSavingRuntime] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [providerActions, setProviderActions] = useState<Record<string, ProviderAction | undefined>>({});
  const providerLocks = useRef(new Set<string>());

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<ProviderFormState>(EMPTY_FORM);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingLock = useRef(false);

  const [editTarget, setEditTarget] = useState<StorageProviderAdminSummary | null>(null);
  const [editForm, setEditForm] = useState<ProviderFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editLock = useRef(false);

  const [credentialTarget, setCredentialTarget] = useState<StorageProviderAdminSummary | null>(null);
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [credentialError, setCredentialError] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);
  const credentialLock = useRef(false);

  const replaceProvider = (next: StorageProviderAdminSummary) => {
    setProviders((current) => sortProviders([
      ...current.filter((provider) => provider.providerConfigId !== next.providerConfigId),
      next,
    ]));
  };

  const refresh = async () => {
    if (!authorized) return;
    setLoading(true);
    setLoadError('');
    try {
      const [listed, runtimeResult] = await Promise.all([
        storageProviderAdminClient.list(),
        storageProviderAdminClient.listRuntimeStatus(),
      ]);
      setProviders(sortProviders(listed));
      setRuntime(runtimeResult.config);
      setRuntimeStatuses(Object.fromEntries(runtimeResult.providers.map((status) => [status.providerConfigId, status])));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách nhà cung cấp.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authorized) void refresh();
  }, [authorized]);

  const runProviderAction = async (
    providerConfigId: string,
    action: ProviderAction,
    operation: () => Promise<void>,
  ) => {
    if (providerLocks.current.has(providerConfigId)) return;
    providerLocks.current.add(providerConfigId);
    setProviderActions((current) => ({ ...current, [providerConfigId]: action }));
    setNotice('');
    setLoadError('');
    try {
      await operation();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.');
    } finally {
      providerLocks.current.delete(providerConfigId);
      setProviderActions((current) => ({ ...current, [providerConfigId]: undefined }));
    }
  };

  const openCreate = () => {
    setCreateForm(EMPTY_FORM);
    setCreateError('');
    setShowCreate(true);
  };

  const closeCredentials = () => {
    setAccessKeyId('');
    setSecretAccessKey('');
    setShowSecret(false);
    setCredentialError('');
    setCredentialTarget(null);
  };

  const openCredentials = (provider: StorageProviderAdminSummary) => {
    setAccessKeyId('');
    setSecretAccessKey('');
    setShowSecret(false);
    setCredentialError('');
    setCredentialTarget(provider);
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creatingLock.current) return;
    const parsedPriority = priority(createForm.priority);
    const parsedSoftLimit = softLimitBytes(createForm.softLimitGb);
    if (
      !createForm.providerConfigId.trim() || !createForm.displayName.trim() ||
      !createForm.accountId.trim() || !createForm.bucket.trim()
    ) {
      setCreateError('Vui lòng nhập đủ các trường bắt buộc.');
      return;
    }
    if (parsedPriority === null) {
      setCreateError('Độ ưu tiên phải là số nguyên từ 0 đến 10000.');
      return;
    }
    if (parsedSoftLimit === null) {
      setCreateError('Soft limit phải là số GB lớn hơn 0 hoặc để trống.');
      return;
    }
    creatingLock.current = true;
    setCreating(true);
    setCreateError('');
    try {
      const created = await storageProviderAdminClient.create({
        providerConfigId: createForm.providerConfigId.trim().toLowerCase(),
        providerType: 'R2',
        displayName: createForm.displayName.trim(),
        accountId: createForm.accountId.trim(),
        bucket: createForm.bucket.trim(),
        ...(createForm.endpoint.trim() ? { endpoint: createForm.endpoint.trim() } : {}),
        ...(createForm.deliveryBaseUrl.trim() ? { deliveryBaseUrl: createForm.deliveryBaseUrl.trim() } : {}),
        enabled: false,
        priority: parsedPriority,
        ...(parsedSoftLimit ? { softLimitBytes: parsedSoftLimit } : {}),
      });
      replaceProvider(created);
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      setNotice('Đã tạo cấu hình ở trạng thái tắt. Hãy nhập credential; nếu lưu credential lỗi, cấu hình vẫn được giữ để thử lại.');
      openCredentials(created);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Không thể tạo cấu hình.');
    } finally {
      creatingLock.current = false;
      setCreating(false);
    }
  };

  const openEdit = (provider: StorageProviderAdminSummary) => {
    setEditTarget(provider);
    setEditError('');
    setEditForm({
      providerConfigId: provider.providerConfigId,
      displayName: provider.displayName,
      accountId: provider.accountId,
      bucket: provider.bucket,
      endpoint: provider.endpoint,
      deliveryBaseUrl: provider.deliveryBaseUrl || '',
      priority: String(provider.priority),
      softLimitGb: provider.softLimitBytes ? String(provider.softLimitBytes / 1024 / 1024 / 1024) : '',
    });
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editTarget || editLock.current) return;
    const parsedPriority = priority(editForm.priority);
    const parsedSoftLimit = softLimitBytes(editForm.softLimitGb);
    if (!editForm.displayName.trim() || !editForm.accountId.trim() || !editForm.bucket.trim()) {
      setEditError('Vui lòng nhập đủ tên cấu hình, Account ID và bucket.');
      return;
    }
    if (parsedPriority === null) {
      setEditError('Độ ưu tiên phải là số nguyên từ 0 đến 10000.');
      return;
    }
    if (parsedSoftLimit === null) {
      setEditError('Soft limit phải là số GB lớn hơn 0 hoặc để trống.');
      return;
    }
    editLock.current = true;
    setSavingEdit(true);
    setEditError('');
    try {
      const accountChanged = editForm.accountId.trim() !== editTarget.accountId;
      const endpointUnchanged = editForm.endpoint.trim() === editTarget.endpoint;
      const updated = await storageProviderAdminClient.update({
        providerConfigId: editTarget.providerConfigId,
        displayName: editForm.displayName.trim(),
        accountId: editForm.accountId.trim(),
        bucket: editForm.bucket.trim(),
        ...(!(accountChanged && endpointUnchanged) ? { endpoint: editForm.endpoint.trim() } : {}),
        deliveryBaseUrl: editForm.deliveryBaseUrl.trim(),
        priority: parsedPriority,
        softLimitBytes: parsedSoftLimit ?? null,
      });
      replaceProvider(updated);
      setEditTarget(null);
      setNotice(`Đã cập nhật cấu hình ${updated.displayName}. Credential không bị thay đổi.`);
      void refresh();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Không thể cập nhật cấu hình.');
    } finally {
      editLock.current = false;
      setSavingEdit(false);
    }
  };

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!credentialTarget || credentialLock.current) return;
    if (!accessKeyId.trim() || !secretAccessKey.trim()) {
      setCredentialError('Vui lòng nhập đủ Access Key ID và Secret Access Key.');
      return;
    }
    credentialLock.current = true;
    setSavingCredentials(true);
    setCredentialError('');
    try {
      const updated = await storageProviderAdminClient.setCredentials(
        credentialTarget.providerConfigId,
        accessKeyId.trim(),
        secretAccessKey.trim(),
      );
      replaceProvider(updated);
      // Credential values exist only in this transient form state and are
      // destroyed immediately after a successful callable response.
      setAccessKeyId('');
      setSecretAccessKey('');
      setShowSecret(false);
      setCredentialTarget(null);
      setNotice(`Đã lưu credential mới cho ${updated.displayName}. Giá trị bí mật không được lưu hoặc hiển thị lại trên trình duyệt.`);
      void refresh();
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : 'Không thể lưu credential.');
    } finally {
      credentialLock.current = false;
      setSavingCredentials(false);
    }
  };

  const testProvider = (provider: StorageProviderAdminSummary) => runProviderAction(
    provider.providerConfigId,
    'testing',
    async () => {
      const result = await storageProviderAdminClient.testConnection(provider.providerConfigId);
      replaceProvider({
        ...provider,
        healthStatus: result.status,
        lastHealthCheckAt: result.testedAt,
        updatedAt: result.testedAt,
      });
      setNotice(`${provider.displayName}: ${HEALTH_PRESENTATION[result.status].detail}`);
      void refresh();
    },
  );

  const disableProvider = (provider: StorageProviderAdminSummary) => {
    const confirmed = confirm(
      `Tắt cấu hình “${provider.displayName}”?\n\n` +
      'Thao tác này chỉ ngăn sử dụng mới. Bucket, credential, ảnh và Image Registry sẽ không bị xóa.',
    );
    if (!confirmed) return;
    void runProviderAction(provider.providerConfigId, 'disabling', async () => {
      const updated = await storageProviderAdminClient.disable(provider.providerConfigId);
      replaceProvider(updated);
      setNotice(`Đã tắt ${updated.displayName}. Không có bucket, credential hoặc ảnh nào bị xóa.`);
      void refresh();
    });
  };

  const enableProvider = (provider: StorageProviderAdminSummary) => {
    void runProviderAction(provider.providerConfigId, 'enabling', async () => {
      const updated = await storageProviderAdminClient.enable(provider.providerConfigId);
      replaceProvider(updated);
      setNotice(`Đã bật ${updated.displayName} cho các upload mới đủ điều kiện.`);
      void refresh();
    });
  };

  const updateRuntime = async (changes: Parameters<typeof storageProviderAdminClient.updateRuntime>[0]) => {
    if (savingRuntime) return;
    setSavingRuntime(true);
    setLoadError('');
    try {
      setRuntime(await storageProviderAdminClient.updateRuntime(changes));
      setNotice('Đã cập nhật chiến lược lưu trữ cho các upload mới. Ảnh cũ không bị di chuyển.');
      void refresh();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể cập nhật chiến lược lưu trữ.');
    } finally {
      setSavingRuntime(false);
    }
  };

  const setManualActive = async (providerConfigId: string) => {
    if (savingRuntime) return;
    setSavingRuntime(true);
    setLoadError('');
    try {
      setRuntime(await storageProviderAdminClient.setManualActive(providerConfigId));
      setNotice(runtime?.strategy === 'MANUAL'
        ? 'Đã đổi provider cho upload mới ở chế độ Manual.'
        : 'Đã lưu provider sẽ dùng khi chuyển sang Manual; Automatic vẫn chọn theo eligibility và priority.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể chọn provider.');
    } finally {
      setSavingRuntime(false);
    }
  };

  if (!authorized) return null;

  return (
    <div className="space-y-4 animate-in fade-in duration-100">
      <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-sky-600 text-white shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-black text-sky-950">Storage Manager</h4>
            <p className="text-xs text-sky-900/80 mt-0.5 leading-relaxed">
              Quản lý provider và chiến lược backend cho các upload ảnh mới. Ảnh đã tồn tại luôn ở nguyên provider cũ.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="min-h-[38px] px-3 py-2 rounded-xl border border-sky-300 bg-white text-sky-800 text-xs font-bold hover:bg-sky-100 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Tải lại
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="min-h-[38px] px-3 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-black flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Thêm Provider
          </button>
        </div>
      </div>

      {notice ? (
        <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      ) : null}
      {loadError ? (
        <div className="p-3 rounded-xl border border-red-300 bg-red-50 text-red-900 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      ) : null}

      {runtime ? (
        <div className="p-4 rounded-2xl border-2 border-sky-200 bg-white space-y-3">
          <div>
            <h5 className="font-black text-neutral-950">Chiến lược upload mới</h5>
            <p className="text-[11px] text-neutral-500">Cấu hình backend-authoritative; không di chuyển ảnh đã tồn tại.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-neutral-700">Strategy
              <select
                value={runtime.strategy}
                disabled={savingRuntime}
                onChange={(event) => void updateRuntime({ strategy: event.target.value as StorageRuntimeConfig['strategy'] })}
                className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3"
              >
                <option value="MANUAL">MANUAL</option>
                <option value="AUTOMATIC">AUTOMATIC</option>
              </select>
            </label>
            {runtime.strategy === 'MANUAL' ? (
              <label className="text-xs font-bold text-neutral-700">Provider upload đang chọn
                <select
                  value={runtime.activeProviderConfigId}
                  disabled={savingRuntime}
                  onChange={(event) => void setManualActive(event.target.value)}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3"
                >
                  <option value="firebase-primary">Firebase Storage · firebase-primary</option>
                  {providers.map((provider) => (
                    <option key={provider.providerConfigId} value={provider.providerConfigId}>
                      {provider.displayName} · {provider.enabled && provider.credentialsConfigured && provider.healthStatus === 'HEALTHY' ? 'đủ điều kiện' : 'chưa đủ điều kiện'}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="text-xs font-bold text-neutral-700">Ngưỡng tracked usage (%)
                <input
                  key={runtime.automaticThresholdPercent}
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={runtime.automaticThresholdPercent}
                  disabled={savingRuntime}
                  onBlur={(event) => void updateRuntime({ automaticThresholdPercent: Number(event.target.value) })}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3"
                />
              </label>
            )}
          </div>
          {runtime.strategy === 'AUTOMATIC' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                <input
                  type="checkbox"
                  checked={runtime.firebaseFallbackEnabled}
                  disabled={savingRuntime}
                  onChange={(event) => void updateRuntime({ firebaseFallbackEnabled: event.target.checked })}
                />
                Dùng firebase-primary làm fallback cuối
              </label>
              <label className="text-xs font-bold text-neutral-700">Provider sẽ dùng nếu chuyển sang Manual
                <select
                  value={runtime.activeProviderConfigId}
                  disabled={savingRuntime}
                  onChange={(event) => void setManualActive(event.target.value)}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-neutral-300 bg-white px-3"
                >
                  <option value="firebase-primary">Firebase Storage · firebase-primary</option>
                  {providers.map((provider) => <option key={provider.providerConfigId} value={provider.providerConfigId}>{provider.displayName}</option>)}
                </select>
              </label>
            </div>
          ) : null}
          <p className="text-[11px] text-neutral-500">
            Automatic: R2 đủ điều kiện được xếp theo priority nhỏ hơn trước, sau đó theo providerConfigId. Ngưỡng là routing vận hành và có thể vượt nhẹ khi nhiều upload đồng thời.
          </p>
        </div>
      ) : null}

      <div className="p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h5 className="font-black text-emerald-950">Firebase Storage</h5>
                <span className="px-2 py-0.5 rounded-full border border-emerald-300 bg-white text-emerald-800 text-[10px] font-black">
                  {runtime?.strategy === 'MANUAL' && runtime.activeProviderConfigId === 'firebase-primary'
                    ? 'ĐANG CHỌN (MANUAL)'
                    : runtime?.strategy === 'AUTOMATIC' && runtime.firebaseFallbackEnabled ? 'FALLBACK CUỐI' : 'BUILT-IN'}
                </span>
              </div>
              <p className="font-mono text-[11px] text-emerald-800 mt-1">firebase-primary · FIREBASE_STORAGE</p>
              <p className="text-xs text-emerald-900/80 mt-1">
                Provider built-in cho upload trực tiếp qua Firebase SDK và đọc ảnh Firebase hiện có.
              </p>
              <p className="text-xs text-emerald-900 mt-1 font-bold">
                Tracked app usage: {formatBytes(runtimeStatuses['firebase-primary']?.trackedUsageBytes || 0)}
              </p>
            </div>
          </div>
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
        </div>
      </div>

      <StorageBackupManager providers={providers} />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h5 className="font-black text-neutral-950">Cấu hình Cloudflare R2</h5>
            <p className="text-[11px] text-neutral-500">Mỗi thẻ là một configuration instance độc lập.</p>
          </div>
          <span className="text-[11px] font-bold text-neutral-500">{providers.length} cấu hình</span>
        </div>

        {loading && providers.length === 0 ? (
          <div className="p-8 rounded-2xl border border-neutral-200 bg-neutral-50 text-center text-neutral-600 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-600" />
            Đang tải cấu hình đã được backend làm sạch...
          </div>
        ) : null}

        {!loading && providers.length === 0 ? (
          <div className="p-6 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 text-center">
            <Server className="w-7 h-7 mx-auto text-neutral-400" />
            <p className="font-black text-neutral-800 mt-2">Chưa cấu hình nhà cung cấp lưu trữ ảnh bên ngoài.</p>
            <p className="text-xs text-neutral-500 mt-1">Hệ thống không tự động tạo cấu hình R2.</p>
            <button type="button" onClick={openCreate} className="mt-3 px-3 py-2 rounded-xl bg-sky-700 text-white text-xs font-black inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Thêm Provider
            </button>
          </div>
        ) : null}

        {providers.map((provider) => {
          const health = HEALTH_PRESENTATION[provider.healthStatus];
          const action = providerActions[provider.providerConfigId];
          const runtimeStatus = runtimeStatuses[provider.providerConfigId];
          return (
            <div key={provider.providerConfigId} className="p-4 rounded-2xl border border-neutral-200 bg-white shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h6 className="font-black text-neutral-950">{provider.displayName}</h6>
                    <span className="px-2 py-0.5 rounded-full bg-orange-100 border border-orange-300 text-orange-800 text-[10px] font-black">CLOUDFLARE R2</span>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${
                      provider.enabled
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-neutral-100 text-neutral-600 border-neutral-300'
                    }`}>
                      {provider.enabled ? 'CHO PHÉP CẤP QUYỀN MỚI' : 'ĐÃ TẮT'}
                    </span>
                    {runtime?.strategy === 'MANUAL' && runtime.activeProviderConfigId === provider.providerConfigId ? (
                      <span className="px-2 py-0.5 rounded-full border border-violet-300 bg-violet-100 text-violet-800 text-[10px] font-black">ĐANG CHỌN (MANUAL)</span>
                    ) : null}
                  </div>
                  <p className="font-mono text-[11px] text-neutral-500 mt-1 break-all">{provider.providerConfigId}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black shrink-0 ${health.badge}`}>
                  {health.label}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span className="font-bold text-neutral-500">Bucket:</span> <span className="font-mono break-all">{provider.bucket || '—'}</span></div>
                <div><span className="font-bold text-neutral-500">Priority:</span> <span>{provider.priority}</span></div>
                <div><span className="font-bold text-neutral-500">Tracked app usage:</span> <span>{formatBytes(runtimeStatus?.trackedUsageBytes || 0)}</span></div>
                <div><span className="font-bold text-neutral-500">Soft limit:</span> <span>{provider.softLimitBytes ? formatBytes(provider.softLimitBytes) : 'Chưa cấu hình'}</span></div>
                <div><span className="font-bold text-neutral-500">Automatic eligibility:</span> <span className={runtimeStatus?.acceptsNewUploads ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{runtimeStatus?.acceptsNewUploads ? 'Đủ điều kiện' : (runtimeStatus?.eligibilityReasons.join(', ') || 'Chưa xác định')}</span></div>
                {runtimeStatus?.usagePercent !== undefined ? (
                  <div><span className="font-bold text-neutral-500">Tỷ lệ soft limit:</span> <span>{runtimeStatus.usagePercent.toFixed(1)}%</span></div>
                ) : null}
                <div><span className="font-bold text-neutral-500">Account ID:</span> <span className="font-mono break-all">{provider.accountId || '—'}</span></div>
                <div>
                  <span className="font-bold text-neutral-500">Credential:</span>{' '}
                  <span className={provider.credentialsConfigured ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                    {provider.credentialsConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
                  </span>
                </div>
                <div className="sm:col-span-2"><span className="font-bold text-neutral-500">Endpoint:</span> <span className="font-mono break-all">{provider.endpoint || '—'}</span></div>
                {provider.deliveryBaseUrl ? (
                  <div className="sm:col-span-2"><span className="font-bold text-neutral-500">Delivery URL:</span> <span className="font-mono break-all">{provider.deliveryBaseUrl}</span></div>
                ) : null}
              </div>

              <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200 text-[11px] text-neutral-700">
                <p>{health.detail}</p>
                <p className="mt-1 text-neutral-500">Lần kiểm tra: {formatDate(provider.lastHealthCheckAt)} · Cập nhật: {formatDate(provider.updatedAt)}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(action)}
                  onClick={() => void testProvider(provider)}
                  className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${action === 'testing' ? 'animate-spin' : ''}`} />
                  {action === 'testing' ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                </button>
                <button type="button" disabled={Boolean(action)} onClick={() => openEdit(provider)} className="px-3 py-2 rounded-xl border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Sửa cấu hình
                </button>
                <button type="button" disabled={Boolean(action)} onClick={() => openCredentials(provider)} className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" /> {provider.credentialsConfigured ? 'Thay credential' : 'Nhập credential'}
                </button>
                {provider.enabled ? (
                  <button type="button" disabled={Boolean(action)} onClick={() => disableProvider(provider)} className="px-3 py-2 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                    <PowerOff className="w-3.5 h-3.5" /> {action === 'disabling' ? 'Đang tắt...' : 'Tắt provider'}
                  </button>
                ) : (
                  <button type="button" disabled={Boolean(action)} onClick={() => enableProvider(provider)} className="px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> {action === 'enabling' ? 'Đang bật...' : 'Bật provider'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 leading-relaxed">
        <strong>Lưu ý vận hành:</strong> Tracked app usage chỉ cộng kích thước bản ghi ACTIVE trong Image Registry, không phải quota Cloudflare. Upload trực tiếp R2 cần CORS bucket giới hạn đúng origin ứng dụng, method PUT và các signed headers; hệ thống không tự cấu hình tài khoản Cloudflare.
      </div>

      {showCreate ? (
        <Dialog title="Thêm cấu hình Cloudflare R2" subtitle="Bước 1/2: tạo metadata không bí mật. Cấu hình mới luôn ở trạng thái tắt." onClose={() => !creating && setShowCreate(false)}>
          <form onSubmit={submitCreate} className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Mã cấu hình" required value={createForm.providerConfigId} onChange={(value) => setCreateForm((current) => ({ ...current, providerConfigId: value }))} placeholder="r2-production-a" maxLength={64} hint="Mã ổn định, chữ thường; không dùng tên hiển thị có thể thay đổi." />
              <FormField label="Tên hiển thị" required value={createForm.displayName} onChange={(value) => setCreateForm((current) => ({ ...current, displayName: value }))} placeholder="R2 Production A" maxLength={100} />
              <FormField label="Cloudflare Account ID" required value={createForm.accountId} onChange={(value) => setCreateForm((current) => ({ ...current, accountId: value }))} placeholder="32 ký tự hexadecimal" maxLength={32} />
              <FormField label="Bucket" required value={createForm.bucket} onChange={(value) => setCreateForm((current) => ({ ...current, bucket: value }))} placeholder="workshop-images" maxLength={63} />
              <div className="sm:col-span-2">
                <FormField label="S3 endpoint" value={createForm.endpoint} onChange={(value) => setCreateForm((current) => ({ ...current, endpoint: value }))} placeholder="Để trống để backend tạo từ Account ID" maxLength={300} hint="Endpoint tùy chọn cho jurisdiction EU/US/FedRAMP; backend xác minh hostname." />
              </div>
              <div className="sm:col-span-2">
                <FormField label="Delivery base URL (tùy chọn)" type="url" value={createForm.deliveryBaseUrl} onChange={(value) => setCreateForm((current) => ({ ...current, deliveryBaseUrl: value }))} placeholder="https://images.example.com" maxLength={500} />
              </div>
              <FormField label="Priority" required type="number" value={createForm.priority} onChange={(value) => setCreateForm((current) => ({ ...current, priority: value }))} hint="Số nhỏ hơn được ưu tiên trước trong Automatic." />
              <FormField label="Soft limit (GB, tùy chọn)" type="number" value={createForm.softLimitGb} onChange={(value) => setCreateForm((current) => ({ ...current, softLimitGb: value }))} hint="Giới hạn vận hành do Developer đặt, không phải quota Cloudflare." />
              <FormField label="Loại provider" value="Cloudflare R2" readOnly />
            </div>
            {createError ? <p className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{createError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={creating} onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-neutral-300 text-xs font-bold disabled:opacity-50">Hủy</button>
              <button type="submit" disabled={creating} className="px-4 py-2 rounded-xl bg-sky-700 text-white text-xs font-black disabled:opacity-50">
                {creating ? 'Đang tạo...' : 'Tạo cấu hình & nhập credential'}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {editTarget ? (
        <Dialog title={`Sửa ${editTarget.displayName}`} subtitle="Chỉ cập nhật metadata không bí mật. Credential được quản lý ở form riêng." onClose={() => !savingEdit && setEditTarget(null)}>
          <form onSubmit={submitEdit} className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Mã cấu hình" value={editForm.providerConfigId} readOnly />
              <FormField label="Loại provider" value="Cloudflare R2" readOnly />
              <FormField label="Tên hiển thị" required value={editForm.displayName} onChange={(value) => setEditForm((current) => ({ ...current, displayName: value }))} maxLength={100} />
              <FormField label="Priority" required type="number" value={editForm.priority} onChange={(value) => setEditForm((current) => ({ ...current, priority: value }))} />
              <FormField label="Soft limit (GB, tùy chọn)" type="number" value={editForm.softLimitGb} onChange={(value) => setEditForm((current) => ({ ...current, softLimitGb: value }))} hint="Để trống để bỏ soft limit." />
              <FormField label="Cloudflare Account ID" required value={editForm.accountId} onChange={(value) => setEditForm((current) => ({ ...current, accountId: value }))} maxLength={32} />
              <FormField label="Bucket" required value={editForm.bucket} onChange={(value) => setEditForm((current) => ({ ...current, bucket: value }))} maxLength={63} />
              <div className="sm:col-span-2">
                <FormField label="S3 endpoint" value={editForm.endpoint} onChange={(value) => setEditForm((current) => ({ ...current, endpoint: value }))} maxLength={300} hint="Xóa trắng để backend tạo endpoint chuẩn từ Account ID." />
              </div>
              <div className="sm:col-span-2">
                <FormField label="Delivery base URL (tùy chọn)" type="url" value={editForm.deliveryBaseUrl} onChange={(value) => setEditForm((current) => ({ ...current, deliveryBaseUrl: value }))} maxLength={500} />
              </div>
            </div>
            {editError ? <p className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{editError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={savingEdit} onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-xl border border-neutral-300 text-xs font-bold disabled:opacity-50">Hủy</button>
              <button type="submit" disabled={savingEdit} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-black disabled:opacity-50">
                {savingEdit ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {credentialTarget ? (
        <Dialog title={`${credentialTarget.credentialsConfigured ? 'Thay' : 'Nhập'} credential`} subtitle={`${credentialTarget.displayName} · Giá trị cũ không thể xem lại.`} onClose={() => !savingCredentials && closeCredentials()}>
          <form onSubmit={submitCredentials} className="p-4 sm:p-5 space-y-4">
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 leading-relaxed">
              Hai giá trị dưới đây chỉ tồn tại trong state của form này và được gửi trực tiếp tới callable backend. Chúng không được ghi vào Firestore, localStorage, sessionStorage, IndexedDB, URL hoặc console.
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-neutral-700">Access Key ID <span className="text-red-600">*</span></span>
              <input type="text" autoComplete="off" spellCheck={false} value={accessKeyId} onChange={(event) => setAccessKeyId(event.target.value)} placeholder="Nhập Access Key ID mới" maxLength={256} className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-neutral-300 font-mono text-xs focus:border-amber-500 outline-hidden" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-neutral-700">Secret Access Key <span className="text-red-600">*</span></span>
              <div className="relative">
                <input type={showSecret ? 'text' : 'password'} autoComplete="new-password" spellCheck={false} value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.target.value)} placeholder="Nhập Secret Access Key mới" maxLength={512} className="w-full min-h-[42px] pl-3 pr-11 py-2 rounded-xl border border-neutral-300 font-mono text-xs focus:border-amber-500 outline-hidden" />
                <button type="button" onClick={() => setShowSecret((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-neutral-500 hover:bg-neutral-100" title={showSecret ? 'Ẩn secret' : 'Hiện secret'}>
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            {credentialError ? <p className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs">{credentialError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={savingCredentials} onClick={closeCredentials} className="px-4 py-2 rounded-xl border border-neutral-300 text-xs font-bold disabled:opacity-50">Để sau</button>
              <button type="submit" disabled={savingCredentials} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black disabled:opacity-50">
                {savingCredentials ? 'Đang lưu credential...' : 'Lưu credential mới'}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
};
