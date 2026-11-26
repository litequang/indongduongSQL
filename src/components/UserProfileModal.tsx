import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  User as UserIcon,
  KeyRound,
  Upload,
  Image as ImageIcon,
  Check,
  Eye,
  EyeOff,
  Phone,
  Shield,
  Printer,
  Sparkles,
  Camera,
  Wifi,
  WifiOff,
  Scissors,
  Briefcase,
  Palette,
  Crown
} from 'lucide-react';
import { soundManager } from '../utils/soundUtils';
import { VersionBadge } from './VersionBadge';
import { User, UserRole } from '../types';
import { imageStorageService, PreparedImage } from '../services/imageStorageService';
import { ResolvedImage } from './ResolvedImage';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=160&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=160&auto=format&fit=crop&q=80',
];

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, updateUser, appConfig, isOnline, users, setCurrentUser, isPersonalDemoActive, isDemoActive } = useApp();

  const isProduction = appConfig.system.deploymentMode === 'PRODUCTION';
  const isManagerOrDev = currentUser?.role === 'ADMIN' || currentUser?.role === 'DEVELOPER';

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<PreparedImage | null>(null);
  const [selectedPresetAvatar, setSelectedPresetAvatar] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [showCustomUrlInput, setShowCustomUrlInput] = useState(false);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getRoleIcon = (r: UserRole) => {
    switch (r) {
      case 'DEVELOPER': return <Shield className="w-3.5 h-3.5 text-indigo-600" />;
      case 'ADMIN': return <Shield className="w-3.5 h-3.5 text-red-600" />;
      case 'MANAGER': return <Crown className="w-3.5 h-3.5 text-amber-600" />;
      case 'DESIGNER': return <Palette className="w-3.5 h-3.5 text-blue-600" />;
      case 'PRINTER': return <Printer className="w-3.5 h-3.5 text-amber-600" />;
      case 'FINISHER': return <Scissors className="w-3.5 h-3.5 text-purple-600" />;
      case 'SALE': return <Briefcase className="w-3.5 h-3.5 text-emerald-600" />;
    }
  };

  const getRoleLabel = (r: UserRole) => {
    switch (r) {
      case 'DEVELOPER': return 'Developer (Kỹ Thuật Hệ Thống)';
      case 'ADMIN': return 'Admin (Quản Trị Viên Xưởng)';
      case 'MANAGER': return 'Quản Lý / Sếp Xưởng';
      case 'DESIGNER': return 'Thiết Kế';
      case 'PRINTER': return 'Thợ In';
      case 'FINISHER': return 'Tổ Gia Công';
      case 'SALE': return 'Kinh Doanh';
    }
  };

  useEffect(() => {
    if (isOpen && currentUser) {
      setName(currentUser.name || '');
      setUsername(currentUser.username || '');
      setPhone(currentUser.phone || '');
      setAvatar(currentUser.avatar || PRESET_AVATARS[0]);
      setPendingAvatar(null);
      setSelectedPresetAvatar(PRESET_AVATARS.includes(currentUser.avatar || '') ? currentUser.avatar : null);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setErrorMsg('');
      setSuccessMsg('');
      setCustomAvatarUrl('');
      setShowCustomUrlInput(false);
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !currentUser) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingAvatar(true);
      setErrorMsg('');
      setSuccessMsg('Đang nén và tối ưu ảnh đại diện...');
      const prepared = await imageStorageService.prepareImage(file, 512);
      imageStorageService.removePreview(pendingAvatar || undefined);
      setPendingAvatar(prepared);
      setSelectedPresetAvatar(null);
      setAvatar(prepared.previewUrl);
      setSuccessMsg('Đã chọn & tối ưu ảnh đại diện thành công!');
    } catch (err) {
      console.warn('Avatar compression error:', err);
      setErrorMsg('Không thể xử lý ảnh này, vui lòng chọn ảnh khác!');
    } finally {
      setIsProcessingAvatar(false);
      // Reset input value so same file can be re-selected if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Vui lòng nhập tên hiển thị!');
      return;
    }

    // PIN remains a demo-only convenience. Production credentials are managed
    // by Firebase Auth and cannot be changed or verified in this browser.
    if (isProduction && newPin.trim()) {
      setErrorMsg('Production password changes must be completed through the Firebase Auth administrator flow.');
      return;
    }

    // Check if a demo user wants to change PIN
    let updatedPin = currentUser.pin;
    if (!isProduction && newPin.trim()) {
      const userExpectedPin = currentUser.pin;

      if (!currentPin.trim()) {
        setErrorMsg('Vui lòng nhập Mật khẩu / Mã PIN hiện tại để xác thực đổi!');
        return;
      }

      if (currentPin.trim() !== userExpectedPin) {
        setErrorMsg('Mật khẩu / Mã PIN hiện tại không chính xác!');
        return;
      }

      if (newPin.trim().length < 3) {
        setErrorMsg('Mật khẩu / Mã PIN mới phải có ít nhất 3 ký tự!');
        return;
      }

      if (newPin.trim() !== confirmPin.trim()) {
        setErrorMsg('Mật khẩu mới và Nhập lại mật khẩu không khớp nhau!');
        return;
      }

      updatedPin = newPin.trim();
    }

    let uploadedAvatar: Awaited<ReturnType<typeof imageStorageService.uploadAvatar>> | undefined;
    let finalAvatar = avatar.trim() || currentUser.avatar;
    try {
      if (pendingAvatar && isProduction) {
        uploadedAvatar = await imageStorageService.uploadAvatar(currentUser.id, pendingAvatar, currentUser.id);
        finalAvatar = uploadedAvatar.downloadUrl;
      }
      if (isProduction && !uploadedAvatar && (imageStorageService.isDataImage(finalAvatar) || !currentUser.avatarImage?.storagePath)) {
        finalAvatar = currentUser.avatarImage?.downloadUrl || '';
      }

      // Save profile changes only after the Storage upload succeeds. A failed
      // Firestore save rolls back the newly created object.
      const updates: Partial<User> = {
        name: name.trim(),
        username: username.trim(),
        phone: phone.trim(),
        avatar: finalAvatar || undefined,
        avatarImage: uploadedAvatar || currentUser.avatarImage,
      };
      if (!isProduction && updatedPin) {
        updates.pin = updatedPin;
      }
      await updateUser(currentUser.id, updates);

      if (uploadedAvatar && currentUser.avatarImage?.storagePath && currentUser.avatarImage.storagePath !== uploadedAvatar.storagePath) {
        await imageStorageService.deleteImage(currentUser.avatarImage).catch(() => undefined);
      }
      imageStorageService.removePreview(pendingAvatar || undefined);
      setPendingAvatar(null);

    soundManager.playSuccess();
    setSuccessMsg('Đã cập nhật hồ sơ & đổi mật khẩu thành công!');
    setTimeout(() => {
      onClose();
    }, 900);
    } catch (error: any) {
      if (uploadedAvatar) await imageStorageService.cleanupImages([uploadedAvatar]);
      setErrorMsg(error?.message || 'Firestore did not confirm the profile update.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col my-auto max-h-[92dvh]">
        
        {/* Header - Unified solid dark slate header */}
        <div className="px-5 py-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20 shrink-0">
              <UserIcon className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base text-white tracking-tight">
                Hồ Sơ & Tài Khoản Cá Nhân
              </h2>
              <p className="text-xs text-neutral-400 font-medium">
                Đổi ảnh đại diện, tên hiển thị, mật khẩu ca & kiểm tra phiên bản
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - Unified clean white canvas */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto flex-1 space-y-4 bg-white">
          
          {/* Top Avatar Preview & Uploader - Single clean border box */}
          <div className="p-4 bg-white rounded-2xl border border-neutral-200 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative group shrink-0">
              <ResolvedImage
                image={!pendingAvatar && !selectedPresetAvatar ? currentUser.avatarImage : undefined}
                legacyUrl={avatar}
                alt="Avatar"
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-neutral-100 shadow-sm"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 bg-amber-500 hover:bg-amber-600 text-neutral-950 rounded-full shadow-md cursor-pointer transition-all hover:scale-110"
                title="Tải ảnh từ điện thoại / máy tính"
              >
                <Camera className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                <span className="font-black text-sm text-neutral-900 truncate">{name || currentUser.name}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-800 border border-neutral-200">
                  {currentUser.role === 'PRINTER' ? 'Thợ in' : currentUser.role === 'DESIGNER' ? 'Thiết kế' : currentUser.role === 'FINISHER' ? 'Gia công' : currentUser.role === 'SALE' ? 'Kinh doanh' : 'Quản trị'}
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Tài khoản: <b className="font-mono text-neutral-800">{currentUser.username || currentUser.phone || currentUser.name}</b>
              </p>
              
              <div className="flex items-center justify-center sm:justify-start gap-2 pt-1 flex-wrap">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-xl text-xs font-bold text-neutral-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Tải ảnh lên</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCustomUrlInput(!showCustomUrlInput)}
                  className="px-3 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-xl text-xs font-bold text-neutral-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Dán Link ảnh</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section: Chế độ kết nối & Phiên bản ứng dụng */}
          <div className="space-y-2">
            {/* Chế độ: Trực tuyến */}
            <div className="p-3 bg-white rounded-2xl border border-neutral-200 text-xs text-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'animate-ping bg-emerald-400' : 'bg-neutral-400'}`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-emerald-600' : 'bg-neutral-500'}`} />
                </span>
                <span className="font-semibold text-neutral-700">
                  Chế độ: <b className="text-neutral-900">{isOnline ? 'Trực Tuyến (Online Đám Mây)' : 'Offline (Bộ Nhớ Đệm)'}</b>
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                {isOnline ? 'Đồng bộ tức thì' : 'Lưu cục bộ'}
              </span>
            </div>

            {/* Phiên bản & Nút Cập nhật */}
            <VersionBadge />
          </div>

          {/* Custom Avatar URL input if requested */}
          {showCustomUrlInput && (
            <div className="p-3 bg-white border border-neutral-300 rounded-2xl space-y-2 animate-in fade-in">
              <label className="text-xs font-bold text-neutral-800 block">Dán đường dẫn ảnh Avatar (URL):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAvatarUrl}
                  onChange={(e) => setCustomAvatarUrl(e.target.value)}
                  placeholder="https://... ảnh jpg, png"
                  className="flex-1 px-3 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs font-medium outline-hidden focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customAvatarUrl.trim()) {
                      if (isProduction) {
                        setErrorMsg('Production avatars must be selected as an image file and uploaded to Firebase Storage.');
                        return;
                      }
                      setAvatar(customAvatarUrl.trim());
                      setShowCustomUrlInput(false);
                      setSuccessMsg('Đã áp dụng ảnh avatar mới!');
                    }
                  }}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Áp dụng
                </button>
              </div>
            </div>
          )}

          {/* Preset Avatar Gallery */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-neutral-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Hoặc chọn nhanh ảnh đại diện mẫu:</span>
            </label>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
          {PRESET_AVATARS.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={async () => {
                    setErrorMsg('');
                    setSuccessMsg('');
                    setSelectedPresetAvatar(url);
                    if (!isProduction) {
                      setAvatar(url);
                      return;
                    }
                    const previousAvatar = avatar;
                    try {
                      setIsProcessingAvatar(true);
                      setAvatar(url);
                      const prepared = await imageStorageService.prepareImageFromUrl(url, 512);
                      imageStorageService.removePreview(pendingAvatar || undefined);
                      setPendingAvatar(prepared);
                      setAvatar(prepared.previewUrl);
                      setSuccessMsg('Đã chọn avatar mẫu. Ảnh sẽ được lưu an toàn khi bạn bấm Lưu thay đổi hồ sơ.');
                    } catch (error) {
                      setAvatar(previousAvatar);
                      setSelectedPresetAvatar(null);
                      setErrorMsg(imageStorageService.uploadErrorMessage(error));
                    } finally {
                      setIsProcessingAvatar(false);
                    }
                  }}
                  className={`relative rounded-full aspect-square overflow-hidden border-2 transition-all cursor-pointer ${
                    selectedPresetAvatar === url
                      ? 'border-amber-500 ring-2 ring-amber-400 ring-offset-2 scale-110 shadow-sm'
                      : 'border-neutral-200 hover:border-amber-300 opacity-80 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt="preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  {selectedPresetAvatar === url && (
                    <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center text-white">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Name, Username & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-neutral-500" />
                <span>Họ và tên hiển thị:</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên thợ / nhân viên..."
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-bold text-neutral-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-neutral-500" />
                <span>Tên đăng nhập:</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="VD: trinhtyquang..."
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-bold text-neutral-900 focus:border-amber-500 outline-hidden font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-neutral-500" />
                <span>Số điện thoại:</span>
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0988 123 456..."
                className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-medium text-neutral-900 focus:border-amber-500 outline-hidden font-mono"
              />
            </div>
          </div>

          {/* Change Password / PIN Section - Clean single-tone border box */}
          <div className={isProduction ? 'hidden' : 'p-4 bg-white rounded-2xl border border-neutral-200 space-y-3 mt-2'}>
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-neutral-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Đổi Mật Khẩu / Mã PIN Đăng Nhập Ca</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] font-bold text-neutral-500 hover:text-neutral-800 flex items-center gap-1 cursor-pointer"
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPin ? 'Ẩn ký tự' : 'Hiện mật khẩu'}</span>
              </button>
            </div>

            <p className="text-[11px] text-neutral-500">
              (Nếu không cần đổi mật khẩu, bạn có thể để trống các ô bên dưới)
            </p>

            <div className="space-y-2.5">
              <div>
                <input
                  type={showPin ? 'text' : 'password'}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="Mật khẩu / PIN hiện tại..."
                  className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-900 focus:border-amber-500 outline-hidden font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="Mật khẩu mới (VD: 5678)..."
                  className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-900 focus:border-amber-500 outline-hidden font-mono"
                />
                <input
                  type={showPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-semibold text-neutral-900 focus:border-amber-500 outline-hidden font-mono"
                />
              </div>
            </div>
          </div>

          {/* If Admin/Dev has personal DEMO mode active: Allow switching user right here to test roles */}
          {isDemoActive && isManagerOrDev && isPersonalDemoActive && (
            <div className="p-3.5 bg-white rounded-2xl border border-neutral-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-neutral-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Chế độ Demo: Chuyển tài khoản thử nghiệm nhanh
                </span>
                <span className="text-[10px] bg-neutral-100 text-neutral-800 font-bold px-2 py-0.5 rounded border border-neutral-200">
                  Demo Cá Nhân
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Nhấn chọn tài khoản bất kỳ để trải nghiệm giao diện từng vai trò (Thợ in, Thiết kế, Gia công, Sếp):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {users.map((u) => {
                  const isCurrent = u.id === currentUser.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setCurrentUser(u);
                        onClose();
                      }}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-neutral-900 text-white border-neutral-900 font-bold shadow-xs'
                          : 'bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ResolvedImage
                          image={u.avatarImage}
                          legacyUrl={u.avatar}
                          alt={u.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0 border border-neutral-200"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 truncate">
                          <p className="text-xs truncate font-bold">{u.name}</p>
                          <p className={`text-[10px] truncate ${isCurrent ? 'text-neutral-300' : 'text-neutral-500'}`}>
                            {getRoleLabel(u.role)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 scale-90">
                        {getRoleIcon(u.role)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 animate-in fade-in">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 animate-in fade-in flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Footer Submit Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-xs font-bold text-neutral-700 cursor-pointer transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="flex-2 py-2.5 px-4 bg-neutral-950 hover:bg-neutral-900 active:scale-98 text-amber-400 font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-neutral-950/20 transition-all"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Lưu Thay Đổi Hồ Sơ</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
