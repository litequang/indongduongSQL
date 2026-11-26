import React from 'react';
import { LayoutDashboard, ClipboardList, Plus, Clock, Scissors, Printer, Sparkles, BarChart3, Users, CheckCircle2, FileText, CheckSquare, Send, Package , Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { handleAvatarImageError, safeAvatarSrc } from '../utils/avatarUtils';
import { ResolvedImage } from './ResolvedImage';

export const MobileNav: React.FC = () => {
  const {
    appConfig,
    currentUser,
    activeTab,
    setActiveTab,
    setIsCreateModalOpen,
    unreadNotifsCount,
    urgentOrdersCount,
    orders
  } = useApp();

  const myPrinterOrders = orders.filter(o => o.printerId === currentUser.id && o.status !== 'DRAFT');
  const myPrinterWaiting = myPrinterOrders.filter(o => o.status === 'WAITING_ACCEPTANCE' || o.status === 'WAITING_PRINT' || o.status === 'ACCEPTED').length;
  const myPrinterPrinting = myPrinterOrders.filter(o => o.status === 'PRINTING').length;

  const myFinisherOrders = orders.filter(o => o.status === 'FINISHING' || o.status === 'PRINTED');
  const finisherWaiting = myFinisherOrders.filter(o => o.status === 'PRINTED').length;
  const finisherWorking = myFinisherOrders.filter(o => o.status === 'FINISHING').length;

  // PRINTER Mobile Navigation Bar
  if (currentUser.role === 'PRINTER') {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {/* Home / Overview */}
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'overview' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Trang chủ</span>
        </button>

        {/* Chờ in */}
        <button
          type="button"
          onClick={() => setActiveTab('waiting_print')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors relative cursor-pointer ${
            activeTab === 'waiting_print' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <div className="relative">
            <Clock className="w-5 h-5" />
            {myPrinterWaiting > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 bg-amber-500 text-white text-[9px] font-black rounded-full shadow-xs">
                {myPrinterWaiting}
              </span>
            )}
          </div>
          <span className="text-[10px]">Chờ in</span>
        </button>

        {/* Đang in */}
        <button
          type="button"
          onClick={() => setActiveTab('printing')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors relative cursor-pointer ${
            activeTab === 'printing' ? 'text-blue-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <div className="relative">
            <Printer className="w-5 h-5" />
            {myPrinterPrinting > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-600 rounded-full animate-ping"></span>
            )}
          </div>
          <span className="text-[10px]">Đang in</span>
        </button>

        {/* Đã in */}
        <button
          type="button"
          onClick={() => setActiveTab('printed')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'printed' ? 'text-emerald-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px]">Đã in xong</span>
        </button>

        {/* Tài khoản / Đổi thợ */}
        <button
          type="button"
          onClick={() => {
            const switcherBtn = document.getElementById('btn-role-switcher');
            if (switcherBtn) switcherBtn.click();
          }}
          className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors text-neutral-500 hover:text-neutral-900 cursor-pointer"
        >
          <div className="relative">
            <ResolvedImage
              image={currentUser.avatarImage}
              legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
              alt={currentUser.name}
              className="w-5 h-5 rounded-full object-cover border border-neutral-300"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, currentUser.name)}
            />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span className="text-[10px]">Tài khoản</span>
        </button>
      </nav>
    );
  }

  // WAREHOUSE has an operational workspace of its own; it never inherits
  // Printer, Finisher, Sale, or management controls on mobile.
  if (currentUser.role === 'WAREHOUSE') {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-neutral-200/90 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-md">
        <button type="button" onClick={() => setActiveTab('overview')} className={`flex flex-col items-center gap-0.5 py-1 px-2 ${activeTab === 'overview' ? 'text-sky-600 font-bold' : 'text-neutral-500'}`}><LayoutDashboard className="w-5 h-5" /><span className="text-[10px]">Trang chủ</span></button>
        <button type="button" onClick={() => setActiveTab('finished_goods')} className={`flex flex-col items-center gap-0.5 py-1 px-2 ${activeTab === 'finished_goods' ? 'text-sky-600 font-bold' : 'text-neutral-500'}`}><Package className="w-5 h-5" /><span className="text-[10px]">Trong kho</span></button>
        <button type="button" onClick={() => setActiveTab('dispatches')} className={`flex flex-col items-center gap-0.5 py-1 px-2 ${activeTab === 'dispatches' ? 'text-sky-600 font-bold' : 'text-neutral-500'}`}><Send className="w-5 h-5" /><span className="text-[10px]">Xuất kho</span></button>
      </nav>
    );
  }

  // FINISHER Mobile Navigation Bar
  if (currentUser.role === 'FINISHER') {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'overview' ? 'text-purple-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Trang chủ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('finishing')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors relative cursor-pointer ${
            activeTab === 'finishing' ? 'text-purple-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <div className="relative">
            <Scissors className="w-5 h-5" />
            {finisherWaiting + finisherWorking > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 bg-purple-600 text-white text-[9px] font-black rounded-full shadow-xs">
                {finisherWaiting + finisherWorking}
              </span>
            )}
          </div>
          <span className="text-[10px]">Gia công</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'completed' ? 'text-emerald-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-[10px]">Hoàn thành</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const switcherBtn = document.getElementById('btn-role-switcher');
            if (switcherBtn) switcherBtn.click();
          }}
          className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors text-neutral-500 hover:text-neutral-900 cursor-pointer"
        >
          <div className="relative">
            <ResolvedImage
              image={currentUser.avatarImage}
              legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
              alt={currentUser.name}
              className="w-5 h-5 rounded-full object-cover border border-neutral-300"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, currentUser.name)}
            />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span className="text-[10px]">Tài khoản</span>
        </button>
      </nav>
    );
  }

  // DESIGNER Mobile Navigation Bar
  if (currentUser.role === 'DESIGNER') {
    const notSentPlateCount = orders.filter(o => o.plateStatus === 'NOT_SENT').length;
    const draftsCount = orders.filter(o => o.status === 'DRAFT').length;

    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {/* Home */}
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'overview' ? 'text-blue-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Trang chủ</span>
        </button>

        {/* Chưa ra kẽm */}
        <button
          type="button"
          onClick={() => setActiveTab('not_sent_plate')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors relative cursor-pointer ${
            activeTab === 'not_sent_plate' ? 'text-red-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <div className="relative">
            <Clock className="w-5 h-5" />
            {notSentPlateCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded-full shadow-xs">
                {notSentPlateCount}
              </span>
            )}
          </div>
          <span className="text-[10px]">Chưa kẽm</span>
        </button>

        {/* Center Giant Action: Ra Lệnh In Siêu Tốc */}
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('open-quick-composer'));
          }}
          className="-mt-5 w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 text-white shadow-lg shadow-amber-500/40 flex items-center justify-center active:scale-95 transition-transform cursor-pointer ring-4 ring-white shrink-0"
          title="Ra lệnh in siêu tốc (10 giây)"
        >
          <Plus className="w-6 h-6 stroke-[3]" />
        </button>

        {/* Lệnh nháp / DS Lệnh */}
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'all' ? 'text-blue-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px]">DS Lệnh</span>
        </button>

        {/* Account Switcher */}
        <button
          type="button"
          onClick={() => {
            const switcherBtn = document.getElementById('btn-role-switcher');
            if (switcherBtn) switcherBtn.click();
          }}
          className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors text-neutral-500 hover:text-neutral-900 cursor-pointer"
        >
          <div className="relative">
            <ResolvedImage
              image={currentUser.avatarImage}
              legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
              alt={currentUser.name}
              className="w-5 h-5 rounded-full object-cover border border-neutral-300"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, currentUser.name)}
            />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span className="text-[10px]">Tài khoản</span>
        </button>
      </nav>
    );
  }

  // SALE Mobile Navigation Bar
  if (currentUser.role === 'SALE') {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'overview' ? 'text-emerald-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Trang chủ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('printing')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'printing' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Printer className="w-5 h-5" />
          <span className="text-[10px]">Đang in</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('finishing')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'finishing' ? 'text-purple-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Scissors className="w-5 h-5" />
          <span className="text-[10px]">Gia công</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'all' ? 'text-emerald-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <ClipboardList className="w-5 h-5" />
          <span className="text-[10px]">Tra cứu</span>
        </button>
        {appConfig?.features?.customer && (
          <button
            type="button"
            onClick={() => setActiveTab('customers')}
            className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
              activeTab === 'customers' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px]">Khách</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            const switcherBtn = document.getElementById('btn-role-switcher');
            if (switcherBtn) switcherBtn.click();
          }}
          className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors text-neutral-500 hover:text-neutral-900 cursor-pointer"
        >
          <div className="relative">
            <ResolvedImage
              image={currentUser.avatarImage}
              legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
              alt={currentUser.name}
              className="w-5 h-5 rounded-full object-cover border border-neutral-300"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, currentUser.name)}
            />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
            )}
          </div>
          <span className="text-[10px]">Tài khoản</span>
        </button>
      </nav>
    );
  }

  // ADMIN & DEVELOPER Mobile Navigation Bar
  const urgentCount = orders.filter(o => o.plateStatus === 'NOT_SENT' || o.status === 'WAITING_ACCEPTANCE').length;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-neutral-200/90 px-2 py-1.5 flex items-center justify-around shadow-lg">
      {/* Home / Overview */}
      <button
        type="button"
        onClick={() => setActiveTab('overview')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
          activeTab === 'overview' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        <div className="relative">
          <LayoutDashboard className="w-5 h-5" />
          {urgentOrdersCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
          )}
        </div>
        <span className="text-[10px]">Trang chủ</span>
      </button>

      {/* Việc cần xử lý */}
      <button
        type="button"
        onClick={() => setActiveTab('my_work')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors relative cursor-pointer ${
          activeTab === 'my_work' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        <div className="relative">
          <Clock className="w-5 h-5" />
          {urgentCount > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 bg-amber-500 text-white text-[9px] font-black rounded-full shadow-xs">
              {urgentCount}
            </span>
          )}
        </div>
        <span className="text-[10px]">Việc gấp</span>
      </button>

      {/* Center Giant Action: Ra Lệnh In (opens quick composer) */}
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent('open-quick-composer'));
        }}
        className="-mt-5 w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/40 flex items-center justify-center active:scale-95 transition-transform cursor-pointer ring-4 ring-white shrink-0"
        title="Ra lệnh in nhanh"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* All Orders List */}
      <button
        type="button"
        onClick={() => setActiveTab('all')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
          activeTab === 'all' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
        }`}
      >
        <ClipboardList className="w-5 h-5" />
        <span className="text-[10px]">DS Lệnh</span>
      </button>
      {appConfig?.features?.customer && (
        <button
          type="button"
          onClick={() => setActiveTab('customers')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'customers' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px]">Khách</span>
        </button>
      )}

      {appConfig?.features?.salesOrder && (
        <button
          type="button"
          onClick={() => setActiveTab('salesOrders')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors cursor-pointer ${
            activeTab === 'salesOrders' ? 'text-amber-600 font-bold' : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <FileText className="w-5 h-5" />
          <span className="text-[10px]">Đơn hàng</span>
        </button>
      )}

      {/* Account Switcher */}
      <button
        type="button"
        onClick={() => {
          const switcherBtn = document.getElementById('btn-role-switcher');
          if (switcherBtn) switcherBtn.click();
        }}
        className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl transition-colors text-neutral-500 hover:text-neutral-900 cursor-pointer"
      >
        <div className="relative">
          <ResolvedImage
            image={currentUser.avatarImage}
            legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
            alt={currentUser.name}
            className="w-5 h-5 rounded-full object-cover border border-neutral-300"
            referrerPolicy="no-referrer"
            onError={(event) => handleAvatarImageError(event, currentUser.name)}
          />
          {unreadNotifsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"></span>
          )}
        </div>
        <span className="text-[10px]">Tài khoản</span>
      </button>

    </nav>
  );
};
