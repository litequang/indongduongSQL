import React, { useState } from 'react';
import { FinishedGood, DispatchMethod } from '../types';
import { warehouseDispatchService } from '../services/warehouseDispatchService';
import { useApp } from '../context/AppContext';
import { X, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';
import { OpenIssueTransitionModal, TransitionIssue } from './OpenIssueTransitionModal';
import { workflowIssueRepository } from '../repositories/workflowIssueRepository';
import { workflowCallableService } from '../services/workflowCallableService';
import { WorkflowIssue } from '../types';

interface CreateDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGoods: FinishedGood[];
  onSuccess: () => void;
}

export const CreateDispatchModal: React.FC<CreateDispatchModalProps> = ({ isOpen, onClose, selectedGoods, onSuccess }) => {
  const { currentUser } = useApp();
  
  // Group by Customer ID first, because we should only dispatch for one customer at a time.
  const uniqueCustomers = Array.from(new Set(selectedGoods.map(g => g.customerId)));
  const isMultiCustomer = uniqueCustomers.length > 1;

  const [quantities, setQuantities] = useState<Record<string, number>>(
    selectedGoods.reduce((acc, g) => ({ ...acc, [g.id]: g.remainingQuantity }), {})
  );
  
  const [dispatchMethod, setDispatchMethod] = useState<DispatchMethod>('INTERNAL_DELIVERY');
  const [note, setNote] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState(selectedGoods[0]?.customerSnapshot?.address || '');
  const [submitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();
  const [error, setError] = useState('');
  const [transitionIssues, setTransitionIssues] = useState<WorkflowIssue[] | null>(null);

  if (!isOpen) return null;

  const createDispatch = async () => {
    if (isMultiCustomer) {
      setError('Chỉ được tạo phiếu xuất cho cùng một khách hàng.');
      return;
    }
    
    if (!tryAcquireSubmit()) return;
    setError('');

    try {
      // Find the SalesOrder. This is a bit hacky because we are using the orders from context.
      // The callable verifies this one-sales-order constraint against the
      // selected finished-good records.
      const uniqueOrders = Array.from(new Set(selectedGoods.map(g => g.salesOrderId)));
      if (uniqueOrders.length > 1) {
        throw new Error('Chỉ được xuất hàng cho 1 đơn hàng (SalesOrder) cùng lúc trong phiên bản này.');
      }
      
      const salesOrderId = uniqueOrders[0];
      const itemsToDispatch = selectedGoods.map(g => ({
        finishedGood: g,
        dispatchQuantity: quantities[g.id]
      })).filter(item => item.dispatchQuantity > 0);

      if (itemsToDispatch.length === 0) {
        throw new Error('Vui lòng chọn số lượng xuất lớn hơn 0.');
      }
      
      void {
        id: salesOrderId,
        customerId: selectedGoods[0].customerId,
        customerSnapshot: selectedGoods[0].customerSnapshot || { name: 'Khách hàng' }
      };

      await warehouseDispatchService.createDraft(
        salesOrderId,
        itemsToDispatch,
        dispatchMethod,
        note,
        deliveryAddress,
        currentUser?.id || 'system'
      );
      
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi tạo phiếu xuất.');
    } finally {
      releaseSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMultiCustomer) { setError('Chỉ được tạo phiếu xuất cho cùng một khách hàng.'); return; }
    try {
      const ids = selectedGoods.map((good) => good.salesOrderItemId).filter((id): id is string => Boolean(id));
      const issues = await workflowIssueRepository.getOpenForEntities(ids, 'WAREHOUSE');
      if (issues.length) { setTransitionIssues(issues); return; }
      await createDispatch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể kiểm tra sự cố đang mở.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="px-6 py-4 border-b border-neutral-200 flex justify-between items-center bg-neutral-50 shrink-0">
          <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-500" />
            Tạo phiếu xuất kho
          </h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {isMultiCustomer ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Không thể tạo phiếu xuất</p>
                <p className="text-sm mt-1">Các sản phẩm được chọn thuộc về nhiều khách hàng khác nhau. Vui lòng chỉ chọn sản phẩm của cùng một khách hàng.</p>
              </div>
            </div>
          ) : (
            <form id="dispatchForm" onSubmit={handleSubmit} className="space-y-6">
              
              <div className="bg-amber-50 text-amber-800 p-4 rounded-lg">
                <p className="font-medium">Khách hàng: {selectedGoods[0]?.customerSnapshot?.name || 'Khách lẻ'}</p>
                <p className="text-sm mt-1">Đơn hàng: {selectedGoods[0]?.salesOrderId}</p>
              </div>

              <div>
                <h3 className="font-medium text-neutral-900 mb-3">Sản phẩm xuất kho</h3>
                <div className="space-y-3">
                  {selectedGoods.map(good => (
                    <div key={good.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg bg-neutral-50">
                      <div>
                        <div className="font-medium text-neutral-900">{good.productName}</div>
                        <div className="text-sm text-neutral-500 mt-1">Còn lại: {good.remainingQuantity.toLocaleString()} túi</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-neutral-500">Thực xuất:</span>
                        <input
                          type="number"
                          min="1"
                          max={good.remainingQuantity}
                          value={quantities[good.id] || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setQuantities(prev => ({ ...prev, [good.id]: Math.min(val, good.remainingQuantity) }));
                          }}
                          className="w-24 p-2 border border-neutral-300 rounded text-right focus:ring-amber-500 focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Phương thức giao hàng</label>
                  <select
                    value={dispatchMethod}
                    onChange={(e) => setDispatchMethod(e.target.value as DispatchMethod)}
                    className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                  >
                    <option value="INTERNAL_DELIVERY">Giao nội bộ</option>
                    <option value="BUS">Gửi xe khách</option>
                    <option value="CUSTOMER_PICKUP">Khách tự lấy</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Địa chỉ giao hàng (Tùy chỉnh nếu cần)</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Nhập địa chỉ nhận hàng"
                  className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Ghi chú phiếu xuất</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  rows={3}
                  className="w-full p-2.5 border border-neutral-300 rounded-lg focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}
            </form>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
            disabled={submitting}
          >
            Hủy
          </button>
          {!isMultiCustomer && (
            <button
              type="submit"
              form="dispatchForm"
              disabled={submitting}
              className="px-4 py-2 font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? 'Đang lưu...' : 'Lưu nháp phiếu xuất'}
            </button>
          )}
        </div>
      </div>
      {transitionIssues && <OpenIssueTransitionModal title="xuất kho" actor={currentUser} issues={transitionIssues as TransitionIssue[]} onResolve={(issueId) => workflowCallableService.resolveWorkflowIssue(issueId)} onContinue={createDispatch} onClose={() => setTransitionIssues(null)} />}
    </div>
  );
};
