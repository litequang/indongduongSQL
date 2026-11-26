import React, { useState } from 'react';
import {
  ShieldCheck,
  Check,
  X,
  RotateCcw,
  Plus,
  Trash2,
  UserCheck,
  Sparkles,
  Lock,
  Unlock,
  Layers,
  Crown,
  Wrench,
  HelpCircle,
  Users,
  Sliders,
  CheckCircle2,
  Info
} from 'lucide-react';
import { AppConfig, UserRole, User } from '../types';
import { ResolvedImage } from './ResolvedImage';
import {
  PERMISSION_DEFINITIONS,
  PermissionKey,
  DEFAULT_ROLE_PERMISSION_MATRIX,
  PermissionDefinition
} from '../permissions';

interface DeveloperPermissionMatrixProps {
  formData: AppConfig;
  setFormData: React.Dispatch<React.SetStateAction<AppConfig>>;
  users: User[];
}

const ROLES_LIST: { role: UserRole; label: string; badgeColor: string }[] = [
  { role: 'ADMIN', label: 'Admin (Kỹ thuật)', badgeColor: 'bg-red-100 text-red-800 border-red-200' },
  { role: 'MANAGER', label: 'Quản Lý (Sếp)', badgeColor: 'bg-purple-100 text-purple-800 border-purple-200' },
  { role: 'DESIGNER', label: 'Thiết Kế', badgeColor: 'bg-blue-100 text-blue-800 border-blue-200' },
  { role: 'SALE', label: 'Kinh Doanh', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { role: 'PRINTER', label: 'Thợ In', badgeColor: 'bg-amber-100 text-amber-800 border-amber-200' },
  { role: 'FINISHER', label: 'Gia Công', badgeColor: 'bg-violet-100 text-violet-800 border-violet-200' },
  { role: 'DEVELOPER', label: 'Developer', badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
];

export const DeveloperPermissionMatrix: React.FC<DeveloperPermissionMatrixProps> = ({
  formData,
  setFormData,
  users
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showAddCustomFeature, setShowAddCustomFeature] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<'Cấu Hình & Quản Trị' | 'Lệnh In & Điều Phối' | 'Kẽm & Vận Hành In' | 'Gia Công & Sự Cố' | 'Báo Cáo & Tiện Ích'>('Lệnh In & Điều Phối');
  const [customDesc, setCustomDesc] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Active matrix combined with default baseline
  const roleMatrix = formData.permissions?.roleMatrix || {};
  const userOverrides = formData.permissions?.userOverrides || {};
  const customFeatures = formData.permissions?.customFeatures || [];

  // Group permissions by category
  const allDefinitions: PermissionDefinition[] = [
    ...PERMISSION_DEFINITIONS,
    ...customFeatures.map(cf => ({
      key: cf.key as PermissionKey,
      name: cf.name,
      category: (cf.category || 'Lệnh In & Điều Phối') as any,
      description: cf.description || 'Tính năng tùy chỉnh do Developer tạo'
    }))
  ];

  const categories = Array.from(new Set(allDefinitions.map(d => d.category)));

  // Helper to check current effective state for a role
  const isRolePermitted = (role: UserRole, permKey: string): boolean => {
    if (role === 'DEVELOPER') return true; // Dev is always master true
    if (roleMatrix[role] && typeof roleMatrix[role]![permKey] === 'boolean') {
      return roleMatrix[role]![permKey];
    }
    const typedKey = permKey as PermissionKey;
    if (DEFAULT_ROLE_PERMISSION_MATRIX[role] && typeof DEFAULT_ROLE_PERMISSION_MATRIX[role][typedKey] === 'boolean') {
      return DEFAULT_ROLE_PERMISSION_MATRIX[role][typedKey];
    }
    return false;
  };

  // Toggle role permission cell
  const handleToggleRolePermission = (role: UserRole, permKey: string) => {
    if (role === 'DEVELOPER') return; // Cannot disable developer bypass
    const currentVal = isRolePermitted(role, permKey);
    const newVal = !currentVal;

    setFormData(prev => {
      const currentPermissions = prev.permissions || {};
      const currentRoleMatrix = currentPermissions.roleMatrix || {};
      const currentRoleObj = currentRoleMatrix[role] || {};

      return {
        ...prev,
        permissions: {
          ...currentPermissions,
          roleMatrix: {
            ...currentRoleMatrix,
            [role]: {
              ...currentRoleObj,
              [permKey]: newVal
            }
          }
        }
      };
    });
  };

  // User-level override helpers
  const getUserOverrideValue = (userId: string, permKey: string): boolean | 'INHERIT' => {
    if (userOverrides[userId] && typeof userOverrides[userId][permKey] === 'boolean') {
      return userOverrides[userId][permKey];
    }
    return 'INHERIT';
  };

  const handleSetUserOverride = (userId: string, permKey: string, val: boolean | 'INHERIT') => {
    setFormData(prev => {
      const currentPermissions = prev.permissions || {};
      const currentUserOverrides = currentPermissions.userOverrides || {};
      const currentUserObj = { ...(currentUserOverrides[userId] || {}) };

      if (val === 'INHERIT') {
        delete currentUserObj[permKey];
      } else {
        currentUserObj[permKey] = val;
      }

      return {
        ...prev,
        permissions: {
          ...currentPermissions,
          userOverrides: {
            ...currentUserOverrides,
            [userId]: currentUserObj
          }
        }
      };
    });
  };

  // Preset Configurations
  const handleResetToDefaults = () => {
    if (confirm('Khôi phục toàn bộ Ma Trận Phân Quyền về cài đặt mặc định ban đầu?')) {
      setFormData(prev => ({
        ...prev,
        permissions: {
          ...(prev.permissions || {}),
          roleMatrix: {}
        }
      }));
    }
  };

  const handleApplyManagerSafePreset = () => {
    // Sếp có toàn quyền theo dõi lệnh, xem báo cáo, dùng demo sandbox, nhưng khóa quản lý nhân sự & cài đặt xưởng
    setFormData(prev => {
      const currentPermissions = prev.permissions || {};
      const currentRoleMatrix = currentPermissions.roleMatrix || {};
      return {
        ...prev,
        permissions: {
          ...currentPermissions,
          roleMatrix: {
            ...currentRoleMatrix,
            MANAGER: {
              canManageUsers: false,
              canManageWorkshopSettings: false,
              canUseDemoSandbox: true,
              canPurgeAllOrders: false,
              canCreateProductionOrder: true,
              canDispatchOrder: true,
              canToggleUrgent: true,
              canDeleteOrder: true,
              canBulkDeleteOrders: true,
              canRequestCancel: true,
              canApproveCancel: true,
              canAcceptPrintJob: true,
              canMarkPlateReady: true,
              canStartPrinting: true,
              canFinishPrinting: true,
              canManageFinishing: true,
              canReportIssue: true,
              canResolveIssue: true,
              canViewReports: true,
              canExportExcel: true,
            }
          }
        }
      };
    });
  };

  const handleApplyManagerFullPreset = () => {
    // Mở full quyền cho Manager (bao gồm cả cài đặt xưởng & nhân sự)
    setFormData(prev => {
      const currentPermissions = prev.permissions || {};
      const currentRoleMatrix = currentPermissions.roleMatrix || {};
      return {
        ...prev,
        permissions: {
          ...currentPermissions,
          roleMatrix: {
            ...currentRoleMatrix,
            MANAGER: {
              canManageUsers: true,
              canManageWorkshopSettings: true,
              canUseDemoSandbox: true,
              canPurgeAllOrders: false,
              canCreateProductionOrder: true,
              canDispatchOrder: true,
              canToggleUrgent: true,
              canDeleteOrder: true,
              canBulkDeleteOrders: true,
              canRequestCancel: true,
              canApproveCancel: true,
              canAcceptPrintJob: true,
              canMarkPlateReady: true,
              canStartPrinting: true,
              canFinishPrinting: true,
              canManageFinishing: true,
              canReportIssue: true,
              canResolveIssue: true,
              canViewReports: true,
              canExportExcel: true,
            }
          }
        }
      };
    });
  };

  // Add Custom Feature Flag
  const handleAddCustomFeature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customKey.trim() || !customName.trim()) return;

    const formattedKey = customKey.trim().replace(/\s+/g, '_').toLowerCase();
    
    // Check if duplicate
    if (allDefinitions.some(d => d.key === formattedKey)) {
      alert(`Key "${formattedKey}" đã tồn tại! Vui lòng chọn key khác.`);
      return;
    }

    const newFeature = {
      key: formattedKey,
      name: customName.trim(),
      category: customCategory,
      description: customDesc.trim() || 'Tính năng tùy chỉnh mở rộng'
    };

    setFormData(prev => {
      const currentPermissions = prev.permissions || {};
      const currentCustomFeatures = currentPermissions.customFeatures || [];
      return {
        ...prev,
        permissions: {
          ...currentPermissions,
          customFeatures: [...currentCustomFeatures, newFeature]
        }
      };
    });

    setCustomKey('');
    setCustomName('');
    setCustomDesc('');
    setShowAddCustomFeature(false);
  };

  const handleRemoveCustomFeature = (keyToRemove: string) => {
    if (confirm(`Xóa tính năng tùy chỉnh "${keyToRemove}"?`)) {
      setFormData(prev => {
        const currentPermissions = prev.permissions || {};
        const currentCustomFeatures = currentPermissions.customFeatures || [];
        return {
          ...prev,
          permissions: {
            ...currentPermissions,
            customFeatures: currentCustomFeatures.filter(f => f.key !== keyToRemove)
          }
        };
      });
    }
  };

  const selectedUserObj = users.find(u => u.id === selectedUserId);

  return (
    <div className="space-y-4 animate-in fade-in duration-100">
      
      {/* Header Banner */}
      <div className="p-3.5 sm:p-4 bg-gradient-to-r from-purple-900 to-indigo-950 text-white rounded-2xl border border-purple-700/50 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/30 border border-purple-400/40 rounded-xl text-purple-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-black tracking-wide flex items-center gap-1.5">
                <span>Ma Trận Phân Quyền Đa Cấp</span>
                <span className="text-[10px] bg-purple-500 text-white font-mono px-1.5 py-0.5 rounded">
                  Developer Engine
                </span>
              </h4>
              <p className="text-[11px] sm:text-xs text-purple-200 leading-tight mt-0.5">
                Chủ động bật/tắt bất kỳ tính năng nào cho từng Vai Trò hoặc cấp quyền ngoại lệ cho từng Cá Nhân.
              </p>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleApplyManagerSafePreset}
              className="px-2.5 py-1.5 bg-purple-600/80 hover:bg-purple-600 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer shadow-xs border border-purple-400/40 flex items-center gap-1"
              title="Cấu hình an toàn: Sếp theo dõi tiến độ + dùng demo, không vào cài đặt xưởng & nhân sự"
            >
              <Crown className="w-3 h-3 text-amber-300" />
              <span>Sếp An Toàn</span>
            </button>

            <button
              type="button"
              onClick={handleApplyManagerFullPreset}
              className="px-2.5 py-1.5 bg-indigo-700/80 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer shadow-xs border border-indigo-400/40 flex items-center gap-1"
              title="Cấp full quyền mọi module cho Sếp"
            >
              <Unlock className="w-3 h-3 text-emerald-300" />
              <span>Full Quyền Sếp</span>
            </button>

            <button
              type="button"
              onClick={handleResetToDefaults}
              className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-bold rounded-xl transition-all cursor-pointer border border-neutral-600 flex items-center gap-1"
              title="Khôi phục ma trận về mặc định ban đầu"
            >
              <RotateCcw className="w-3 h-3 text-neutral-400" />
              <span>Mặc Định</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter & Add Custom Feature Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
              categoryFilter === 'ALL'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Tất cả ({allDefinitions.length})
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                categoryFilter === cat
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAddCustomFeature(!showAddCustomFeature)}
          className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 border border-purple-300"
        >
          <Plus className="w-3.5 h-3.5 text-purple-700" />
          <span>Thêm Tính Năng Tùy Chỉnh</span>
        </button>
      </div>

      {/* Create Custom Feature Form */}
      {showAddCustomFeature && (
        <form onSubmit={handleAddCustomFeature} className="p-3.5 bg-purple-50 rounded-2xl border-2 border-purple-300 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-purple-200 pb-2">
            <h5 className="text-xs font-black text-purple-950 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Định Nghĩa Quyền / Tính Năng Mới</span>
            </h5>
            <button
              type="button"
              onClick={() => setShowAddCustomFeature(false)}
              className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="font-bold text-neutral-700 block mb-1">Mã Quyền (Key Code):</label>
              <input
                type="text"
                required
                value={customKey}
                onChange={e => setCustomKey(e.target.value)}
                placeholder="vd: can_view_revenue"
                className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-xl font-mono text-xs outline-hidden focus:border-purple-600"
              />
            </div>
            <div>
              <label className="font-bold text-neutral-700 block mb-1">Tên Quyền Hiển Thị:</label>
              <input
                type="text"
                required
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="vd: Xem Doanh Thu & Lợi Nhuận"
                className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold outline-hidden focus:border-purple-600"
              />
            </div>
            <div>
              <label className="font-bold text-neutral-700 block mb-1">Nhóm Tính Năng:</label>
              <select
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value as any)}
                className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold outline-hidden focus:border-purple-600 cursor-pointer"
              >
                <option value="Cấu Hình & Quản Trị">Cấu Hình & Quản Trị</option>
                <option value="Lệnh In & Điều Phối">Lệnh In & Điều Phối</option>
                <option value="Kẽm & Vận Hành In">Kẽm & Vận Hành In</option>
                <option value="Gia Công & Sự Cố">Gia Công & Sự Cố</option>
                <option value="Báo Cáo & Tiện Ích">Báo Cáo & Tiện Ích</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-neutral-700 block mb-1 text-xs">Mô tả tác dụng quyền:</label>
            <input
              type="text"
              value={customDesc}
              onChange={e => setCustomDesc(e.target.value)}
              placeholder="vd: Cho phép người dùng xem biểu đồ doanh số kinh doanh tháng"
              className="w-full px-2.5 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs outline-hidden focus:border-purple-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddCustomFeature(false)}
              className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-xl cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Tạo Quyền & Đưa Vào Ma Trận</span>
            </button>
          </div>
        </form>
      )}

      {/* 1. INTERACTIVE MATRIX TABLE */}
      <div className="border border-neutral-200 rounded-2xl overflow-hidden shadow-xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-neutral-100/95 backdrop-blur-xs border-b border-neutral-200 text-[11px] font-black text-neutral-700 uppercase tracking-wider">
                <th className="p-3.5 min-w-[240px]">Quyền / Chức Năng</th>
                {ROLES_LIST.map(r => (
                  <th key={r.role} className="p-2.5 text-center whitespace-nowrap">
                    <span className={`inline-block px-2.5 py-1 rounded-lg border text-[10px] font-bold ${r.badgeColor}`}>
                      {r.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-xs">
              {categories
                .filter(cat => categoryFilter === 'ALL' || categoryFilter === cat)
                .map(categoryName => {
                  const permsInCategory = allDefinitions.filter(d => d.category === categoryName);
                  if (permsInCategory.length === 0) return null;

                  return (
                    <React.Fragment key={categoryName}>
                      {/* Category Header Row */}
                      <tr className="bg-neutral-50/90">
                        <td colSpan={ROLES_LIST.length + 1} className="px-3.5 py-2 font-black text-neutral-800 text-[11px] tracking-wide border-y border-neutral-200/80">
                          <span className="text-purple-700 mr-1.5 font-black">●</span>
                          {categoryName} ({permsInCategory.length})
                        </td>
                      </tr>

                      {/* Permission Rows */}
                      {permsInCategory.map((perm) => {
                        const isCustom = customFeatures.some(f => f.key === perm.key);

                        return (
                          <tr key={perm.key} className="hover:bg-amber-50/40 transition-colors">
                            
                            {/* Feature Name & Description */}
                            <td className="p-3.5 align-middle">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-bold text-neutral-900 flex items-center gap-1.5 text-xs">
                                    <span>{perm.name}</span>
                                    {isCustom && (
                                      <span className="text-[9px] font-mono bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded font-bold shrink-0">
                                        Custom
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-normal">
                                    {perm.description}
                                  </p>
                                </div>

                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCustomFeature(perm.key)}
                                    className="text-neutral-400 hover:text-red-600 p-1 transition-colors cursor-pointer shrink-0"
                                    title="Xóa tính năng tùy chỉnh này"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Role Cells */}
                            {ROLES_LIST.map(r => {
                              const permitted = isRolePermitted(r.role, perm.key);
                              const isDevRole = r.role === 'DEVELOPER';

                              return (
                                <td key={r.role} className="p-2 text-center align-middle">
                                  {isDevRole ? (
                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[10px] font-black cursor-default" title="Developer luôn toàn quyền">
                                      Full
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRolePermission(r.role, perm.key)}
                                      className={`inline-flex items-center justify-center w-8 h-8 rounded-xl transition-all cursor-pointer active:scale-90 ${
                                        permitted
                                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xs'
                                          : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-400 border border-neutral-200'
                                      }`}
                                      title={`Bấm để ${permitted ? 'Tắt' : 'Bật'} quyền "${perm.name}" cho ${r.label}`}
                                    >
                                      {permitted ? (
                                        <Check className="w-4 h-4 stroke-[3]" />
                                      ) : (
                                        <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                      )}
                                    </button>
                                  )}
                                </td>
                              );
                            })}

                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. USER-LEVEL OVERRIDES SECTION */}
      <div className="p-4 bg-neutral-50/90 rounded-2xl border border-neutral-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h5 className="text-xs font-black text-neutral-900 uppercase tracking-wide flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-purple-600" />
              <span>Ngoại Lệ Cho Từng Cá Nhân (User Override)</span>
            </h5>
            <p className="text-[11px] text-neutral-500">
              Gán quyền đặc cách hoặc thu hồi quyền của riêng một nhân sự cụ thể bất kể vai trò của họ.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-neutral-700 whitespace-nowrap">Chọn nhân viên:</label>
            <select
              value={selectedUserId}
              onChange={e => setSelectedUserId(e.target.value)}
              className="px-3 py-1.5 bg-white border border-neutral-300 rounded-xl text-xs font-bold outline-hidden focus:border-purple-600 cursor-pointer min-w-[200px]"
            >
              <option value="">-- Chọn nhân sự cấu hình --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedUserObj ? (
          <div className="pt-2 border-t border-neutral-200 space-y-3">
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-neutral-200">
              <div className="flex items-center gap-2.5">
                <ResolvedImage
                  image={selectedUserObj.avatarImage}
                  legacyUrl={selectedUserObj.avatar}
                  alt={selectedUserObj.name}
                  className="w-8 h-8 rounded-full object-cover border border-neutral-200"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <p className="text-xs font-black text-neutral-900">{selectedUserObj.name}</p>
                  <p className="text-[10px] text-neutral-500">Vai trò chính: <b className="text-purple-700">{selectedUserObj.role}</b></p>
                </div>
              </div>

              {Object.keys(userOverrides[selectedUserObj.id] || {}).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Xóa toàn bộ quyền ngoại lệ của "${selectedUserObj.name}" để kế thừa theo vai trò?`)) {
                      setFormData(prev => {
                        const currentPerms = prev.permissions || {};
                        const currentOverrides = { ...(currentPerms.userOverrides || {}) };
                        delete currentOverrides[selectedUserObj.id];
                        return {
                          ...prev,
                          permissions: {
                            ...currentPerms,
                            userOverrides: currentOverrides
                          }
                        };
                      });
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1.5 cursor-pointer bg-red-50 px-2.5 py-1 rounded-lg border border-red-200"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Xóa tất cả ngoại lệ ({Object.keys(userOverrides[selectedUserObj.id] || {}).length})</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {allDefinitions.map(def => {
                const currentOverride = getUserOverrideValue(selectedUserObj.id, def.key);
                const roleDefault = isRolePermitted(selectedUserObj.role, def.key);

                return (
                  <div
                    key={def.key}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                      currentOverride !== 'INHERIT'
                        ? 'bg-purple-50/90 border-purple-300 ring-1 ring-purple-200'
                        : 'bg-white border-neutral-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-neutral-900 truncate text-xs">{def.name}</p>
                      <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                        Kế thừa vai trò: {roleDefault ? '🟢 Cho phép' : '🔴 Chặn'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSetUserOverride(selectedUserObj.id, def.key, 'INHERIT')}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                          currentOverride === 'INHERIT'
                            ? 'bg-neutral-800 text-white'
                            : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                        }`}
                        title="Kế thừa theo vai trò"
                      >
                        Kế Thừa
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetUserOverride(selectedUserObj.id, def.key, true)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                          currentOverride === true
                            ? 'bg-emerald-600 text-white shadow-2xs font-black'
                            : 'bg-neutral-100 text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title="Bắt buộc cho phép"
                      >
                        Bật
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetUserOverride(selectedUserObj.id, def.key, false)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                          currentOverride === false
                            ? 'bg-red-600 text-white shadow-2xs font-black'
                            : 'bg-neutral-100 text-red-700 hover:bg-red-50'
                        }`}
                        title="Bắt buộc chặn"
                      >
                        Tắt
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-neutral-400 bg-white rounded-xl border border-dashed border-neutral-300">
            Chọn một nhân sự từ danh sách trên để xem hoặc chỉnh sửa quyền ngoại lệ riêng.
          </div>
        )}
      </div>

    </div>
  );
};
