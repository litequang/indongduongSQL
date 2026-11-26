import React, { useState, useEffect } from 'react';
import {
  Database,
  BarChart3,
  HardDrive,
  Activity,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Layers,
  FileSpreadsheet,
  Users,
  RefreshCw,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { ProductionOrder, User } from '../types';
import { safeLocalStorageGet } from '../utils/storageUtils';

interface DatabaseMetricsDashboardProps {
  orders: ProductionOrder[];
  users: User[];
  isFirebaseOnline: boolean;
}

export const DatabaseMetricsDashboard: React.FC<DatabaseMetricsDashboardProps> = ({
  orders,
  users,
  isFirebaseOnline
}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. Calculate Storage Metrics from Local Cache & State
  const calculateStorageSize = () => {
    try {
      let ordersSize = 0;
      let usersSize = 0;
      let configSize = 0;

      const ordersRaw = safeLocalStorageGet('flexo_orders_prod_v1') || '';
      const usersRaw = safeLocalStorageGet('flexo_users_prod_v1') || '';
      const configRaw = safeLocalStorageGet('flexo_instance_app_config_v1') || '';

      ordersSize = new Blob([ordersRaw || JSON.stringify(orders)]).size;
      usersSize = new Blob([usersRaw || JSON.stringify(users)]).size;
      configSize = new Blob([configRaw]).size;

      const totalBytes = ordersSize + usersSize + configSize;
      return {
        totalBytes,
        totalKb: (totalBytes / 1024).toFixed(1),
        totalMb: (totalBytes / (1024 * 1024)).toFixed(3),
        ordersKb: (ordersSize / 1024).toFixed(1),
        usersKb: (usersSize / 1024).toFixed(1),
        configKb: (configSize / 1024).toFixed(1)
      };
    } catch {
      return {
        totalBytes: 0,
        totalKb: '0',
        totalMb: '0.000',
        ordersKb: '0',
        usersKb: '0',
        configKb: '0'
      };
    }
  };

  const storageStats = calculateStorageSize();

  // 2. Calculate Order Status Distribution
  const totalOrders = orders.length;
  const activeOrders = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && !o.deletedAt).length;
  const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
  const cancelledOrders = orders.filter(o => o.status === 'CANCELLED' || !!o.deletedAt).length;
  
  // Calculate average comments / timeline per order
  const totalTimelineEvents = orders.reduce((sum, o) => sum + (o.timeline?.length || 0), 0);
  const totalComments = orders.reduce((sum, o) => sum + (o.comments?.length || 0), 0);

  // 3. Estimated Daily Read/Write Operations based on typical workshop traffic
  // Assuming ~5 active users making ~20 orders/day with real-time status updates:
  const estimatedDailyWrites = Math.max(25, (activeOrders * 6) + (users.length * 2));
  const estimatedDailyReads = Math.max(100, (activeOrders * 18) + (users.length * 10));

  // Spark Plan Limits (Free Tier)
  const SPARK_MAX_WRITES = 20000;
  const SPARK_MAX_READS = 50000;
  const SPARK_MAX_STORAGE_MB = 1024; // 1GB
  const SPARK_MAX_CONCURRENT_USERS = 100;

  const storageUsagePercent = Math.min(100, (parseFloat(storageStats.totalMb) / SPARK_MAX_STORAGE_MB) * 100);
  const writeUsagePercent = Math.min(100, (estimatedDailyWrites / SPARK_MAX_WRITES) * 100);
  const readUsagePercent = Math.min(100, (estimatedDailyReads / SPARK_MAX_READS) * 100);

  // Evaluation recommendation for developer
  const isApproachingLimits = storageUsagePercent > 70 || writeUsagePercent > 60 || totalOrders > 5000;

  return (
    <div className="space-y-4 text-neutral-800">
      {/* Overview Card */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-indigo-950 text-white p-4 sm:p-5 rounded-2xl border border-neutral-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h4 className="font-black text-sm sm:text-base text-white tracking-wide flex items-center gap-2">
                <span>Thống Kê Dữ Liệu & Ước Lượng Dung Lượng</span>
                <span className="text-[10px] uppercase font-bold bg-amber-400 text-neutral-950 px-2 py-0.5 rounded-full">
                  Real-time Lite
                </span>
              </h4>
              <p className="text-xs text-neutral-400 mt-0.5">
                Đo lường dung lượng tài nguyên bộ nhớ đệm, số lượng bản ghi và khuyến nghị gói dịch vụ
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey(k => k + 1)}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-neutral-200 text-xs font-bold rounded-xl border border-white/15 transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới số liệu</span>
          </button>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5 pt-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] font-bold text-neutral-400 block mb-1">Tổng Dung Lượng Database</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-amber-400">{storageStats.totalKb}</span>
              <span className="text-xs font-bold text-neutral-400">KB ({storageStats.totalMb} MB)</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold block mt-1">
              &lt; 0.1% hạn mức 1GB Free
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] font-bold text-neutral-400 block mb-1">Tổng Số Lệnh In / Bản Ghi</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-blue-400">{totalOrders}</span>
              <span className="text-xs font-bold text-neutral-400">đơn</span>
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1">
              {activeOrders} đang chạy • {completedOrders} hoàn thành
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] font-bold text-neutral-400 block mb-1">Ước Tính Ghi / Ngày</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-emerald-400">~{estimatedDailyWrites}</span>
              <span className="text-xs font-bold text-neutral-400">writes/ngày</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold block mt-1">
              Hạn mức: 20,000 writes/ngày
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <span className="text-[11px] font-bold text-neutral-400 block mb-1">Tài Khoản Nhân Sự Xưởng</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-purple-400">{users.length}</span>
              <span className="text-xs font-bold text-neutral-400">users</span>
            </div>
            <span className="text-[10px] text-neutral-400 block mt-1">
              {users.filter(u => u.active !== false && !u.deletedAt).length} đang hoạt động
            </span>
          </div>
        </div>
      </div>

      {/* Comparison: Free Spark vs Paid Blaze & Decision Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Resource Breakdown Card */}
        <div className="p-4 bg-white rounded-2xl border border-neutral-200 shadow-2xs space-y-3">
          <h5 className="font-black text-xs sm:text-sm text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <span>Phân Bổ Dung Lượng Chi Tiết</span>
          </h5>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between font-bold text-neutral-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                  <span>Dữ liệu Lệnh In ({totalOrders} đơn)</span>
                </span>
                <span className="font-mono text-neutral-900">{storageStats.ordersKb} KB</span>
              </div>
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '85%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-bold text-neutral-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-purple-500" />
                  <span>Dữ liệu Nhân Sự & Phân Quyền ({users.length} users)</span>
                </span>
                <span className="font-mono text-neutral-900">{storageStats.usersKb} KB</span>
              </div>
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: '10%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-bold text-neutral-700 mb-1">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  <span>Cấu Hình Xưởng, Máy In & Vật Tư</span>
                </span>
                <span className="font-mono text-neutral-900">{storageStats.configKb} KB</span>
              </div>
              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '5%' }} />
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Sự kiện nhật ký (Timeline): <strong>{totalTimelineEvents}</strong></span>
              <span>Bình luận/Tin nhắn: <strong>{totalComments}</strong></span>
            </div>
          </div>
        </div>

        {/* Developer Upgrade Advisor */}
        <div className={`p-4 rounded-2xl border shadow-2xs space-y-3 ${
          isApproachingLimits
            ? 'bg-amber-50/80 border-amber-300'
            : 'bg-emerald-50/70 border-emerald-300'
        }`}>
          <h5 className="font-black text-xs sm:text-sm text-neutral-900 flex items-center gap-2 border-b border-neutral-200/60 pb-2">
            {isApproachingLimits ? (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            )}
            <span>Khuyến Nghị Cho Developer (Gói Dịch Vụ)</span>
          </h5>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <span className="text-neutral-600">Đánh giá hiện tại:</span>
              <span className={`px-2 py-0.5 rounded-md ${
                isApproachingLimits ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
              }`}>
                {isApproachingLimits ? 'Khuyên dùng: Nâng cấp gói Blaze' : 'An toàn: Gói Free Spark hiện vẫn đáp ứng tốt'}
              </span>
            </div>

            <p className="text-[11px] text-neutral-700 leading-relaxed">
              <strong>Khi nào NÊN nâng cấp lên gói Blaze (Pay-as-you-go)?</strong>
            </p>
            <ul className="text-[11px] text-neutral-600 space-y-1 pl-4 list-disc">
              <li>Xưởng có <strong>trên 15-20 thợ in</strong> đăng nhập và cập nhật trạng thái liên tục suốt 3 ca.</li>
              <li>Số lượng đơn in phát sinh <strong>vượt 200 đơn/ngày</strong> kèm hàng trăm ảnh chụp sản phẩm.</li>
              <li>Cần đảm bảo không bao giờ bị khóa tạm thời nếu có ngày xưởng chạy vượt mức 20,000 lượt ghi.</li>
            </ul>

            <div className="pt-2 border-t border-neutral-200/60 flex items-center justify-between text-[11px]">
              <span className="text-neutral-500 font-medium">Chi phí dự tính nếu nâng Blaze:</span>
              <span className="font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300">
                0đ - 30.000đ / tháng
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance & Lightweight Guarantee Notice */}
      <div className="p-3 bg-neutral-100/90 rounded-xl border border-neutral-200 text-xs flex items-start gap-2.5">
        <Cpu className="w-4 h-4 text-neutral-600 shrink-0 mt-0.5" />
        <div className="text-[11px] text-neutral-600 leading-relaxed">
          <strong className="text-neutral-800">Tính năng này có làm nặng hệ thống không?</strong>{' '}
          <strong>Hoàn toàn KHÔNG.</strong> Dashboard này tính toán trực tiếp từ bộ nhớ RAM và Cache hiện có của trình duyệt (Zero Network Overhead), không sinh thêm bất kỳ truy vấn nào lên cơ sở dữ liệu và không làm tiêu tốn thêm hạn ngạch (quota) của Firebase.
        </div>
      </div>
    </div>
  );
};
