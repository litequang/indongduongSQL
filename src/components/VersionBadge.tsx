import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  DownloadCloud,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  History,
  Calendar,
  Layers,
  X,
  Tag,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import {
  APP_VERSION,
  APP_BUILD_DATE,
  APP_CHANGELOG_HISTORY,
  ChangelogItem,
  checkForAppUpdates,
  applyAppUpdate
} from '../utils/versionUtils';

interface VersionBadgeProps {
  variant?: 'pill' | 'button' | 'badge' | 'minimal';
  className?: string;
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({
  variant = 'button',
  className = ''
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({
    [APP_VERSION]: true // Expand the latest version by default
  });

  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean;
    latestVersion: string;
    releaseNotes?: string;
    changelog: ChangelogItem[];
  }>({
    hasUpdate: false,
    latestVersion: APP_VERSION,
    changelog: APP_CHANGELOG_HISTORY
  });

  const checkVersion = async () => {
    setChecking(true);
    try {
      const res = await checkForAppUpdates();
      setUpdateInfo({
        hasUpdate: res.hasUpdate,
        latestVersion: res.latestVersion,
        releaseNotes: res.releaseNotes,
        changelog: res.changelog && res.changelog.length > 0 ? res.changelog : APP_CHANGELOG_HISTORY
      });
      if (res.hasUpdate) {
        setExpandedVersions(prev => ({
          ...prev,
          [res.latestVersion]: true
        }));
      }
    } catch (e) {
      console.warn('Lỗi kiểm tra bản mới:', e);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkVersion();
  }, []);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await applyAppUpdate();
      setUpdateSuccess(true);
    } catch (err) {
      console.error('Lỗi khi cập nhật:', err);
      window.location.reload();
    }
  };

  const toggleVersionItem = (ver: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedVersions(prev => ({
      ...prev,
      [ver]: !prev[ver]
    }));
  };

  return (
    <>
      {/* Compact Trigger Button */}
      {variant === 'minimal' ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          title={`Phiên bản v${APP_VERSION} (Nhấn để xem nhật ký nâng cấp)`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-900 border border-neutral-200 transition-colors cursor-pointer ${className}`}
        >
          <Sparkles className="w-3 h-3 text-amber-600" />
          <span>v{APP_VERSION}</span>
          {updateInfo.hasUpdate && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
          )}
        </button>
      ) : variant === 'pill' ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          title={`Phiên bản v${APP_VERSION} (Nhấn để xem nhật ký nâng cấp)`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-black bg-neutral-900 hover:bg-neutral-800 text-amber-400 border border-neutral-700 shadow-2xs transition-all cursor-pointer ${className}`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>v{APP_VERSION}</span>
          {updateInfo.hasUpdate ? (
            <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] rounded font-sans font-bold animate-pulse">
              Mới
            </span>
          ) : (
            <span className="text-[10px] text-neutral-400 font-sans font-medium">
              • Nhật ký
            </span>
          )}
        </button>
      ) : (
        /* Default Full-width Compact Button for Menus */
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`w-full px-3 py-2 bg-neutral-50 hover:bg-amber-50/80 border border-neutral-200 hover:border-amber-300 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer group ${className}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-amber-100 group-hover:bg-amber-200 text-amber-800 flex items-center justify-center shrink-0">
              <History className="w-3.5 h-3.5 text-amber-700" />
            </div>
            <div className="text-left truncate">
              <div className="font-bold text-neutral-800 group-hover:text-amber-950 flex items-center gap-1.5">
                <span>Nhật Ký Nâng Cấp</span>
                <span className="font-mono font-black text-[11px] bg-neutral-200 group-hover:bg-amber-200 text-neutral-900 group-hover:text-amber-950 px-1.5 py-0.2 rounded">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-[10px] text-neutral-400 truncate">
                Xem lịch sử cập nhật & tính năng mới
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1">
            {updateInfo.hasUpdate ? (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md animate-pulse">
                Bản mới
              </span>
            ) : (
              <span className="text-[10px] text-neutral-400 group-hover:text-amber-800 font-semibold flex items-center gap-0.5">
                Chi tiết
                <ArrowUpRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </button>
      )}

      {/* Pop-up Changelog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col my-auto max-h-[90dvh]">
            
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-850 text-white flex items-center justify-between border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black shadow-md shadow-amber-500/20 shrink-0">
                  <Sparkles className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-black text-base text-white tracking-tight">
                      Nhật Ký Thay Đổi & Nâng Cấp
                    </h2>
                    <span className="font-mono font-black text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-lg border border-amber-500/30">
                      v{APP_VERSION}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 font-medium">
                    Lịch sử phát triển và các tính năng mới qua từng bản cập nhật
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Sub-Header Toolbar (Check Update / Status) */}
            <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200/80 flex items-center justify-between gap-3 flex-wrap shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600 font-semibold">Trạng thái:</span>
                {updateInfo.hasUpdate ? (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-black animate-pulse flex items-center gap-1">
                    <DownloadCloud className="w-3.5 h-3.5 text-amber-700" />
                    Có bản mới: v{updateInfo.latestVersion}
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đang là bản mới nhất ({APP_BUILD_DATE})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={checkVersion}
                  disabled={checking}
                  className="px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin text-amber-600' : 'text-neutral-500'}`} />
                  <span>{checking ? 'Đang kiểm tra...' : 'Kiểm tra bản mới'}</span>
                </button>

                {updateInfo.hasUpdate && (
                  <button
                    type="button"
                    onClick={handleUpdate}
                    disabled={updating}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/20 transition-all"
                  >
                    <DownloadCloud className={`w-3.5 h-3.5 ${updating ? 'animate-bounce' : ''}`} />
                    <span>{updating ? 'Đang cập nhật...' : 'Cập nhật ngay'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Body: Timeline Changelog History */}
            <div className="p-5 overflow-y-auto max-h-[60dvh] space-y-3.5">
              {updateInfo.changelog.map((item, idx) => {
                const isCurrent = item.version === APP_VERSION;
                const isExpanded = !!expandedVersions[item.version];

                return (
                  <div
                    key={item.version}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isCurrent
                        ? 'border-amber-400/80 bg-amber-50/20 shadow-xs'
                        : 'border-neutral-200/80 bg-white hover:border-neutral-300'
                    }`}
                  >
                    {/* Header Item Accordion */}
                    <div
                      onClick={(e) => toggleVersionItem(item.version, e)}
                      className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-neutral-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg shrink-0 ${
                          isCurrent
                            ? 'bg-amber-500 text-neutral-950 shadow-2xs font-extrabold'
                            : 'bg-neutral-100 text-neutral-800'
                        }`}>
                          v{item.version}
                        </span>

                        {isCurrent && (
                          <span className="px-2 py-0.2 bg-neutral-900 text-amber-400 text-[10px] font-black rounded-md shrink-0">
                            HIỆN TẠI
                          </span>
                        )}

                        {item.tag && (
                          <span className={`px-1.5 py-0.2 text-[10px] font-black rounded shrink-0 ${
                            item.tag === 'NEW'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.tag === 'HOTFIX'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {item.tag}
                          </span>
                        )}

                        <div className="truncate">
                          <p className="text-xs font-bold text-neutral-900 truncate">
                            {item.title}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-neutral-400 font-medium hidden sm:inline">
                          {item.releaseDate}
                        </span>
                        <div className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail Body */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-neutral-100/90 text-xs space-y-2.5 bg-neutral-50/40">
                        {item.summary && (
                          <p className="text-neutral-700 font-medium leading-relaxed bg-white p-2.5 rounded-xl border border-neutral-200/60 shadow-2xs">
                            {item.summary}
                          </p>
                        )}

                        <div className="space-y-1.5 pt-1">
                          <p className="text-[11px] font-black text-neutral-600 uppercase tracking-wider">
                            Chi tiết thay đổi & tính năng:
                          </p>
                          <ul className="space-y-1.5 pl-1">
                            {item.changes.map((change, cIdx) => (
                              <li key={cIdx} className="flex items-start gap-2 text-neutral-700 leading-relaxed">
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5 stroke-[2.5]" />
                                <span>{change}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-neutral-100/80 border-t border-neutral-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Hệ thống Tự động cập nhật không làm gián đoạn xưởng in</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
