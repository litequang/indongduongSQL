import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Search,
  Plus,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  RotateCcw,
  Globe,
  Radio,
  Users,
  Lock,
  LogOut,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  FlaskConical,
  Crown,
  Wifi,
  WifiOff,
  RefreshCw,
  Smartphone,
  Download
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { formatRelativeTime } from '../utils/dateUtils';
import { OnlineDeploymentGuideModal } from './OnlineDeploymentGuideModal';
import { NetworkStatusModal } from './NetworkStatusModal';
import { CompanyBranding } from './CompanyBranding';
import { VersionBadge } from './VersionBadge';
import { canManageUsers, canManageWorkshopSettings } from '../permissions';
import { handleAvatarImageError, safeAvatarSrc } from '../utils/avatarUtils';
import { ResolvedImage } from './ResolvedImage';

export const Navbar: React.FC = () => {
  const {
    currentUser,
    setCurrentUser,
    users,
    notifications,
    unreadNotifsCount,
    markNotificationRead,
    markAllNotificationsRead,
    setIsCreateModalOpen,
    setIsLibraryModalOpen,
    setIsSettingsModalOpen,
    setIsInstallModalOpen,
    setIsUserManagementModalOpen,
    setIsProfileModalOpen,
    setIsLoginModalOpen,
    logout,
    settings,
    updateSettings,
    appConfig,
    isOnline,
    isSyncing,
    syncNow,
    isAppInstalled,
    searchQuery,
    setSearchQuery,
    setSelectedOrder,
    orders,
    resetDemoData,
    isDemoActive,
    isPersonalDemoActive,
    setIsPersonalDemoActive,
    realAuthenticatedUser,
    setActiveTab,
  } = useApp();

  const isProduction = appConfig.system.deploymentMode === 'PRODUCTION';
  // Demo preview authorization intentionally uses the real Firebase-mapped
  // role, never the presentation role currently rendered in the app.
  const isVerifiedDeveloper = isDemoActive
    ? currentUser.role === 'DEVELOPER'
    : realAuthenticatedUser?.role === 'DEVELOPER';
  const isAdminOrDev = currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER';
  const isManagerRole = currentUser.role === 'MANAGER';
  const isLeadership = isManagerRole || isAdminOrDev;
  const adminUser = users.find(u => u.role === 'ADMIN');
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [isOnlineGuideOpen, setIsOnlineGuideOpen] = useState(false);
  const [isNetworkStatusOpen, setIsNetworkStatusOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      setIsInstallModalOpen(true);
    }
  };

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setIsRoleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'DEVELOPER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300">Developer</span>;
      case 'ADMIN':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-900 border border-red-300">Admin</span>;
      case 'MANAGER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-900 border border-purple-300">Quản lý</span>;
      case 'DESIGNER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-900 border border-blue-300">Thiết kế</span>;
      case 'SALE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">Kinh Doanh</span>;
      case 'PRINTER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900 border border-amber-300">Thợ in</span>;
      case 'FINISHER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-violet-100 text-violet-900 border border-violet-300">Tổ Gia Công</span>;
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-neutral-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Left: Brand / Title (Dynamic per instance) */}
        <CompanyBranding size="md" showSlogan={true} className="min-w-0 shrink flex-1 lg:flex-none lg:shrink-0" />

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã lệnh #LIN-0198, khách hàng, thợ in, giấy..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-neutral-100/80 hover:bg-neutral-100 focus:bg-white border border-transparent focus:border-amber-500 rounded-xl outline-hidden transition-all text-neutral-800 placeholder-neutral-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600 bg-neutral-200/70 hover:bg-neutral-200 px-1.5 py-0.5 rounded"
              >
                Xóa
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          
          {/* Cài Đặt App Vào Máy (PWA Install Guide) */}
          {!isAppInstalled && (
            <button
              onClick={handleInstallClick}
              title="Cài đặt ứng dụng vào máy tính hoặc điện thoại"
              className="flex px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl transition-all items-center gap-1.5 text-xs font-bold cursor-pointer shadow-md shadow-amber-500/20 border border-amber-600"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">Cài App</span>
            </button>
          )}

          {/* Library of Past Prints (Desktop only) */}
          <button
            onClick={() => setIsLibraryModalOpen(true)}
            title="Thư viện mẫu đã in (In lại 1-click)"
            className="hidden lg:flex p-2 text-neutral-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl border border-neutral-200/80 transition-colors items-center gap-1.5 text-xs font-medium cursor-pointer"
          >
            <Layers className="w-4 h-4 text-amber-600" />
            <span>Mẫu đã in</span>
          </button>

          {/* Sound Toggle (Tablet/Desktop) */}
          <button
            onClick={() => updateSettings({ soundAlerts: !settings.soundAlerts })}
            className={`hidden sm:flex p-2 rounded-xl transition-colors cursor-pointer ${
              settings.soundAlerts
                ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
            }`}
            title={settings.soundAlerts ? 'Âm thanh thông báo: Bật' : 'Âm thanh thông báo: Tắt'}
          >
            {settings.soundAlerts ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Mode & Network Status Badge (Trực Tuyến vs Offline) */}
          <button
            id="btn-network-status"
            onClick={() => setIsNetworkStatusOpen(true)}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-black border transition-all cursor-pointer shadow-2xs ${
              isOnline
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-neutral-100 text-neutral-800 border-neutral-300 hover:bg-neutral-200'
            }`}
            title={
              isOnline
                ? 'Hệ thống đang Trực Tuyến. Dữ liệu được đồng bộ thời gian thực lên Đám Mây. Nhấn để kiểm tra.'
                : 'Đang hoạt động Offline. Dữ liệu lưu an toàn trên máy, tự động đồng bộ khi có mạng. Nhấn để xem chi tiết.'
            }
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isOnline ? 'animate-ping bg-emerald-400' : 'bg-neutral-400'
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isOnline ? 'bg-emerald-600' : 'bg-neutral-600'
                }`}
              ></span>
            </span>

            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-700 hidden sm:inline" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-neutral-600 hidden sm:inline" />
            )}

            <span className="text-[11px] sm:text-xs hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>

            {isDemoActive && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-amber-300 text-amber-950 rounded text-[9px] font-black uppercase">
                Demo
              </span>
            )}

            {isSyncing && (
              <RefreshCw className="w-3 h-3 text-emerald-700 animate-spin ml-0.5" />
            )}
          </button>

          {/* Quick Demo Role Switcher in Top Bar */}
          {isDemoActive && (
            <button
              type="button"
              onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-black bg-amber-200 hover:bg-amber-300 text-amber-950 border border-amber-400 transition-all cursor-pointer shadow-2xs"
              title="Chế độ Demo Sandbox: Nhấn để chuyển vai trò kiểm thử (Thợ in, Thiết kế, Gia công, Sếp)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-900" />
              <span>Chuyển vai trò test</span>
            </button>
          )}

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="p-2 relative text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors cursor-pointer"
              title="Thông báo xưởng"
            >
              <Bell className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-bounce">
                  {unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-76 sm:w-96 bg-white rounded-2xl shadow-xl border border-neutral-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-neutral-900">Thông Báo Xưởng</span>
                    {unreadNotifsCount > 0 && (
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                        {unreadNotifsCount} mới
                      </span>
                    )}
                  </div>
                  {unreadNotifsCount > 0 && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-xs text-amber-600 hover:text-amber-700 font-medium cursor-pointer"
                    >
                      Đã đọc hết
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-sm text-neutral-400">
                      Không có thông báo nào
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => {
                          markNotificationRead(notif.id);
                          const target = orders.find(o => o.id === notif.orderId);
                          if (target) setSelectedOrder(target);
                          setIsNotifOpen(false);
                        }}
                        className={`p-3.5 hover:bg-amber-50/50 transition-colors cursor-pointer flex gap-3 items-start ${
                          !notif.read ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                          notif.type === 'issue' || notif.type === 'warning'
                            ? 'bg-red-100 text-red-600'
                            : notif.type === 'completed'
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          {notif.type === 'issue' || notif.type === 'warning' ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : notif.type === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Bell className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs font-bold text-neutral-900 truncate">
                              {notif.title}
                            </p>
                            <span className="text-[10px] text-neutral-400 shrink-0">
                              {formatRelativeTime(notif.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Role Switcher Dropdown */}
          <div className="relative ml-1" ref={roleRef}>
            <button
              id="btn-role-switcher"
              onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
              className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-neutral-200 hover:border-neutral-300 bg-neutral-50/80 hover:bg-neutral-100 transition-all cursor-pointer"
            >
              <ResolvedImage
                image={currentUser.avatarImage}
                legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
                alt={currentUser.name}
                className="w-7 h-7 rounded-full object-cover border border-white shadow-xs"
                referrerPolicy="no-referrer"
                onError={(event) => handleAvatarImageError(event, currentUser.name)}
              />
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-neutral-800 leading-tight truncate max-w-[110px]">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-neutral-500 leading-none mt-0.5">
                  {currentUser.role === 'PRINTER' ? 'Thợ in' : currentUser.role === 'DESIGNER' ? 'Thiết kế' : currentUser.role === 'FINISHER' ? 'Gia công' : currentUser.role === 'SALE' ? 'Kinh doanh' : currentUser.role === 'WAREHOUSE' ? 'Kho' : 'Quản lý xưởng'}
                </div>
              </div>
            </button>

            {isRoleMenuOpen && (
              <div className="absolute right-0 mt-2 w-76 bg-white rounded-2xl shadow-xl border border-neutral-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                
                {/* Current Active User Banner */}
                <div className="px-3.5 py-2.5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ResolvedImage
                      image={currentUser.avatarImage}
                      legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
                      alt={currentUser.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-neutral-200"
                      referrerPolicy="no-referrer"
                      onError={(event) => handleAvatarImageError(event, currentUser.name)}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-neutral-900 truncate">
                        {currentUser.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 truncate">
                        {currentUser.role === 'PRINTER' ? `Thợ in (${currentUser.machineAssigned || 'Máy in'})` : currentUser.role === 'DESIGNER' ? 'Bộ phận Thiết kế' : currentUser.role === 'FINISHER' ? 'Bộ phận Gia công' : currentUser.role === 'SALE' ? 'Bộ phận Kinh doanh' : currentUser.role === 'WAREHOUSE' ? 'Bộ phận Kho' : 'Quản trị viên / Sếp'}
                      </p>
                    </div>
                  </div>
                  {getRoleBadge(currentUser.role)}
                </div>

                <div className="px-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('guide'); setIsRoleMenuOpen(false); }}
                    className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100"
                  >
                    Hướng dẫn sử dụng hệ thống
                  </button>
                </div>

                {/* 1. DEMO SANDBOX ACTIVE: Full seamless switcher for ALL roles */}
                {isDemoActive ? (
                  <div>
                    {/* Demo Sandbox Banner & Quick Return to Admin */}
                    <div className="p-3 bg-amber-500/15 border-b border-amber-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <FlaskConical className="w-4 h-4 text-amber-700 animate-pulse" />
                          <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                            Chế Độ Demo Sandbox
                          </span>
                        </div>
                        {isPersonalDemoActive && (
                          <button
                            type="button"
                            onClick={() => {
                              if (adminUser) setCurrentUser(adminUser);
                              setIsPersonalDemoActive(false);
                              setIsRoleMenuOpen(false);
                            }}
                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black cursor-pointer shadow-2xs"
                            title="Thoát Demo và trở về dữ liệu Online thật"
                          >
                            Về Online
                          </button>
                        )}
                      </div>

                      {/* Prominent 1-Click Return to Admin if currently acting as another role */}
                      {currentUser.role !== 'ADMIN' && adminUser && (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentUser(adminUser);
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full py-2 px-3 bg-neutral-950 hover:bg-neutral-900 text-amber-400 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ring-2 ring-amber-400"
                        >
                          <Crown className="w-4 h-4 text-amber-400" />
                          <span>👑 Quay lại tài khoản Quản trị (Admin)</span>
                        </button>
                      )}
                    </div>

                    {/* Quick Fast Role Switcher in Demo Sandbox */}
                    <div className="p-2.5 bg-neutral-50/70 border-b border-neutral-100">
                      <div className="px-1.5 py-1 flex items-center justify-between">
                        <p className="text-[10px] font-black text-neutral-600 uppercase tracking-wider">
                          Chọn tài khoản kiểm thử:
                        </p>
                        <span className="text-[9px] bg-amber-200 text-amber-950 font-bold px-1.5 py-0.2 rounded">
                          {users.length} tài khoản
                        </span>
                      </div>
                      <div className="py-1 max-h-48 overflow-y-auto space-y-1">
                        {users.map((u) => {
                          const isSelected = u.id === currentUser.id;
                          return (
                            <button
                              key={u.id}
                              onClick={() => {
                                setCurrentUser(u);
                                setIsRoleMenuOpen(false);
                              }}
                              className={`w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-amber-100/70 rounded-xl transition-colors cursor-pointer ${
                                isSelected ? 'bg-amber-100 font-bold text-amber-950 ring-1 ring-amber-300' : 'text-neutral-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ResolvedImage
                                  image={u.avatarImage}
                                  legacyUrl={safeAvatarSrc(u.avatar, u.name)}
                                  alt={u.name}
                                  className="w-6 h-6 rounded-full object-cover shrink-0 border border-neutral-200"
                                  referrerPolicy="no-referrer"
                                  onError={(event) => handleAvatarImageError(event, u.name)}
                                />
                                <div className="truncate">
                                  <p className="text-xs font-bold truncate">
                                    {u.name}
                                  </p>
                                </div>
                              </div>
                              <div className="shrink-0">
                                {getRoleBadge(u.role)}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2 mt-1 border-t border-neutral-200/60 flex items-center justify-between">
                        <span className="text-[10px] text-neutral-400">Sandbox Test Mode</span>
                        <button
                          onClick={() => {
                            if (confirm('Khôi phục lại dữ liệu mẫu Demo Sandbox? (Chỉ áp dụng trong môi trường thử nghiệm trên máy này, dữ liệu thật của xưởng được bảo toàn 100%)')) {
                              resetDemoData();
                              setIsRoleMenuOpen(false);
                            }
                          }}
                          className="flex items-center gap-1 text-[11px] text-neutral-600 hover:text-amber-800 p-1 rounded-lg hover:bg-amber-100 cursor-pointer font-bold"
                          title="Khôi phục mẫu demo Sandbox"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-700" />
                          <span>Reset Demo Mẫu</span>
                        </button>
                      </div>
                    </div>

                    {/* Standard Controls */}
                    <div className="p-3 space-y-2">
                      <button
                        onClick={() => {
                          setIsProfileModalOpen(true);
                          setIsRoleMenuOpen(false);
                        }}
                        className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4 text-neutral-600" />
                        <span>Xem Thông Tin Cá Nhân</span>
                      </button>

                      {canManageUsers(currentUser, appConfig) && (
                        <button
                          onClick={() => {
                            setIsUserManagementModalOpen(true);
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black flex items-center justify-between transition-colors cursor-pointer shadow-2xs"
                        >
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-amber-400" />
                            Quản Lý Nhân Sự & Mã PIN
                          </span>
                          <span className="text-[10px] bg-amber-500 text-neutral-950 px-1.5 py-0.5 rounded font-mono font-bold">
                            {users.length}
                          </span>
                        </button>
                      )}

                      {canManageWorkshopSettings(currentUser, appConfig) && (
                        <button
                          onClick={() => {
                            setIsSettingsModalOpen(true);
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-600" />
                          Cài Đặt Xưởng In
                        </button>
                      )}

                      <VersionBadge />

                      <button
                        onClick={() => {
                          logout();
                          setIsRoleMenuOpen(false);
                        }}
                        className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Đăng Xuất</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 2. REGULAR PRODUCTION / ONLINE MODE */
                  <div>
                    {!isLeadership ? (
                      /* Staff Shift View (Designer, Printer, Finisher, Sale) */
                      <div className="p-3 space-y-2">
                        <button
                          onClick={() => {
                            setIsProfileModalOpen(true);
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>Đổi Avatar & Mật Khẩu</span>
                        </button>

                        <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-900 leading-relaxed flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-600' : 'bg-neutral-500'}`}></span>
                          <span>Chế độ: <b>{isOnline ? 'Trực Tuyến (Online)' : 'Offline (Bộ nhớ đệm)'}</b></span>
                        </div>

                        {/* Phiên bản ứng dụng & Nút Cập nhật */}
                        <VersionBadge />

                        <button
                          onClick={() => {
                            logout();
                            setIsRoleMenuOpen(false);
                          }}
                          className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Đăng Xuất</span>
                        </button>
                      </div>
                    ) : (
                      /* Leadership View (Admin / Developer / Manager) */
                      <div>
                        <div className="p-3 space-y-2 border-b border-neutral-100">
                          <button
                            onClick={() => {
                              setIsProfileModalOpen(true);
                              setIsRoleMenuOpen(false);
                            }}
                            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-neutral-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
                          >
                            <UserCheck className="w-4 h-4" />
                            <span>{isManagerRole ? 'Hồ Sơ Quản Lý & Mật Khẩu' : 'Đổi Avatar & Mật Khẩu Admin'}</span>
                          </button>

                          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-900 leading-relaxed flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-600' : 'bg-neutral-500'}`}></span>
                            <span>Chế độ: <b>{isOnline ? 'Trực Tuyến (Online)' : 'Offline (Bộ nhớ đệm)'}</b></span>
                          </div>

                          {/* Phiên bản ứng dụng & Nút Cập nhật */}
                          <VersionBadge />

                          <button
                            onClick={() => {
                              logout();
                              setIsRoleMenuOpen(false);
                            }}
                            className="w-full py-2 px-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                          >
                            <LogOut className="w-4 h-4" />
                            <span>Đăng Xuất</span>
                          </button>

                          {/* Dynamic Permission Actions (Quản lý nhân sự & Cài đặt xưởng) */}
                          {canManageUsers(currentUser, appConfig) && (
                            <button
                              onClick={() => {
                                setIsUserManagementModalOpen(true);
                                setIsRoleMenuOpen(false);
                              }}
                              className="w-full px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-black flex items-center justify-between transition-colors cursor-pointer shadow-2xs"
                            >
                              <span className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-amber-400" />
                                Quản Lý Nhân Sự & Mã PIN
                              </span>
                              <span className="text-[10px] bg-amber-500 text-neutral-950 px-1.5 py-0.5 rounded font-mono font-bold">
                                {users.length}
                              </span>
                            </button>
                          )}

                          {canManageWorkshopSettings(currentUser, appConfig) && (
                            <button
                              onClick={() => {
                                setIsSettingsModalOpen(true);
                                setIsRoleMenuOpen(false);
                              }}
                              className="w-full px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-600" />
                              Cài Đặt Xưởng In
                            </button>
                          )}
                        </div>

                        {/* Personal Demo Sandbox Toggle */}
                        {isVerifiedDeveloper && (
                          <div className="p-3 bg-neutral-50/70">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-neutral-900">
                                  Chế độ Thử Nghiệm (Demo)
                                </p>
                                <p className="text-[10px] text-neutral-500">
                                  Bật để test giao diện mọi vai trò tự do
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsPersonalDemoActive(!isPersonalDemoActive)}
                                aria-pressed={isPersonalDemoActive}
                                aria-label="Bật hoặc tắt chế độ thử nghiệm vai trò"
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                                  isPersonalDemoActive ? 'bg-amber-500' : 'bg-neutral-300'
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    isPersonalDemoActive ? 'translate-x-4.5' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

        </div>

      </div>

      <OnlineDeploymentGuideModal
        isOpen={isOnlineGuideOpen}
        onClose={() => setIsOnlineGuideOpen(false)}
      />

      <NetworkStatusModal
        isOpen={isNetworkStatusOpen}
        onClose={() => setIsNetworkStatusOpen(false)}
      />
    </header>
  );
};
