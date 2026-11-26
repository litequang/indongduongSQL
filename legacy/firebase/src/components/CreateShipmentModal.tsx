import React, { useState } from 'react';
import { WarehouseDispatch, DispatchMethod } from '../types';
import { useApp } from '../context/AppContext';
import { shippingService } from '../services/shippingService';
import { X, Truck, Box, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';

interface Props {
  dispatch: WarehouseDispatch;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateShipmentModal: React.FC<Props> = ({ dispatch, onClose, onSuccess }) => {
  const { currentUser } = useApp();
  const [isSubmitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();
  
  const [method, setMethod] = useState<DispatchMethod>(dispatch.dispatchMethod === 'VIETTEL_POST' ? 'INTERNAL_DELIVERY' : (dispatch.dispatchMethod || 'INTERNAL_DELIVERY'));
  const [packageCount, setPackageCount] = useState(1);
  const [weight, setWeight] = useState(1000);
  const [cod, setCod] = useState(0);
  const [note, setNote] = useState('');
  
  const [receiver, setReceiver] = useState({
    name: dispatch.customerSnapshot.name,
    phone: dispatch.customerSnapshot.phone || '',
    address: dispatch.deliveryAddress || dispatch.customerSnapshot.address || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    if (!tryAcquireSubmit()) return;

    try {
      await shippingService.createShipment(
        dispatch,
        method,
        receiver,
        packageCount,
        weight,
        cod,
        note,
        currentUser.id
      );
      toast.success('Tạo vận đơn thành công!');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tạo vận đơn');
    } finally {
      releaseSubmit();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <h2 className="text-xl font-bold text-neutral-900">Tạo Vận Đơn</h2>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-neutral-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="create-shipment-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">Phương thức giao hàng</label>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as DispatchMethod)}
                  className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition-all"
                >
                  <option value="INTERNAL_DELIVERY">Giao nội bộ (Xe nhà)</option>
                  <option value="CUSTOMER_PICKUP">Khách tự lấy</option>
                  <option value="BUS">Gửi chành xe</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>
            </div>

            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-4">
              <h3 className="text-sm font-bold text-neutral-900">Thông tin người nhận</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Tên người nhận</label>
                  <input
                    type="text"
                    required
                    value={receiver.name}
                    onChange={e => setReceiver({...receiver, name: e.target.value})}
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    required
                    value={receiver.phone}
                    onChange={e => setReceiver({...receiver, phone: e.target.value})}
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-neutral-500 mb-1">Địa chỉ chi tiết</label>
                  <input
                    type="text"
                    required
                    value={receiver.address}
                    onChange={e => setReceiver({...receiver, address: e.target.value})}
                    className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1 flex items-center gap-1"><Box className="w-3 h-3"/> Số kiện</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={packageCount}
                  onChange={e => setPackageCount(parseInt(e.target.value))}
                  className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Trọng lượng (gram)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={weight}
                  onChange={e => setWeight(parseInt(e.target.value))}
                  className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Tiền thu hộ (COD)</label>
                <input
                  type="number"
                  min="0"
                  value={cod}
                  onChange={e => setCod(parseInt(e.target.value))}
                  className="w-full p-2.5 bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Ghi chú giao hàng</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                className="w-full p-3 bg-neutral-50 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-neutral-900 focus:border-neutral-900 outline-none transition-all"
                placeholder="Cho xem hàng, giao giờ hành chính..."
              />
            </div>
            
          </form>
        </div>

        <div className="p-6 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-200 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            form="create-shipment-form"
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? 'Đang xử lý...' : (
              <>
                <Truck className="w-4 h-4" />
                <span>Tạo vận đơn</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
