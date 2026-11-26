import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Wifi, WifiOff, RefreshCw, X, HardDrive, CheckCircle2, Cloud, Activity, AlertTriangle } from 'lucide-react';
import { testFirebaseConnection, isFirebaseConfigured, getActiveFirebaseConfig, FirebaseHealthResult } from '../config/firebase';

interface NetworkStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NetworkStatusModal: React.FC<NetworkStatusModalProps> = ({ isOpen, onClose }) => {
  const { isOnline, isFirebaseOnline, firebaseAuthenticated, syncNow, isSyncing, orders, users } = useApp();
  const hasFbConfig = isFirebaseConfigured();
  const fbConfig = getActiveFirebaseConfig();
  const [testingFirebase, setTestingFirebase] = useState(false);
  const [testResult, setTestResult] = useState<FirebaseHealthResult | null>(null);

  const handleTestConnection = async () => {
    setTestingFirebase(true);
    setTestResult(null);
    try {
      const result = await testFirebaseConnection();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Lỗi kiểm tra: ${err?.message || err}`,
        network: isOnline ? 'ONLINE' : 'OFFLINE',
        firebaseAuth: 'NOT_TESTED',
        firestoreRead: 'NOT_TESTED',
        firestoreWrite: 'NOT_TESTED',
      });
    } finally {
      setTestingFirebase(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 text-neutral-800">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl border border-neutral-200 overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150 max-h-[85dvh] sm:max-h-[90dvh]">
        
        {/* Header */}
        <div className={`p-4 sm:p-5 text-white flex items-start sm:items-center justify-between shrink-0 ${
          isOnline
            ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700'
            : 'bg-gradient-to-r from-neutral-800 via-neutral-750 to-neutral-900'
        }`}>
          <div className="flex items-start sm:items-center gap-3">
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl shrink-0 flex items-center justify-center font-bold text-xl shadow-inner ${
              isOnline ? 'bg-white/20 text-white' : 'bg-amber-500 text-neutral-950'
            }`}>
              {isOnline ? <Wifi className="w-5 h-5 sm:w-6 sm:h-6" /> : <WifiOff className="w-5 h-5 sm:w-6 sm:h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white leading-tight">
                  Trạng Thái: {isOnline ? 'Trực Tuyến' : 'Offline'}
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-white/90 mt-1 leading-snug max-w-[240px] sm:max-w-none">
                {isOnline ? 'Trạng thái mạng của trình duyệt. Xác minh Firestore được hiển thị riêng bên dưới.' : 'Trình duyệt hiện không có kết nối mạng.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 space-y-3 sm:space-y-4 text-xs sm:text-sm overflow-y-auto custom-scrollbar">
          {isOnline && !isFirebaseOnline && (
            <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs">
              Firebase session: {firebaseAuthenticated ? 'đã xác thực; hãy chạy Test Sync Cloud để kiểm tra Firestore.' : 'chưa có business-user session đã xác thực.'}
            </div>
          )}
          
          {/* Main Status Card */}
          <div className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border ${
            isOnline
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/70 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-start gap-2.5 sm:gap-3">
              {isOnline ? (
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 sm:space-y-1.5">
                <p className="font-black text-[13px] sm:text-sm">
                  {isOnline
                    ? '🟢 Mạng trình duyệt đang trực tuyến'
                    : '🟡 Mạng trình duyệt đang offline'}
                </p>
                <p className="text-[11px] sm:text-xs leading-relaxed opacity-90">
                  {isOnline
                    ? 'Trạng thái mạng không tự khẳng định Firestore read/write. Xem kết quả Test Sync Cloud để biết quyền và khả năng truy cập thực tế.'
                    : 'Firestore cần được kiểm tra lại sau khi kết nối mạng được khôi phục.'}
                </p>
              </div>
            </div>
          </div>

          {/* Sync Stats Box */}
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <div className="p-2.5 sm:p-3 bg-neutral-50 rounded-xl sm:rounded-2xl border border-neutral-200">
              <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 block">Lệnh in trên máy:</span>
              <span className="text-sm sm:text-base font-black text-neutral-900">{orders.length} lệnh</span>
            </div>
            <div className="p-2.5 sm:p-3 bg-neutral-50 rounded-xl sm:rounded-2xl border border-neutral-200">
              <span className="text-[10px] sm:text-[11px] font-bold text-neutral-500 block">Nhân sự ca:</span>
              <span className="text-sm sm:text-base font-black text-neutral-900">{users.length} tài khoản</span>
            </div>
          </div>

          {/* Firebase Live Test Section */}
          <div className="p-3 sm:p-4 bg-neutral-50 rounded-xl sm:rounded-2xl border border-neutral-200 space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold sm:font-black text-neutral-900 flex items-center gap-1.5 text-xs sm:text-sm">
                <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                <span>Test Sync Cloud</span>
              </span>
              <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full ${
                hasFbConfig ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
              }`}>
                {hasFbConfig ? 'Đã Cấu Hình' : 'Chưa cấu hình'}
              </span>
            </div>

            {testResult && (
              <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl border flex items-start gap-2 ${
                testResult.success 
                   ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                   : 'bg-red-50 border-red-300 text-red-900'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 text-[10px] sm:text-[11px]">
                  <p className="font-bold text-xs">{testResult.success ? 'Thành công!' : 'Lỗi đồng bộ'}</p>
                  <p className="opacity-90 leading-relaxed">{testResult.message}</p>
                  <div className="pt-1 grid grid-cols-1 gap-0.5 font-medium">
                    <span>Mạng: {testResult.network}</span>
                    <span>Firebase Auth: {testResult.firebaseAuth}</span>
                    <span>Firestore read: {testResult.firestoreRead}</span>
                    <span>Firestore write: {testResult.firestoreWrite}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={testingFirebase}
              onClick={handleTestConnection}
              className="w-full py-2 sm:py-2.5 px-3 bg-amber-500 hover:bg-amber-400 active:scale-98 disabled:opacity-50 text-neutral-950 font-black text-[11px] sm:text-xs rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-sm"
            >
              <Activity className={`w-3.5 h-3.5 sm:w-4 h-4 ${testingFirebase ? 'animate-spin' : ''}`} />
              <span>{testingFirebase ? 'Đang gửi gói tin...' : 'Kiểm Tra Kết Nối Ngay'}</span>
            </button>
          </div>

          {/* Manual Sync Trigger */}
          <div className="pt-1">
            <button
              type="button"
              disabled={isSyncing || !isOnline}
              onClick={() => syncNow()}
              className="w-full py-2.5 sm:py-3 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm rounded-xl sm:rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : isOnline ? 'Đồng Bộ Dữ Liệu Ngay' : 'Không có mạng'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-500 shrink-0">
          <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-600">
            {isFirebaseOnline ? 'Firebase Auth session active' : 'Firestore sync not verified'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] sm:text-xs font-bold text-neutral-700 hover:text-neutral-900 cursor-pointer"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};
