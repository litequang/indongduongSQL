import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserRole } from '../types';
import { ProductionUserManagement } from './ProductionUserManagement';
import { ResolvedImage } from './ResolvedImage';
import {
  Users,
  UserPlus,
  Shield,
  Printer,
  Scissors,
  Palette,
  Briefcase,
  KeyRound,
  Trash2,
  Edit2,
  Check,
  X,
  Lock,
  Phone,
  UserCheck,
  Smartphone,
  Code2,
  Cpu,
  Crown
  ,Package
} from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
];

export const UserManagementModal: React.FC = () => {
  const {
    isUserManagementModalOpen,
    setIsUserManagementModalOpen,
    users,
    currentUser,
    appConfig,
    isDemoActive,
    addUser,
    updateUser,
    deleteUser
  } = useApp();

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const availablePrinters = appConfig?.production?.printersList || [
    'Máy In 1',
    'Máy In 2',
    'Máy In 4 màu',
    'Máy In Cuộn',
    'Máy In Offset'
  ];

  // Form states
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('PRINTER');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [machineAssigned, setMachineAssigned] = useState(availablePrinters[0] || 'Máy In 1');
  const [avatar, setAvatar] = useState(PRESET_AVATARS[0]);

  if (!isUserManagementModalOpen) return null;

  if (!isDemoActive) {
    return <ProductionUserManagement onClose={() => setIsUserManagementModalOpen(false)} />;
  }

  const resetForm = () => {
    setName('');
    setRole('PRINTER');
    setPhone('');
    setUsername('');
    setPin('');
    setMachineAssigned(availablePrinters[0] || 'Máy In 1');
    setAvatar(PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)]);
    setIsAddingUser(false);
    setEditingUserId(null);
  };

  const handleStartEdit = (user: User) => {
    setEditingUserId(user.id);
    setName(user.name);
    setRole(user.role);
    setPhone(user.phone || '');
    setUsername(user.username || '');
    setPin(user.pin || '');
    setMachineAssigned(user.machineAssigned || 'Máy In 1');
    setAvatar(user.avatar || PRESET_AVATARS[0]);
    setIsAddingUser(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Vui lòng nhập họ và tên nhân sự!');
      return;
    }

    if (editingUserId) {
      const updates: Partial<User> = {
        name: name.trim(),
        role,
        phone: phone.trim(),
        username: username.trim(),
        machineAssigned: role === 'PRINTER' ? machineAssigned : undefined,
        avatar
      };
      if (pin.trim()) {
        updates.pin = pin.trim();
      }
      updateUser(editingUserId, updates);
    } else {
      addUser({
        name: name.trim(),
        role,
        phone: phone.trim(),
        username: username.trim() || undefined,
        pin: pin.trim() || '1234',
        machineAssigned: role === 'PRINTER' ? machineAssigned : undefined,
        avatar,
        active: true
      });
    }

    resetForm();
  };

  const getRoleIcon = (r: UserRole) => {
    switch (r) {
      case 'DEVELOPER': return <Code2 className="w-4 h-4 text-indigo-600" />;
      case 'ADMIN': return <Shield className="w-4 h-4 text-red-600" />;
      case 'MANAGER': return <Crown className="w-4 h-4 text-amber-600" />;
      case 'DESIGNER': return <Palette className="w-4 h-4 text-blue-600" />;
      case 'PRINTER': return <Printer className="w-4 h-4 text-amber-600" />;
      case 'FINISHER': return <Scissors className="w-4 h-4 text-purple-600" />;
      case 'SALE': return <Briefcase className="w-4 h-4 text-emerald-600" />;
      case 'WAREHOUSE': return <Package className="w-4 h-4 text-sky-600" />;
    }
  };

  const getRoleName = (r: UserRole) => {
    switch (r) {
      case 'DEVELOPER': return 'Developer (Kỹ Thuật Hệ Thống)';
      case 'ADMIN': return 'Admin (Quản Trị Viên Xưởng)';
      case 'MANAGER': return 'Quản Lý / Sếp Xưởng';
      case 'DESIGNER': return 'Thiết Kế';
      case 'PRINTER': return 'Thợ In';
      case 'FINISHER': return 'Tổ Gia Công';
      case 'SALE': return 'Kinh Doanh';
      case 'WAREHOUSE': return 'Kho';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-3xl rounded-2xl sm:rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col h-[94dvh] sm:h-auto sm:max-h-[90dvh]">

        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-900 text-white shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base md:text-lg truncate">
                Quản Lý Nhân Sự & Phân Quyền
              </h3>
              <p className="text-[11px] sm:text-xs text-neutral-400 truncate">
                Tạo tài khoản, mã PIN và phân công máy in, thiết kế, gia công
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              resetForm();
              setIsUserManagementModalOpen(false);
            }}
            className="w-9 h-9 flex items-center justify-center hover:bg-neutral-800 rounded-xl transition-colors cursor-pointer text-neutral-400 hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">

          {/* Action Toolbar */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Danh sách nhân sự ({users.length} người)
            </span>

            {!isAddingUser && (
              <button
                onClick={() => {
                  resetForm();
                  setIsAddingUser(true);
                }}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-98 text-neutral-950 font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Thêm Nhân Viên Mới</span>
              </button>
            )}
          </div>

          {/* Form Create / Edit User */}
          {isAddingUser && (
            <form onSubmit={handleSave} className="bg-amber-50/50 rounded-2xl p-4 sm:p-5 border border-amber-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-amber-600" />
                  {editingUserId ? 'Chỉnh sửa thông tin nhân viên' : 'Thêm nhân sự mới vào xưởng'}
                </h4>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-bold text-neutral-500 hover:text-neutral-800"
                >
                  Hủy
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

                {/* Full Name */}
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Họ và Tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setName(newName);
                      // Auto suggest username if not editing
                      if (!editingUserId && !username) {
                        const cleanUser = newName
                          .toLowerCase()
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .replace(/đ/g, "d")
                          .replace(/[^a-z0-9]/g, "");
                        setUsername(cleanUser);
                      }
                    }}
                    placeholder="VD: Trịnh Tý Quang, Nguyễn Văn Thợ..."
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-semibold outline-hidden focus:border-amber-500"
                  />
                </div>

                {/* Username */}
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1 flex items-center justify-between">
                    <span>Tên đăng nhập (Username)</span>
                    <span className="text-[10px] text-neutral-400 font-normal">Dùng để đăng nhập ca</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="VD: trinhtyquang, quang_tk, thien_in..."
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-mono font-bold text-neutral-900 outline-hidden focus:border-amber-500"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Vai trò trong xưởng <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-bold outline-hidden focus:border-amber-500 cursor-pointer"
                  >
                    <option value="ADMIN">👑 Admin (Quản trị viên xưởng - Quản lý nhân sự & Cài đặt xưởng)</option>
                    <option value="MANAGER">👔 Quản Lý / Sếp (Giám sát tiến độ, duyệt lệnh, báo cáo, dùng Demo)</option>
                    <option value="DESIGNER">🎨 Thiết Kế (Tạo lệnh in, Gửi kẽm, Soát file in)</option>
                    <option value="SALE">💼 Kinh Doanh (Tạo đơn hàng, Theo dõi tiến độ giao khách)</option>
                    <option value="PRINTER">🖨️ Thợ In (Nhận lệnh in, Vận hành máy, Báo kẽm/in xong)</option>
                    <option value="FINISHER">✂️ Tổ Gia Công (Dán túi bánh mì, Cắt bế, Đóng gói)</option>
                    <option value="WAREHOUSE">📦 Kho (Nhận hàng hoàn tất và xuất kho)</option>
                    <option value="DEVELOPER">🛠️ Developer (Kỹ thuật hệ thống - Ma trận phân quyền & cấu hình)</option>
                  </select>
                </div>

                {/* PIN Code for fast mobile login */}
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1 flex items-center justify-between">
                    <span>Mã PIN đăng nhập (4 số) <span className="text-red-500">*</span></span>
                    <span className="text-[10px] text-neutral-400 font-normal">Mặc định: 1234</span>
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="1234"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-mono font-bold tracking-widest outline-hidden focus:border-amber-500"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09xx xxx xxx"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs font-medium outline-hidden focus:border-amber-500"
                  />
                </div>

                {/* Machine Assignment for Printers */}
                {role === 'PRINTER' && (
                  <div>
                    <label className="text-xs font-bold text-neutral-700 block mb-1">
                      Máy in phụ trách chính
                    </label>
                    <select
                      value={machineAssigned}
                      onChange={(e) => setMachineAssigned(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-bold outline-hidden focus:border-amber-500 cursor-pointer"
                    >
                      {availablePrinters.map((p, idx) => (
                        <option key={idx} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Avatar Selection */}
                <div className={role === 'PRINTER' ? 'sm:col-span-1' : 'sm:col-span-2'}>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Ảnh đại diện
                  </label>
                  <div className="flex items-center gap-2 overflow-x-auto py-1">
                    {PRESET_AVATARS.map((av, i) => (
                      <img
                        key={i}
                        src={av}
                        alt="Avatar"
                        onClick={() => setAvatar(av)}
                        className={`w-9 h-9 rounded-full object-cover cursor-pointer transition-all border-2 ${
                          avatar === av ? 'border-amber-500 scale-110 shadow-xs' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                </div>

              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {editingUserId ? 'Lưu Thay Đổi' : 'Tạo Nhân Sự Mới'}
                </button>
              </div>
            </form>
          )}

          {/* Users List Table */}
          <div className="space-y-2.5">
            {users.map((u) => (
              <div
                key={u.id}
                className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  u.id === currentUser.id
                    ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-400/20'
                    : 'bg-white border-neutral-200/90 hover:border-neutral-300'
                }`}
              >

                {/* User Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <ResolvedImage
                      image={u.avatarImage}
                      legacyUrl={u.avatar}
                      alt={u.name}
                      className="w-11 h-11 rounded-full object-cover border border-neutral-200"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm sm:text-base text-neutral-900">
                        {u.name}
                      </span>
                      {u.id === currentUser.id && (
                        <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-black rounded-full">
                          ĐANG ĐĂNG NHẬP
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-neutral-100 border border-neutral-200">
                        {getRoleIcon(u.role)}
                        <span>{getRoleName(u.role)}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 flex-wrap font-medium">
                      {u.username && (
                        <span className="font-mono text-neutral-800 bg-amber-100/70 border border-amber-300/60 px-1.5 py-0.5 rounded text-[11px] font-bold">
                          @{u.username}
                        </span>
                      )}
                      {u.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-neutral-400" />
                          {u.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-mono text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded">
                        <Lock className="w-3 h-3 text-neutral-400" />
                        PIN: {u.pin || '1234'}
                      </span>
                      {u.machineAssigned && (
                        <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">
                          {u.machineAssigned}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">

                  {/* Edit Button */}
                  <button
                    onClick={() => handleStartEdit(u)}
                    className="p-2 text-neutral-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
                    title="Chỉnh sửa thông tin / Đổi PIN"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete Button (cannot delete last admin or yourself) */}
                  {u.id !== currentUser.id && users.length > 1 && (
                    <button
                      onClick={() => {
                        if (confirm(`Bạn có chắc muốn xóa nhân sự "${u.name}" khỏi hệ thống?`)) {
                          deleteUser(u.id);
                        }
                      }}
                      className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      title="Xóa nhân sự"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                </div>

              </div>
            ))}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500 shrink-0 gap-2">
          <span className="truncate hidden sm:inline">
            💡 Mẹo: Cài đặt mã PIN 4 số ngắn gọn để thợ in thao tác nhanh trên điện thoại xưởng.
          </span>
          <span className="truncate sm:hidden text-[11px]">
            💡 Mã PIN 4 số giúp thợ đăng nhập nhanh.
          </span>
          <button
            onClick={() => setIsUserManagementModalOpen(false)}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white font-bold rounded-xl cursor-pointer shrink-0 min-h-[38px]"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
