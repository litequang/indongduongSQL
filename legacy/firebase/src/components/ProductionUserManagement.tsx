import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Link2, LoaderCircle, LockKeyhole, Power, RefreshCw, ShieldAlert, UserPlus, Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { staffProvisioningService, StaffProvisioningStatus } from '../services/staffProvisioningService';
import { UserRole } from '../types';

const ALL_ROLES: UserRole[] = ['DEVELOPER', 'ADMIN', 'MANAGER', 'DESIGNER', 'SALE', 'PRINTER', 'FINISHER', 'WAREHOUSE'];
const ADMIN_ASSIGNABLE_ROLES: UserRole[] = ['MANAGER', 'DESIGNER', 'SALE', 'PRINTER', 'FINISHER', 'WAREHOUSE'];

const ROLE_LABELS: Record<UserRole, string> = {
  DEVELOPER: 'Developer',
  ADMIN: 'Admin',
  MANAGER: 'Quản lý',
  DESIGNER: 'Thiết kế',
  SALE: 'Kinh doanh',
  PRINTER: 'Thợ in',
  FINISHER: 'Gia công',
  WAREHOUSE: 'Kho',
};

interface ProductionUserManagementProps {
  onClose: () => void;
}

function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return actorRole === 'DEVELOPER' || (actorRole === 'ADMIN' && ADMIN_ASSIGNABLE_ROLES.includes(targetRole));
}

export const ProductionUserManagement: React.FC<ProductionUserManagementProps> = ({ onClose }) => {
  const { currentUser } = useApp();
  const [staff, setStaff] = useState<StaffProvisioningStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'new' | 'linkExisting'>('new');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('PRINTER');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [machineAssigned, setMachineAssigned] = useState('');
  const [active, setActive] = useState(true);
  const [existingBusinessUserId, setExistingBusinessUserId] = useState('');
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState('');

  const permittedRoles = useMemo(
    () => currentUser.role === 'DEVELOPER' ? ALL_ROLES : ADMIN_ASSIGNABLE_ROLES,
    [currentUser.role],
  );
  const canProvision = currentUser.role === 'DEVELOPER' || currentUser.role === 'ADMIN';
  const unlinkedStaff = useMemo(() => staff.filter((entry) => !entry.authLinked), [staff]);

  const refresh = useCallback(async () => {
    if (!canProvision) return;
    setLoading(true);
    try {
      setStaff(await staffProvisioningService.getStatus());
      setError('');
    } catch (requestError: any) {
      setError(requestError?.message || 'Không thể tải trạng thái tài khoản nhân sự.');
    } finally {
      setLoading(false);
    }
  }, [canProvision]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetProvisionForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setRole('PRINTER');
    setPassword('');
    setConfirmPassword('');
    setMachineAssigned('');
    setActive(true);
    setExistingBusinessUserId('');
  };

  const chooseLink = (entry: StaffProvisioningStatus) => {
    setMode('linkExisting');
    setExistingBusinessUserId(entry.businessUserId);
    setName(entry.name);
    setRole(entry.role);
    setPhone(entry.phone || '');
    setEmail(entry.email || '');
    setPassword('');
    setConfirmPassword('');
    setNotice('');
    setError('');
  };

  const submitProvision = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password.length < 8) {
      setError('Mật khẩu ban đầu phải có ít nhất 8 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Xác nhận mật khẩu chưa khớp.');
      return;
    }
    if (mode === 'linkExisting' && !existingBusinessUserId) {
      setError('Hãy chọn nhân sự hiện có cần liên kết.');
      return;
    }
    setBusyAction('provision');
    try {
      const result = await staffProvisioningService.provision(mode === 'new' ? {
        mode,
        name,
        email,
        initialPassword: password,
        role,
        phone,
        machineAssigned: role === 'PRINTER' ? machineAssigned : undefined,
        active,
      } : {
        mode,
        email,
        initialPassword: password,
        existingBusinessUserId,
      });
      setNotice(result.mode === 'new'
        ? `Đã tạo tài khoản đăng nhập cho ${result.businessUserId}. Mật khẩu không được lưu hoặc hiển thị lại.`
        : `Đã liên kết tài khoản đăng nhập cho ${result.businessUserId}.`);
      resetProvisionForm();
      await refresh();
    } catch (requestError: any) {
      setError(requestError?.message || 'Không thể tạo tài khoản.');
    } finally {
      setBusyAction(null);
    }
  };

  const runStaffAction = async (actionKey: string, task: () => Promise<void>, success: string) => {
    setError('');
    setNotice('');
    setBusyAction(actionKey);
    try {
      await task();
      setNotice(success);
      await refresh();
    } catch (requestError: any) {
      setError(requestError?.message || 'Không thể hoàn tất thao tác tài khoản.');
    } finally {
      setBusyAction(null);
    }
  };

  const submitPasswordReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetTargetId) return;
    setError('');
    if (temporaryPassword.length < 8) {
      setError('Mật khẩu tạm thời phải có ít nhất 8 ký tự.');
      return;
    }
    if (temporaryPassword !== confirmTemporaryPassword) {
      setError('Xác nhận mật khẩu tạm thời chưa khớp.');
      return;
    }
    await runStaffAction(`reset-${resetTargetId}`, () => staffProvisioningService.resetPassword(resetTargetId, temporaryPassword), 'Đã đặt lại mật khẩu. Mật khẩu mới không được lưu hoặc hiển thị lại.');
    setTemporaryPassword('');
    setConfirmTemporaryPassword('');
    setResetTargetId(null);
  };

  if (!canProvision) {
    return <div className="fixed inset-0 z-50 bg-neutral-950/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
        <ShieldAlert className="w-8 h-8 text-red-600" />
        <h2 className="font-black text-neutral-900">Không có quyền quản lý tài khoản</h2>
        <p className="text-sm text-neutral-600">Chỉ DEVELOPER hoặc ADMIN được phép tạo và quản lý tài khoản đăng nhập nhân sự.</p>
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-neutral-900 py-2.5 font-bold text-white">Đóng</button>
      </div>
    </div>;
  }

  return <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[94dvh]">
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-900 text-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center"><Users className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm sm:text-base">Quản lý tài khoản nhân sự</h3>
            <p className="text-[11px] sm:text-xs text-neutral-400">Firebase Authentication + hồ sơ nhân sự được tạo qua backend đặc quyền</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white"><X className="w-5 h-5" /></button>
      </div>

      <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 flex gap-2">
          <LockKeyhole className="w-4 h-4 shrink-0" />
          <p>Mật khẩu chỉ đi thẳng đến Firebase Auth qua Cloud Function; không được lưu trong Firestore, audit log, localStorage hoặc hiển thị lại.</p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{notice}</div>}

        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-2">
          <button type="button" onClick={() => { setMode('new'); resetProvisionForm(); }} className={`px-3 py-2 text-xs font-bold border-b-2 ${mode === 'new' ? 'border-amber-500 text-amber-800' : 'border-transparent text-neutral-500'}`}><UserPlus className="inline w-4 h-4 mr-1" />Tạo tài khoản mới</button>
          {currentUser.role === 'DEVELOPER' && <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="ml-auto rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600">Công cụ nâng cao</button>}
        </div>
        {showAdvanced && currentUser.role === 'DEVELOPER' && <div className="flex gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2"><button type="button" onClick={() => { setMode('linkExisting'); setPassword(''); setConfirmPassword(''); }} className={`px-3 py-2 text-xs font-bold ${mode === 'linkExisting' ? 'rounded-lg bg-amber-100 text-amber-900' : 'text-neutral-600'}`}><Link2 className="inline w-4 h-4 mr-1" />Di chuyển / liên kết tài khoản cũ</button></div>}

        <form onSubmit={submitProvision} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <h4 className="font-black text-sm text-amber-950">{mode === 'new' ? 'Tạo tài khoản đăng nhập nhân sự' : 'Liên kết tài khoản đăng nhập cho nhân sự hiện có'}</h4>
          {mode === 'linkExisting' ? <label className="block text-xs font-bold text-neutral-700">Nhân sự chưa có tài khoản đăng nhập
            <select required value={existingBusinessUserId} onChange={(event) => chooseLink(staff.find((entry) => entry.businessUserId === event.target.value) || { businessUserId: '', name: '', role: 'PRINTER', active: true, authLinked: false })} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm">
              <option value="">Chọn nhân sự</option>
              {unlinkedStaff.map((entry) => <option key={entry.businessUserId} value={entry.businessUserId}>{entry.name} — {ROLE_LABELS[entry.role]} — {entry.businessUserId}</option>)}
            </select>
          </label> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-neutral-700">Họ và tên<input required value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-bold text-neutral-700">Vai trò<select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm">{permittedRoles.map((entry) => <option key={entry} value={entry}>{ROLE_LABELS[entry]}</option>)}</select></label>
            <label className="text-xs font-bold text-neutral-700">Số điện thoại<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>
            {role === 'PRINTER' && <label className="text-xs font-bold text-neutral-700">Máy in phụ trách<input value={machineAssigned} onChange={(event) => setMachineAssigned(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>}
          </div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-neutral-700">Email đăng nhập<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>
            {mode === 'new' && <label className="mt-6 flex items-center gap-2 text-xs font-bold text-neutral-700"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Kích hoạt ngay sau khi tạo</label>}
            <label className="text-xs font-bold text-neutral-700">Mật khẩu ban đầu<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>
            <label className="text-xs font-bold text-neutral-700">Xác nhận mật khẩu<input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>
          </div>
          <div className="flex justify-end"><button disabled={busyAction === 'provision'} type="submit" className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-black text-white disabled:opacity-60">{busyAction === 'provision' ? 'Đang tạo…' : mode === 'new' ? 'TẠO TÀI KHOẢN' : 'LIÊN KẾT TÀI KHOẢN'}</button></div>
        </form>

        {resetTargetId && <form onSubmit={submitPasswordReset} className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-3">
          <div className="flex justify-between gap-3"><h4 className="font-black text-sm text-violet-950 flex items-center gap-2"><KeyRound className="w-4 h-4" />Đặt mật khẩu tạm thời</h4><button type="button" onClick={() => setResetTargetId(null)} className="text-xs font-bold text-neutral-500">Hủy</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs font-bold text-neutral-700">Mật khẩu tạm thời<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-neutral-700">Xác nhận<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirmTemporaryPassword} onChange={(event) => setConfirmTemporaryPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm" /></label></div>
          <button disabled={busyAction === `reset-${resetTargetId}`} className="rounded-xl bg-violet-700 px-4 py-2 text-xs font-black text-white disabled:opacity-60">ĐẶT LẠI MẬT KHẨU</button>
        </form>}

        <div className="flex items-center justify-between"><h4 className="font-black text-sm text-neutral-900">Trạng thái tài khoản ({staff.length})</h4><button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-neutral-300 p-2 text-neutral-600 disabled:opacity-50" title="Làm mới"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
        {loading ? <div className="flex justify-center py-8 text-neutral-500"><LoaderCircle className="w-5 h-5 animate-spin" /></div> : <div className="space-y-2">
          {staff.map((entry) => {
            const manageable = canManageRole(currentUser.role, entry.role) && entry.businessUserId !== currentUser.id;
            const nextRole = pendingRoles[entry.businessUserId] || entry.role;
            return <div key={entry.businessUserId} className="rounded-2xl border border-neutral-200 bg-white p-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-sm text-neutral-900">{entry.name}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold">{ROLE_LABELS[entry.role]}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${entry.authLinked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{entry.authLinked ? 'Đã có tài khoản đăng nhập' : 'Chưa có tài khoản đăng nhập'}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${entry.active ? 'bg-sky-100 text-sky-800' : 'bg-neutral-200 text-neutral-600'}`}>{entry.active ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</span></div>
              <div className="text-xs text-neutral-500 break-all">{entry.email || 'Chưa có email'} · {entry.businessUserId}{entry.machineAssigned ? ` · ${entry.machineAssigned}` : ''}</div>
              {manageable && <div className="flex flex-wrap gap-2 items-center">
                {!entry.authLinked && <button type="button" onClick={() => chooseLink(entry)} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900"><Link2 className="inline w-3.5 h-3.5 mr-1" />Liên kết</button>}
                <button type="button" disabled={busyAction === `active-${entry.businessUserId}`} onClick={() => void runStaffAction(`active-${entry.businessUserId}`, () => staffProvisioningService.setActive(entry.businessUserId, !entry.active), entry.active ? 'Đã vô hiệu hóa tài khoản.' : 'Đã kích hoạt lại tài khoản.')} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] font-bold text-neutral-700 disabled:opacity-50"><Power className="inline w-3.5 h-3.5 mr-1" />{entry.active ? 'Vô hiệu hóa' : 'Kích hoạt lại'}</button>
                {entry.authLinked && <button type="button" onClick={() => { setResetTargetId(entry.businessUserId); setTemporaryPassword(''); setConfirmTemporaryPassword(''); }} className="rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-900"><KeyRound className="inline w-3.5 h-3.5 mr-1" />Đặt lại mật khẩu</button>}
                {entry.authLinked && <><select value={nextRole} onChange={(event) => setPendingRoles((previous) => ({ ...previous, [entry.businessUserId]: event.target.value as UserRole }))} className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-[11px] font-bold">{permittedRoles.map((candidate) => <option key={candidate} value={candidate}>{ROLE_LABELS[candidate]}</option>)}</select><button type="button" disabled={nextRole === entry.role || busyAction === `role-${entry.businessUserId}`} onClick={() => { if (confirm(`Đổi vai trò của ${entry.name} thành ${ROLE_LABELS[nextRole]}?`)) void runStaffAction(`role-${entry.businessUserId}`, () => staffProvisioningService.changeRole(entry.businessUserId, nextRole), 'Đã cập nhật vai trò trên hồ sơ và identity mapping.'); }} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11px] font-bold text-neutral-700 disabled:opacity-50">Lưu vai trò</button></>}
              </div>}
            </div>;
          })}
        </div>}
      </div>
    </div>
  </div>;
};
