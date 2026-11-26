import React, { useMemo } from 'react';
import { X, Edit, Phone, MapPin, Link2, Calendar, FileImage } from 'lucide-react';
import { Customer } from '../types';
import { useSavedDesign } from '../context/SavedDesignContext';
import { useApp } from '../context/AppContext';
import { canManageCustomer } from '../permissions';

interface Props {
  customer: Customer;
  onClose: () => void;
  onEdit: () => void;
}

export const CustomerDetailModal: React.FC<Props> = ({ customer, onClose, onEdit }) => {
  const { savedDesigns } = useSavedDesign();
  const { currentUser } = useApp();
  
  const customerDesigns = useMemo(() => {
    return savedDesigns.filter(d => 
      d.customerId === customer.id || 
      (!d.customerId && d.customerName === customer.name)
    );
  }, [savedDesigns, customer]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <h3 className="text-lg font-black text-neutral-900 flex items-center gap-2">
              {customer.name}
              <span className="px-2 py-0.5 bg-neutral-200 text-neutral-700 text-xs rounded uppercase tracking-wider">{customer.code}</span>
            </h3>
            {customer.source && (
              <p className="text-[10px] text-neutral-400 font-bold uppercase mt-1">Nguồn: {customer.source}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canManageCustomer(currentUser) && (
              <button onClick={onEdit} className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
                <Edit className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Info Section */}
          <section>
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Thông Tin Liên Hệ</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                <div className="p-2 bg-white rounded-lg shadow-xs"><Phone className="w-4 h-4 text-amber-600" /></div>
                <div>
                  <div className="text-[10px] font-bold text-neutral-400 uppercase">Số điện thoại</div>
                  <div className="text-sm font-bold text-neutral-800">{customer.phone || 'Chưa có'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                <div className="p-2 bg-white rounded-lg shadow-xs"><Link2 className="w-4 h-4 text-blue-500" /></div>
                <div>
                  <div className="text-[10px] font-bold text-neutral-400 uppercase">Mạng xã hội</div>
                  <div className="text-xs font-medium text-neutral-700 flex gap-2 mt-0.5">
                    {customer.zalo && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Zalo: {customer.zalo}</span>}
                    {customer.facebook && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">FB: {customer.facebook}</span>}
                    {!customer.zalo && !customer.facebook && 'Chưa có'}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100 sm:col-span-2">
                <div className="p-2 bg-white rounded-lg shadow-xs"><MapPin className="w-4 h-4 text-emerald-600" /></div>
                <div>
                  <div className="text-[10px] font-bold text-neutral-400 uppercase">Địa chỉ</div>
                  <div className="text-sm font-medium text-neutral-800">
                    {[customer.address, customer.ward, customer.district, customer.province].filter(Boolean).join(', ') || 'Chưa có'}
                  </div>
                </div>
              </div>
              {customer.note && (
                <div className="flex items-start gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100 sm:col-span-2">
                  <div className="text-sm font-medium text-amber-900 w-full">
                    <span className="text-[10px] font-bold text-amber-600/70 uppercase block mb-1">Ghi chú</span>
                    {customer.note}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Saved Designs */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Mẫu Đã Lưu ({customerDesigns.length})</h4>
            </div>
            {customerDesigns.length === 0 ? (
              <div className="p-6 text-center border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                <FileImage className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-neutral-500">Khách hàng chưa có mẫu in nào trong thư viện.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {customerDesigns.map(design => (
                  <div key={design.id} className="group relative rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-xs hover:shadow-md hover:border-amber-300 transition-all">
                    <div className="aspect-square bg-neutral-100 relative">
                      <img 
                        src={design.imageUrl} 
                        alt={design.productName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-bold text-neutral-800 line-clamp-1" title={design.productName}>{design.productName}</p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">{design.bagSize} • {design.paperType}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
