import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Shipment, ShipmentStatus, ReturnInspectionStatus } from '../types';
import { shipmentRepository } from '../repositories/shipmentRepository';
import { shippingService } from '../services/shippingService';
import { Package, Truck, CheckCircle2, AlertCircle, RefreshCw, XCircle, Copy, Info, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const ShippingManagement: React.FC = () => {
  const { currentUser } = useApp();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ShipmentStatus | 'ALL'>('ALL');

  // Return inspection modal
  const [inspectingShipment, setInspectingShipment] = useState<Shipment | null>(null);
  const [inspectionResult, setInspectionResult] = useState<'RESTOCKED' | 'SCRAPPED' | 'CUSTOMER_HOLD'>('RESTOCKED');
  const [inspectionNote, setInspectionNote] = useState('');
  const [isSubmittingInspection, setIsSubmittingInspection] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const data = await shipmentRepository.getAll();
      setShipments(data);
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi tải danh sách vận đơn');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpdateStatus = async (shipment: Shipment, newStatus: ShipmentStatus) => {
    if (!currentUser) return;
    try {
      await shippingService.updateStatus(shipment.id, newStatus, currentUser.id);
      toast.success('Cập nhật trạng thái thành công');
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi cập nhật trạng thái');
    }
  };

  const handleCancel = async (shipment: Shipment) => {
    if (!currentUser) return;
    if (!window.confirm('Bạn có chắc chắn muốn hủy vận đơn này?')) return;
    try {
      await shippingService.cancelShipment(shipment, currentUser.id);
      toast.success('Hủy vận đơn thành công');
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi hủy vận đơn');
    }
  };

  const handleSubmitReturnInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectingShipment || !currentUser) return;
    setIsSubmittingInspection(true);
    try {
      await shippingService.performReturnInspection(
        inspectingShipment.id,
        inspectionResult,
        inspectionNote,
        currentUser
      );
      toast.success(
        inspectionResult === 'RESTOCKED' 
          ? 'Đã kiểm tra và cộng trả lại tồn kho thành phẩm thành công!'
          : 'Đã hoàn tất xử lý biên bản hàng trả về!'
      );
      setInspectingShipment(null);
      setInspectionNote('');
      loadData();
    } catch (err: any) {
      toast.error('Lỗi xử lý kiểm hàng: ' + (err.message || ''));
    } finally {
      setIsSubmittingInspection(false);
    }
  };

  const copyTracking = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Đã copy mã vận đơn');
  };

  const filteredShipments = shipments.filter(s => activeTab === 'ALL' || s.status === activeTab);

  if (isLoading) return <div className="p-8 text-center text-neutral-500">Đang tải dữ liệu...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Quản lý Giao Hàng</h1>
          <p className="text-neutral-500 mt-1">Theo dõi và cập nhật trạng thái vận đơn</p>
        </div>
      </div>

      <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 hide-scrollbar gap-2">
        {['ALL', 'DRAFT', 'READY', 'CREATED', 'PICKUP_PENDING', 'IN_TRANSIT', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            {tab === 'ALL' ? 'Tất cả' : 
             tab === 'DRAFT' ? 'Nháp' :
             tab === 'READY' ? 'Sẵn sàng' :
             tab === 'CREATED' ? 'Đã tạo' :
             tab === 'PICKUP_PENDING' ? 'Chờ lấy' :
             tab === 'IN_TRANSIT' ? 'Đang giao' :
             tab === 'DELIVERED' ? 'Đã giao' :
             tab === 'DELIVERY_FAILED' ? 'Giao lỗi' :
             tab === 'RETURNED' ? 'Hoàn hàng' : 'Đã hủy'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500 uppercase text-[11px] font-bold tracking-wider">
              <tr>
                <th className="p-4">Mã VĐ / P.Xuất</th>
                <th className="p-4">Người nhận</th>
                <th className="p-4">Phương thức</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4">Kiểm hàng hoàn</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-xs">
              {filteredShipments.map(shipment => (
                <tr key={shipment.id} className="hover:bg-neutral-50">
                  <td className="p-4">
                    <div className="font-bold text-neutral-900">{shipment.code}</div>
                    <div className="text-xs text-neutral-500 mt-1">PX: {shipment.warehouseDispatchId.split('-')[1] || shipment.warehouseDispatchId}</div>
                    {shipment.trackingCode && (
                      <div className="flex items-center gap-1 mt-1 text-indigo-600 cursor-pointer" onClick={() => copyTracking(shipment.trackingCode!)}>
                        <Copy className="w-3 h-3" />
                        <span className="text-xs font-medium">{shipment.trackingCode}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="font-medium">{shipment.receiverSnapshot.name}</div>
                    <div className="text-xs text-neutral-500">{shipment.receiverSnapshot.phone}</div>
                    <div className="text-xs text-neutral-500 truncate max-w-[200px]">{shipment.receiverSnapshot.address}</div>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700">
                      <Truck className="w-3.5 h-3.5" />
                      {shipment.method}
                    </span>
                    {shipment.shippingFee ? (
                      <div className="text-xs font-medium text-amber-600 mt-1">Phí: {shipment.shippingFee.toLocaleString()}đ</div>
                    ) : null}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      shipment.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                      shipment.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                      shipment.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-700' :
                      shipment.status === 'RETURNED' ? 'bg-purple-100 text-purple-800' :
                      shipment.status === 'RETURNING' ? 'bg-orange-100 text-orange-800' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {shipment.status}
                    </span>
                  </td>
                  <td className="p-4">
                    {shipment.status === 'RETURNED' ? (
                      <div>
                        {shipment.returnInspectionStatus === 'RESTOCKED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Đã nhập lại kho
                          </span>
                        ) : shipment.returnInspectionStatus === 'SCRAPPED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700">
                            <XCircle className="w-3 h-3" /> Hàng hỏng / Hủy
                          </span>
                        ) : shipment.returnInspectionStatus === 'CUSTOMER_HOLD' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" /> Giữ chờ khách
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setInspectingShipment(shipment);
                              setInspectionResult('RESTOCKED');
                              setInspectionNote('');
                            }}
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          >
                            <RotateCcw className="w-3 h-3" /> Kiểm & Nhập kho
                          </button>
                        )}
                        {shipment.returnInspectedByName && (
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            @{shipment.returnInspectedByName}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400 text-[11px]">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {shipment.status !== 'DELIVERED' && shipment.status !== 'CANCELLED' && shipment.status !== 'RETURNED' && (
                        <>
                          <button 
                            onClick={() => handleUpdateStatus(shipment, 'DELIVERED')}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Xác nhận đã giao"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          {(shipment.method === 'INTERNAL_DELIVERY' || shipment.method === 'BUS' || shipment.method === 'OTHER') && shipment.status !== 'IN_TRANSIT' && (
                            <button 
                              onClick={() => handleUpdateStatus(shipment, 'IN_TRANSIT')}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Bắt đầu giao"
                            >
                              <Truck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateStatus(shipment, 'RETURNED')}
                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors cursor-pointer"
                            title="Đánh dấu hoàn hàng về kho (RETURNED)"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleCancel(shipment)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Hủy đơn"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredShipments.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    Không có vận đơn nào
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return Inspection Dialog */}
      {inspectingShipment && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-neutral-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-neutral-900">
                  Kiểm Hàng Hoàn Về #{inspectingShipment.code}
                </h3>
                <p className="text-xs text-neutral-500">
                  Khách: {inspectingShipment.receiverSnapshot.name}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitReturnInspection} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Kết quả kiểm tra hàng hóa (*):
                </label>
                <select
                  value={inspectionResult}
                  onChange={(e) => setInspectionResult(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:border-purple-500 font-bold outline-none"
                >
                  <option value="RESTOCKED">Nhập lại kho thành phẩm (Hàng nguyên vẹn, tăng tồn kho)</option>
                  <option value="SCRAPPED">Hàng lỗi / Hư hỏng / Tiêu hủy (Không tăng tồn kho)</option>
                  <option value="CUSTOMER_HOLD">Giữ lưu kho chờ khách xử lý tiếp</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Ghi chú kiểm hàng / Lý do:
                </label>
                <textarea
                  rows={3}
                  placeholder="VD: Kiểm đếm đầy đủ 1000 túi, bao bì còn mới nguyên..."
                  value={inspectionNote}
                  onChange={(e) => setInspectionNote(e.target.value)}
                  className="w-full p-3 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:border-purple-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectingShipment(null)}
                  className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInspection}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingInspection ? 'Đang lưu...' : 'Xác nhận xử lý'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
