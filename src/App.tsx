import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { useAuth } from './context/AuthContext';
import { getAuthGateMode } from './utils/authInitializationState';
import { getLoginBranding } from './config/loginBranding';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { DashboardOverview } from './components/DashboardOverview';
import { QuickOrderComposer } from './components/QuickOrderComposer';
import { RoleWorkspaceBanner } from './components/RoleWorkspaceBanner';
import { OrderCard } from './components/OrderCard';
import { CreateOrderModal } from './components/CreateOrderModal';
import { OrderDetailModal } from './components/OrderDetailModal';
import { IssueReportModal } from './components/IssueReportModal';
import { PrintCompletionModal } from './components/PrintCompletionModal';
import { FinishingHandoffModal } from './components/FinishingHandoffModal';
import { LibraryModal } from './components/LibraryModal';
import { SettingsModal } from './components/SettingsModal';
import { InstallAppModal } from './components/InstallAppModal';
import { ImageViewerModal } from './components/ImageViewerModal';
import { UserManagementModal } from './components/UserManagementModal';
import { UserProfileModal } from './components/UserProfileModal';
import { LoginModal } from './components/LoginModal';
import { BootstrapFirstRun } from './components/BootstrapFirstRun';
import { bootstrapService } from './services/bootstrapService';
import { BatchActionBar } from './components/BatchActionBar';
import { DemoSandboxFloatingBar } from './components/DemoSandboxFloatingBar';
import { CustomerImportModal } from './features/customer-import/CustomerImportModal';
import { CustomerManagement } from './components/CustomerManagement';
import { SalesOrderManagement } from './components/SalesOrderManagement';
import { DesignerQueue } from './components/DesignerQueue';

import { FinishedGoodsManagement } from './components/FinishedGoodsManagement';
import { WarehouseDispatchManagement } from './components/WarehouseDispatchManagement';
import { FinishingTasksManagement } from './components/FinishingTasksManagement';
import { UserGuidePage } from './components/UserGuidePage';

import { ShippingManagement } from './components/ShippingManagement';


import { ProductionOrder, ProductionStatus, PlateStatus } from './types';
import {
  Plus,
  Filter,
  Search,
  Layers,
  Printer,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  Clock,
  LayoutGrid,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Send,
  ChevronLeft,
  ChevronRight,
  Calendar,
  SlidersHorizontal,
  X,
  ArrowUp,
  Building2,
  FileText
} from 'lucide-react';
import { canViewReports } from './permissions';

const MainContent: React.FC = () => {
  const {
    currentUser,
    orders,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    filterPaper,
    setFilterPaper,
    filterPrinter,
    setFilterPrinter,
    setIsCreateModalOpen,
    users,
    selectedOrderIds,
    selectAllOrders,
    clearSelectedOrders,
    isProfileModalOpen,
    setIsProfileModalOpen,
    isCustomerImportModalOpen,
    setIsCustomerImportModalOpen,
    isLibraryModalOpen,
    appConfig,
    isLoadingHistory,
    hasMoreHistory,
    loadMoreHistory,
    searchHistoryByCode,
    isDemoActive
  } = useApp();
  const isStandaloneWorkflowTab = ['customers', 'salesOrders', 'designer_queue', 'finished_goods', 'dispatches', 'shipping', 'finishing', 'guide'].includes(activeTab);

  // Dynamic paper types from appConfig
  const availablePaperTypes = React.useMemo(() => {
    const list = appConfig?.production?.paperTypes?.length
      ? appConfig.production.paperTypes
      : ['Kraft', 'OP', 'MG', 'Fort', 'Duplex', 'BB', 'Ivory', 'Couche'];
    return ['ALL', ...list];
  }, [appConfig]);

  // Dynamic document title and PWA manifest injection
  React.useEffect(() => {
    if (appConfig?.company?.name) {
      const companyName = appConfig.company.name;
      const shortName = appConfig.company.shortName || companyName;
      
      document.title = companyName;

      const updateManifest = async () => {
        try {
          const manifestElement = document.querySelector('link[rel="manifest"]');
          if (!manifestElement) return;
          
          const currentHref = manifestElement.getAttribute('href');
          if (!currentHref || currentHref.startsWith('blob:')) return;

          const res = await fetch(currentHref);
          const manifest = await res.json();
          
          manifest.name = companyName;
          manifest.short_name = shortName;
          
          const blob = new Blob([JSON.stringify(manifest)], {type: 'application/manifest+json'});
          const newHref = URL.createObjectURL(blob);
          manifestElement.setAttribute('href', newHref);
        } catch (e) {
          console.error('Lỗi cập nhật manifest PWA:', e);
        }
      };

      updateManifest();
    }
  }, [appConfig?.company?.name, appConfig?.company?.shortName]);

  // Sub-modal states for fast interactions from cards
  const [activeIssueOrder, setActiveIssueOrder] = useState<ProductionOrder | null>(null);
  const [activeFinishPrintOrder, setActiveFinishPrintOrder] = useState<ProductionOrder | null>(null);
  const [activeFinishingOrder, setActiveFinishingOrder] = useState<ProductionOrder | null>(null);

  // Quick Plate & Dispatch Filter inside the order list
  const [filterPlateOrDispatch, setFilterPlateOrDispatch] = useState<'ALL' | 'DRAFT' | 'NOT_SENT' | 'READY' | 'UNACCEPTED' | 'PRINTING' | 'FINISHING' | 'COMPLETED' | 'ISSUE'>('ALL');
  const [printerFilterStatus, setPrinterFilterStatus] = useState<'ALL' | 'WAITING' | 'PRINTING' | 'PRINTED' | 'ISSUE'>('ALL');
  const [finisherFilterStatus, setFinisherFilterStatus] = useState<'ALL' | 'WAITING' | 'FINISHING' | 'COMPLETED'>('ALL');
  const [saleFilterStatus, setSaleFilterStatus] = useState<'ALL' | 'PRINTING' | 'FINISHING' | 'COMPLETED'>('ALL');

  // Date Filter State
  const [dateFilterMode, setDateFilterMode] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [customFilterDate, setCustomFilterDate] = useState('');

  // Pagination State
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Scroll to top state
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 300) {
      setShowScrollTop(true);
    } else {
      setShowScrollTop(false);
    }
  };

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Reset pagination when any filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterPaper, filterPrinter, filterPlateOrDispatch, printerFilterStatus, finisherFilterStatus, saleFilterStatus, dateFilterMode, customFilterDate, activeTab]);

  // Accordion Expand/Collapse state
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const toggleOrderExpand = (id: string) => {
    setExpandedOrders(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleToggleExpandAll = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    orders.forEach(o => {
      next[o.id] = expand;
    });
    setExpandedOrders(next);
  };

  const areAllExpanded = orders.length > 0 && orders.every(o => !!expandedOrders[o.id]);

  // Role-specific counts
  // Printer
  const myPrinterOrders = orders.filter(o => o.printerId === currentUser.id && o.status !== 'DRAFT');
  const myPrinterWaitingCount = myPrinterOrders.filter(o => o.status === 'WAITING_ACCEPTANCE' || o.status === 'WAITING_PRINT' || o.status === 'ACCEPTED').length;
  const myPrinterPrintingCount = myPrinterOrders.filter(o => o.status === 'PRINTING').length;
  const myPrinterPrintedCount = myPrinterOrders.filter(o => o.status === 'PRINTED' || o.status === 'FINISHING' || o.status === 'COMPLETED').length;
  const myPrinterIssueCount = myPrinterOrders.filter(o => o.issues?.some(i => i.status === 'OPEN')).length;

  // Finisher
  const finisherOrders = orders.filter(o => o.status === 'PRINTED' || o.status === 'FINISHING' || o.status === 'COMPLETED');
  const finisherWaitingCount = finisherOrders.filter(o => o.status === 'PRINTED').length;
  const finisherWorkingCount = finisherOrders.filter(o => o.status === 'FINISHING').length;
  const finisherCompletedCount = finisherOrders.filter(o => o.status === 'COMPLETED').length;

  // Sale
  const saleOrders = orders.filter(o => o.status !== 'DRAFT');
  const salePrintingCount = saleOrders.filter(o => o.status === 'PRINTING').length;
  const saleFinishingCount = saleOrders.filter(o => o.status === 'FINISHING' || o.status === 'PRINTED').length;
  const saleCompletedCount = saleOrders.filter(o => o.status === 'COMPLETED').length;

  // Designer
  const designerOrders = orders.filter(o => currentUser.role !== 'DESIGNER' || o.createdBy === currentUser.id || o.status !== 'DRAFT');
  const designerDraftCount = orders.filter(o => o.status === 'DRAFT').length;
  const designerNotSentPlateCount = orders.filter(o => o.plateStatus === 'NOT_SENT').length;
  const designerReadyPlateCount = orders.filter(o => (o.plateStatus === 'SENT' || o.plateStatus === 'RECEIVED' || o.plateStatus === 'OLD_PLATE') && o.status !== 'DRAFT').length;
  const designerUnacceptedCount = orders.filter(o => o.status === 'WAITING_ACCEPTANCE').length;
  const designerPrintingCount = orders.filter(o => o.status === 'PRINTING').length;

  // Filter Orders
  const filteredOrders = orders.filter((order) => {
    // -------------------------------------------------------------
    // STRICT ROLE ISOLATION PIPELINE:
    // Only show orders that have arrived at or belong to the user's operational role
    // -------------------------------------------------------------

    // 1. PRINTER STRICT ISOLATION: Printer ONLY sees non-draft orders assigned to themselves
    if (currentUser.role === 'PRINTER') {
      if (order.printerId !== currentUser.id) return false;
      if (order.status === 'DRAFT') return false;

      // In-page quick status filter for printer
      if (printerFilterStatus === 'WAITING' && !(order.status === 'WAITING_ACCEPTANCE' || order.status === 'WAITING_PRINT' || order.status === 'ACCEPTED')) {
        return false;
      }
      if (printerFilterStatus === 'PRINTING' && order.status !== 'PRINTING') {
        return false;
      }
      if (printerFilterStatus === 'PRINTED' && !(order.status === 'PRINTED' || order.status === 'FINISHING' || order.status === 'COMPLETED')) {
        return false;
      }
      if (printerFilterStatus === 'ISSUE' && !(order.issues?.some(i => i.status === 'OPEN'))) {
        return false;
      }
    }

    // 2. FINISHER STRICT ISOLATION: Finisher ONLY sees orders that have finished printing (PRINTED, FINISHING, COMPLETED)
    if (currentUser.role === 'FINISHER') {
      if (order.status !== 'PRINTED' && order.status !== 'FINISHING' && order.status !== 'COMPLETED') {
        return false;
      }

      // In-page quick status filter for finisher
      if (finisherFilterStatus === 'WAITING' && order.status !== 'PRINTED') {
        return false;
      }
      if (finisherFilterStatus === 'FINISHING' && order.status !== 'FINISHING') {
        return false;
      }
      if (finisherFilterStatus === 'COMPLETED' && order.status !== 'COMPLETED') {
        return false;
      }
    }

    // 3. SALE: Only orders in production (exclude unpublished designer drafts)
    if (currentUser.role === 'SALE') {
      if (order.status === 'DRAFT') return false;

      // In-page quick status filter for sale
      if (saleFilterStatus === 'PRINTING' && order.status !== 'PRINTING') {
        return false;
      }
      if (saleFilterStatus === 'FINISHING' && !(order.status === 'FINISHING' || order.status === 'PRINTED')) {
        return false;
      }
      if (saleFilterStatus === 'COMPLETED' && order.status !== 'COMPLETED') {
        return false;
      }
    }

    // 4. DESIGNER & ADMIN / DEVELOPER: In-page filter
    if (currentUser.role === 'DESIGNER' || currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER') {
      if (filterPlateOrDispatch === 'DRAFT' && order.status !== 'DRAFT') {
        return false;
      }
      if (filterPlateOrDispatch === 'NOT_SENT' && order.plateStatus !== 'NOT_SENT') {
        return false;
      }
      if (filterPlateOrDispatch === 'READY' && (order.plateStatus === 'NOT_SENT' || order.status === 'DRAFT')) {
        return false;
      }
      if (filterPlateOrDispatch === 'UNACCEPTED' && order.status !== 'WAITING_ACCEPTANCE') {
        return false;
      }
      if (filterPlateOrDispatch === 'PRINTING' && order.status !== 'PRINTING') {
        return false;
      }
      if (filterPlateOrDispatch === 'FINISHING' && !(order.status === 'FINISHING' || order.status === 'PRINTED')) {
        return false;
      }
      if (filterPlateOrDispatch === 'COMPLETED' && order.status !== 'COMPLETED') {
        return false;
      }
      if (filterPlateOrDispatch === 'ISSUE' && !(order.issues?.some(i => i.status === 'OPEN'))) {
        return false;
      }
    }

    // -------------------------------------------------------------
    // Common Filters
    // -------------------------------------------------------------

    // Text Search (Code, Sapo Code, Tags, Customer name, Product, Printer, Note, Paper)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const codeMatch = order.code.toLowerCase().includes(q);
      const sapoMatch = (order.sapoCode || '').toLowerCase().includes(q);
      const tagsMatch = order.tags?.some(t => t.toLowerCase().includes(q)) || false;
      const productMatch = (order.productName || '').toLowerCase().includes(q);
      const reprintMatch = (order.reprintFromCode || '').toLowerCase().includes(q);
      const plateDateMatch = (order.originalPlateDate || order.plateDate || '').toLowerCase().includes(q);
      const printerMatch = order.printerName.toLowerCase().includes(q);
      const designerMatch = (order.createdByName || order.designerName || '').toLowerCase().includes(q);
      const paperMatch = `${order.paperType} ${order.paperGsm}`.toLowerCase().includes(q);
      const noteMatch = (order.note || '').toLowerCase().includes(q);
      const itemMatch = order.items.some(
        it => (it.customerName || '').toLowerCase().includes(q) || (it.productName || '').toLowerCase().includes(q)
      );

      if (!codeMatch && !sapoMatch && !tagsMatch && !productMatch && !reprintMatch && !plateDateMatch && !printerMatch && !designerMatch && !paperMatch && !noteMatch && !itemMatch) {
        return false;
      }
    }

    // Date Range Filter
    if (dateFilterMode !== 'ALL') {
      const orderDate = new Date(order.createdAt || order.plateDate || Date.now());
      const now = new Date();

      if (dateFilterMode === 'TODAY') {
        if (orderDate.toDateString() !== now.toDateString()) return false;
      } else if (dateFilterMode === 'YESTERDAY') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (orderDate.toDateString() !== yesterday.toDateString()) return false;
      } else if (dateFilterMode === 'THIS_WEEK') {
        const startOfWeek = new Date(now);
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        if (orderDate < startOfWeek) return false;
      } else if (dateFilterMode === 'THIS_MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (orderDate < startOfMonth) return false;
      } else if (dateFilterMode === 'CUSTOM' && customFilterDate) {
        const targetDateStr = new Date(customFilterDate).toDateString();
        if (orderDate.toDateString() !== targetDateStr) return false;
      }
    }

    // Paper filter
    if (filterPaper !== 'ALL' && order.paperType !== filterPaper) {
      return false;
    }

    // Printer filter (for Designer/Admin)
    if ((currentUser.role === 'DESIGNER' || currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER') && filterPrinter !== 'ALL' && order.printerId !== filterPrinter) {
      return false;
    }

    // Tab filter
    switch (activeTab) {
      case 'overview':
        return true;
      case 'my_work':
        if (currentUser.role === 'PRINTER') {
          return order.printerId === currentUser.id && order.status !== 'COMPLETED';
        }
        if (currentUser.role === 'DESIGNER') {
          return (
            order.status === 'DRAFT' ||
            order.plateStatus === 'NOT_SENT' ||
            order.status === 'WAITING_ACCEPTANCE' ||
            order.issues?.some(i => i.status === 'OPEN')
          );
        }
        if (currentUser.role === 'FINISHER') {
          return order.status === 'FINISHING' || order.status === 'PRINTED';
        }
        if (currentUser.role === 'SALE') {
          return order.status !== 'COMPLETED';
        }
        return true;
      case 'drafts':
        return order.status === 'DRAFT';
      case 'not_sent_plate':
        return order.plateStatus === 'NOT_SENT';
      case 'ready_plate':
        return (order.plateStatus === 'SENT' || order.plateStatus === 'RECEIVED' || order.plateStatus === 'OLD_PLATE') && order.status !== 'DRAFT';
      case 'unaccepted':
        return order.status === 'WAITING_ACCEPTANCE';
      case 'waiting_plate':
        return order.plateStatus === 'NOT_SENT' || order.plateStatus === 'SENT';
      case 'waiting_print':
        return order.status === 'WAITING_PRINT' || order.status === 'WAITING_ACCEPTANCE' || order.status === 'ACCEPTED';
      case 'printing':
        return order.status === 'PRINTING';
      case 'printed':
        return order.status === 'PRINTED';
      case 'finishing':
        return order.status === 'FINISHING' || order.status === 'PRINTED';
      case 'completed':
        return order.status === 'COMPLETED';
      case 'issue':
        return order.issues?.some(i => i.status === 'OPEN');
      default:
        return true;
    }
  });

  // Pagination calculation
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = pageSize === 0
    ? filteredOrders
    : filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Auto-search history for exact code if no local results
  const lastSearchedRef = React.useRef<string>('');
  React.useEffect(() => {
    const q = searchQuery.trim().toUpperCase();
    if (q.length >= 3 && filteredOrders.length === 0 && lastSearchedRef.current !== q && !isDemoActive) {
      const timeout = setTimeout(() => {
         lastSearchedRef.current = q;
         searchHistoryByCode(q);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [searchQuery, filteredOrders.length, searchHistoryByCode, isDemoActive]);

  const getTabTitle = () => {
    const hasReports = canViewReports(currentUser, appConfig);

    if (currentUser.role === 'PRINTER') {
      switch (activeTab) {
        case 'overview':
          return hasReports ? 'Bàn thợ in & Thống kê' : 'Bàn thợ in';
        case 'waiting_print':
          return 'Lệnh in chờ bạn chạy máy';
        case 'printing':
          return 'Lệnh đang in trên máy';
        case 'printed':
          return 'Lệnh đã in xong (Chuyển gia công)';
        case 'my_work':
        case 'all':
          return `Tất cả lệnh in của @${currentUser.name}`;
        case 'issue':
          return 'Lệnh có sự cố bạn cần theo dõi';
        default:
          return `Lệnh in của @${currentUser.name}`;
      }
    }

    if (currentUser.role === 'FINISHER') {
      switch (activeTab) {
        case 'overview':
          return hasReports ? 'Tổng quan tổ gia công túi & Thống kê' : 'Tổng quan tổ gia công túi';
        case 'printed':
          return 'Lệnh in xong chờ nhận dán túi';
        case 'finishing':
          return 'Lệnh đang gia công / dán túi';
        case 'completed':
          return 'Lệnh đã hoàn thành đóng gói';
        case 'my_work':
        case 'all':
        default:
          return 'Tất cả lệnh chuyển qua tổ gia công';
      }
    }

    if (currentUser.role === 'SALE') {
      switch (activeTab) {
        case 'overview':
          return hasReports ? 'Tổng quan bán hàng & Thống kê' : 'Tổng quan bán hàng & Tiến độ đơn';
        case 'printing':
          return 'Đơn hàng đang in trên máy';
        case 'finishing':
          return 'Đơn hàng đang gia công dán túi';
        case 'completed':
          return 'Đơn hàng đã xong xuất xưởng';
        case 'all':
        default:
          return 'Tất cả đơn hàng đang sản xuất';
      }
    }

    if (currentUser.role === 'DESIGNER') {
      switch (activeTab) {
        case 'overview':
          return 'Bàn làm việc thiết kế & Xuất kẽm';
        case 'my_work':
          return `Việc thiết kế cần xử lý ngay`;
        case 'drafts':
          return 'Lệnh in chưa gửi thợ (Lưu tạm)';
        case 'not_sent_plate':
          return 'Lệnh in CHƯA RA KẼM (Cần gửi nhà kẽm)';
        case 'ready_plate':
          return 'Lệnh in ĐÃ RA KẼM (Sẵn sàng in)';
        case 'unaccepted':
          return 'Lệnh in chờ thợ xác nhận';
        case 'printing':
          return 'Lệnh đang in trên máy';
        case 'all':
        default:
          return 'Tất cả lệnh thiết kế đã tạo';
      }
    }

    switch (activeTab) {
      case 'overview':
        return 'Tổng quan & Bảng số liệu xưởng';
      case 'my_work':
        return `Việc cần làm của ${currentUser.name}`;
      case 'drafts':
        return 'Lệnh in chưa gửi cho thợ (Lưu tạm)';
      case 'not_sent_plate':
        return 'Lệnh in CHƯA RA KẼM (Cần gửi nhà kẽm)';
      case 'ready_plate':
        return 'Lệnh in ĐÃ RA KẼM (Sẵn sàng in)';
      case 'unaccepted':
        return 'Lệnh in chờ thợ xác nhận';
      case 'waiting_plate':
        return 'Danh sách lệnh chờ kẽm in';
      case 'waiting_print':
        return 'Lệnh đã sẵn sàng in';
      case 'printing':
        return 'Các lệnh đang chạy trên máy in';
      case 'printed':
        return 'Các lệnh đã in xong';
      case 'finishing':
        return 'Các lệnh in xong chờ & đang gia công';
      case 'completed':
        return 'Lệnh in đã hoàn thành xuất xưởng';
      case 'issue':
        return 'Danh sách lệnh có sự cố cần xử lý';
      default:
        return 'Tất cả lệnh sản xuất túi bánh mì';
    }
  };

  const getTabSubtitle = () => {
    if (currentUser.role === 'PRINTER') {
      switch (activeTab) {
        case 'waiting_print':
          return 'Kiểm tra khổ giấy, màu mực, kẽm in và bấm Bắt đầu in';
        case 'printing':
          return 'Cập nhật tiến độ hoặc bấm Hoàn thành in để chuyển gia công';
        case 'printed':
          return 'Các lệnh đã in xong và đã bàn giao cho tổ gia công dán đáy/cắt xén';
        case 'issue':
          return 'Các lệnh có phản hồi báo sự cố đang được xử lý';
        default:
          return `Hiển thị ${filteredOrders.length} lệnh sản xuất được giao cho bạn`;
      }
    }

    if (currentUser.role === 'FINISHER') {
      switch (activeTab) {
        case 'printed':
          return 'Các đơn máy in đã in xong và bàn giao cho tổ gia công nhận làm';
        case 'finishing':
          return 'Các đơn đang tiến hành dán đáy, bế quai, dán băng keo nắp túi';
        case 'completed':
          return 'Các đơn đã gia công xong và đóng thùng hoàn tất';
        default:
          return `Hiển thị ${filteredOrders.length} đơn gia công`;
      }
    }

    if (currentUser.role === 'SALE') {
      switch (activeTab) {
        case 'printing':
          return 'Các đơn xưởng in đang chạy máy';
        case 'finishing':
          return 'Các đơn xưởng đang dán túi và đóng gói';
        case 'completed':
          return 'Các đơn đã hoàn thành có thể xuất xưởng giao khách';
        default:
          return `Hiển thị ${filteredOrders.length} đơn hàng`;
      }
    }

    switch (activeTab) {
      case 'my_work':
        return 'Bao gồm lệnh nháp chờ phát, kẽm chưa gửi, và các sự cố';
      case 'drafts':
        return 'Draft đang lưu trên thiết bị. Chọn nhiều lệnh rồi GỬI SANG SẢN XUẤT; mỗi draft được gửi độc lập và lỗi một lệnh không chặn các lệnh còn lại.';
      case 'not_sent_plate':
        return 'Các lệnh chưa gửi kẽm cho nhà kẽm, cần gửi gấp hoặc theo dõi.';
      case 'ready_plate':
        return 'Các lệnh đã ra kẽm, có kẽm cũ hoặc đã nhận kẽm tại xưởng.';
      case 'waiting_plate':
        return 'Không được để sót một lệnh nào chưa gửi kẽm cho nhà kẽm';
      default:
        return `Hiển thị ${filteredOrders.length} lệnh sản xuất`;
    }
  };

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 flex flex-col overflow-y-auto bg-neutral-100/50 pb-40 lg:pb-32"
    >
      
      <main className="max-w-7xl w-full mx-auto p-3 sm:p-6 space-y-6">
        
        {/* ROLE-SPECIFIC WORKSPACE BANNER (Only on sub-tabs as quick status strip) */}
        
        {activeTab === 'finished_goods' && (
          <FinishedGoodsManagement />
        )}
        
        {activeTab === 'dispatches' && (
          <WarehouseDispatchManagement />
        )}

        {activeTab === 'shipping' && (
          <ShippingManagement />
        )}

        {activeTab === 'finishing' && (
          <FinishingTasksManagement />
        )}

        {activeTab === 'guide' && <UserGuidePage />}

        {activeTab === 'customers' && (
          appConfig?.features?.customer ? (
            <CustomerManagement />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mb-4">
                <Building2 className="w-8 h-8 text-neutral-400" />
              </div>
              <h2 className="text-lg font-bold text-neutral-900 mb-2">Tính năng chưa được bật</h2>
              <p className="text-sm text-neutral-500 max-w-sm">
                Module Khách hàng hiện đang được tắt. Quản trị viên có thể bật tính năng này trong phần cài đặt.
              </p>
              <button
                onClick={() => setActiveTab('overview')}
                className="mt-6 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition-colors"
              >
                Về Tổng Quan
              </button>
            </div>
          )
        )}

        {activeTab === 'salesOrders' && (
          appConfig?.features?.salesOrder ? (
            <SalesOrderManagement />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-neutral-400" />
              </div>
              <h2 className="text-lg font-bold text-neutral-900 mb-2">Tính năng chưa được bật</h2>
              <p className="text-sm text-neutral-500 max-w-sm">
                Module Đơn hàng hiện đang được tắt. Quản trị viên có thể bật tính năng này trong phần cài đặt.
              </p>
              <button
                onClick={() => setActiveTab('overview')}
                className="mt-6 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition-colors"
              >
                Về Tổng Quan
              </button>
            </div>
          )
        )}
        
        {activeTab === 'designer_queue' && (
          appConfig?.features?.salesOrder ? (
            <DesignerQueue />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mb-4">
                <Layers className="w-8 h-8 text-neutral-400" />
              </div>
              <h2 className="text-lg font-bold text-neutral-900 mb-2">Tính năng chưa được bật</h2>
              <p className="text-sm text-neutral-500 max-w-sm">
                Tính năng này yêu cầu bật module Đơn hàng Sale.
              </p>
              <button
                onClick={() => setActiveTab('overview')}
                className="mt-6 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition-colors"
              >
                Về Tổng Quan
              </button>
            </div>
          )
        )}
        
        {activeTab !== 'overview' && !isStandaloneWorkflowTab && (
          <RoleWorkspaceBanner
            onOpenIssueModal={(id) => {
              const target = orders.find(o => o.id === id);
              if (target) setActiveIssueOrder(target);
            }}
            onOpenFinishPrintModal={(id) => {
              const target = orders.find(o => o.id === id);
              if (target) setActiveFinishPrintOrder(target);
            }}
          />
        )}

        {/* QUICK ORDER COMPOSER - For Designer, Admin/Manager */}
        {!isStandaloneWorkflowTab && (currentUser.role === 'DESIGNER' || currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER') && (
          <QuickOrderComposer />
        )}

        {/* If in overview tab, show unified streamlined dashboard */}
        {activeTab === 'overview' && (
          <DashboardOverview
            onOpenIssueModal={(id) => {
              const target = orders.find(o => o.id === id);
              if (target) setActiveIssueOrder(target);
            }}
            onOpenFinishPrintModal={(id) => {
              const target = orders.find(o => o.id === id);
              if (target) setActiveFinishPrintOrder(target);
            }}
          />
        )}

        {/* Tab Header & Filter Bar */}
        {activeTab !== 'overview' && !isStandaloneWorkflowTab && (
          <div className="space-y-4">
            
            {/* Header Title */}
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200/80 shadow-xs">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-neutral-900 tracking-tight">
                  {getTabTitle()}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5 font-medium">
                  {getTabSubtitle()}
                </p>
              </div>
            </div>

            {/* UNIFIED STREAMLINED DROPDOWN FILTER TOOLBAR */}
            <div className="bg-white/90 backdrop-blur-md p-3.5 sm:p-4 rounded-3xl border border-neutral-200/80 shadow-xs space-y-3">
              
              {/* Dropdown Filters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                
                {/* 1. STATUS FILTER DROPDOWN */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
                    {currentUser.role === 'PRINTER' ? 'Trạng thái in' : currentUser.role === 'FINISHER' ? 'Trạng thái gia công' : currentUser.role === 'SALE' ? 'Tiến độ đơn' : 'Lọc toàn xưởng'}
                  </label>
                  
                  {currentUser.role === 'PRINTER' ? (
                    <select
                      value={printerFilterStatus}
                      onChange={(e) => setPrinterFilterStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                    >
                      <option value="ALL">📋 Tất cả lệnh của tôi ({myPrinterOrders.length})</option>
                      <option value="WAITING">⏳ Chờ in ({myPrinterWaitingCount})</option>
                      <option value="PRINTING">🖨️ Đang in ({myPrinterPrintingCount})</option>
                      <option value="PRINTED">✅ Đã in xong ({myPrinterPrintedCount})</option>
                      {myPrinterIssueCount > 0 && <option value="ISSUE">⚠️ Sự cố ({myPrinterIssueCount})</option>}
                    </select>
                  ) : currentUser.role === 'FINISHER' ? (
                    <select
                      value={finisherFilterStatus}
                      onChange={(e) => setFinisherFilterStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-purple-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                    >
                      <option value="ALL">📋 Tất cả đơn gia công ({finisherOrders.length})</option>
                      <option value="WAITING">✂️ Chờ nhận dán ({finisherWaitingCount})</option>
                      <option value="FINISHING">📦 Đang gia công ({finisherWorkingCount})</option>
                      <option value="COMPLETED">✅ Đã đóng gói xong ({finisherCompletedCount})</option>
                    </select>
                  ) : currentUser.role === 'SALE' ? (
                    <select
                      value={saleFilterStatus}
                      onChange={(e) => setSaleFilterStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                    >
                      <option value="ALL">📋 Tất cả đơn sản xuất ({saleOrders.length})</option>
                      <option value="PRINTING">🖨️ Đang in ({salePrintingCount})</option>
                      <option value="FINISHING">✂️ Đang gia công ({saleFinishingCount})</option>
                      <option value="COMPLETED">✅ Hoàn thành ({saleCompletedCount})</option>
                    </select>
                  ) : (
                    <select
                      value={filterPlateOrDispatch}
                      onChange={(e) => setFilterPlateOrDispatch(e.target.value as any)}
                      className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                    >
                      <option value="ALL">🌐 Tất cả trạng thái ({orders.length})</option>
                      <option value="DRAFT">📝 Bản nháp ({designerDraftCount})</option>
                      <option value="NOT_SENT">🔴 Chưa ra kẽm ({designerNotSentPlateCount})</option>
                      <option value="READY">🟢 Đã ra kẽm ({designerReadyPlateCount})</option>
                      <option value="UNACCEPTED">🟠 Chờ thợ nhận ({designerUnacceptedCount})</option>
                      <option value="PRINTING">🖨️ Đang in máy ({designerPrintingCount})</option>
                      <option value="FINISHING">✂️ Đang gia công ({finisherWorkingCount + finisherWaitingCount})</option>
                      <option value="COMPLETED">✅ Đã hoàn tất ({finisherCompletedCount})</option>
                      <option value="ISSUE">⚠️ Có sự cố</option>
                    </select>
                  )}
                </div>

                {/* 2. DYNAMIC PAPER FILTER DROPDOWN */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    Loại giấy ({availablePaperTypes.length - 1} loại)
                  </label>
                  <select
                    value={filterPaper}
                    onChange={(e) => setFilterPaper(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                  >
                    {availablePaperTypes.map((paper) => (
                      <option key={paper} value={paper}>
                        {paper === 'ALL' ? '📜 Tất cả loại giấy' : `📄 Giấy ${paper}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. PRINTER FILTER DROPDOWN (For Designer / Finisher / Admin / Developer) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5 text-amber-500" />
                    Thợ phụ trách
                  </label>
                  {currentUser.role === 'PRINTER' ? (
                    <div className="px-3 py-2 bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-600 truncate">
                      👤 {currentUser.name} (Chính bạn)
                    </div>
                  ) : (
                    <select
                      value={filterPrinter}
                      onChange={(e) => setFilterPrinter(e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                    >
                      <option value="ALL">👥 Tất cả thợ in</option>
                      {users
                        .filter(u => u.role === 'PRINTER')
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            🖨️ {u.name}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {/* 4. DATE RANGE FILTER */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    Thời gian tạo lệnh
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={dateFilterMode}
                      onChange={(e) => setDateFilterMode(e.target.value as any)}
                      className="flex-1 px-3 py-2 bg-neutral-50 hover:bg-neutral-100/80 border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 focus:bg-white outline-hidden cursor-pointer transition-all"
                    >
                      <option value="ALL">🗓️ Tất cả thời gian</option>
                      <option value="TODAY">⚡ Hôm nay</option>
                      <option value="YESTERDAY">⏮️ Hôm qua</option>
                      <option value="THIS_WEEK">📅 Tuần này</option>
                      <option value="THIS_MONTH">📊 Tháng này</option>
                      <option value="CUSTOM">🎯 Chọn ngày cụ thể...</option>
                    </select>

                    {dateFilterMode === 'CUSTOM' && (
                      <input
                        type="date"
                        value={customFilterDate}
                        onChange={(e) => setCustomFilterDate(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-xl text-xs font-bold text-neutral-800 focus:ring-2 focus:ring-amber-400 outline-hidden"
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* Reset all filters button */}
              {(filterPaper !== 'ALL' || filterPrinter !== 'ALL' || dateFilterMode !== 'ALL' || searchQuery !== '' || filterPlateOrDispatch !== 'ALL' || printerFilterStatus !== 'ALL' || finisherFilterStatus !== 'ALL' || saleFilterStatus !== 'ALL') && (
                <div className="flex justify-end pt-2 border-t border-neutral-100 mt-2">
                  <button
                    onClick={() => {
                      setFilterPaper('ALL');
                      setFilterPrinter('ALL');
                      setDateFilterMode('ALL');
                      setCustomFilterDate('');
                      setSearchQuery('');
                      setFilterPlateOrDispatch('ALL');
                      setPrinterFilterStatus('ALL');
                      setFinisherFilterStatus('ALL');
                      setSaleFilterStatus('ALL');
                    }}
                    className="px-2.5 py-1 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Xóa bộ lọc</span>
                  </button>
                </div>
              )}

            </div>

          </div>
        )}

        {/* Orders Accordion List */}
        {activeTab !== 'overview' && !isStandaloneWorkflowTab && (
          <div className="space-y-3">
            
            {/* Accordion Toolbar: Count + Batch Select + Page Size + Expand/Collapse All */}
            {filteredOrders.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-neutral-500 font-semibold bg-white/60 p-2 rounded-2xl border border-neutral-200/60 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-neutral-700 font-bold">
                    {pageSize === 0 ? (
                      `Hiển thị tất cả ${filteredOrders.length} lệnh`
                    ) : (
                      `Hiển thị ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredOrders.length)} / ${filteredOrders.length} lệnh`
                    )}
                  </span>

                  {/* Page Size Selector */}
                  <div className="flex items-center gap-1 pl-2 border-l border-neutral-200">
                    <span className="text-neutral-400 font-medium">Trang:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-0.5 bg-white border border-neutral-200 rounded-md text-xs font-bold text-neutral-800 focus:border-amber-500 outline-hidden cursor-pointer"
                    >
                      <option value={10}>10 lệnh / trang</option>
                      <option value={20}>20 lệnh / trang</option>
                      <option value={50}>50 lệnh / trang</option>
                      <option value={100}>100 lệnh / trang</option>
                      <option value={0}>Tất cả</option>
                    </select>
                  </div>

                  {/* Bulk Select all filtered / visible / Deselect button */}
                  {(currentUser.role === 'DEVELOPER' || currentUser.role === 'ADMIN' || currentUser.role === 'DESIGNER' || currentUser.role === 'MANAGER') && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const allFilteredIds = filteredOrders.map(o => o.id);
                          const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedOrderIds.includes(id));
                          if (allSelected) {
                            clearSelectedOrders();
                          } else {
                            selectAllOrders(allFilteredIds);
                          }
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs"
                        title="Chọn tất cả các lệnh theo danh sách đang lọc"
                      >
                        {filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id)) ? (
                          <>
                            <Square className="w-3.5 h-3.5" />
                            <span>Bỏ chọn tất cả ({filteredOrders.length})</span>
                          </>
                        ) : (
                          <>
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Chọn tất cả ({filteredOrders.length} lệnh)</span>
                          </>
                        )}
                      </button>

                      {pageSize > 0 && filteredOrders.length > pageSize && (
                        <button
                          onClick={() => {
                            const visibleIds = paginatedOrders.map(o => o.id);
                            const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrderIds.includes(id));
                            if (allVisibleSelected) {
                              clearSelectedOrders();
                            } else {
                              selectAllOrders(visibleIds);
                            }
                          }}
                          className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs border border-neutral-200"
                          title="Chỉ chọn các lệnh hiển thị trên trang này"
                        >
                          <span>Trang ({paginatedOrders.length})</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleExpandAll(!areAllExpanded)}
                    className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-neutral-700 font-bold rounded-lg border border-neutral-200 shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>{areAllExpanded ? 'Thu gọn tất cả ▲' : 'Mở rộng tất cả ▼'}</span>
                  </button>
                </div>
              </div>
            )}

            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-neutral-200/80 shadow-xs space-y-3">
                <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto text-2xl text-amber-600">
                  🥖
                </div>
                <h3 className="text-base font-bold text-neutral-800">
                  Không có lệnh in nào phù hợp
                </h3>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  {searchQuery ? `Không tìm thấy kết quả cho "${searchQuery}"` : 'Tất cả các công việc trong mục này đã được hoàn tất gọn gàng!'}
                </p>
                {(currentUser.role === 'DESIGNER' || currentUser.role === 'ADMIN') && (
                  <button
                    onClick={() => {
                      const el = document.getElementById('quick-order-composer');
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        const input = el.querySelector('input');
                        if (input) {
                          input.focus();
                          input.classList.add('ring-4', 'ring-amber-400');
                          setTimeout(() => input.classList.remove('ring-4', 'ring-amber-400'), 1500);
                        }
                      }
                    }}
                    className="mt-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                    Tạo lệnh in ngay
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {paginatedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isExpanded={expandedOrders[order.id] || false}
                    onToggleExpand={() => toggleOrderExpand(order.id)}
                    onOpenIssueModal={(ord) => setActiveIssueOrder(ord)}
                    onOpenFinishPrintModal={(ord) => setActiveFinishPrintOrder(ord)}
                    onOpenFinishingModal={(ord) => setActiveFinishingOrder(ord)}
                  />
                ))}
                
                {/* Load More History Button */}
                {!isDemoActive && hasMoreHistory && (
                  <button
                    onClick={loadMoreHistory}
                    disabled={isLoadingHistory}
                    className="w-full mt-4 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 rounded-2xl font-bold text-sm transition-all border border-neutral-200 shadow-xs flex items-center justify-center gap-2"
                  >
                    {isLoadingHistory ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                        Đang tải...
                      </span>
                    ) : (
                      <>Tải thêm lệnh cũ (Lịch sử)</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Pagination Navigation Footer */}
            {pageSize > 0 && totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-neutral-200/80 shadow-xs text-xs font-semibold">
                <span className="text-neutral-500">
                  Trang <b className="text-neutral-900">{currentPage}</b> / <b>{totalPages}</b>
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-neutral-50 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed border border-neutral-200 rounded-xl font-bold text-neutral-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Trước</span>
                  </button>

                  {/* Page number buttons */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, idx, arr) => {
                      const prevP = arr[idx - 1];
                      const showEllipsis = prevP && p - prevP > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="px-1 text-neutral-400">...</span>}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className={`w-8 h-8 rounded-xl font-bold transition-all border cursor-pointer ${
                              currentPage === p
                                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 bg-neutral-50 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed border border-neutral-200 rounded-xl font-bold text-neutral-700 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Tiếp</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* SCROLL TO TOP BUTTON */}
      <button
        onClick={scrollToTop}
        title="Cuộn lên đầu trang"
        className={`fixed bottom-40 lg:bottom-24 right-4 lg:right-8 z-40 p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center bg-white text-neutral-500 hover:bg-neutral-50 hover:text-amber-600 border border-neutral-200/60 ${
          showScrollTop 
            ? "opacity-100 translate-y-0" 
            : "opacity-0 translate-y-8 pointer-events-none"
        }`}
      >
        <ArrowUp className="w-6 h-6" />
      </button>

      {/* FLOATING BATCH ACTION BAR */}
      <BatchActionBar />

      {/* MODALS */}
      <CreateOrderModal />
      <OrderDetailModal
        onOpenIssueModal={(ord) => setActiveIssueOrder(ord)}
        onOpenFinishPrintModal={(ord) => setActiveFinishPrintOrder(ord)}
        onOpenFinishingModal={(ord) => setActiveFinishingOrder(ord)}
      />
      <IssueReportModal
        order={activeIssueOrder}
        onClose={() => setActiveIssueOrder(null)}
      />
      <PrintCompletionModal
        order={activeFinishPrintOrder}
        onClose={() => setActiveFinishPrintOrder(null)}
      />
      <FinishingHandoffModal
        order={activeFinishingOrder}
        onClose={() => setActiveFinishingOrder(null)}
      />
      {isLibraryModalOpen && <LibraryModal />}
      <SettingsModal />
      <InstallAppModal />
      <ImageViewerModal />
      <UserManagementModal />
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
      {isCustomerImportModalOpen && (
        <CustomerImportModal onClose={() => setIsCustomerImportModalOpen(false)} />
      )}
    </div>
  );
};

const AuthSplash: React.FC = () => {
  const branding = getLoginBranding();
  return <main data-auth-screen="initializing" className="min-h-[100dvh] bg-neutral-950 text-white grid place-items-center p-6">
    <section className="w-full max-w-sm text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-400 text-neutral-950 grid place-items-center shadow-lg">
        <Printer className="w-7 h-7" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-black tracking-tight text-xl">{branding.companyName}</h1>
        <p className="mt-2 text-sm text-neutral-300" aria-live="polite">Đang xác thực...</p>
      </div>
      <div className="mx-auto h-1.5 w-28 overflow-hidden rounded-full bg-neutral-800" aria-hidden="true">
        <div className="h-full w-1/2 rounded-full bg-amber-400 animate-pulse" />
      </div>
    </section>
  </main>;
};

const AccountResolutionError: React.FC = () => {
  const { authResolutionError, retryFirebaseProfile, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const error = authResolutionError;
  const branding = getLoginBranding();

  if (!error) return <AuthSplash />;

  const retry = async () => {
    setBusy(true);
    try {
      await retryFirebaseProfile();
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main data-auth-screen="account-error" className="min-h-[100dvh] bg-neutral-950 text-white grid place-items-center p-6">
      <section className="w-full max-w-md rounded-3xl bg-white text-neutral-900 overflow-hidden shadow-2xl">
        <div className="px-6 py-5 bg-neutral-950 text-white">
          <p className="text-xs font-bold tracking-[0.16em] text-amber-300">{branding.appName}</p>
          <h1 className="mt-2 text-xl font-black">Không thể mở phiên làm việc</h1>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4" role="alert">
            <p className="font-extrabold text-red-900">{error.title}</p>
            <p className="mt-1 text-sm leading-6 text-red-800">{error.message}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={retry} disabled={busy} className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-amber-300 disabled:opacity-50">
              {busy ? 'Đang kiểm tra...' : 'Thử lại'}
            </button>
            {error.code !== 'FIREBASE_UNAVAILABLE' && (
              <button type="button" onClick={signOut} disabled={busy} className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-bold text-neutral-700 disabled:opacity-50">
                Đăng xuất
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

const BootstrapGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<'CHECKING' | 'NEEDS_SETUP' | 'INITIALIZED'>('CHECKING');

  React.useEffect(() => {
    let current = true;
    void bootstrapService.getStatus()
      .then((result) => { if (current) setState(result.needsSetup ? 'NEEDS_SETUP' : 'INITIALIZED'); })
      // Existing deployments which have not received the new function must
      // continue to expose their normal login page during a rolling deploy.
      .catch(() => { if (current) setState('INITIALIZED'); });
    return () => { current = false; };
  }, []);

  if (state === 'CHECKING') return <AuthSplash />;
  if (state === 'NEEDS_SETUP') return <BootstrapFirstRun onComplete={() => setState('INITIALIZED')} />;
  return <>{children}</>;
};

const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isDemoActive, isSessionLocked, isLoginModalOpen, isDeveloperDemoPreviewReady } = useApp();
  const { authInitializationState, firebaseProfile, authResolutionError } = useAuth();
  const gate = getAuthGateMode({
    authInitializationState,
    hasResolvedBusinessProfile: Boolean(firebaseProfile),
    hasResolutionError: Boolean(authResolutionError),
    isDemoActive,
  });

  if (isDemoActive && (isSessionLocked || isLoginModalOpen)) return <LoginModal />;
  if (gate === 'SPLASH') return <AuthSplash />;
  if (gate === 'ACCOUNT_ERROR') return <AccountResolutionError />;
  if (!isDemoActive && !isDeveloperDemoPreviewReady) return <AuthSplash />;
  if (gate === 'LOGIN') return <BootstrapGate><LoginModal /></BootstrapGate>;
  return <>{children}</>;
};

const AppShell: React.FC = () => {
  const { isRolePreviewActive } = useApp();
  const previewLockClass = isRolePreviewActive ? 'pointer-events-none select-none' : '';

  return (
    <div className="h-[100dvh] bg-neutral-100 flex flex-col font-sans text-neutral-900 antialiased selection:bg-amber-500 selection:text-white">
      {/* The Demo banner stays interactive. Every production-data surface is
          inert during role preview, so visible workflow controls are safely
          presentation-only. */}
      <div inert={isRolePreviewActive} className={previewLockClass}>
        <Navbar />
      </div>

      <DemoSandboxFloatingBar />

      <div inert={isRolePreviewActive} className={`flex-1 flex overflow-hidden min-h-0 ${previewLockClass}`}>
        <Sidebar />
        <MainContent />
      </div>

      <div inert={isRolePreviewActive} className={previewLockClass}>
        <MobileNav />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AuthGate>
        <AppShell />
      </AuthGate>
    </AppProvider>
  );
}
