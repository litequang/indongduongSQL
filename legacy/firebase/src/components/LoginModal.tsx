import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Factory, LockKeyhole, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getLoginBranding } from '../config/loginBranding';
import { getSignInErrorMessage } from '../utils/authErrorMessages';

export const LoginModal: React.FC = () => {
  const { isDemoActive, users, isSessionLocked } = useApp();
  const { isLoginModalOpen, signInWithFirebase, loginWithPin, authInitializationState } = useAuth();
  const isProduction = !isDemoActive;
  const branding = getLoginBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasLogo, setHasLogo] = useState(Boolean(branding.logoUrl));
  const [selectedUserId, setSelectedUserId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHasLogo(Boolean(branding.logoUrl));
  }, [branding.logoUrl]);

  useEffect(() => {
    if (isLoginModalOpen || isSessionLocked) {
      setError('');
      setPassword('');
      setPin('');
      setShowPassword(false);
    }
  }, [isLoginModalOpen, isSessionLocked]);

  if (isProduction) {
    if (authInitializationState !== 'UNAUTHENTICATED') return null;
  } else if (!isLoginModalOpen && !isSessionLocked) {
    return null;
  }

  const submitFirebase = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      await signInWithFirebase(email, password);
    } catch (submitError) {
      setError(getSignInErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  const submitDemoPin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!loginWithPin(selectedUserId, pin)) setError('Mã PIN không đúng. Vui lòng thử lại.');
  };

  const brandMark = (
    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/15 p-2 shadow-lg ring-1 ring-white/20">
      {hasLogo ? (
        <img
          src={branding.logoUrl}
          alt={`Logo ${branding.companyName}`}
          className="h-full w-full object-contain"
          referrerPolicy="no-referrer"
          onError={() => setHasLogo(false)}
        />
      ) : (
        <Factory className="h-8 w-8 text-amber-300" aria-hidden="true" />
      )}
    </div>
  );

  return (
    <main className="fixed inset-0 z-50 grid min-h-[100dvh] place-items-center overflow-y-auto bg-slate-950 p-4 sm:p-6">
      <section aria-labelledby="login-title" className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl ring-1 ring-white/10 md:grid-cols-[1.05fr_0.95fr]">
        <aside className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-8 text-white sm:px-10 sm:py-11">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="flex items-center gap-4">
              {brandMark}
              <div className="min-w-0">
                <p className="truncate text-sm font-black tracking-[0.12em] text-amber-300">{branding.appName}</p>
                <p className="mt-1 text-sm font-semibold text-white">{branding.companyName}</p>
              </div>
            </div>
            <div className="max-w-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-lg font-bold leading-7 text-white sm:text-xl">{branding.tagline}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">Đăng nhập an toàn để tiếp tục công việc của bạn.</p>
            </div>
          </div>
        </aside>

        {isProduction ? (
          <form onSubmit={submitFirebase} className="flex min-h-full flex-col justify-center p-6 sm:p-10">
            <div className="mb-7">
              <p className="text-xs font-black tracking-[0.16em] text-amber-700">{branding.appName}</p>
              <h1 id="login-title" className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">ĐĂNG NHẬP HỆ THỐNG</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">Đăng nhập bằng tài khoản nhân viên được cấp</p>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-800" htmlFor="login-email">
                Email
                <span className="relative mt-1.5 block">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    id="login-email"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    disabled={busy}
                    className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </span>
              </label>

              <label className="block text-sm font-bold text-slate-800" htmlFor="login-password">
                Mật khẩu
                <span className="relative mt-1.5 block">
                  <input
                    id="login-password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    disabled={busy}
                    className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 pr-12 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    aria-pressed={showPassword}
                    disabled={busy}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </span>
              </label>
            </div>

            {error && (
              <p role="alert" aria-live="assertive" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black tracking-wide text-amber-300 shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'ĐANG ĐĂNG NHẬP...' : 'ĐĂNG NHẬP'}
              {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>

            <p className="mt-5 text-center text-xs leading-5 text-slate-500">Nếu chưa có tài khoản, vui lòng liên hệ quản trị viên.</p>
          </form>
        ) : (
          <form onSubmit={submitDemoPin} className="flex min-h-full flex-col justify-center p-6 sm:p-10">
            <div className="mb-7">
              <p className="text-xs font-black tracking-[0.16em] text-amber-700">{branding.appName}</p>
              <h1 id="login-title" className="mt-2 text-2xl font-black tracking-tight text-slate-950">ĐĂNG NHẬP HỆ THỐNG</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">Chọn tài khoản dùng để xem bản demo.</p>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-800" htmlFor="demo-user">Tài khoản
                <select id="demo-user" required value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100">
                  <option value="">Chọn tài khoản</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-bold text-slate-800" htmlFor="demo-pin">Mã PIN
                <input id="demo-pin" required type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="Nhập mã PIN" className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" />
              </label>
            </div>
            {error && <p role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
            <button type="submit" className="mt-6 min-h-12 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black tracking-wide text-amber-300">MỞ BẢN DEMO</button>
          </form>
        )}
      </section>
    </main>
  );
};
