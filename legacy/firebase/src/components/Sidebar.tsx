import React from 'react';
import { LayoutDashboard, ClipboardList, PlusCircle, Layers, Scissors, Bell, SlidersHorizontal, AlertCircle, Clock, Printer, Sparkles, Lock, LogOut, Users, Download, Smartphone, FileText, CheckSquare, Send, Package, Truck, CircleHelp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { canManageCustomer, canManageWorkshopSettings, canOperateWarehouse, canViewReports } from '../permissions';
import { handleAvatarImageError, safeAvatarSrc } from '../utils/avatarUtils';
import { ResolvedImage } from './ResolvedImage';

export const Sidebar: React.FC = () => {
  const {
    currentUser,
    activeTab,
    setActiveTab,
    setIsCreateModalOpen,
    setIsLibraryModalOpen,
    setIsSettingsModalOpen,
    setIsInstallModalOpen,
    setIsLoginModalOpen,
    setIsCustomerImportModalOpen,
    logout,
    appConfig,
    isAppInstalled,
    unreadNotifsCount,
    urgentOrdersCount,
    orders
  } = useApp();

  const isProduction = appConfig.system.deploymentMode === 'PRODUCTION';

  // Role-specific counts & lists
  const myPrinterOrders = orders.filter(o => o.printerId === currentUser.id && o.status !== 'DRAFT');
  const myPrinterWaitingCount = myPrinterOrders.filter(o => o.status === 'WAITING_ACCEPTANCE' || o.status === 'WAITING_PRINT' || o.status === 'ACCEPTED').length;
  const myPrinterPrintingCount = myPrinterOrders.filter(o => o.status === 'PRINTING').length;
  const myPrinterPrintedCount = myPrinterOrders.filter(o => o.status === 'PRINTED' || o.status === 'FINISHING' || o.status === 'COMPLETED').length;
  const myPrinterIssueCount = myPrinterOrders.filter(o => o.issues?.some(i => i.status === 'OPEN')).length;

  const hasReportsPermission = canViewReports(currentUser, appConfig);

  const draftCount = orders.filter(o => o.status === 'DRAFT').length;
  const unacceptedCount = orders.filter(o => o.status === 'WAITING_ACCEPTANCE').length;
  const notSentPlateCount = orders.filter(o => o.plateStatus === 'NOT_SENT').length;
  const readyPlateCount = orders.filter(o => o.plateStatus === 'SENT' || o.plateStatus === 'RECEIVED' || o.plateStatus === 'OLD_PLATE').length;
  const issueCount = orders.filter(o => o.issues?.some(i => i.status === 'OPEN')).length;
  const printingCount = orders.filter(o => o.status === 'PRINTING').length;
  const finishingCount = orders.filter(o => o.status === 'FINISHING').length;

  // Build role-tailored navigation items
  const getNavItems = (): any[] => {
    if (currentUser.role === 'PRINTER') {
      return [
        {
          id: 'overview',
          label: hasReportsPermission ? 'Bàn thợ in & Thống kê' : 'Bàn thợ in',
          icon: LayoutDashboard,
          badge: myPrinterOrders.some(o => o.isUrgent) ? 'GẤP' : undefined,
          badgeColor: 'bg-red-500 text-white'
        },
        {
          id: 'waiting_print',
          label: 'Lệnh chờ in',
          icon: Clock,
          badge: myPrinterWaitingCount > 0 ? myPrinterWaitingCount : undefined,
          badgeColor: 'bg-amber-500 text-white'
        },
        {
          id: 'printing',
          label: 'Đang in trên máy',
          icon: Printer,
          badge: myPrinterPrintingCount > 0 ? myPrinterPrintingCount : undefined,
          badgeColor: 'bg-blue-600 text-white animate-pulse'
        },
        {
          id: 'printed',
          label: 'Lệnh đã in xong',
          icon: Sparkles,
          count: myPrinterPrintedCount
        },
        {
          id: 'all',
          label: 'Tất cả lệnh của tôi',
          icon: ClipboardList,
          count: myPrinterOrders.length
        },
        ...(myPrinterIssueCount > 0 ? [
          {
            id: 'issue',
            label: 'Có sự cố cần báo',
            icon: AlertCircle,
            badge: myPrinterIssueCount,
            badgeColor: 'bg-red-600 text-white animate-pulse'
          }
        ] : [])
      ];
    }

    if (currentUser.role === 'FINISHER') {
      const finisherPrintedCount = orders.filter(o => o.status === 'PRINTED').length;
      const finisherWorkingCount = orders.filter(o => o.status === 'FINISHING').length;
      const finisherCompletedCount = orders.filter(o => o.status === 'COMPLETED').length;
      const finisherTotalCount = orders.filter(o => o.status === 'PRINTED' || o.status === 'FINISHING' || o.status === 'COMPLETED').length;

      return [
        {
          id: 'overview',
          label: hasReportsPermission ? 'Tổng quan gia công & Thống kê' : 'Tổng quan gia công',
          icon: LayoutDashboard,
        },
        {
          id: 'printed',
          label: 'Chờ nhận dán túi',
          icon: Clock,
          badge: finisherPrintedCount > 0 ? finisherPrintedCount : undefined,
          badgeColor: 'bg-amber-500 text-white animate-pulse'
        },
        {
          id: 'finishing',
          label: 'Đang dán túi / bế',
          icon: Scissors,
          badge: finisherWorkingCount > 0 ? finisherWorkingCount : undefined,
          badgeColor: 'bg-purple-600 text-white'
        },
        {
          id: 'completed',
          label: 'Đã đóng gói hoàn thành',
          icon: ClipboardList,
          count: finisherCompletedCount
        },
        {
          id: 'all',
          label: 'Tất cả đơn gia công',
          icon: ClipboardList,
          count: finisherTotalCount
        }
      ];
    }

    if (currentUser.role === 'SALE') {
      const saleActiveCount = orders.filter(o => o.status !== 'DRAFT' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
      const saleCompletedCount = orders.filter(o => o.status === 'COMPLETED').length;

      return [
        {
          id: 'overview',
          label: hasReportsPermission ? 'Tổng quan bán hàng & Thống kê' : 'Tổng quan bán hàng',
          icon: LayoutDashboard,
        },
        {
          id: 'all',
          label: 'Đơn đang sản xuất',
          icon: ClipboardList,
          count: saleActiveCount
        },
        {
          id: 'printing',
          label: 'Đang in trên máy',
          icon: Printer,
          count: printingCount
        },
        {
          id: 'finishing',
          label: 'Đang dán túi gia công',
          icon: Scissors,
          count: finishingCount
        },
        {
          id: 'completed',
          label: 'Đã hoàn thành',
          icon: ClipboardList,
          count: saleCompletedCount
        }
      ];
    }

    if (currentUser.role === 'DESIGNER') {
      const designerTotalCount = orders.filter(o => o.status !== 'DRAFT' || o.createdBy === currentUser.id).length;

      return [
        {
          id: 'overview',
          label: 'Bàn làm việc thiết kế',
          icon: LayoutDashboard,
          badge: notSentPlateCount > 0 ? `! ${notSentPlateCount}` : undefined,
          badgeColor: 'bg-red-500 text-white'
        },
        {
          id: 'my_work',
          label: 'Việc cần xử lý',
          icon: Clock,
          badge: draftCount + notSentPlateCount + unacceptedCount + issueCount > 0
            ? draftCount + notSentPlateCount + unacceptedCount + issueCount
            : undefined,
          badgeColor: 'bg-amber-500 text-white'
        },
        ...(appConfig?.features?.salesOrder ? [{
          id: 'designer_queue',
          label: 'Mẫu chờ ghép in',
          icon: Layers,
          badgeColor: 'bg-amber-500 text-white'
        }] : []),
        {
          id: 'drafts',
          label: 'Lệnh lưu nháp',
          icon: Clock,
          badge: draftCount > 0 ? draftCount : undefined,
          badgeColor: 'bg-amber-500 text-white'
        },
        {
          id: 'not_sent_plate',
          label: 'Chưa ra kẽm',
          icon: Layers,
          badge: notSentPlateCount > 0 ? `! ${notSentPlateCount}` : undefined,
          badgeColor: 'bg-red-500 text-white'
        },
        {
          id: 'ready_plate',
          label: 'Đã ra kẽm',
          icon: Layers,
          count: readyPlateCount
        },
        {
          id: 'unaccepted',
          label: 'Chờ thợ nhận',
          icon: AlertCircle,
          badge: unacceptedCount > 0 ? unacceptedCount : undefined,
          badgeColor: 'bg-orange-500 text-white'
        },
        {
          id: 'printing',
          label: 'Đang in máy',
          icon: Printer,
          count: printingCount
        },
        {
          id: 'all',
          label: 'Tất cả lệnh thiết kế',
          icon: ClipboardList,
          count: designerTotalCount
        },
        ...(issueCount > 0 ? [
          {
            id: 'issue',
            label: 'Có vấn đề',
            icon: AlertCircle,
            badge: issueCount,
            badgeColor: 'bg-red-600 text-white animate-pulse'
          }
        ] : [])
      ];
    }

    // Default: Admin / Developer
    return [
      {
        id: 'overview',
        label: 'Tổng quan xưởng',
        icon: LayoutDashboard,
        badge: urgentOrdersCount > 0 ? urgentOrdersCount : undefined,
        badgeColor: 'bg-red-500 text-white'
      },
      {
        id: 'my_work',
        label: 'Việc cần xử lý',
        icon: Clock,
        badge: draftCount + notSentPlateCount + unacceptedCount + issueCount > 0
          ? draftCount + notSentPlateCount + unacceptedCount + issueCount
          : undefined,
        badgeColor: 'bg-amber-500 text-white'
      },
      ...(appConfig?.features?.salesOrder ? [{
        id: 'designer_queue',
        label: 'Mẫu chờ ghép in',
        icon: Layers,
        badgeColor: 'bg-amber-500 text-white'
      }] : []),
      {
        id: 'drafts',
        label: 'Chưa gửi cho thợ',
        icon: Clock,
        badge: draftCount > 0 ? draftCount : undefined,
        badgeColor: 'bg-amber-500 text-white'
      },
      {
        id: 'not_sent_plate',
        label: 'Chưa ra kẽm',
        icon: Layers,
        badge: notSentPlateCount > 0 ? `! ${notSentPlateCount}` : undefined,
        badgeColor: 'bg-red-500 text-white'
      },
      {
        id: 'ready_plate',
        label: 'Đã ra kẽm',
        icon: Layers,
        count: readyPlateCount
      },
      {
        id: 'all',
        label: 'Tất cả lệnh in',
        icon: ClipboardList,
        count: orders.length
      },
      {
        id: 'unaccepted',
        label: 'Chờ thợ nhận',
        icon: AlertCircle,
        badge: unacceptedCount > 0 ? unacceptedCount : undefined,
        badgeColor: 'bg-orange-500 text-white'
      },
      {
        id: 'printing',
        label: 'Đang in',
        icon: Printer,
        count: printingCount
      },
      {
        id: 'finishing',
        label: 'Gia công',
        icon: Scissors,
        count: finishingCount
      },
      {
        id: 'issue',
        label: 'Có vấn đề',
        icon: AlertCircle,
        badge: issueCount > 0 ? issueCount : undefined,
        badgeColor: 'bg-red-600 text-white animate-pulse'
      }
    ];
  };

  const navItems = getNavItems();

  if (appConfig?.features?.warehouseDispatch && canOperateWarehouse(currentUser)) {
    navItems.push({
      id: 'finished_goods',
      label: 'Thành phẩm',
      icon: CheckSquare, // Using CheckSquare or Package, let's use Package if available, otherwise FileText
      // no count needed for now
    });
    navItems.push({
      id: 'dispatches',
      label: 'Xuất hàng',
      icon: Send, // Using Send
    });
  }

  if (appConfig?.features?.shipping && canOperateWarehouse(currentUser)) {
    navItems.push({
      id: 'shipping',
      label: 'Giao hàng',
      icon: Truck, 
    });
  }

  return (
    <aside className="w-64 bg-white border-r border-neutral-200/80 shrink-0 hidden lg:flex flex-col justify-between p-3.5 select-none">
      <div className="space-y-3">

        {/* Navigation items */}
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Quản Lý Sản Xuất
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-amber-500/10 text-amber-900 font-semibold'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600' : 'text-neutral-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
                {item.count !== undefined && !item.badge && (
                  <span className="text-xs text-neutral-400 font-semibold">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

{/* Secondary Modules */}
        {appConfig?.features?.customer && (
          <div className="pt-3 border-t border-neutral-100 space-y-1">
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Khách Hàng & Kho
            </p>
            
            <button
              onClick={() => setActiveTab('customers')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'customers'
                  ? 'bg-amber-500/10 text-amber-900 font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className={`w-4 h-4 ${activeTab === 'customers' ? 'text-amber-600' : 'text-amber-500'}`} />
                <span>Khách hàng (CRM)</span>
              </div>
            </button>
          </div>
        )}
        
        {appConfig?.features?.salesOrder && (
          <div className="pt-3 border-t border-neutral-100 space-y-1">
            <button
              onClick={() => setActiveTab('salesOrders')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                activeTab === 'salesOrders'
                  ? 'bg-amber-500/10 text-amber-900 font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileText className={`w-4 h-4 ${activeTab === 'salesOrders' ? 'text-amber-600' : 'text-amber-500'}`} />
                <span>Đơn hàng Sale</span>
              </div>
            </button>
          </div>
        )}

        <div className="pt-3 border-t border-neutral-100 space-y-1">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${activeTab === 'guide' ? 'bg-amber-500/10 text-amber-900 font-semibold' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'}`}
          >
            <div className="flex items-center gap-2.5"><CircleHelp className={`w-4 h-4 ${activeTab === 'guide' ? 'text-amber-600' : 'text-amber-500'}`} /><span>Hướng dẫn</span></div>
          </button>
        </div>
        
        <div className="pt-3 border-t border-neutral-100 space-y-1">
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
            Tiện Ích & Kho Mẫu
          </p>
          
          <button
            onClick={() => setIsLibraryModalOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-amber-500" />
              <span>Thư viện mẫu đã in</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded">
              In lại
            </span>
          </button>

          {!isAppInstalled && (
            <button
              onClick={() => setIsInstallModalOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-neutral-700 bg-amber-50/50 hover:bg-amber-100/70 hover:text-neutral-900 border border-amber-200/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4 text-amber-600 animate-bounce" />
                <span className="font-semibold text-neutral-800">Cài đặt app vào máy</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-500 text-white font-black rounded uppercase">
                PWA
              </span>
            </button>
          )}

          {canManageWorkshopSettings(currentUser, appConfig) && (
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-neutral-400" />
              <span>Cài đặt xưởng in</span>
            </button>
          )}

          {canManageCustomer(currentUser) && (
            <button
              onClick={() => setIsCustomerImportModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-900 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Import Khách Hàng</span>
            </button>
          )}
        </div>

      </div>

      {/* User Status Card */}
      <div className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            <ResolvedImage
              image={currentUser.avatarImage}
              legacyUrl={safeAvatarSrc(currentUser.avatar, currentUser.name)}
              alt={currentUser.name}
              className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-xs"
              referrerPolicy="no-referrer"
              onError={(event) => handleAvatarImageError(event, currentUser.name)}
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-neutral-900 truncate">
              {currentUser.name}
            </p>
            <p className="text-[11px] text-neutral-500 truncate capitalize">
              {currentUser.role === 'DEVELOPER' ? 'Developer' : currentUser.role === 'ADMIN' ? 'Admin xưởng' : currentUser.role === 'MANAGER' ? 'Quản lý (Sếp)' : currentUser.role === 'PRINTER' ? 'Thợ in' : currentUser.role === 'DESIGNER' ? 'Thiết kế' : currentUser.role === 'FINISHER' ? 'Tổ gia công' : currentUser.role === 'SALE' ? 'Kinh doanh' : currentUser.role === 'WAREHOUSE' ? 'Kho' : 'Quản lý'}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            if (isProduction) {
              logout();
            } else {
              setIsLoginModalOpen(true);
            }
          }}
          className="p-1.5 hover:bg-neutral-200 rounded-xl text-neutral-500 hover:text-neutral-900 transition-colors cursor-pointer"
          title="Đăng xuất"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
