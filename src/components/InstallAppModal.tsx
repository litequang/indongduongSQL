import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Laptop,
  Share2,
  PlusSquare,
  MoreVertical,
  Download,
  Zap,
  Maximize2,
  HardDrive,
  ShieldCheck,
  Check,
  Copy,
  QrCode,
  Sparkles,
  ExternalLink,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const InstallAppModal: React.FC = () => {
  const { isInstallModalOpen, setIsInstallModalOpen, appConfig } = useApp();
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('ios');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // Detect PWA installation prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Auto detect platform on initial load
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (/iPad|iPhone|iPod/.test(ua)) {
        setActiveTab('ios');
      } else if (/Android/.test(ua)) {
        setActiveTab('android');
      } else {
        setActiveTab('desktop');
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!isInstallModalOpen) return null;

  // Auto-detect browser live origin
  const getAutoDetectedUrl = () => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };

  const configuredUrl = appConfig?.company?.customAppUrl?.trim() || '';
  const autoUrl = getAutoDetectedUrl();
  const activeUrl = configuredUrl || autoUrl;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleNativeInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('Native install error:', err);
    }
  };

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(activeUrl)}`;
  const companyName = appConfig?.company?.name || 'XƯỞNG IN TÚI BÁNH MÌ';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#0b132b] text-slate-100 rounded-3xl w-full max-w-xl max-h-[94dvh] flex flex-col shadow-2xl border border-slate-700/80 overflow-hidden my-auto">
        
        {/* TOP BAR / TABS */}
        <div className="p-3 sm:p-4 border-b border-slate-800 bg-[#080d1f] flex flex-col gap-3">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl overflow-hidden bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-xs shrink-0">
                <img
                  src="/icon.svg"
                  alt="App Icon"
                  className="w-full h-full object-contain p-0.5"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-1.5">
                  <span>Cài Đặt App Vào Thiết Bị</span>
                  <span className="px-1.5 py-0.2 text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                    PWA
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Dùng như ứng dụng chuyên nghiệp, 1 chạm mở ngay
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsInstallModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer"
              title="Đóng hướng dẫn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Device Tabs (Matches user's reference mockup) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-900/90 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                activeTab === 'ios'
                  ? 'bg-slate-800 text-amber-400 font-black shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Smartphone className={`w-3.5 h-3.5 ${activeTab === 'ios' ? 'text-amber-400' : 'text-slate-400'}`} />
              <span className="truncate">iPhone / iPad</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('android')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                activeTab === 'android'
                  ? 'bg-slate-800 text-emerald-400 font-black shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Smartphone className={`w-3.5 h-3.5 ${activeTab === 'android' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="truncate">Android (Chrome)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`py-2 px-1 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                activeTab === 'desktop'
                  ? 'bg-slate-800 text-sky-400 font-black shadow-md border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Laptop className={`w-3.5 h-3.5 ${activeTab === 'desktop' ? 'text-sky-400' : 'text-slate-400'}`} />
              <span className="truncate">Máy Tính (PC/Mac)</span>
            </button>
          </div>

        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">

          {/* 1-CLICK NATIVE INSTALL BANNER (If supported by browser) */}
          {deferredPrompt && (
            <div className="p-3.5 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-600/20 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-300">Trình duyệt đã sẵn sàng cài đặt!</h4>
                  <p className="text-[11px] text-slate-300">Nhấn để cài đặt ứng dụng trực tiếp chỉ với 1 click.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleNativeInstall}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black text-xs transition-all shadow-md cursor-pointer shrink-0"
              >
                Cài Đặt Ngay
              </button>
            </div>
          )}

          {/* TAB 1: IPHONE / IPAD (IOS) */}
          {activeTab === 'ios' && (
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-3.5 text-slate-200">
              
              <div className="flex items-center gap-2 text-amber-400 font-black text-xs sm:text-sm uppercase tracking-wide">
                <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                <span>HƯỚNG DẪN THÊM VÀO MÀN HÌNH CHÍNH TRÊN IPHONE/IPAD</span>
              </div>

              <div className="space-y-3 text-xs leading-relaxed">
                
                {/* Step 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      Mở trình duyệt <strong className="text-white font-bold">Safari</strong> trên iPhone hoặc iPad của bạn.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    2
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-slate-300">
                      Chạm vào nút{' '}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-sky-400 font-bold mx-1">
                        <Share2 className="w-3 h-3" /> Chia sẻ (Share)
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      (ở <strong className="text-slate-300 font-semibold">thanh dưới cùng</strong> trên iPhone hoặc <strong className="text-slate-300 font-semibold">góc trên bên phải</strong> cạnh thanh URL trên iPad).
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      Cuộn xuống và chọn{' '}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-amber-400 font-bold mx-1">
                        <PlusSquare className="w-3 h-3" /> Thêm vào MH chính (Add to Home Screen)
                      </span>
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    4
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      Nhấn <strong className="text-white font-bold">"Thêm" (Add)</strong> ở góc trên bên phải để hoàn tất. Icon <strong className="text-amber-300 font-bold">Lệnh In Túi Bánh Mì</strong> sẽ xuất hiện ngay trên màn hình chính!
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: ANDROID (CHROME/CỐC CỐC) */}
          {activeTab === 'android' && (
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-3.5 text-slate-200">
              
              <div className="flex items-center gap-2 text-emerald-400 font-black text-xs sm:text-sm uppercase tracking-wide">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>HƯỚNG DẪN CÀI ĐẶT TRÊN ĐIỆN THOẠI ANDROID (CHROME/CỐC CỐC)</span>
              </div>

              <div className="space-y-3 text-xs leading-relaxed">
                
                {/* Step 1 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      Mở trình duyệt <strong className="text-white font-bold">Google Chrome</strong> hoặc <strong className="text-white font-bold">Cốc Cốc</strong> trên điện thoại.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    2
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-slate-300">
                      Chạm vào biểu tượng{' '}
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold mx-1">
                        <MoreVertical className="w-3 h-3" /> Menu (3 chấm)
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      ở góc trên bên phải trình duyệt.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      Chọn{' '}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-emerald-400 font-bold mx-1">
                        <Download className="w-3 h-3" /> Cài đặt ứng dụng
                      </span>{' '}
                      hoặc{' '}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-amber-400 font-bold mx-1">
                        Thêm vào Màn hình chính
                      </span>
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-emerald-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-700 mt-0.5">
                    4
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-300">
                      Xác nhận <strong className="text-white font-bold">"Cài đặt" (Install)</strong>. Ứng dụng sẽ được tạo như một App độc lập với biểu tượng sắc nét.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: MÁY TÍNH (PC/MAC) */}
          {activeTab === 'desktop' && (
            <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-3.5 text-slate-200">
              
              <div className="flex items-center gap-2 text-sky-400 font-black text-xs sm:text-sm uppercase tracking-wide">
                <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
                <span>CÀI ĐẶT TRÊN MÁY TÍNH (CHROME / EDGE)</span>
              </div>

              <div className="space-y-3 text-xs leading-relaxed">
                
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-2">
                  <p className="text-slate-300">
                    <strong className="text-white font-bold">1.</strong> Nhìn lên thanh địa chỉ trình duyệt <span className="text-slate-400">(Address bar)</span> ở góc phải.
                  </p>
                  <p className="text-slate-300">
                    <strong className="text-white font-bold">2.</strong> Bấm vào biểu tượng{' '}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded-md text-sky-400 font-bold mx-1">
                      <Download className="w-3 h-3" /> Cài đặt ứng dụng (Install App)
                    </span>{' '}
                    hoặc chọn <strong className="text-white">Menu ⋮ ➔ Cài đặt Lệnh In Túi...</strong>
                  </p>
                  <p className="text-slate-300">
                    <strong className="text-white font-bold">3.</strong> Ứng dụng sẽ chạy trong cửa sổ riêng biệt siêu mượt, toàn màn hình và tiện lợi cho việc quản lý sản xuất xưởng in!
                  </p>
                </div>

              </div>

            </div>
          )}

          {/* QUICK SHARING & QR CODE BAR */}
          <div className="p-3.5 bg-slate-900/70 rounded-2xl border border-slate-800 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>Link truy cập ứng dụng trên điện thoại:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowQr(!showQr)}
                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQr ? 'Ẩn mã QR' : 'Mở mã QR quét nhanh'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activeUrl}
                className="flex-1 bg-slate-950 px-3 py-2 text-xs text-amber-300 rounded-xl border border-slate-700 outline-hidden font-mono select-all truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  copied
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>

            {showQr && (
              <div className="mt-2 p-4 bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-900 animate-in fade-in zoom-in-95">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="w-44 h-44 rounded-lg shadow-xs"
                />
                <p className="text-[11px] font-bold text-slate-600 text-center">
                  Mở Camera trên iPhone / Android để quét & cài đặt trực tiếp
                </p>
              </div>
            )}
          </div>

          {/* 4 BENEFIT CARDS (Matches user's reference mockup) */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-400">
              Lợi ích khi cài đặt Web App Xưởng In:
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* Card 1 */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-start gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl shrink-0 mt-0.5">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-white leading-tight">Mở 1 Chạm Tức Thì</h5>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Truy cập ngay lập tức từ màn hình chính như app tải từ App Store / CH Play.
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-start gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0 mt-0.5">
                  <Maximize2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-white leading-tight">Toàn Màn Hình</h5>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Ẩn thanh địa chỉ trình duyệt, tối ưu 100% diện tích xem lệnh in & quản lý kẽm.
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-start gap-2.5">
                <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl shrink-0 mt-0.5">
                  <HardDrive className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-white leading-tight">Không Tốn Bộ Nhớ</h5>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Dung lượng siêu nhẹ (chỉ vài MB), không làm chậm hay nặng bộ nhớ máy.
                  </p>
                </div>
              </div>

              {/* Card 4 */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800 flex items-start gap-2.5">
                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-white leading-tight">Đồng Bộ & Offline</h5>
                  <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                    Lưu trữ dữ liệu lệnh & kẽm cục bộ để xem mọi lúc, tự động đồng bộ khi có mạng.
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* FOOTER (Matches user's reference mockup) */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-[#080d1f] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/icon.svg"
              alt="Logo"
              className="w-4 h-4 object-contain opacity-80"
              referrerPolicy="no-referrer"
            />
            <span className="text-[11px] text-slate-400">
              © {new Date().getFullYear()} {companyName}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsInstallModalOpen(false)}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer border border-slate-700 hover:border-slate-600"
          >
            Đã Hiểu
          </button>
        </div>

      </div>
    </div>
  );
};
