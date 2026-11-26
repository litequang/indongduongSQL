import React, { useState } from 'react';
import { CheckCircle2, Factory, LockKeyhole } from 'lucide-react';
import { getLoginBranding } from '../config/loginBranding';
import { bootstrapService } from '../services/bootstrapService';

export const BootstrapFirstRun: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const branding = getLoginBranding();
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState(branding.companyName);
  const [appName, setAppName] = useState(branding.appName);
  const [tagline, setTagline] = useState(branding.tagline);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  const next = () => {
    setError('');
    if (step === 1 && (!companyName.trim() || !appName.trim())) return setError('Hãy nhập tên xưởng và tên hệ thống.');
    if (step === 2 && (!name.trim() || !email.trim() || password.length < 8 || password !== confirmPassword)) return setError('Hãy điền đủ thông tin; mật khẩu tối thiểu 8 ký tự và phải khớp.');
    setStep((value) => Math.min(3, value + 1));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!setupKey) return setError('Hãy nhập setup key một lần.');
    setBusy(true); setError('');
    try {
      await bootstrapService.bootstrap({ companyName, appName, tagline, logoUrl, name, email, password, setupKey });
      setComplete(true);
    } catch (requestError: any) {
      setError(requestError?.message || 'Không thể khởi tạo hệ thống.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="fixed inset-0 z-50 grid min-h-[100dvh] place-items-center overflow-y-auto bg-slate-950 p-4 sm:p-6">
    <section className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
      <header className="bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white sm:p-8"><div className="flex items-center gap-3"><Factory className="h-8 w-8 text-amber-300" /><div><p className="text-xs font-black tracking-[.15em] text-amber-300">CHƯA KHỞI TẠO HỆ THỐNG</p><h1 className="mt-1 text-2xl font-black">Khởi tạo xưởng mới</h1></div></div><p className="mt-3 text-sm text-slate-300">Thiết lập này chỉ có thể thực hiện một lần cho Firebase project này.</p></header>
      {complete ? <div className="p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="mt-4 text-xl font-black">Hệ thống đã được khởi tạo.</h2><p className="mt-2 text-sm text-slate-600">Developer đầu tiên đã được tạo an toàn.</p><button type="button" onClick={onComplete} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-amber-300">VỀ ĐĂNG NHẬP</button></div> : <form onSubmit={submit} className="p-6 sm:p-8"><div className="mb-6 flex gap-2 text-xs font-black"><span className={step === 1 ? 'text-amber-700' : 'text-slate-400'}>1. XƯỞNG</span><span>›</span><span className={step === 2 ? 'text-amber-700' : 'text-slate-400'}>2. DEVELOPER</span><span>›</span><span className={step === 3 ? 'text-amber-700' : 'text-slate-400'}>3. XÁC NHẬN</span></div>
        {step === 1 && <div className="grid gap-4"><h2 className="font-black">Thông tin xưởng</h2><label className="text-sm font-bold">Tên công ty/xưởng<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Tên hệ thống<input required value={appName} onChange={(e) => setAppName(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Tagline (tuỳ chọn)<input value={tagline} onChange={(e) => setTagline(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">URL logo (tuỳ chọn)<input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label></div>}
        {step === 2 && <div className="grid gap-4"><h2 className="font-black">Tài khoản quản trị đầu tiên</h2><label className="text-sm font-bold">Họ tên<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Mật khẩu<input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm font-bold">Xác nhận mật khẩu<input required type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label></div>}
        {step === 3 && <div className="grid gap-4"><h2 className="font-black">Xác nhận & khởi tạo</h2><p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><LockKeyhole className="mr-2 inline h-4 w-4" />Setup key chỉ được gửi đến Cloud Function để xác thực, không được lưu trong trình duyệt hay Firestore.</p><label className="text-sm font-bold">Setup key<input required type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label></div>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-6 flex justify-between gap-3">{step > 1 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-xl border px-4 py-3 text-sm font-bold">Quay lại</button> : <span />}{step < 3 ? <button type="button" onClick={next} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-amber-300">TIẾP TỤC</button> : <button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-amber-300 disabled:opacity-50">{busy ? 'ĐANG KHỞI TẠO...' : 'KHỞI TẠO HỆ THỐNG'}</button>}</div>
      </form>}
    </section>
  </main>;
};
