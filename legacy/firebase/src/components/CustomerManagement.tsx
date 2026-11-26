import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Customer } from '../types';
import { customerService } from '../services/customerService';
import { Search, Plus, FileText, ExternalLink, Edit, MoreVertical, MapPin, Phone, User, Calendar, Trash2 } from 'lucide-react';

// Create modal inline or separate
import { CreateCustomerModal } from './CreateCustomerModal';
import { CustomerDetailModal } from './CustomerDetailModal';
import { canManageCustomer } from '../permissions';

export const CustomerManagement: React.FC = () => {
  const { currentUser, setIsCustomerImportModalOpen } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    const unsubscribe = customerService.subscribeCustomers(
      (data) => {
        setCustomers(data);
        setLoadError(null);
        setIsLoading(false);
      },
      (error) => {
        setLoadError(error.message || 'Không thể tải danh sách khách hàng.');
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, []);

  const fetchCustomers = async () => {
    // Realtime subscription owns the canonical list. This only clears a stale
    // error after a create/edit action without converting failures to [].
    setLoadError(null);
  };

  // Filter
  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
           (c.phone && c.phone.includes(q)) ||
           (c.phoneNormalized && c.phoneNormalized.includes(q)) ||
           (c.code && c.code.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      {/* Header Title */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-neutral-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-neutral-900 tracking-tight">
            Quản Lý Khách Hàng
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 font-medium">
            Danh sách khách hàng, thông tin liên hệ và lịch sử giao dịch.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canManageCustomer(currentUser) && (
            <>
              <button
                onClick={() => setIsCustomerImportModalOpen(true)}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>Import Khách</span>
              </button>
              <button
                onClick={() => {
                  setEditingCustomer(null);
                  setIsCreateModalOpen(true);
                }}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Khách Hàng</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, mã khách..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-md pl-10 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all outline-hidden"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 text-neutral-500 font-bold text-xs uppercase tracking-wider">
                <th className="p-4 whitespace-nowrap">Mã KH</th>
                <th className="p-4">Tên Khách Hàng</th>
                <th className="p-4 whitespace-nowrap">Số Điện Thoại</th>
                <th className="p-4">Địa Chỉ</th>
                <th className="p-4 whitespace-nowrap">Nguồn</th>
                <th className="p-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    <div className="animate-pulse flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-neutral-200 border-t-amber-500 rounded-full animate-spin"></div>
                      <span className="text-xs font-medium">Đang tải danh sách...</span>
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-red-700">
                    <p className="font-bold">Không thể tải danh sách khách hàng.</p>
                    <p className="mt-1 text-xs text-red-600">{loadError}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    Không tìm thấy khách hàng nào.
                  </td>
                </tr>
              ) : (
                filtered.map(customer => (
                  <tr key={customer.id} className="hover:bg-amber-50/30 transition-colors group">
                    <td className="p-4 font-mono text-xs font-bold text-neutral-500 whitespace-nowrap">
                      {customer.code}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-neutral-900">{customer.name}</div>
                      {customer.note && <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">{customer.note}</div>}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {customer.phone ? (
                        <div className="flex items-center gap-1.5 text-neutral-700 font-medium">
                          <Phone className="w-3.5 h-3.5 text-neutral-400" />
                          {customer.phone}
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">Chưa có</span>
                      )}
                    </td>
                    <td className="p-4">
                      {customer.address || customer.province ? (
                        <div className="flex items-start gap-1.5 text-neutral-600 text-xs line-clamp-2">
                          <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                          <span>{[customer.address, customer.ward, customer.district, customer.province].filter(Boolean).join(', ')}</span>
                        </div>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">Chưa có</span>
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {customer.source ? (
                        <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded text-[10px] font-bold uppercase">
                          {customer.source === 'EXCEL_IMPORT' ? 'IMPORT' : customer.source}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic text-[10px]">Thủ công</span>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setViewingCustomer(customer)}
                        className="p-1.5 text-neutral-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Xem chi tiết"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      {canManageCustomer(currentUser) && (
                        <button
                          onClick={() => {
                            setEditingCustomer(customer);
                            setIsCreateModalOpen(true);
                          }}
                          className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-1"
                          title="Chỉnh sửa"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {(currentUser.role === 'ADMIN' || currentUser.role === 'DEVELOPER') && (
                        <button
                          onClick={async () => {
                            if (window.confirm('Bạn có chắc muốn xóa khách hàng này?')) {
                              await customerService.softDeleteCustomer(customer.id);
                              fetchCustomers();
                            }
                          }}
                          className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-1"
                          title="Xóa khách hàng"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateModalOpen && (
        <CreateCustomerModal
          customer={editingCustomer}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingCustomer(null);
          }}
          onSaved={() => {
            fetchCustomers();
            setIsCreateModalOpen(false);
            setEditingCustomer(null);
          }}
        />
      )}

      {viewingCustomer && (
        <CustomerDetailModal
          customer={viewingCustomer}
          onClose={() => setViewingCustomer(null)}
          onEdit={() => {
            setEditingCustomer(viewingCustomer);
            setViewingCustomer(null);
            setIsCreateModalOpen(true);
          }}
        />
      )}
    </div>
  );
};
