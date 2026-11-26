import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Customer } from '../types';
import { customerService } from '../services/customerService';
import { normalizePhone } from '../features/customer-import/customerNormalizer';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';

interface Props {
  customer?: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}

export const CreateCustomerModal: React.FC<Props> = ({ customer, onClose, onSaved }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    province: '',
    district: '',
    ward: '',
    zalo: '',
    facebook: '',
    note: ''
  });
  
  const [isSubmitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();
  const [duplicateWarning, setDuplicateWarning] = useState<Customer | null>(null);
  const [forceCreate, setForceCreate] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
        province: customer.province || '',
        district: customer.district || '',
        ward: customer.ward || '',
        zalo: customer.zalo || '',
        facebook: customer.facebook || '',
        note: customer.note || ''
      });
    }
  }, [customer]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError('');
    if (duplicateWarning) {
      setDuplicateWarning(null);
      setForceCreate(false);
    }
  };

  const checkDuplicate = async (phone: string) => {
    const norm = normalizePhone(phone);
    if (!norm) return null;
    const existing = await customerService.findExistingCustomersByPhones([norm]);
    if (existing.length > 0) {
      // If editing, ignore self
      if (customer) {
        const others = existing.filter(e => e.id !== customer.id);
        if (others.length > 0) return others[0];
        return null;
      }
      return existing[0];
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Tên khách hàng là bắt buộc');
      return;
    }

    if (!tryAcquireSubmit()) return;
    try {
      // Duplicate detection
      if (!forceCreate && formData.phone) {
        const dup = await checkDuplicate(formData.phone);
        if (dup) {
          setDuplicateWarning(dup);
          releaseSubmit();
          return;
        }
      }

      if (customer) {
        await customerService.updateCustomer(customer.id, formData);
      } else {
        await customerService.createCustomer({
          ...formData,
          source: 'MANUAL',
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi lưu khách hàng');
    } finally {
      releaseSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <h3 className="text-lg font-black text-neutral-900">
            {customer ? 'Sửa Thông Tin Khách' : 'Thêm Khách Hàng Mới'}
          </h3>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto">
          <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm font-medium rounded-xl border border-red-100 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            
            {duplicateWarning && !forceCreate && (
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200/60 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">Phát hiện trùng lặp!</h4>
                    <p className="text-xs text-amber-700 mt-1">Số điện thoại này có thể thuộc về một khách hàng đã có trong hệ thống:</p>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-amber-100 text-xs text-neutral-700 font-medium">
                  <div className="font-bold text-neutral-900">{duplicateWarning.name}</div>
                  <div>Mã KH: {duplicateWarning.code}</div>
                  <div>SĐT: {duplicateWarning.phone}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForceCreate(true)} className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">
                    VẪN TẠO MỚI
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Tên khách hàng <span className="text-red-500">*</span></label>
              <input
                autoFocus
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="VD: Nguyễn Văn A"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Số điện thoại</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="VD: 0901234567"
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Địa chỉ</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Số nhà, tên đường..."
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Tỉnh/TP</label>
                <input
                  type="text"
                  name="province"
                  value={formData.province}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Quận/Huyện</label>
                <input
                  type="text"
                  name="district"
                  value={formData.district}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Phường/Xã</label>
                <input
                  type="text"
                  name="ward"
                  value={formData.ward}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Zalo</label>
                <input
                  type="text"
                  name="zalo"
                  value={formData.zalo}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Facebook</label>
                <input
                  type="text"
                  name="facebook"
                  value={formData.facebook}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-600 uppercase mb-1.5">Ghi chú</label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:bg-white outline-hidden resize-none"
              ></textarea>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-neutral-100 flex justify-end gap-3 bg-neutral-50/50 mt-auto">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-200/50 rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            form="customer-form"
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>{customer ? 'Cập nhật' : 'Lưu khách hàng'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
