import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Smartphone,
  CheckCircle2,
  Copy,
  Zap,
  Radio,
  Edit3,
  Save,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  QrCode
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface OnlineDeploymentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnlineDeploymentGuideModal: React.FC<OnlineDeploymentGuideModalProps> = ({
  isOpen,
  onClose
}) => {
  const { appConfig, updateAppConfig, setIsSettingsModalOpen, currentUser } = useApp();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Auto-detect browser live origin
  const getAutoDetectedUrl = () => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    // Map dev cloud-run container to preview link if applicable
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };

  const configuredUrl = appConfig?.company?.customAppUrl?.trim() || '';
  const autoUrl = getAutoDetectedUrl();
  const activeUrl = configuredUrl || autoUrl;

  const [editUrlValue, setEditUrlValue] = useState(activeUrl);

  useEffect(() => {
    setEditUrlValue(activeUrl);
  }, [activeUrl, isOpen]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSaveCustomUrl = () => {
    const trimmed = editUrlValue.trim();
    updateAppConfig({
      company: {
        ...appConfig.company,
        customAppUrl: trimmed
      }
    });
    setIsEditing(false);
  };

  const handleResetToAuto = () => {
    const auto = getAutoDetectedUrl();
    setEditUrlValue(auto);
    updateAppConfig({
      company: {
        ...appConfig.company,
        customAppUrl: ''
      }
    });
    setIsEditing(false);
  };

  // QR Code URL using free online generator
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(activeUrl)}`;

  const isDevOrAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 text-neutral-800">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-white/20 rounded-xl backdrop-blur-xs">
              <Globe className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg">
                Đường Link Web App & Triển Khai Xưởng In
              </h3>
              <p className="text-xs text-blue-100">
                Gửi link cho thợ in ở xưởng khác mở trên điện thoại / máy tính bảng
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs sm:text-sm flex-1">
          
          {/* Current Live URL Box */}
          <div className="bg-amber-50/60 p-4 rounded-2xl border-2 border-amber-200 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <span className="text-xs font-black text-neutral-900 uppercase tracking-wide">
                  Đường link Web App xưởng in (Đang chạy Online):
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {configuredUrl ? (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-bold rounded-md">
                    Đã tùy chỉnh riêng
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] font-bold rounded-md">
                    Tự động nhận diện
                  </span>
                )}
                {copied && <span className="text-xs font-bold text-emerald-600 animate-bounce">Đã copy link!</span>}
              </div>
            </div>

            {/* URL Display / Edit Mode */}
            {isEditing ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editUrlValue}
                    onChange={(e) => setEditUrlValue(e.target.value)}
                    placeholder="Nhập đường link web app thực tế (VD: https://in.tenxuong.vn)..."
                    className="flex-1 px-3 py-2 bg-white border-2 border-amber-400 rounded-xl text-xs font-mono font-bold text-neutral-900 outline-hidden"
                  />
                  <button
                    onClick={handleSaveCustomUrl}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-neutral-950 text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu Link</span>
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
                  >
                    Hủy
                  </button>
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>💡 Bạn có thể dán link tên miền riêng, link shared hoặc link Cloud Run thực tế.</span>
                  <button
                    type="button"
                    onClick={handleResetToAuto}
                    className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Lấy link tự động của trình duyệt
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeUrl}
                  className="flex-1 px-3 py-2.5 bg-white border border-neutral-300 rounded-xl text-xs font-mono font-bold text-neutral-900 shadow-2xs select-all"
                />
                
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 sm:flex-none px-3.5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-black rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    title="Copy đường link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </button>

                  <button
                    onClick={() => setShowQr(!showQr)}
                    className="px-3 py-2.5 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Hiển thị mã QR quét bằng điện thoại"
                  >
                    <QrCode className="w-3.5 h-3.5 text-blue-600" />
                    <span>Mã QR</span>
                  </button>

                  {isDevOrAdmin && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer border border-amber-300 shadow-2xs"
                      title="Chỉnh sửa link web app thực tế"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                      <span>Chỉnh sửa</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* QR Code expansion */}
            {showQr && (
              <div className="p-4 bg-white rounded-2xl border border-amber-200 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <img
                  src={qrCodeUrl}
                  alt="QR Code Web App"
                  className="w-32 h-32 rounded-xl border border-neutral-200 p-1 bg-white shrink-0"
                />
                <div className="space-y-1.5">
                  <h5 className="font-black text-neutral-900 text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1.5">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    Quét mã QR bằng Camera điện thoại
                  </h5>
                  <p className="text-[11px] text-neutral-600 leading-relaxed">
                    Thợ in hoặc Sale chỉ cần dùng Camera điện thoại quét mã này để mở thẳng vào giao diện xưởng in ngay lập tức.
                  </p>
                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline"
                  >
                    <span>Mở thử trong tab mới</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Guide on where to edit in Settings */}
            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <span className="text-neutral-600">
                📌 Bạn cũng có thể chỉnh sửa link này trong <b>Cài Đặt Xưởng In</b> → tab <b>Thương Hiệu & Xưởng</b>.
              </span>
              {isDevOrAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setIsSettingsModalOpen(true);
                  }}
                  className="text-amber-900 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Mở Cài Đặt Xưởng In
                </button>
              )}
            </div>
          </div>

          {/* 3 Steps to deploy for workshop */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-neutral-900 text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500 fill-current" />
              Cách Thợ In & Các Bộ Phận Sử Dụng Thực Tế:
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* Step 1 */}
              <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 font-extrabold flex items-center justify-center text-sm">
                  1
                </div>
                <h5 className="font-bold text-neutral-900 text-xs">Văn Phòng / Thiết Kế</h5>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Thiết kế xong chỉ cần nhấn <b>Ctrl + V</b> dán ảnh vào web, gõ 1 dòng lệnh rồi bấm <b>Phát Lệnh</b>.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-900 font-extrabold flex items-center justify-center text-sm">
                  2
                </div>
                <h5 className="font-bold text-neutral-900 text-xs">Thợ In Tại Xưởng Khác</h5>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Mở link web trên điện thoại (4G hoặc WiFi xưởng), chuông kêu ting ting, thợ chạm nút <b>[ XÁC NHẬN ĐÃ NHẬN ]</b>.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-900 font-extrabold flex items-center justify-center text-sm">
                  3
                </div>
                <h5 className="font-bold text-neutral-900 text-xs">Gia Công & Bàn Giao</h5>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  In xong bấm <b>[ IN XONG ]</b>, chuyển tự động sang tổ gia công dán/cắt mà không cần gọi điện thoại hỏi nhau.
                </p>
              </div>

            </div>
          </div>

          {/* Install as PWA on Phone */}
          <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-start gap-3">
            <Smartphone className="w-6 h-6 text-neutral-700 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-bold text-neutral-900">
                Cài đặt app lên màn hình chính điện thoại của thợ in:
              </p>
              <p className="text-neutral-600 text-[11px]">
                Trên Safari (iPhone) hoặc Chrome (Android): Mở link trên → Bấm <b>Chia sẻ / Menu 3 chấm</b> → Chọn <b>"Thêm vào màn hình chính" (Add to Home Screen)</b> để dùng như một ứng dụng độc lập có biểu tượng riêng.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">
            Dữ liệu đồng bộ trực tiếp qua Firebase Cloud Firestore
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
