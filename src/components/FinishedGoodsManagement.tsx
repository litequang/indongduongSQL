import React, { useState, useEffect } from 'react';
import { FinishedGood } from '../types';
import { finishedGoodService } from '../services/finishedGoodService';
import { AlertTriangle, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CreateDispatchModal } from './CreateDispatchModal';
import { ProductWorkflowIssueModal } from './ProductWorkflowIssueModal';
import { WorkflowIssuesPanel } from './WorkflowIssuesPanel';
export const FinishedGoodsManagement: React.FC = () => {

  const [goods, setGoods] = useState<FinishedGood[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCreateDispatchOpen, setIsCreateDispatchOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<FinishedGood | null>(null);
  const { appConfig } = useApp();

  useEffect(() => finishedGoodService.subscribe(next => {
    setGoods(next);
    setLoading(false);
  }, error => {
    console.error(error);
    setLoading(false);
  }), []);

  
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await finishedGoodService.getAll();
      setGoods(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectedGoods = goods.filter(g => selectedIds.includes(g.id));

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <WorkflowIssuesPanel stage="WAREHOUSE" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Thành phẩm chờ xuất</h1>
          <p className="text-neutral-500">Quản lý các sản phẩm đã gia công xong và sẵn sàng xuất kho</p>
        </div>
        
        {selectedIds.length > 0 && (
          <button
            onClick={() => setIsCreateDispatchOpen(true)}
            className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-amber-600 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Tạo phiếu xuất ({selectedIds.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div></div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50 text-neutral-500 text-sm border-b border-neutral-200">
                  <th className="p-4 w-12 text-center">
                    <span className="text-[10px] font-black">CHỌN</span>
                  </th>
                  <th className="p-4 font-medium">Sản phẩm</th>
                  <th className="p-4 font-medium">Khách hàng</th>
                  <th className="p-4 font-medium text-right">Tổng thành phẩm</th>
                  <th className="p-4 font-medium text-right">Đã xuất</th>
                  <th className="p-4 font-medium text-right">Còn lại</th>
                  <th className="p-4 font-medium text-center">Trạng thái</th>
                  <th className="p-4 font-medium text-center">Sự cố</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {goods.map(good => (
                  <tr key={good.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        disabled={good.remainingQuantity <= 0}
                        className="rounded border-neutral-300 text-amber-500 focus:ring-amber-500 disabled:opacity-50"
                        checked={selectedIds.includes(good.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const sameOrderIds = goods.filter(candidate => candidate.salesOrderId === good.salesOrderId).map(candidate => candidate.id);
                            setSelectedIds(current => [...current.filter(id => sameOrderIds.includes(id)), good.id].filter((id, index, all) => all.indexOf(id) === index));
                          } else {
                            setSelectedIds(selectedIds.filter(id => id !== good.id));
                          }
                        }}
                      />
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-neutral-900">{good.productName}</div>
                      <div className="text-sm text-neutral-500 text-xs mt-1">SO: {good.salesOrderId}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-neutral-900">{good.customerSnapshot?.name || 'Khách lẻ'}</div>
                    </td>
                    <td className="p-4 text-right font-medium text-neutral-900">
                      {good.acceptedQuantity.toLocaleString()}
                    </td>
                    <td className="p-4 text-right text-neutral-500">
                      {good.dispatchedQuantity.toLocaleString()}
                    </td>
                    <td className="p-4 text-right font-bold text-amber-600">
                      {good.remainingQuantity.toLocaleString()}
                    </td>
                    
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          good.status === 'READY' ? 'bg-green-100 text-green-700' :
                          good.status === 'PARTIALLY_DISPATCHED' ? 'bg-blue-100 text-blue-700' :
                          good.status === 'DISPATCHED' ? 'bg-neutral-100 text-neutral-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {good.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <button disabled={!good.salesOrderItemId} onClick={() => setIssueTarget(good)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-black text-rose-700 disabled:opacity-40"><AlertTriangle className="h-3.5 w-3.5" />Báo sự cố</button>
                    </td>

                  </tr>
                ))}
                
                {goods.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-neutral-500">
                      Không có dữ liệu thành phẩm
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isCreateDispatchOpen && (
        <CreateDispatchModal 
          isOpen={isCreateDispatchOpen} 
          onClose={() => setIsCreateDispatchOpen(false)} 
          selectedGoods={selectedGoods}
          onSuccess={() => {
            setIsCreateDispatchOpen(false);
            setSelectedIds([]);
            loadData();
          }}
        />
      )}
      {issueTarget?.salesOrderItemId && <ProductWorkflowIssueModal salesOrderItemId={issueTarget.salesOrderItemId} stage="WAREHOUSE" productName={issueTarget.productName} onClose={() => setIssueTarget(null)} />}
    </div>
  );
};
