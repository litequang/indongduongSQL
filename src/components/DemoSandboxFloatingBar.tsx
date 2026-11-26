import React from 'react';
import { useApp } from '../context/AppContext';
import { User, UserRole } from '../types';
import {
  FlaskConical,
  ShieldCheck,
  RotateCcw,
  Crown,
  Palette,
  Printer,
  Scissors,
  Briefcase,
  Wrench,
  ChevronRight,
  Sparkles,
  Shield
} from 'lucide-react';
import { soundManager } from '../utils/soundUtils';
import { canUseDemoSandbox } from '../permissions';
import { DEVELOPER_DEMO_PREVIEW_ROLES } from '../utils/developerDemoPreview';
import { ResolvedImage } from './ResolvedImage';

export const DemoSandboxFloatingBar: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    users,
    appConfig,
    isDemoActive,
    isPersonalDemoActive,
    setIsPersonalDemoActive,
    previewRole,
    setPreviewRole,
    isRolePreviewActive,
    realAuthenticatedUser,
    logout,
    resetDemoData,
    setIsSettingsModalOpen
  } = useApp();

  // Find users by role for quick 1-click test pills
  const managerUser = users.find(u => u.role === 'MANAGER');
  const adminUser = users.find(u => u.role === 'ADMIN');
  const devUser = users.find(u => u.role === 'DEVELOPER');
  const designerUser = users.find(u => u.role === 'DESIGNER');
  const printerUsers = users.filter(u => u.role === 'PRINTER');
  const finisherUser = users.find(u => u.role === 'FINISHER');
  const saleUser = users.find(u => u.role === 'SALE');

  const handleSwitchUser = (targetUser?: User) => {
    if (!targetUser) return;
    setCurrentUser(targetUser);
    soundManager.playDing();
  };

  const getRoleBadgeLabel = (role: UserRole) => {
    switch (role) {
      case 'MANAGER': return '👔 Sếp / Quản Lý';
      case 'ADMIN': return '👑 Admin Xưởng';
      case 'PRINTER': return '🖨️ Thợ in';
      case 'DESIGNER': return '🎨 Thiết kế';
      case 'FINISHER': return '✂️ Gia công';
      case 'SALE': return '💼 Sale';
      case 'DEVELOPER': return '🛠️ Dev';
      default: return role;
    }
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return <Crown className="w-3.5 h-3.5 text-amber-900" />;
      case 'DEVELOPER':
        return <Wrench className="w-3.5 h-3.5 text-blue-900" />;
      case 'DESIGNER':
        return <Palette className="w-3.5 h-3.5 text-purple-900" />;
      case 'PRINTER':
        return <Printer className="w-3.5 h-3.5 text-orange-900" />;
      case 'FINISHER':
        return <Scissors className="w-3.5 h-3.5 text-emerald-900" />;
      case 'SALE':
        return <Briefcase className="w-3.5 h-3.5 text-blue-900" />;
      default:
        return <Sparkles className="w-3.5 h-3.5" />;
    }
  };

  // Authenticated production preview. It deliberately changes only the UI
  // role exposed by AppContext; Firebase Auth and auth_identities remain the
  // verified DEVELOPER identity. App.tsx makes the rest of the shell inert
  // while this banner is active so previews cannot mutate production data.
  if (isRolePreviewActive) {
    return (
      <section data-demo-role-preview="active" className="bg-amber-500 text-neutral-950 border-b border-amber-600/60 shadow-sm px-3 sm:px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 bg-neutral-950 text-amber-400 px-2.5 py-1 rounded-full text-[11px] font-black tracking-wide shrink-0">
              <FlaskConical className="w-3.5 h-3.5 animate-pulse" />
              <span>CHẾ ĐỘ DEMO</span>
            </div>
            <p className="text-xs font-black truncate">ĐANG XEM: {getRoleBadgeLabel(previewRole)}</p>
            <span className="hidden md:inline text-[11px] text-amber-950/80">Quyền Firebase thực: {realAuthenticatedUser?.role || 'DEVELOPER'} · Thao tác dữ liệu bị khóa</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[11px] font-bold text-amber-950" htmlFor="developer-demo-role">Vai trò xem thử</label>
            <select
              id="developer-demo-role"
              value={previewRole}
              onChange={(event) => setPreviewRole(event.target.value as UserRole)}
              className="min-h-[32px] rounded-lg border border-amber-700/40 bg-white px-2 text-xs font-black text-neutral-900 outline-none"
            >
              {DEVELOPER_DEMO_PREVIEW_ROLES.map((role) => (
                <option key={role} value={role}>{getRoleBadgeLabel(role)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsPersonalDemoActive(false)}
              className="min-h-[32px] rounded-lg bg-neutral-950 px-3 text-xs font-black text-amber-300 hover:bg-neutral-800"
            >
              Thoát Demo
            </button>
            <button
              type="button"
              onClick={() => { void logout(); }}
              className="min-h-[32px] rounded-lg border border-amber-800/50 bg-white px-3 text-xs font-black text-neutral-900 hover:bg-neutral-100"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </section>
    );
  }

  // In the explicitly built local DEMO sandbox, keep the historical full
  // account-switching controls. Production never reaches this branch.
  if (!isDemoActive) return null;

  return (
    <div className="bg-amber-500 text-neutral-950 border-b border-amber-600/60 shadow-sm sticky top-14 sm:top-16 z-30 px-3 sm:px-4 py-1.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2">
        
        {/* Left: Mode Title & Current Active Role Indicator */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-neutral-950 text-amber-400 px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wide shadow-2xs">
            <FlaskConical className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>DEMO SANDBOX</span>
          </div>

          <div className="flex items-center gap-1 text-xs font-bold text-neutral-900">
            <span className="hidden sm:inline text-neutral-800">Đang đóng vai:</span>
            <div className="flex items-center gap-1.5 bg-white/80 px-2 py-0.5 rounded-lg border border-amber-600/30">
              <ResolvedImage
                image={currentUser.avatarImage}
                legacyUrl={currentUser.avatar}
                alt={currentUser.name}
                className="w-4 h-4 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="font-black text-neutral-950 truncate max-w-[120px] sm:max-w-[160px]">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-amber-900 font-bold bg-amber-200/80 px-1.5 py-0.2 rounded">
                {getRoleBadgeLabel(currentUser.role)}
              </span>
            </div>
          </div>
        </div>

        {/* Center/Right: Quick 1-Click Role Switcher Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 md:pb-0 scrollbar-none">
          <span className="text-[11px] font-bold text-amber-950 shrink-0 hidden lg:inline">
            Đổi vai trò test:
          </span>

          {/* Sếp / Quản Lý */}
          {managerUser && (
            <button
              type="button"
              onClick={() => handleSwitchUser(managerUser)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === managerUser.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title="Chuyển ngay về tài khoản Sếp / Quản Lý Xưởng"
            >
              <Crown className="w-3.5 h-3.5 text-amber-500" />
              <span>👔 Sếp (Quản Lý)</span>
            </button>
          )}

          {/* Admin Xưởng */}
          {adminUser && (
            <button
              type="button"
              onClick={() => handleSwitchUser(adminUser)}
              className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === adminUser.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title="Chuyển ngay về tài khoản Admin Kỹ Thuật Xưởng"
            >
              <Shield className="w-3.5 h-3.5 text-red-600" />
              <span>👑 Admin Xưởng</span>
            </button>
          )}

          {/* Thiết Kế */}
          {designerUser && (
            <button
              type="button"
              onClick={() => handleSwitchUser(designerUser)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === designerUser.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title="Chuyển vai trò Thiết Kế"
            >
              <Palette className="w-3.5 h-3.5 text-purple-600" />
              <span>Thiết Kế</span>
            </button>
          )}

          {/* Thợ In */}
          {printerUsers.map((pu, idx) => (
            <button
              key={pu.id}
              type="button"
              onClick={() => handleSwitchUser(pu)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === pu.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title={`Chuyển vai trò Thợ In: ${pu.name} (${pu.machineAssigned || `Máy ${idx + 1}`})`}
            >
              <Printer className="w-3.5 h-3.5 text-orange-600" />
              <span>Thợ In {idx + 1}</span>
            </button>
          ))}

          {/* Gia Công */}
          {finisherUser && (
            <button
              type="button"
              onClick={() => handleSwitchUser(finisherUser)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === finisherUser.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title="Chuyển vai trò Gia Công"
            >
              <Scissors className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gia Công</span>
            </button>
          )}

          {/* Sale / Kinh Doanh */}
          {saleUser && (
            <button
              type="button"
              onClick={() => handleSwitchUser(saleUser)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === saleUser.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title="Chuyển vai trò Kinh Doanh (Sale)"
            >
              <Briefcase className="w-3.5 h-3.5 text-blue-600" />
              <span>Kinh Doanh</span>
            </button>
          )}

          {/* Developer (if exists) */}
          {devUser && (
            <button
              type="button"
              onClick={() => handleSwitchUser(devUser)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-2xs ${
                currentUser.id === devUser.id
                  ? 'bg-neutral-950 text-amber-400 ring-2 ring-neutral-900'
                  : 'bg-white hover:bg-neutral-100 text-neutral-900 border border-amber-600/30'
              }`}
              title="Chuyển vai trò Developer"
            >
              <Wrench className="w-3.5 h-3.5 text-blue-600" />
              <span>Dev</span>
            </button>
          )}

          {/* Exit / Return to Online Mode */}
          {isPersonalDemoActive && (
            <button
              type="button"
              onClick={() => {
                // If exiting demo, switch back to Admin by default so user is never locked out
                if (adminUser) setCurrentUser(adminUser);
                setIsPersonalDemoActive(false);
              }}
              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer shadow-xs ml-1"
              title="Thoát Demo Sandbox và trở về Chế Độ Online Thực Tế của xưởng"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Về Online</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
