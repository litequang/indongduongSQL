import React, { useState, useEffect } from 'react';
import { WarehouseDispatch } from '../types';
import { warehouseDispatchRepository } from '../repositories/warehouseDispatchRepository';
import { warehouseDispatchService } from '../services/warehouseDispatchService';
import { useApp } from '../context/AppContext';
import { Search, Filter, CheckCircle2, AlertTriangle, Send, Eye, XCircle } from 'lucide-react';
import { CreateShipmentModal } from './CreateShipmentModal';
import { canConfirmWarehouseDispatch } from '../permissions';

export const WarehouseDispatchManagement: React.FC = () => {
  const [dispatches, setDispatches] = useState<WarehouseDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, appConfig } = useApp();
  const [activeDispatch, setActiveDispatch] = useState<WarehouseDispatch | null>(null);
  const [showShipmentModal, setShowShipmentModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await warehouseDispatchRepository.getAll(100);
      setDispatches(data.dispatches);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (dispatch: WarehouseDispatch) => {
    if (dispatch.status !== 'DRAFT') return;
    if (!window.confirm(`Xác nhận xuất hàng phiếu ${dispatch.code}? Số lượng sẽ được trừ vào thành phẩm.`)) return;

    try {
      await warehouseDispatchService.confirmDispatch(dispatch.id, currentUser?.id || 'system');
      loadData();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi xác nhận xuất hàng');
    }
  };

  const handleReverse = async (dispatch: WarehouseDispatch) => {
    if (dispatch.status !== 'DISPATCHED') return;
    
    const reason = window.prompt('Nhập lý do hủy/hoàn phiếu xuất này:');
    if (!reason) return;

    try {
      await warehouseDispatchService.reverseDispatch(dispatch.id, currentUser?.id || 'system', reason);
      loadData();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi hủy phiếu xuất');
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Danh sách Phiếu xuất</h1>
          <p className="text-neutral-500">Quản lý các phiếu xuất kho (Nháp & Đã xuất)</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-neutral-500 text-sm border-b border-neutral-200">
                  <th className="p-4 font-medium">Mã phiếu</th>
                  <th className="p-4 font-medium">Khách hàng</th>
                  <th className="p-4 font-medium">Phương thức</th>
                  <th className="p-4 font-medium">Ngày tạo</th>
                  <th className="p-4 font-medium text-center">Trạng thái</th>
                  <th className="p-4 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {dispatches.map(dispatch => (
                  <tr key={dispatch.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-neutral-900">{dispatch.code}</div>
                      <div className="text-sm text-neutral-500 text-xs mt-1">SO: {dispatch.salesOrderId}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-neutral-900">{dispatch.customerSnapshot?.name}</div>
                      <div className="text-sm text-neutral-500">{dispatch.deliveryAddress || dispatch.customerSnapshot?.address}</div>
                    </td>
                    <td className="p-4 text-neutral-600">
                      {dispatch.dispatchMethod === 'VIETTEL_POST' ? 'Viettel Post' :
                       dispatch.dispatchMethod === 'INTERNAL_DELIVERY' ? 'Giao nội bộ' :
                       dispatch.dispatchMethod === 'CUSTOMER_PICKUP' ? 'Khách tự lấy' :
                       dispatch.dispatchMethod === 'BUS' ? 'Gửi xe khách' : 'Khác'}
                    </td>
                    <td className="p-4 text-neutral-600">
                      {new Date(dispatch.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        dispatch.status === 'DISPATCHED' ? 'bg-green-100 text-green-700' :
                        dispatch.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {dispatch.status === 'DRAFT' ? 'NHÁP' : dispatch.status === 'DISPATCHED' ? 'ĐÃ XUẤT' : 'ĐÃ HỦY'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        {dispatch.status === 'DRAFT' && canConfirmWarehouseDispatch(currentUser) && (
                          <button
                            onClick={() => handleConfirm(dispatch)}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium transition-colors"
                            title="Xác nhận xuất kho"
                          >
                            Xác nhận xuất
                          </button>
                        )}
                          
                        {dispatch.status === 'DISPATCHED' && canConfirmWarehouseDispatch(currentUser) && (
                          <button 
                            onClick={() => handleReverse(dispatch)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 rounded bg-neutral-100 hover:bg-red-50 transition-colors"
                            title="Hủy/Hoàn phiếu xuất"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {dispatch.status === 'DISPATCHED' && appConfig.features.shipping && (
                            <button
                              onClick={() => {
                                setActiveDispatch(dispatch);
                                setShowShipmentModal(true);
                              }}
                              className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 text-xs font-medium transition-colors"
                            >
                              Tạo vận đơn
                            </button>
                        )}


                      </div>
                    </td>
                  </tr>
                ))}
                
                {dispatches.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-neutral-500">
                      Không có dữ liệu phiếu xuất
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showShipmentModal && activeDispatch && (
        <CreateShipmentModal
          dispatch={activeDispatch}
          onClose={() => setShowShipmentModal(false)}
          onSuccess={() => {
            setShowShipmentModal(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};
