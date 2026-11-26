import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Layers,
  Printer,
  User,
  TrendingUp,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Scissors,
  FileSpreadsheet
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductionOrder } from '../types';

export const ProductionStatistics: React.FC = () => {
  const { orders, users, appConfig } = useApp();

  const [timeRange, setTimeRange] = useState<'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'all' | 'custom'>('this_week');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedPrinterFilter, setSelectedPrinterFilter] = useState('ALL');
  const [selectedPaperFilter, setSelectedPaperFilter] = useState('ALL');

  // Filter orders by time range
  const filteredOrders = useMemo(() => {
    const now = new Date();
    
    return orders.filter(order => {
      if (order.status === 'DRAFT') return false;

      const orderDate = new Date(order.createdAt || order.plateDate || Date.now());

      // Time Range Filtering
      if (timeRange === 'today') {
        const isToday = orderDate.toDateString() === now.toDateString();
        if (!isToday) return false;
      } else if (timeRange === 'this_week') {
        const startOfWeek = new Date(now);
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        if (orderDate < startOfWeek) return false;
      } else if (timeRange === 'last_week') {
        const startOfThisWeek = new Date(now);
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        startOfThisWeek.setDate(diff);
        startOfThisWeek.setHours(0, 0, 0, 0);

        const startOfLastWeek = new Date(startOfThisWeek);
        startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

        if (orderDate < startOfLastWeek || orderDate >= startOfThisWeek) return false;
      } else if (timeRange === 'this_month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (orderDate < startOfMonth) return false;
      } else if (timeRange === 'last_month') {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        if (orderDate < startOfLastMonth || orderDate > endOfLastMonth) return false;
      } else if (timeRange === 'custom') {
        if (customStartDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          if (orderDate < start) return false;
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (orderDate > end) return false;
        }
      }

      // Printer Filter
      if (selectedPrinterFilter !== 'ALL' && order.printerId !== selectedPrinterFilter) {
        return false;
      }

      // Paper Filter
      if (selectedPaperFilter !== 'ALL' && order.paperType !== selectedPaperFilter) {
        return false;
      }

      return true;
    });
  }, [orders, timeRange, customStartDate, customEndDate, selectedPrinterFilter, selectedPaperFilter]);

  // General Metrics
  const totalSheets = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.actualPrintedSheets || o.totalSheets || 0), 0);
  }, [filteredOrders]);

  const completedOrders = useMemo(() => {
    return filteredOrders.filter(o => o.status === 'COMPLETED' || o.status === 'PRINTED' || o.status === 'FINISHING');
  }, [filteredOrders]);

  const completedSheets = useMemo(() => {
    return completedOrders.reduce((sum, o) => sum + (o.actualPrintedSheets || o.totalSheets || 0), 0);
  }, [completedOrders]);

  const issueOrdersCount = useMemo(() => {
    return filteredOrders.filter(o => o.issues?.some(i => i.status === 'OPEN')).length;
  }, [filteredOrders]);

  // Metrics grouped by Printer
  const printerStats = useMemo(() => {
    const statsMap: Record<string, {
      printerId: string;
      printerName: string;
      orderCount: number;
      completedCount: number;
      totalSheets: number;
      completedSheets: number;
      issueCount: number;
    }> = {};

    filteredOrders.forEach(order => {
      const pId = order.printerId || 'unassigned';
      const pName = order.printerName || 'Chưa phân công';
      if (!statsMap[pId]) {
        statsMap[pId] = {
          printerId: pId,
          printerName: pName,
          orderCount: 0,
          completedCount: 0,
          totalSheets: 0,
          completedSheets: 0,
          issueCount: 0
        };
      }
      statsMap[pId].orderCount += 1;
      const sheets = order.actualPrintedSheets || order.totalSheets || 0;
      statsMap[pId].totalSheets += sheets;

      if (order.status === 'COMPLETED' || order.status === 'PRINTED' || order.status === 'FINISHING') {
        statsMap[pId].completedCount += 1;
        statsMap[pId].completedSheets += sheets;
      }

      if (order.issues?.some(i => i.status === 'OPEN')) {
        statsMap[pId].issueCount += 1;
      }
    });

    return Object.values(statsMap).sort((a, b) => b.totalSheets - a.totalSheets);
  }, [filteredOrders]);

  // Metrics grouped by Paper Type
  const paperStats = useMemo(() => {
    const statsMap: Record<string, {
      paperType: string;
      orderCount: number;
      totalSheets: number;
    }> = {};

    filteredOrders.forEach(order => {
      const pType = order.paperType || 'Kraft';
      if (!statsMap[pType]) {
        statsMap[pType] = {
          paperType: pType,
          orderCount: 0,
          totalSheets: 0
        };
      }
      statsMap[pType].orderCount += 1;
      statsMap[pType].totalSheets += (order.actualPrintedSheets || order.totalSheets || 0);
    });

    return Object.values(statsMap).sort((a, b) => b.totalSheets - a.totalSheets);
  }, [filteredOrders]);

  // Metrics grouped by Designer / Creator
  const designerStats = useMemo(() => {
    const statsMap: Record<string, {
      designerName: string;
      orderCount: number;
      totalSheets: number;
      plateReadyCount: number;
    }> = {};

    filteredOrders.forEach(order => {
      const dName = order.designerName || order.createdByName || 'Thiết kế';
      if (!statsMap[dName]) {
        statsMap[dName] = {
          designerName: dName,
          orderCount: 0,
          totalSheets: 0,
          plateReadyCount: 0
        };
      }
      statsMap[dName].orderCount += 1;
      statsMap[dName].totalSheets += (order.totalSheets || 0);
      if (order.plateStatus === 'SENT' || order.plateStatus === 'RECEIVED' || order.plateStatus === 'OLD_PLATE') {
        statsMap[dName].plateReadyCount += 1;
      }
    });

    return Object.values(statsMap).sort((a, b) => b.orderCount - a.orderCount);
  }, [filteredOrders]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Mã Đơn', 'Ngày Tạo', 'Khách Hàng / Mẫu', 'Loại Giấy', 'Định Lượng', 'Khổ Giấy', 'Màu', 'Số Lượng Tờ', 'Thợ In', 'Thiết Kế', 'Trạng Thái', 'Tình Trạng Kẽm'];
    const rows = filteredOrders.map(o => [
      `"${o.code}"`,
      `"${new Date(o.createdAt).toLocaleDateString('vi-VN')}"`,
      `"${(o.items?.[0]?.customerName || o.productName || '').replace(/"/g, '""')}"`,
      `"${o.paperType}"`,
      `"${o.paperGsm} GSM"`,
      `"${o.paperWidth}x${o.paperHeight}cm"`,
      `"${o.color}"`,
      o.totalSheets,
      `"${o.printerName}"`,
      `"${o.createdByName}"`,
      `"${o.status}"`,
      `"${o.plateStatus}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Bao_cao_san_xuat_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const availablePaperTypes = appConfig?.production?.paperTypes?.length
    ? appConfig.production.paperTypes
    : ['Kraft', 'OP', 'MG', 'Fort', 'Duplex', 'BB', 'Ivory', 'Couche'];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Header & Filter Bar */}
      <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-neutral-200/80 shadow-xs space-y-3 sm:space-y-4">
        <div className="flex items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black shadow-xs shrink-0">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-black text-neutral-900 tracking-tight leading-tight truncate">
                BÁO CÁO & THỐNG KÊ
              </h2>
              <p className="text-[10px] sm:text-xs text-neutral-500 font-medium leading-tight truncate">
                Tổng hợp theo thợ, giấy, thời gian
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[10px] sm:text-xs font-bold rounded-lg sm:rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Xuất Excel / CSV</span>
            <span className="sm:hidden">Xuất</span>
          </button>
        </div>

        {/* Filters Controls */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2.5 sm:gap-2 pt-2 border-t border-neutral-100">
          {/* Time range buttons (Scrollable on mobile) */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 -mb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {[
              { id: 'today', label: 'Hôm nay' },
              { id: 'this_week', label: 'Tuần này' },
              { id: 'last_week', label: 'Tuần trước' },
              { id: 'this_month', label: 'Tháng này' },
              { id: 'last_month', label: 'Tháng trước' },
              { id: 'all', label: 'Tất cả' },
              { id: 'custom', label: 'Tùy chọn...' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setTimeRange(tab.id as any)}
                className={`shrink-0 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all border cursor-pointer ${
                  timeRange === tab.id
                    ? 'bg-neutral-900 text-white border-neutral-950 shadow-xs'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs if selected */}
          {timeRange === 'custom' && (
            <div className="flex items-center justify-between w-full sm:w-auto gap-1.5 bg-neutral-50 p-1.5 rounded-lg border border-neutral-200 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-neutral-500 font-semibold shrink-0">Từ:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="bg-white px-1.5 py-1 border border-neutral-300 rounded w-full text-[10px] sm:text-xs font-bold outline-hidden focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-1 flex-1">
                <span className="text-neutral-500 font-semibold shrink-0">Đến:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="bg-white px-1.5 py-1 border border-neutral-300 rounded w-full text-[10px] sm:text-xs font-bold outline-hidden focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Select filters (Dropdowns) */}
          <div className="flex flex-row items-center gap-2 w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0">
            {/* Printer filter */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-1 sm:flex-none">
              <span className="text-neutral-400 font-bold shrink-0 hidden sm:inline">Thợ in:</span>
              <select
                value={selectedPrinterFilter}
                onChange={e => setSelectedPrinterFilter(e.target.value)}
                className="w-full sm:w-auto px-2 py-1.5 sm:px-2.5 sm:py-1.5 bg-white border border-neutral-200 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-neutral-800 focus:border-amber-500 outline-hidden"
              >
                <option value="ALL">Tất cả thợ</option>
                {users.filter(u => u.role === 'PRINTER').map(u => (
                  <option key={u.id} value={u.id}>@{u.name}</option>
                ))}
              </select>
            </div>

            {/* Paper filter */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs flex-1 sm:flex-none">
              <span className="text-neutral-400 font-bold shrink-0 hidden sm:inline">Giấy:</span>
              <select
                value={selectedPaperFilter}
                onChange={e => setSelectedPaperFilter(e.target.value)}
                className="w-full sm:w-auto px-2 py-1.5 sm:px-2.5 sm:py-1.5 bg-white border border-neutral-200 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold text-neutral-800 focus:border-amber-500 outline-hidden"
              >
                <option value="ALL">Tất cả giấy</option>
                {availablePaperTypes.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Orders */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-neutral-500">Tổng số lệnh in</p>
            <p className="text-2xl sm:text-3xl font-black text-neutral-900 mt-1">
              {filteredOrders.length}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Trong khoảng thời gian</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xl">
            📋
          </div>
        </div>

        {/* Total Output Sheets */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-neutral-500">Tổng sản lượng</p>
            <p className="text-2xl sm:text-3xl font-black text-amber-600 mt-1">
              {totalSheets.toLocaleString('vi-VN')}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Tờ in toàn xưởng</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-900 flex items-center justify-center font-bold text-xl">
            🖨️
          </div>
        </div>

        {/* Completed Output */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-neutral-500">Đã in hoàn tất</p>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1">
              {completedSheets.toLocaleString('vi-VN')}
            </p>
            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {totalSheets > 0 ? Math.round((completedSheets / totalSheets) * 100) : 0}% khối lượng
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xl">
            ✅
          </div>
        </div>

        {/* Issue Rate */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-200/80 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-neutral-500">Sự cố phát sinh</p>
            <p className="text-2xl sm:text-3xl font-black text-rose-600 mt-1">
              {issueOrdersCount}
            </p>
            <p className="text-[11px] text-neutral-400 mt-0.5">Lệnh có phản hồi lỗi</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xl">
            ⚠️
          </div>
        </div>
      </div>

      {/* 3. Detailed Statistics Grid: By Printer & By Paper Type */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Statistics by Printer */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                <Printer className="w-4 h-4" />
              </span>
              <h3 className="text-sm sm:text-base font-black text-neutral-900">
                Sản Lượng Theo Thợ In
              </h3>
            </div>
            <span className="text-xs font-bold text-neutral-500">
              {printerStats.length} thợ in
            </span>
          </div>

          <div className="space-y-3">
            {printerStats.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">Không có dữ liệu trong khoảng thời gian này</p>
            ) : (
              printerStats.map((stat, idx) => {
                const percentOfTotal = totalSheets > 0 ? Math.round((stat.totalSheets / totalSheets) * 100) : 0;
                return (
                  <div key={stat.printerId} className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-700 text-xs font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-neutral-900">
                          @{stat.printerName}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-black text-neutral-900">
                          {stat.totalSheets.toLocaleString('vi-VN')} tờ
                        </span>
                        <span className="text-[11px] text-neutral-500 ml-1.5">
                          ({stat.orderCount} lệnh)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden flex">
                      <div
                        className="bg-amber-500 h-full transition-all duration-500"
                        style={{ width: `${percentOfTotal}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span>Đã in xong: <b>{stat.completedSheets.toLocaleString('vi-VN')} tờ</b></span>
                      <span>Tỷ trọng: <b>{percentOfTotal}% xưởng</b></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Statistics by Paper Type */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                <Layers className="w-4 h-4" />
              </span>
              <h3 className="text-sm sm:text-base font-black text-neutral-900">
                Phân Bổ Theo Loại Giấy
              </h3>
            </div>
            <span className="text-xs font-bold text-neutral-500">
              {paperStats.length} loại giấy
            </span>
          </div>

          <div className="space-y-3">
            {paperStats.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">Không có dữ liệu trong khoảng thời gian này</p>
            ) : (
              paperStats.map((stat, idx) => {
                const percentOfTotal = totalSheets > 0 ? Math.round((stat.totalSheets / totalSheets) * 100) : 0;
                return (
                  <div key={stat.paperType} className="p-3 bg-neutral-50 rounded-2xl border border-neutral-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-200 text-amber-950 text-xs font-black">
                          {stat.paperType}
                        </span>
                        <span className="text-xs text-neutral-500 font-medium">
                          {stat.orderCount} đơn hàng
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs sm:text-sm font-black text-neutral-900">
                          {stat.totalSheets.toLocaleString('vi-VN')} tờ
                        </span>
                        <span className="text-[11px] font-bold text-amber-700 ml-1.5">
                          ({percentOfTotal}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden flex">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-orange-500 h-full transition-all duration-500"
                        style={{ width: `${percentOfTotal}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. Designer & Plate Preparation Statistics */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-100 text-purple-800 rounded-xl">
              <User className="w-4 h-4" />
            </span>
            <h3 className="text-sm sm:text-base font-black text-neutral-900">
              Thống Kê Khâu Thiết Kế & Xuất Kẽm
            </h3>
          </div>
          <span className="text-xs font-bold text-neutral-500">
            {designerStats.length} nhân sự
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {designerStats.map(d => (
            <div key={d.designerName} className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-neutral-900">
                  {d.designerName}
                </span>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-900 text-xs font-black rounded-lg">
                  {d.orderCount} lệnh tạo
                </span>
              </div>
              <div className="text-xs text-neutral-600 space-y-1 pt-1 border-t border-neutral-200">
                <div className="flex justify-between">
                  <span>Tổng số tờ:</span>
                  <span className="font-bold text-neutral-900">{d.totalSheets.toLocaleString('vi-VN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Đã chuẩn bị kẽm:</span>
                  <span className="font-bold text-emerald-700">{d.plateReadyCount} / {d.orderCount} lệnh</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
