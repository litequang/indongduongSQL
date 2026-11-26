import { safeLocalStorageSet, safeLocalStorageRemove } from '../utils/storageUtils';
import React, { useState, useRef } from 'react';
import {
  X,
  SlidersHorizontal,
  Building2,
  Printer,
  Clock,
  ToggleLeft,
  Server,
  Check,
  RotateCcw,
  Plus,
  Save,
  Globe,
  Scissors,
  FileText,
  Weight,
  Palette,
  CheckCircle2,
  ShieldCheck,
  FlaskConical,
  Trash2,
  ShieldAlert,
  Upload,
  Download,
  Smartphone,
  Monitor,
  Tablet,
  Image as ImageIcon,
  Sparkles,
  RefreshCw,
  FileCode,
  CheckCircle,
  Activity,
  Cloud,
  AlertTriangle,
  Key,
  Database
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AppConfig } from '../types';
import { canManageSystemSettings } from '../permissions';
import { VersionBadge } from './VersionBadge';
import { DeveloperPermissionMatrix } from './DeveloperPermissionMatrix';
import { DatabaseMetricsDashboard } from './DatabaseMetricsDashboard';
import { StorageProviderManager } from './StorageProviderManager';
import { ResolvedImage } from './ResolvedImage';
import { downloadSvgAsset } from '../utils/iconSync';
import { testFirebaseConnection, getActiveFirebaseConfig, isFirebaseConfigured } from '../config/firebase';
import { featureService, FeatureModule, MODULE_REGISTRY } from '../services/featureService';
import { imageStorageService, PreparedImage } from '../services/imageStorageService';

export const SettingsModal: React.FC = () => {
  const {
    appConfig,
    updateAppConfig,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isFirebaseOnline,
    resetDemoData,
    deleteAllOrders,
    orders,
    currentUser,
    realAuthenticatedUser,
    users,
    isDemoActive,
    isPersonalDemoActive,
    setIsPersonalDemoActive,
    isRolePreviewActive,
  } = useApp();

  const canManageStorageProviders = !isDemoActive && !isRolePreviewActive && canManageSystemSettings(realAuthenticatedUser);
  const [activeTab, setActiveTab] = useState<'company' | 'production' | 'workflow' | 'features' | 'system' | 'storage' | 'metrics' | 'permissions'>('company');
  const [formData, setFormData] = useState<AppConfig>(() => appConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // New item inputs
  const [newPaperType, setNewPaperType] = useState('');
  const [newGsm, setNewGsm] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newFinishing, setNewFinishing] = useState('');
  const [newPrinterName, setNewPrinterName] = useState('');

  // Logo / SVG Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [logoUploadInfo, setLogoUploadInfo] = useState<{ name: string; isSvg: boolean; sizeKb: number } | null>(null);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<PreparedImage | null>(null);

  // Firebase Live Test & Custom Config state
  const [testingFirebase, setTestingFirebase] = useState(false);
  const [fbTestResult, setFbTestResult] = useState<{ success: boolean; message: string; pingMs?: number; projectId?: string } | null>(null);
  const [showCustomFbEditor, setShowCustomFbEditor] = useState(false);
  const [customFbForm, setCustomFbForm] = useState(() => getActiveFirebaseConfig());

  const handleTestFirebase = async () => {
    setTestingFirebase(true);
    setFbTestResult(null);
    try {
      const res = await testFirebaseConnection();
      setFbTestResult(res);
    } catch (err: any) {
      setFbTestResult({
        success: false,
        message: `Lỗi kết nối: ${err?.message || err}`
      });
    } finally {
      setTestingFirebase(false);
    }
  };

  const handleSaveCustomFb = async () => {
    if (!isDemoActive) {
      alert('Production Firebase configuration is build-managed and cannot be changed in this browser.');
      return;
    }
    try {
      safeLocalStorageSet('flexo_custom_firebase_config_v1', JSON.stringify(customFbForm));
      alert('Đã lưu cấu hình Firebase vào trình duyệt! Đang kiểm tra kết nối...');
      await handleTestFirebase();
    } catch (e) {
      alert('Không thể lưu cấu hình');
    }
  };

  const handleClearCustomFb = () => {
    if (!isDemoActive) {
      alert('Production Firebase configuration is build-managed and cannot be changed in this browser.');
      return;
    }
    if (confirm('Xóa cấu hình Firebase tùy chỉnh và dùng cấu hình mặc định từ file .env?')) {
      safeLocalStorageRemove('flexo_custom_firebase_config_v1');
      setCustomFbForm(getActiveFirebaseConfig());
      alert('Đã xóa cấu hình tùy chỉnh.');
    }
  };

  const handleProcessLogoFile = async (file: File) => {
    try {
      setLogoUploadError(null);
      const prepared = await imageStorageService.prepareImage(file, 1024);
      imageStorageService.removePreview(pendingLogo || undefined);
      setPendingLogo(prepared);
      setFormData(prev => ({
        ...prev,
        company: {
          ...prev.company,
          logoUrl: prepared.previewUrl,
          logoImage: undefined,
        }
      }));
      setLogoUploadInfo({
        name: prepared.fileName,
        isSvg: false,
        sizeKb: Math.round(prepared.size / 1024)
      });
    } catch (err) {
      console.error('Lỗi khi đọc file logo:', err);
      setLogoUploadError(imageStorageService.uploadErrorMessage(err));
    }
  };

  const handleResetDefaultLogo = () => {
    imageStorageService.removePreview(pendingLogo || undefined);
    setPendingLogo(null);
    setFormData(prev => ({
      ...prev,
        company: {
          ...prev.company,
          logoUrl: '',
          logoImage: undefined,
      }
    }));
    setLogoUploadInfo(null);
    setLogoUploadError(null);
  };

  const handleDownloadCurrentLogo = async () => {
    try {
      const targetUrl = await imageStorageService.resolveImageUrl(
        formData.company.logoImage,
        formData.company.logoUrl,
      ) || '/icon.svg';
      downloadSvgAsset(targetUrl, 'icon.svg');
    } catch (error) {
      setLogoUploadError(error instanceof Error ? error.message : 'Không thể tải logo từ kho lưu trữ.');
    }
  };

  // Sync formData whenever appConfig changes or modal opens
  React.useEffect(() => {
    if (isSettingsModalOpen) {
      setFormData(appConfig);
      setSaveSuccess(false);
    }
  }, [isSettingsModalOpen, appConfig]);

  React.useEffect(() => {
    if (activeTab === 'storage' && !canManageStorageProviders) setActiveTab('system');
  }, [activeTab, canManageStorageProviders]);

  if (!isSettingsModalOpen) return null;

  const handleSave = async () => {
    let uploadedLogo: Awaited<ReturnType<typeof imageStorageService.uploadCompanyLogo>> | undefined;
    const previousLogo = appConfig.company.logoImage;
    try {
      setIsSaving(true);
      let configToSave = formData;
      if (pendingLogo && !isDemoActive) {
        uploadedLogo = await imageStorageService.uploadCompanyLogo(pendingLogo, currentUser.id);
        configToSave = {
          ...formData,
          company: {
            ...formData.company,
            logoUrl: uploadedLogo.downloadUrl,
            logoImage: uploadedLogo,
          },
        };
      }
      if (!isDemoActive && !configToSave.company.logoImage?.storagePath) {
        // Test-era external URLs are not a durable app image reference. A
        // production save removes them unless this session uploaded a logo.
        configToSave = {
          ...configToSave,
          company: { ...configToSave.company, logoUrl: '', logoImage: undefined },
        };
      }
      await updateAppConfig(configToSave);
      if (uploadedLogo && previousLogo?.storagePath && previousLogo.storagePath !== uploadedLogo.storagePath) {
        await imageStorageService.deleteImage(previousLogo).catch(() => undefined);
      }
      if (!uploadedLogo && !configToSave.company.logoImage && previousLogo?.storagePath) {
        await imageStorageService.deleteImage(previousLogo).catch(() => undefined);
      }
      imageStorageService.removePreview(pendingLogo || undefined);
      setPendingLogo(null);
      setFormData(configToSave);
      setSaveSuccess(true);
      
      setTimeout(() => {
        setSaveSuccess(false);
      }, 2500);
    } catch (err) {
      if (uploadedLogo) await imageStorageService.cleanupImages([uploadedLogo]);
      console.error('Lỗi khi lưu cài đặt:', err);
      setLogoUploadError(imageStorageService.uploadErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPrinter = () => {
    if (!newPrinterName.trim()) return;
    const currentList = formData.production.printersList || ['Máy In 1', 'Máy In 2', 'Máy In 4 màu', 'Máy In Cuộn', 'Máy In Offset'];
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        printersList: [...currentList, newPrinterName.trim()]
      }
    }));
    setNewPrinterName('');
  };

  const handleRemovePrinter = (index: number) => {
    const currentList = formData.production.printersList || ['Máy In 1', 'Máy In 2', 'Máy In 4 màu', 'Máy In Cuộn', 'Máy In Offset'];
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        printersList: currentList.filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddPaper = () => {
    if (!newPaperType.trim()) return;
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        paperTypes: [...prev.production.paperTypes, newPaperType.trim()]
      }
    }));
    setNewPaperType('');
  };

  const handleRemovePaper = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        paperTypes: prev.production.paperTypes.filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddGsm = () => {
    if (!newGsm.trim()) return;
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        defaultGsmList: [...prev.production.defaultGsmList, newGsm.trim()]
      }
    }));
    setNewGsm('');
  };

  const handleRemoveGsm = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        defaultGsmList: prev.production.defaultGsmList.filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddColor = () => {
    if (!newColor.trim()) return;
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        colorsList: [...prev.production.colorsList, newColor.trim()]
      }
    }));
    setNewColor('');
  };

  const handleRemoveColor = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        colorsList: prev.production.colorsList.filter((_, i) => i !== index)
      }
    }));
  };

  const handleAddFinishing = () => {
    if (!newFinishing.trim()) return;
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        finishingTypes: [...prev.production.finishingTypes, newFinishing.trim()]
      }
    }));
    setNewFinishing('');
  };

  const handleRemoveFinishing = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production: {
        ...prev.production,
        finishingTypes: prev.production.finishingTypes.filter((_, i) => i !== index)
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl xl:max-w-6xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800 flex flex-col h-[94dvh] sm:h-[90dvh] md:h-[88dvh]">
        
        {/* 1. MODAL HEADER */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/95 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-neutral-950 flex items-center justify-center font-bold shadow-xs shrink-0">
              <SlidersHorizontal className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-neutral-900 leading-tight truncate">
                  Cài Đặt Hệ Thống Xưởng In
                </h3>
                <VersionBadge variant="pill" className="shrink-0" />
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-500 truncate mt-0.5">
                Cấu hình thương hiệu, quy cách vật tư, quy trình sản xuất & ma trận phân quyền
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(false)}
            className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-200/60 transition-colors shrink-0 cursor-pointer"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. RESPONSIVE TAB BAR (CLEAN, WIDE, HIGH VISIBILITY) */}
        <div className="flex items-center gap-1.5 px-3 py-2 sm:px-6 sm:py-2.5 bg-neutral-100/90 border-b border-neutral-200 overflow-x-auto no-scrollbar scrollbar-none shrink-0 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
              activeTab === 'company'
                ? 'bg-white text-neutral-950 shadow-xs border border-neutral-200 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <Building2 className={`w-4 h-4 ${activeTab === 'company' ? 'text-amber-600' : 'text-neutral-400'}`} />
            <span>Thương Hiệu & Logo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('production')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
              activeTab === 'production'
                ? 'bg-white text-neutral-950 shadow-xs border border-neutral-200 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <Printer className={`w-4 h-4 ${activeTab === 'production' ? 'text-blue-600' : 'text-neutral-400'}`} />
            <span>Vật Tư & Máy In</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('workflow')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
              activeTab === 'workflow'
                ? 'bg-white text-neutral-950 shadow-xs border border-neutral-200 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <Clock className={`w-4 h-4 ${activeTab === 'workflow' ? 'text-orange-500' : 'text-neutral-400'}`} />
            <span>Cảnh Báo & Giờ Ca</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('features')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
              activeTab === 'features'
                ? 'bg-white text-neutral-950 shadow-xs border border-neutral-200 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <ToggleLeft className={`w-4 h-4 ${activeTab === 'features' ? 'text-emerald-600' : 'text-neutral-400'}`} />
            <span>Tính Năng & Module</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
              activeTab === 'system'
                ? 'bg-white text-neutral-950 shadow-xs border border-neutral-200 font-black'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
            }`}
          >
            <Server className={`w-4 h-4 ${activeTab === 'system' ? 'text-neutral-800' : 'text-neutral-400'}`} />
            <span>Hệ Thống & Lưu Trữ</span>
          </button>

          {canManageStorageProviders && (
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
                activeTab === 'storage'
                  ? 'bg-sky-700 text-white shadow-xs border border-sky-600 font-black'
                  : 'text-sky-800 bg-sky-100/80 hover:bg-sky-200/90 border border-sky-300'
              }`}
            >
              <Cloud className={`w-4 h-4 ${activeTab === 'storage' ? 'text-sky-100' : 'text-sky-700'}`} />
              <span>Lưu Trữ Ảnh (Dev)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('metrics')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
              activeTab === 'metrics'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 shadow-xs border border-amber-400 font-black'
                : 'text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 border border-amber-300/80'
            }`}
          >
            <Database className={`w-4 h-4 ${activeTab === 'metrics' ? 'text-neutral-950' : 'text-amber-700'}`} />
            <span>Thống Kê Dữ Liệu (Dev)</span>
          </button>

          {currentUser.role === 'DEVELOPER' && (
            <button
              type="button"
              onClick={() => setActiveTab('permissions')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all shrink-0 flex items-center gap-2 cursor-pointer min-h-[38px] ${
                activeTab === 'permissions'
                  ? 'bg-purple-900 text-white shadow-xs border border-purple-800 font-black'
                  : 'text-purple-700 bg-purple-100/80 hover:bg-purple-200/90 border border-purple-300'
              }`}
            >
              <ShieldAlert className={`w-4 h-4 ${activeTab === 'permissions' ? 'text-purple-300' : 'text-purple-600'}`} />
              <span>Ma Trận Phân Quyền (Dev)</span>
            </button>
          )}
        </div>

        {/* 3. MODAL BODY (SMOOTH SCROLL, RESPONSIVE 2/3 COLUMN GRIDS) */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs sm:text-sm">
          
          {/* TAB 1: THƯƠNG HIỆU, LOGO & ICON APP */}
          {activeTab === 'company' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Card 1: Thông tin doanh nghiệp / xưởng in */}
                <div className="p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3">
                  <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2 border-b border-neutral-200 pb-2">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    <span>Thông Tin Định Danh Xưởng In</span>
                  </h4>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Tên xưởng in / Doanh nghiệp:
                    </label>
                    <input
                      type="text"
                      value={formData.company.name}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        company: { ...prev.company, name: e.target.value }
                      }))}
                      placeholder="VD: XƯỞNG IN TÚI BÁNH MÌ VINH PHÁT"
                      className="w-full px-3.5 py-2.5 bg-white border border-neutral-300 rounded-xl text-neutral-900 font-bold focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-hidden text-xs sm:text-sm min-h-[42px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        Tên viết tắt (hiển thị di động & icon app):
                      </label>
                      <input
                        type="text"
                        value={formData.company.shortName}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          company: { ...prev.company, shortName: e.target.value }
                        }))}
                        placeholder="VD: VINH PHÁT"
                        className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-neutral-900 font-bold focus:border-amber-500 outline-hidden text-xs min-h-[40px]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 mb-1">
                        Số điện thoại liên hệ:
                      </label>
                      <input
                        type="text"
                        value={formData.company.phone || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          company: { ...prev.company, phone: e.target.value }
                        }))}
                        placeholder="VD: 0988 112 233"
                        className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-neutral-900 font-medium focus:border-amber-500 outline-hidden text-xs min-h-[40px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Địa chỉ xưởng sản xuất:
                    </label>
                    <input
                      type="text"
                      value={formData.company.address || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        company: { ...prev.company, address: e.target.value }
                      }))}
                      placeholder="VD: Số 123 Đường Xưởng In, Cụm Công Nghiệp..."
                      className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-neutral-900 font-medium focus:border-amber-500 outline-hidden text-xs min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Khẩu hiệu / Slogan xưởng:
                    </label>
                    <input
                      type="text"
                      value={formData.company.slogan || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        company: { ...prev.company, slogan: e.target.value }
                      }))}
                      placeholder="VD: In nhanh - Chuẩn màu - Kịp tiến độ"
                      className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-neutral-900 font-medium focus:border-amber-500 outline-hidden text-xs min-h-[40px]"
                    />
                  </div>
                </div>

                {/* Card 2: Đường link & Triển khai trực tuyến */}
                <div className="p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2 border-b border-neutral-200 pb-2">
                      <Globe className="w-4 h-4 text-blue-600" />
                      <span>Đường Link Web App & Triển Khai Xưởng</span>
                    </h4>

                    <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <label className="block text-xs font-bold text-blue-950 flex items-center gap-1.5">
                          <span>Đường link Web App xưởng in (Đang chạy Online):</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              const origin = window.location.origin;
                              const isDevUrl = origin.includes('ais-dev-');
                              const url = isDevUrl ? origin.replace('ais-dev-', 'ais-pre-') : origin;
                              setFormData(prev => ({
                                ...prev,
                                company: { ...prev.company, customAppUrl: url }
                              }));
                            }
                          }}
                          className="self-start sm:self-auto text-[11px] text-blue-700 hover:text-blue-900 font-bold hover:underline cursor-pointer bg-white px-2 py-0.5 rounded-md border border-blue-200 shadow-2xs"
                        >
                          ⚡ Lấy link web hiện tại
                        </button>
                      </div>
                      <input
                        type="url"
                        value={formData.company.customAppUrl || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          company: { ...prev.company, customAppUrl: e.target.value }
                        }))}
                        placeholder="VD: https://in.tenxuong.vn hoặc link app triển khai..."
                        className="w-full px-3.5 py-2 bg-white border border-neutral-300 rounded-xl text-neutral-900 font-mono font-bold focus:border-blue-500 outline-hidden text-xs min-h-[40px]"
                      />
                      <p className="text-[11px] text-blue-800 leading-tight">
                        👉 Dùng tạo mã QR & gửi link cho thợ in, kinh doanh mở nhanh trên điện thoại/máy tính bảng.
                      </p>
                    </div>

                    <div className="p-3 bg-neutral-100 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-1.5">
                      <p className="font-bold text-neutral-800 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Đồng bộ nhận diện thương hiệu tự động:</span>
                      </p>
                      <p className="text-[11px] text-neutral-600 leading-relaxed">
                        Sau khi tải lên file <code className="px-1 py-0.5 bg-white rounded font-mono font-bold text-neutral-900">icon.svg</code> và nhấn <strong>"Lưu Cài Đặt"</strong>, hệ thống sẽ tự động cập nhật logo trên thanh tiêu đề Web, Favicon tab trình duyệt và icon khi Cài đặt ứng dụng vào iPhone, iPad, Android, Máy tính.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3 & 4: Tải lên file icon.svg và Mô phỏng Đa Thiết Bị */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* Left: Upload icon.svg Card (5 cols) */}
                <div className="lg:col-span-5 p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2">
                      <Upload className="w-4 h-4 text-amber-600" />
                      <span>Tải Lên File icon.svg / Logo Xưởng</span>
                    </h4>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                      SVG / PNG / WebP
                    </span>
                  </div>

                  {/* Hidden input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleProcessLogoFile(file);
                      e.target.value = '';
                    }}
                  />

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingLogo(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDraggingLogo(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingLogo(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleProcessLogoFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-5 rounded-2xl border-2 border-dashed transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-2 ${
                      isDraggingLogo
                        ? 'border-amber-500 bg-amber-50 shadow-md scale-[1.01]'
                        : 'border-neutral-300 hover:border-amber-400 bg-white hover:bg-neutral-50/80 shadow-2xs'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                      <FileCode className="w-6 h-6 stroke-[2.2]" />
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-black text-neutral-900">
                        Kéo thả file <span className="text-amber-600 font-mono">icon.svg</span> hoặc ảnh vào đây
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Hoặc bấm để chọn file từ máy tính / điện thoại
                      </p>
                    </div>

                    <button
                      type="button"
                      className="mt-1 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Chọn file icon.svg</span>
                    </button>
                  </div>

                  {/* Upload Error feedback */}
                  {logoUploadError && (
                    <div className="p-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
                      <X className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{logoUploadError}</span>
                    </div>
                  )}

                  {/* Active File Info & Action Buttons */}
                  <div className="space-y-2">
                    <div className="p-3 bg-white rounded-xl border border-neutral-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 p-1 border border-neutral-200 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs">
                          <ResolvedImage
                            image={formData.company.logoImage}
                            legacyUrl={formData.company.logoUrl}
                            fallbackUrl="/icon.svg"
                            alt="Logo preview"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">
                            {logoUploadInfo?.name || (formData.company.logoUrl || formData.company.logoImage ? 'Logo Tùy Chỉnh Xưởng' : 'icon.svg (Mặc định xưởng bánh mì)')}
                          </p>
                          <p className="text-[10px] text-neutral-500 truncate">
                            {formData.company.logoUrl || formData.company.logoImage
                              ? `Ảnh từ ${formData.company.logoImage?.providerConfigId || 'kho lưu trữ'}`
                              : 'File gốc hệ thống (/icon.svg)'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleDownloadCurrentLogo()}
                          className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg border border-neutral-200 transition-colors cursor-pointer"
                          title="Tải file icon.svg hiện tại về máy tính"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {(formData.company.logoUrl || formData.company.logoImage) && (
                          <button
                            type="button"
                            onClick={handleResetDefaultLogo}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                            title="Khôi phục lại logo icon.svg mặc định"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Storage reference is output-only; direct URL/Base64 persistence is disabled. */}
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                        URL tương thích (R2 dùng imageId, không lưu signed URL)
                      </label>
                      <input
                        type="text"
                        value={formData.company.logoUrl || ''}
                        readOnly
                        placeholder="Chọn tệp ảnh để tải lên kho lưu trữ"
                        className="w-full px-3 py-1.5 bg-neutral-100 border border-neutral-300 rounded-xl text-neutral-600 font-mono text-xs outline-hidden min-h-[36px]"
                      />
                    </div>
                  </div>
                </div>

                {/* Right: Live Multi-Device Preview Mockup (7 cols) */}
                <div className="lg:col-span-7 p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-sky-600" />
                      <span>Xem Trước Nhận Diện Trên Đa Thiết Bị</span>
                    </h4>
                    <span className="text-[10px] text-emerald-800 font-black bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Thời Gian Thực</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    
                    {/* Device 1: Browser Tab Favicon Preview (PC / Mac) */}
                    <div className="p-3 bg-white rounded-2xl border border-neutral-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1.5">
                          <Monitor className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Tab Trình Duyệt PC / Laptop:</span>
                        </span>
                      </div>

                      {/* Mock Chrome Tab */}
                      <div className="bg-neutral-100 rounded-t-xl p-1.5 pb-0 border-b border-neutral-200">
                        <div className="bg-white rounded-t-lg px-2.5 py-1.5 flex items-center gap-2 shadow-2xs border-t border-x border-neutral-200">
                          <div className="w-4 h-4 rounded-xs shrink-0 overflow-hidden flex items-center justify-center">
                            <ResolvedImage
                              image={formData.company.logoImage}
                              legacyUrl={formData.company.logoUrl}
                              fallbackUrl="/icon.svg"
                              alt="Favicon"
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <span className="text-[11px] font-bold text-neutral-800 truncate max-w-[130px]">
                            {formData.company.name || 'Xưởng In Bánh Mì'}
                          </span>
                          <X className="w-3 h-3 text-neutral-400 shrink-0 ml-auto" />
                        </div>
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-tight">
                        Favicon trên tab Google Chrome, Microsoft Edge, Safari...
                      </p>
                    </div>

                    {/* Device 2: iPhone / iPad & Android Home Screen Icon */}
                    <div className="p-3 bg-white rounded-2xl border border-neutral-200 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Màn Hình Chính Điện Thoại / iPad:</span>
                        </span>
                      </div>

                      {/* Mock iOS / Android App Icon Tile */}
                      <div className="p-3 bg-gradient-to-b from-slate-900 to-slate-950 rounded-xl flex items-center gap-3 text-white">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-1.5 shadow-lg shadow-amber-500/20 shrink-0 overflow-hidden flex items-center justify-center border border-white/20">
                          <ResolvedImage
                            image={formData.company.logoImage}
                            legacyUrl={formData.company.logoUrl}
                            fallbackUrl="/icon.svg"
                            alt="App Icon Tile"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-white truncate">
                            {formData.company.shortName || formData.company.name || 'Lệnh In Túi'}
                          </p>
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-amber-400/20 text-amber-300 rounded text-[9px] font-bold">
                            App Đã Cài Đặt (PWA)
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-tight">
                        Icon ứng dụng khi Thêm vào Màn hình chính trên iOS Safari & Android.
                      </p>
                    </div>

                    {/* Device 3: Header Brand Navigation Bar */}
                    <div className="p-3 bg-white rounded-2xl border border-neutral-200 space-y-2 shadow-2xs sm:col-span-2">
                      <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Thanh Đầu Trang & Logo Hệ Thống (Header Bar):</span>
                      </span>

                      <div className="p-2.5 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                            <ResolvedImage
                              image={formData.company.logoImage}
                              legacyUrl={formData.company.logoUrl}
                              fallbackUrl="/icon.svg"
                              alt="Header Brand Logo"
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-black text-neutral-900 truncate">
                              {formData.company.name || 'XƯỞNG IN TÚI BÁNH MÌ'}
                            </p>
                            <p className="text-[10px] text-neutral-500 font-medium truncate">
                              {formData.company.slogan || 'Hệ thống Quản lý Tiến độ In'}
                            </p>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-full text-[10px] font-bold">
                          Trực tuyến
                        </span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: QUY CÁCH SẢN XUẤT & VẬT TƯ */}
          {activeTab === 'production' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-100">
              
              {/* 1. Danh sách máy in */}
              <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                    <label className="text-xs font-black text-blue-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Printer className="w-4 h-4 text-blue-600" />
                      <span>Máy In Xưởng ({ (formData.production.printersList || []).length })</span>
                    </label>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 py-3 max-h-40 overflow-y-auto">
                    {(formData.production.printersList || ['Máy In 1', 'Máy In 2', 'Máy In 4 màu', 'Máy In Cuộn', 'Máy In Offset']).map((printer, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white text-blue-950 font-bold rounded-xl border border-blue-200 text-xs flex items-center gap-1.5 shadow-2xs"
                      >
                        <Printer className="w-3 h-3 text-blue-500" />
                        <span>{printer}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePrinter(idx)}
                          className="w-4 h-4 rounded-full hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-600 transition-colors font-bold text-sm cursor-pointer"
                          title="Xóa máy"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-blue-200/80">
                  <input
                    type="text"
                    value={newPrinterName}
                    onChange={(e) => setNewPrinterName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPrinter();
                      }
                    }}
                    placeholder="Thêm máy in..."
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-200 min-h-[38px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddPrinter}
                    className="shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer min-h-[38px] shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              {/* 2. Loại giấy */}
              <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                    <label className="text-xs font-black text-amber-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <FileText className="w-4 h-4 text-amber-600" />
                      <span>Loại Giấy In ({ formData.production.paperTypes.length })</span>
                    </label>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 py-3 max-h-40 overflow-y-auto">
                    {formData.production.paperTypes.map((type, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white text-neutral-900 font-bold rounded-xl border border-neutral-200 text-xs flex items-center gap-1.5 shadow-2xs"
                      >
                        <span>{type}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePaper(idx)}
                          className="w-4 h-4 rounded-full hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-600 transition-colors font-bold text-sm cursor-pointer"
                          title="Xóa"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-amber-200/80">
                  <input
                    type="text"
                    value={newPaperType}
                    onChange={(e) => setNewPaperType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPaper();
                      }
                    }}
                    placeholder="Thêm loại giấy..."
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-bold outline-hidden focus:border-amber-500 focus:ring-2 focus:ring-amber-200 min-h-[38px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddPaper}
                    className="shrink-0 px-3 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-neutral-950 rounded-xl font-black text-xs flex items-center gap-1 cursor-pointer min-h-[38px] shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              {/* 3. Định lượng giấy (GSM) */}
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                    <label className="text-xs font-black text-emerald-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Weight className="w-4 h-4 text-emerald-600" />
                      <span>Định Lượng GSM ({ formData.production.defaultGsmList.length })</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5 py-3 max-h-40 overflow-y-auto">
                    {formData.production.defaultGsmList.map((gsm, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white text-emerald-950 font-bold rounded-xl border border-emerald-200 text-xs flex items-center gap-1.5 shadow-2xs"
                      >
                        <span>{gsm} GSM</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveGsm(idx)}
                          className="w-4 h-4 rounded-full hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-600 transition-colors font-bold text-sm cursor-pointer"
                          title="Xóa"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-emerald-200/80">
                  <input
                    type="text"
                    value={newGsm}
                    onChange={(e) => setNewGsm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddGsm();
                      }
                    }}
                    placeholder="VD: 150..."
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-bold outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 min-h-[38px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddGsm}
                    className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer min-h-[38px] shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              {/* 4. Màu in */}
              <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-200 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                    <label className="text-xs font-black text-rose-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Palette className="w-4 h-4 text-rose-600" />
                      <span>Màu Mực In ({ formData.production.colorsList.length })</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5 py-3 max-h-40 overflow-y-auto">
                    {formData.production.colorsList.map((col, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white text-rose-950 font-bold rounded-xl border border-rose-200 text-xs flex items-center gap-1.5 shadow-2xs"
                      >
                        <span>{col}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveColor(idx)}
                          className="w-4 h-4 rounded-full hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-600 transition-colors font-bold text-sm cursor-pointer"
                          title="Xóa"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-rose-200/80">
                  <input
                    type="text"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddColor();
                      }
                    }}
                    placeholder="Thêm màu in..."
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-bold outline-hidden focus:border-rose-500 focus:ring-2 focus:ring-rose-200 min-h-[38px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddColor}
                    className="shrink-0 px-3 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer min-h-[38px] shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              {/* 5. Công đoạn gia công sau in */}
              <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200 space-y-3 flex flex-col justify-between md:col-span-2 lg:col-span-2">
                <div>
                  <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                    <label className="text-xs font-black text-purple-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Scissors className="w-4 h-4 text-purple-600" />
                      <span>Công Đoạn Gia Công Sau In ({ formData.production.finishingTypes.length })</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5 py-3 max-h-40 overflow-y-auto">
                    {formData.production.finishingTypes.map((fin, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white text-purple-950 font-bold rounded-xl border border-purple-200 text-xs flex items-center gap-1.5 shadow-2xs"
                      >
                        <span>{fin}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFinishing(idx)}
                          className="w-4 h-4 rounded-full hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-600 transition-colors font-bold text-sm cursor-pointer"
                          title="Xóa"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-purple-200/80">
                  <input
                    type="text"
                    value={newFinishing}
                    onChange={(e) => setNewFinishing(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddFinishing();
                      }
                    }}
                    placeholder="Thêm công đoạn (VD: Cán màng bóng, Ép kim, Gấp dán tự động)..."
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-purple-300 rounded-xl text-xs font-bold outline-hidden focus:border-purple-500 focus:ring-2 focus:ring-purple-200 min-h-[38px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddFinishing}
                    className="shrink-0 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer min-h-[38px] shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Thêm Công Đoạn</span>
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 3: CẢNH BÁO & THỜI GIAN (WORKFLOW) */}
          {activeTab === 'workflow' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-100">
              
              {/* Timeout thợ nhận */}
              <div className="p-4 bg-orange-50/70 rounded-2xl border border-orange-200 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-orange-200 pb-2">
                    <span className="font-bold text-neutral-900 flex items-center gap-1.5 text-xs sm:text-sm">
                      <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                      <span>Chờ thợ nhận lệnh:</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={formData.workflow.printerAcceptanceTimeoutMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setFormData(prev => ({
                            ...prev,
                            workflow: { ...prev.workflow, printerAcceptanceTimeoutMinutes: isNaN(val) ? 0 : val }
                          }));
                        }}
                        className="w-16 px-2 py-1 bg-white border border-orange-300 rounded-lg text-center font-black text-orange-600 text-sm outline-hidden focus:ring-2 focus:ring-orange-300"
                      />
                      <span className="text-xs font-bold text-orange-800">phút</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-orange-900 leading-tight">
                    Cảnh báo khi lệnh in gửi sang thợ nhưng chưa bấm xác nhận nhận lệnh.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-orange-200/80">
                  <span className="text-[11px] font-semibold text-neutral-500 mr-1">Chọn nhanh:</span>
                  {[10, 15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        workflow: { ...prev.workflow, printerAcceptanceTimeoutMinutes: mins }
                      }))}
                      className={`px-2.5 py-1 rounded-xl border font-bold text-xs cursor-pointer transition-all ${
                        formData.workflow.printerAcceptanceTimeoutMinutes === mins
                          ? 'bg-orange-500 text-neutral-950 border-orange-500 font-black shadow-xs'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-orange-100'
                      }`}
                    >
                      {mins}p
                    </button>
                  ))}
                </div>
              </div>

              {/* Chậm kẽm */}
              <div className="p-4 bg-red-50/70 rounded-2xl border border-red-200 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-red-200 pb-2">
                    <span className="font-bold text-neutral-900 flex items-center gap-1.5 text-xs sm:text-sm">
                      <Clock className="w-4 h-4 text-red-500 shrink-0" />
                      <span>Chưa gửi ra kẽm:</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={formData.workflow.plateWaitingWarningMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setFormData(prev => ({
                            ...prev,
                            workflow: { ...prev.workflow, plateWaitingWarningMinutes: isNaN(val) ? 0 : val }
                          }));
                        }}
                        className="w-16 px-2 py-1 bg-white border border-red-300 rounded-lg text-center font-black text-red-600 text-sm outline-hidden focus:ring-2 focus:ring-red-300"
                      />
                      <span className="text-xs font-bold text-red-800">phút</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-red-900 leading-tight">
                    Cảnh báo khâu Thiết kế khi lệnh mới tạo quá thời gian mà chưa ra kẽm.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-red-200/80">
                  <span className="text-[11px] font-semibold text-neutral-500 mr-1">Chọn nhanh:</span>
                  {[20, 30, 60, 90, 120].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        workflow: { ...prev.workflow, plateWaitingWarningMinutes: mins }
                      }))}
                      className={`px-2.5 py-1 rounded-xl border font-bold text-xs cursor-pointer transition-all ${
                        formData.workflow.plateWaitingWarningMinutes === mins
                          ? 'bg-red-600 text-white border-red-600 font-black shadow-xs'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-red-100'
                      }`}
                    >
                      {mins}p
                    </button>
                  ))}
                </div>
              </div>

              {/* Kẹt in */}
              <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-blue-200 pb-2">
                    <span className="font-bold text-neutral-900 flex items-center gap-1.5 text-xs sm:text-sm">
                      <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>Đang in quá lâu:</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={formData.workflow.printingStuckWarningMinutes}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setFormData(prev => ({
                            ...prev,
                            workflow: { ...prev.workflow, printingStuckWarningMinutes: isNaN(val) ? 0 : val }
                          }));
                        }}
                        className="w-16 px-2 py-1 bg-white border border-blue-300 rounded-lg text-center font-black text-blue-600 text-sm outline-hidden focus:ring-2 focus:ring-blue-300"
                      />
                      <span className="text-xs font-bold text-blue-800">phút</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-blue-900 leading-tight">
                    Cảnh báo khi máy in nhận lệnh chạy quá lâu mà chưa bấm in xong.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-blue-200/80">
                  <span className="text-[11px] font-semibold text-neutral-500 mr-1">Chọn nhanh:</span>
                  {[30, 45, 60, 90, 180].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        workflow: { ...prev.workflow, printingStuckWarningMinutes: mins }
                      }))}
                      className={`px-2.5 py-1 rounded-xl border font-bold text-xs cursor-pointer transition-all ${
                        formData.workflow.printingStuckWarningMinutes === mins
                          ? 'bg-blue-600 text-white border-blue-600 font-black shadow-xs'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-blue-100'
                      }`}
                    >
                      {mins}p
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: TÍNH NĂNG & MODULES */}
          {activeTab === 'features' && (
            <div className="space-y-6 animate-in fade-in duration-100">
              {/* Feature Modules */}
              <div>
                <h3 className="text-sm font-black text-neutral-900 mb-3 uppercase tracking-wide">MODULE NGHIỆP VỤ</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {(Object.keys(MODULE_REGISTRY) as FeatureModule[]).map(moduleId => {
                    const module = MODULE_REGISTRY[moduleId];
                    const isChecked = formData.features[moduleId] ?? (module.core || false);
                    
                    const handleToggle = (checked: boolean) => {
                      if (checked) {
                        const { canEnable, missingDependencies } = featureService.checkEnableDependencies(moduleId, formData.features);
                        if (!canEnable) {
                          const missingNames = missingDependencies.map(dep => MODULE_REGISTRY[dep].name).join(', ');
                          alert(`Để bật module này, bạn cần bật các module sau trước: ${missingNames}`);
                          return;
                        }
                      } else {
                        const { canDisable, activeDependents } = featureService.checkDisableDependencies(moduleId, formData.features);
                        if (!canDisable) {
                          if (module.core) {
                            alert(`Không thể tắt module cốt lõi của hệ thống.`);
                          } else {
                            const activeNames = activeDependents.map(dep => MODULE_REGISTRY[dep].name).join(', ');
                            alert(`Không thể tắt module này vì các module sau đang phụ thuộc vào nó: ${activeNames}. Vui lòng tắt các module đó trước.`);
                          }
                          return;
                        }
                      }
                      
                      setFormData(prev => ({
                        ...prev,
                        features: { ...prev.features, [moduleId]: checked }
                      }));
                    };

                    return (
                      <label key={moduleId} className={`p-4 bg-neutral-50/90 hover:bg-amber-50/40 rounded-2xl border ${isChecked ? 'border-amber-400 shadow-sm' : 'border-neutral-200'} hover:border-amber-300 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs`}>
                        <div className="min-w-0">
                          <p className="font-black text-neutral-900 text-xs sm:text-sm flex items-center gap-2">
                            {moduleId === 'production' && <Printer className="w-4 h-4 text-emerald-600 shrink-0" />}
                            {moduleId === 'finishing' && <Scissors className="w-4 h-4 text-purple-600 shrink-0" />}
                            {moduleId === 'customer' && <Building2 className="w-4 h-4 text-blue-600 shrink-0" />}
                            {moduleId === 'salesOrder' && <FileText className="w-4 h-4 text-indigo-600 shrink-0" />}
                            {moduleId === 'warehouseDispatch' && <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />}
                            {moduleId === 'shipping' && <Activity className="w-4 h-4 text-orange-600 shrink-0" />}
                            <span>{module.name}</span>
                            {module.core && <span className="px-1.5 py-0.5 bg-neutral-200 text-neutral-700 text-[9px] rounded uppercase">Cốt lõi</span>}
                          </p>
                          <p className="text-[11px] text-neutral-500 mt-0.5 leading-tight">
                            {module.description}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggle(e.target.checked)}
                          disabled={module.core}
                          className="w-5 h-5 accent-amber-600 cursor-pointer shrink-0 disabled:opacity-50"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Tùy chọn giao diện */}
              <div className="pt-4 border-t border-neutral-200">
                <h3 className="text-sm font-black text-neutral-900 mb-3 uppercase tracking-wide">TÙY CHỌN GIAO DIỆN & TIỆN ÍCH</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <label className="p-4 bg-neutral-50/90 hover:bg-amber-50/40 rounded-2xl border border-neutral-200 hover:border-amber-300 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs">
                    <div className="min-w-0">
                      <p className="font-black text-neutral-900 text-xs sm:text-sm flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>Bình Luận & Trao Đổi Lệnh</span>
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Cho phép Thiết kế, Thợ in và Kinh doanh chat, gửi tin nhắn trao đổi trực tiếp dưới từng lệnh
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.features.comments}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        features: { ...prev.features, comments: e.target.checked }
                      }))}
                      className="w-5 h-5 accent-amber-600 cursor-pointer shrink-0"
                    />
                  </label>

                  <label className="p-4 bg-neutral-50/90 hover:bg-amber-50/40 rounded-2xl border border-neutral-200 hover:border-amber-300 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs">
                    <div className="min-w-0">
                      <p className="font-black text-neutral-900 text-xs sm:text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Chuông Âm Thanh & Báo Động</span>
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Phát âm thanh chuông sinh động khi có lệnh in gấp, kẽm chưa về hoặc thợ báo sự cố
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.features.soundAlerts}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        features: { ...prev.features, soundAlerts: e.target.checked }
                      }))}
                      className="w-5 h-5 accent-amber-600 cursor-pointer shrink-0"
                    />
                  </label>

                  <label className="p-4 bg-neutral-50/90 hover:bg-amber-50/40 rounded-2xl border border-neutral-200 hover:border-amber-300 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-2xs">
                    <div className="min-w-0">
                      <p className="font-black text-neutral-900 text-xs sm:text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Thư Viện Mẫu & Quản Lý Kẽm Cũ</span>
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Lưu kho thư viện các mẫu bao bì đã in để dễ dàng tra cứu hình ảnh và tận dụng kẽm cũ
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.features.sampleLibrary}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        features: { ...prev.features, sampleLibrary: e.target.checked }
                      }))}
                      className="w-5 h-5 accent-amber-600 cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: HỆ THỐNG */}
          {activeTab === 'system' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Version & Release Changelog */}
                <div className="p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2 border-b border-neutral-200 pb-2">
                      <Server className="w-4 h-4 text-amber-600" />
                      <span>Thông tin Phiên bản & Cập nhật</span>
                    </span>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Hệ thống đang chạy phiên bản mới nhất với đầy đủ các bản vá bảo mật và tối ưu giao diện.
                    </p>
                  </div>
                  <div className="pt-2">
                    <VersionBadge variant="button" />
                  </div>
                </div>

                {/* Storage & Sync Status */}
                <div className="p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3 text-xs">
                  <span className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2 border-b border-neutral-200 pb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Hạ Tầng & Cơ Sở Dữ Liệu</span>
                  </span>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                      <span className="text-neutral-500 font-bold">Chế độ vận hành:</span>
                      <span className="font-bold text-emerald-700 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        Online Cloud Sync
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                      <span className="text-neutral-500 font-bold">Schema Version:</span>
                      <span className="font-mono font-bold text-neutral-800">
                        Schema #{formData.system.schemaVersion}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 font-bold">Lưu trữ Dữ liệu:</span>
                      <span className={`font-bold px-2 py-0.5 rounded-md ${
                        isFirebaseOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {isFirebaseOnline ? '🔥 Firebase Cloud Firestore' : '💾 Local Storage / Offline'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Firebase Live Connection Diagnostic & Tester */}
              <div className="p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-2">
                  <span className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-amber-600" />
                    <span>Kiểm Tra Đồng Bộ & Kết Nối Firebase Cloud</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCustomFbEditor(!showCustomFbEditor)}
                    className="text-xs text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer self-start sm:self-auto"
                  >
                    {showCustomFbEditor ? 'Ẩn Cấu Hình Chi Tiết' : '⚙️ Tùy Chỉnh Cấu Hình Firebase Trực Tiếp'}
                  </button>
                </div>

                {/* Status & Test Ping */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 font-bold">Project ID:</span>
                      <span className="font-mono font-bold bg-neutral-200 px-2 py-0.5 rounded text-neutral-800">
                        {customFbForm.projectId || 'Chưa thiết lập'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-500 font-bold">Trạng thái cấu hình:</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        isFirebaseConfigured() ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {isFirebaseConfigured() ? '✅ Đã nhập đủ khóa' : '⚠️ Chưa đủ thông tin'}
                      </span>
                    </div>
                  </div>

                  {fbTestResult && (
                    <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                      fbTestResult.success
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-red-50 border-red-300 text-red-900'
                    }`}>
                      {fbTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5">
                        <p className="font-bold">{fbTestResult.success ? 'KẾT NỐI CLOUD THÀNH CÔNG!' : 'LỖI KẾT NỐI FIRESTORE'}</p>
                        <p className="text-[11px] opacity-90 leading-relaxed">{fbTestResult.message}</p>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={testingFirebase}
                    onClick={handleTestFirebase}
                    className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-neutral-800 active:scale-98 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Activity className={`w-4 h-4 ${testingFirebase ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
                    <span>{testingFirebase ? 'Đang gửi gói tin kiểm tra tới Firestore...' : 'Bấm Kiểm Tra Kết Nối Cloud Firestore (Live Ping Test)'}</span>
                  </button>
                </div>

                {/* Custom Firebase Editor */}
                {showCustomFbEditor && (
                  <div className="pt-3 border-t border-neutral-200 space-y-3 animate-in fade-in">
                    <p className="text-[11px] text-neutral-600 leading-relaxed font-medium">
                      Bạn có thể dán trực tiếp thông tin Firebase Web App vào các ô bên dưới nếu không muốn chỉnh sửa file <code>.env</code>:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="font-bold text-neutral-700 block mb-1">API Key (apiKey):</label>
                        <input
                          type="text"
                          value={customFbForm.apiKey}
                          onChange={(e) => setCustomFbForm(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="AIzaSy..."
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-700 block mb-1">Project ID (projectId):</label>
                        <input
                          type="text"
                          value={customFbForm.projectId}
                          onChange={(e) => setCustomFbForm(prev => ({ ...prev, projectId: e.target.value }))}
                          placeholder="xuongin..."
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-700 block mb-1">Auth Domain (authDomain):</label>
                        <input
                          type="text"
                          value={customFbForm.authDomain}
                          onChange={(e) => setCustomFbForm(prev => ({ ...prev, authDomain: e.target.value }))}
                          placeholder="xuongin.firebaseapp.com"
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg font-mono text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-neutral-700 block mb-1">App ID (appId):</label>
                        <input
                          type="text"
                          value={customFbForm.appId}
                          onChange={(e) => setCustomFbForm(prev => ({ ...prev, appId: e.target.value }))}
                          placeholder="1:1049954564901:web:..."
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg font-mono text-[11px]"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveCustomFb}
                        className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-all cursor-pointer shadow-xs"
                      >
                        Lưu & Kết Nối Firebase
                      </button>
                      <button
                        type="button"
                        onClick={handleClearCustomFb}
                        className="py-1.5 px-3 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 font-bold rounded-lg text-xs transition-all cursor-pointer"
                      >
                        Khôi Phục Mặc Định (.env)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset & Sandbox Isolation Section */}
              <div>
                {isDemoActive ? (
                  <div className="p-4 bg-amber-50/90 rounded-2xl border-2 border-amber-300 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-500 text-neutral-950 rounded-xl shrink-0">
                        <FlaskConical className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          🧪 Đang ở Chế Độ Demo Sandbox
                        </h4>
                        <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                          Mọi thao tác tạo đơn hoặc bấm khôi phục mẫu ở đây được <b>cách ly 100%</b> trên máy này. Dữ liệu thật của xưởng trên Cloud được bảo vệ an toàn.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Khôi phục dữ liệu mẫu Demo Sandbox về ban đầu? (Chỉ tác động môi trường thử nghiệm hiện tại, dữ liệu thật của xưởng không bị ảnh hưởng)')) {
                            resetDemoData();
                            setIsSettingsModalOpen(false);
                          }
                        }}
                        className="flex-1 py-2.5 px-4 bg-amber-200/90 hover:bg-amber-300 active:scale-98 text-amber-950 font-black rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer border border-amber-400/60 min-h-[40px]"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Khôi phục dữ liệu mẫu Sandbox</span>
                      </button>

                      {isPersonalDemoActive && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsPersonalDemoActive(false);
                            setIsSettingsModalOpen(false);
                          }}
                          className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer shadow-xs min-h-[40px]"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>Về Chế độ Online</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50/90 rounded-2xl border-2 border-emerald-300 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-emerald-600 text-white rounded-xl shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                          🛡️ Dữ Liệu Online Đang Được Bảo Vệ An Toàn
                        </h4>
                        <p className="text-[11px] text-emerald-900 leading-relaxed font-medium">
                          Hệ thống đang hoạt động ở chế độ <b>Online Thực Tế (Firebase Cloud)</b>. Toàn bộ đơn hàng và lịch sử sản xuất của xưởng được bảo vệ an toàn.
                        </p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPersonalDemoActive(true);
                          setIsSettingsModalOpen(false);
                        }}
                        className="w-full py-2.5 px-4 bg-white hover:bg-amber-50 active:scale-98 text-amber-900 border border-amber-300 font-black rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer shadow-xs min-h-[40px]"
                      >
                        <FlaskConical className="w-4 h-4 text-amber-600" />
                        <span>Bật Demo Sandbox để Thử Nghiệm Mẫu</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Developer Only Purge Orders Tool */}
              {currentUser.role === 'DEVELOPER' && (
                <div className="p-4 bg-red-50/90 rounded-2xl border-2 border-red-200 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-red-600 text-white rounded-xl shrink-0">
                      <Trash2 className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-black text-red-950 uppercase tracking-wide">
                        🧹 Dọn Dữ Liệu Lệnh Cũ (Dành Riêng Developer)
                      </h4>
                      <p className="text-[11px] text-red-800 leading-relaxed font-medium">
                        Hiện có <b>{orders.length} lệnh sản xuất</b> trong hệ thống. Thao tác dọn sạch toàn bộ lệnh test để bàn giao xưởng hoạt động với dữ liệu sạch (Được bảo vệ, chỉ Developer có quyền thực hiện).
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`⚠️ CẢNH BÁO QUAN TRỌNG TỪ DEVELOPER:\n\nBạn có chắc chắn muốn XÓA SẠCH TOÀN BỘ ${orders.length} lệnh sản xuất hiện tại không?\n\nThao tác này dùng để dọn sạch dữ liệu test trước khi chính thức đưa app vào vận hành xưởng!`)) {
                        deleteAllOrders();
                        setIsSettingsModalOpen(false);
                      }
                    }}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 active:scale-98 text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer shadow-xs min-h-[40px]"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa Sạch Toàn Bộ {orders.length} Lệnh Sản Xuất</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DEVELOPER-ONLY STORAGE PROVIDER ADMINISTRATION */}
          {activeTab === 'storage' && canManageStorageProviders && (
            <StorageProviderManager />
          )}

          {/* TAB 6: THỐNG KÊ DỮ LIỆU & DEVELOPER UPGRADE ADVISOR */}
          {activeTab === 'metrics' && (
            <div className="animate-in fade-in duration-100">
              <DatabaseMetricsDashboard
                orders={orders}
                users={users}
                isFirebaseOnline={isFirebaseOnline}
              />
            </div>
          )}

          {/* TAB 6: MA TRẬN PHÂN QUYỀN (DEVELOPER ENGINE) */}
          {activeTab === 'permissions' && currentUser.role === 'DEVELOPER' && (
            <DeveloperPermissionMatrix
              formData={formData}
              setFormData={setFormData}
              users={users}
            />
          )}

        </div>

        {/* 4. MODAL FOOTER */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-neutral-100 bg-neutral-50/90 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in truncate">
                <CheckCircle2 className="w-4 h-4 stroke-[2.5] text-emerald-600 shrink-0" />
                <span>Đã lưu cài đặt thành công và đồng bộ hệ thống!</span>
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(false)}
              className="px-4 sm:px-5 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-100 active:scale-95 text-neutral-700 font-bold rounded-xl text-xs sm:text-sm transition-all cursor-pointer min-h-[40px]"
            >
              Đóng
            </button>
            {activeTab !== 'storage' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 active:scale-95 text-neutral-950 font-black rounded-xl text-xs sm:text-sm shadow-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                <Save className="w-4 h-4 stroke-[2.5]" />
                <span>{isSaving ? 'Đang lưu...' : 'Lưu Cài Đặt'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
