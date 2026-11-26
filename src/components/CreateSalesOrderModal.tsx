import React, { useState, useEffect } from 'react';
import { SalesOrder, SalesOrderItem, Customer, StoredImageReference } from '../types';
import { customerService } from '../services/customerService';
import { salesOrderService } from '../services/salesOrderService';
import { salesOrderRepository } from '../repositories/salesOrderRepository';
import { useApp } from '../context/AppContext';
import { 
  X, Plus, Trash2, Calendar, User, Phone, MapPin, 
  Package, AlertTriangle, CheckCircle2, FileText, Image as ImageIcon 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { imageStorageService, PreparedImage } from '../services/imageStorageService';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';
import { canEditCommercialSalesOrder, canManageCustomer } from '../permissions';
import { ResolvedImage } from './ResolvedImage';

interface Props {
  onClose: () => void;
  onSuccess?: (orderId: string) => void;
  editingOrder?: SalesOrder | null;
}

interface DraftItem {
  id?: string;
  productName: string;
  quantity: number;
  bagWidth?: number;
  bagLength?: number;
  bagGusset?: number;
  paperPreference?: string;
  gsmPreference?: string;
  colorPreference?: string;
  imageUrl?: string;
  image?: StoredImageReference;
  removedImage?: StoredImageReference;
  localImage?: PreparedImage;
  note?: string;
  requiresProduction: boolean;
  requiresFinishing: boolean;
}

export const CreateSalesOrderModal: React.FC<Props> = ({ onClose, onSuccess, editingOrder }) => {
  const { currentUser } = useApp();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isManualCustomer, setIsManualCustomer] = useState(false);
  const [manualCustomer, setManualCustomer] = useState({
    name: '',
    phone: '',
    address: ''
  });

  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [expectedDate, setExpectedDate] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  const [items, setItems] = useState<DraftItem[]>([
    {
      productName: '',
      quantity: 1000,
      bagWidth: undefined,
      bagLength: undefined,
      bagGusset: undefined,
      paperPreference: '',
      gsmPreference: '',
      colorPreference: '',
      imageUrl: '',
      note: ''
      ,requiresProduction: true
      ,requiresFinishing: true
    }
  ]);

  const [isSubmitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();

  useEffect(() => {
    loadCustomers();
    if (editingOrder) {
      setPriority(editingOrder.priority || 'NORMAL');
      setExpectedDate(editingOrder.expectedDeliveryDate ? editingOrder.expectedDeliveryDate.slice(0, 10) : '');
      setInternalNote(editingOrder.internalNote || '');
      setCustomerNote(editingOrder.customerNote || '');
      setSelectedCustomer({
        id: editingOrder.customerId,
        code: '',
        name: editingOrder.customerSnapshot.name,
        phone: editingOrder.customerSnapshot.phone,
        address: editingOrder.customerSnapshot.address,
        createdAt: ''
      });
      loadExistingItems(editingOrder.id);
    }
  }, [editingOrder]);

  const loadCustomers = async () => {
    try {
      const data = await customerService.getCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('Error loading customers', err);
    }
  };

  const loadExistingItems = async (orderId: string) => {
    try {
      const res = await salesOrderService.getOrderWithItems(orderId);
      if (res && res.items.length > 0) {
        setItems(res.items.map(i => ({
          id: i.id,
          productName: i.productName,
          quantity: i.quantity,
          bagWidth: i.bagWidth,
          bagLength: i.bagLength,
          bagGusset: i.bagGusset,
          paperPreference: i.paperPreference || '',
          gsmPreference: i.gsmPreference || '',
          colorPreference: i.colorPreference || '',
          imageUrl: i.imageUrl || '',
          image: i.image,
          note: i.note || ''
          ,requiresProduction: i.requiresProduction !== false
          ,requiresFinishing: i.requiresFinishing !== false
        })));
      }
    } catch (err) {
      console.error('Error loading order items', err);
    }
  };

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        productName: '',
        quantity: 1000,
        bagWidth: undefined,
        bagLength: undefined,
        bagGusset: undefined,
        paperPreference: '',
        gsmPreference: '',
        colorPreference: '',
        imageUrl: '',
        note: ''
        ,requiresProduction: true
        ,requiresFinishing: true
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('Đơn hàng phải có ít nhất 1 sản phẩm');
      return;
    }
    imageStorageService.removePreview(items[index]?.localImage);
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof DraftItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleItemImageFile = async (index: number, file: File) => {
    try {
      const prepared = await imageStorageService.prepareImage(file);
      imageStorageService.removePreview(items[index]?.localImage);
      setItems((previous) => previous.map((item, itemIndex) => itemIndex === index
        ? { ...item, imageUrl: prepared.previewUrl, image: undefined, localImage: prepared }
        : item));
    } catch (error) {
      toast.error(imageStorageService.uploadErrorMessage(error));
    }
  };

  const validateForm = (): boolean => {
    if (!isManualCustomer && !selectedCustomer) {
      toast.error('Vui lòng chọn khách hàng hoặc nhập thông tin khách hàng mới');
      return false;
    }
    if (isManualCustomer && (!manualCustomer.name.trim() || !manualCustomer.phone.trim())) {
      toast.error('Vui lòng nhập tên và số điện thoại khách hàng');
      return false;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productName.trim()) {
        toast.error(`Sản phẩm dòng ${i + 1} chưa có tên sản phẩm`);
        return false;
      }
      if (!item.quantity || item.quantity <= 0) {
        toast.error(`Sản phẩm "${item.productName}" có số lượng không hợp lệ`);
        return false;
      }
    }
    return true;
  };

  const handleSave = async (shouldConfirm: boolean) => {
    if (shouldConfirm && !canEditCommercialSalesOrder(currentUser)) {
      toast.error('Vai trò hiện tại chỉ được lưu Sales Order dạng bản nháp.');
      return;
    }
    if (isManualCustomer && !canManageCustomer(currentUser)) {
      toast.error('Vai trò hiện tại phải chọn khách hàng đã có trong danh bạ.');
      return;
    }
    if (!validateForm()) return;
    if (!tryAcquireSubmit()) return;

    try {
      let customerToUse: Customer;
      if (isManualCustomer) {
        customerToUse = await customerService.createCustomer({
          name: manualCustomer.name.trim(),
          phone: manualCustomer.phone.trim(),
          address: manualCustomer.address.trim()
        });
      } else {
        customerToUse = selectedCustomer!;
      }

      if (editingOrder) {
        // Update existing draft
        // 1. Update order metadata
        await salesOrderRepository.update(editingOrder.id, {
          priority,
          expectedDeliveryDate: expectedDate || undefined,
          internalNote: internalNote || undefined,
          customerNote: customerNote || undefined,
          customerSnapshot: {
            name: customerToUse.name,
            phone: customerToUse.phone,
            address: customerToUse.address
          },
          totalItems: items.length,
          updatedAt: new Date().toISOString()
        });

        // 2. Refresh items (for draft order)
        for (const item of items) {
          if (item.id) {
            let uploadedImage: StoredImageReference | undefined;
            try {
              if (item.localImage) {
                uploadedImage = await imageStorageService.uploadSalesOrderItem(
                  editingOrder.id,
                  item.id,
                  item.localImage,
                  currentUser.id,
                );
              }
              const retainedImage = item.image?.storagePath ? item.image : undefined;
              const retainedImageUrl = !imageStorageService.isDataImage(item.imageUrl) && retainedImage
                ? item.imageUrl || undefined
                : undefined;
              await salesOrderRepository.updateItem(item.id, {
                productName: item.productName,
                quantity: Number(item.quantity),
                bagWidth: item.bagWidth ? Number(item.bagWidth) : undefined,
                bagLength: item.bagLength ? Number(item.bagLength) : undefined,
                bagGusset: item.bagGusset ? Number(item.bagGusset) : undefined,
                paperPreference: item.paperPreference || undefined,
                gsmPreference: item.gsmPreference || undefined,
                colorPreference: item.colorPreference || undefined,
                imageUrl: uploadedImage?.downloadUrl || retainedImageUrl,
                image: uploadedImage || retainedImage,
                note: item.note || undefined,
                requiresProduction: item.requiresProduction,
                requiresFinishing: item.requiresFinishing,
                updatedAt: new Date().toISOString()
              });
            } catch (error) {
              if (uploadedImage) await imageStorageService.cleanupImages([uploadedImage]);
              throw error;
            }
            const priorImage = item.image || item.removedImage;
            if (uploadedImage && priorImage?.storagePath !== uploadedImage.storagePath) {
              // Replacement is durable before the former asset is removed.
              await imageStorageService.retireImages([priorImage]);
            } else if (!uploadedImage && item.removedImage) {
              await imageStorageService.retireImages([item.removedImage]);
            }
            imageStorageService.removePreview(item.localImage);
          } else {
            await salesOrderService.addItemWithImage(editingOrder.id, customerToUse.id, currentUser, item);
            imageStorageService.removePreview(item.localImage);
          }
        }

        if (shouldConfirm) await salesOrderService.confirmOrder(editingOrder.id);
        toast.success(shouldConfirm ? 'Đã chốt đơn hàng thành công!' : 'Đã cập nhật bản nháp thành công!');
        if (onSuccess) onSuccess(editingOrder.id);
        onClose();
      } else {
        // Create new order
        const initialItems = items.map(i => ({
          productName: i.productName.trim(),
          quantity: Number(i.quantity),
          bagWidth: i.bagWidth ? Number(i.bagWidth) : undefined,
          bagLength: i.bagLength ? Number(i.bagLength) : undefined,
          bagGusset: i.bagGusset ? Number(i.bagGusset) : undefined,
          paperPreference: i.paperPreference || undefined,
          gsmPreference: i.gsmPreference || undefined,
          colorPreference: i.colorPreference || undefined,
          localImage: i.localImage,
          note: i.note || undefined
          ,requiresProduction: i.requiresProduction
          ,requiresFinishing: i.requiresFinishing
        }));

        const newOrderId = await salesOrderService.createDraft(
          currentUser,
          customerToUse,
          initialItems,
          priority,
          expectedDate || undefined,
          internalNote || undefined
        );
        items.forEach((item) => imageStorageService.removePreview(item.localImage));

        if (shouldConfirm) {
          await salesOrderService.confirmOrder(newOrderId);
          toast.success('Tạo và chốt đơn hàng thành công!');
        } else {
          toast.success('Đã lưu đơn hàng ở trạng thái Bản nháp (DRAFT)!');
        }

        if (onSuccess) onSuccess(newOrderId);
        onClose();
      }
    } catch (err: any) {
      console.error('Error saving sales order', err);
      toast.error('Lỗi khi lưu đơn hàng: ' + (err.message || 'Không xác định'));
    } finally {
      releaseSubmit();
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || c.code.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-neutral-900">
                {editingOrder ? `Sửa Đơn Hàng ${editingOrder.code}` : 'Tạo Đơn Hàng Mới'}
              </h2>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                Nhân viên phụ trách: <strong className="text-neutral-700">{currentUser.name}</strong>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-200/60 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* SECTION 1: Customer Selection */}
          <div className="bg-neutral-50 p-4 sm:p-5 rounded-2xl border border-neutral-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <User className="w-4 h-4 text-amber-600" />
                Thông Tin Khách Hàng <span className="text-red-500">*</span>
              </h3>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => { setIsManualCustomer(false); setSelectedCustomer(null); }}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${!isManualCustomer ? 'bg-amber-500 text-white' : 'bg-neutral-200 text-neutral-600'}`}
                >
                  Chọn từ danh bạ
                </button>
                {canManageCustomer(currentUser) && <button
                  type="button"
                  onClick={() => { setIsManualCustomer(true); setSelectedCustomer(null); }}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors ${isManualCustomer ? 'bg-amber-500 text-white' : 'bg-neutral-200 text-neutral-600'}`}
                >
                  + Khách hàng mới
                </button>}
              </div>
            </div>

            {!isManualCustomer ? (
              <div className="space-y-2">
                {selectedCustomer ? (
                  <div className="p-3 bg-white rounded-xl border border-amber-300 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-neutral-900 flex items-center gap-2">
                        <span>{selectedCustomer.name}</span>
                        <span className="text-xs font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">{selectedCustomer.code || 'KH'}</span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {selectedCustomer.phone && <span>SĐT: <strong className="text-neutral-700">{selectedCustomer.phone}</strong></span>}
                        {selectedCustomer.address && <span>Đ/C: {selectedCustomer.address}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="text-xs font-bold text-amber-600 hover:text-amber-700 underline px-2 py-1"
                    >
                      Đổi khách
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder="Tìm theo tên, SĐT hoặc mã khách hàng..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
                    />
                    <div className="max-h-40 overflow-y-auto mt-2 border border-neutral-200 rounded-xl bg-white divide-y divide-neutral-100">
                      {filteredCustomers.length === 0 ? (
                        <div className="p-3 text-xs text-neutral-500 text-center">Không tìm thấy khách hàng phù hợp</div>
                      ) : (
                        filteredCustomers.slice(0, 10).map(c => (
                          <div
                            key={c.id}
                            onClick={() => setSelectedCustomer(c)}
                            className="p-2.5 hover:bg-amber-50 cursor-pointer flex justify-between items-center text-xs transition-colors"
                          >
                            <div>
                              <span className="font-bold text-neutral-900">{c.name}</span>
                              {c.phone && <span className="text-neutral-500 ml-2">({c.phone})</span>}
                            </div>
                            <span className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded font-mono">{c.code}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-xl border border-neutral-200">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Tên khách hàng (*)</label>
                  <input
                    type="text"
                    placeholder="VD: Cty Bao Bì An Khang"
                    value={manualCustomer.name}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Số điện thoại (*)</label>
                  <input
                    type="text"
                    placeholder="VD: 0912345678"
                    value={manualCustomer.phone}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Địa chỉ giao hàng</label>
                  <input
                    type="text"
                    placeholder="VD: 123 Lê Duẩn, Q.1, HCM"
                    value={manualCustomer.address}
                    onChange={(e) => setManualCustomer(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: Order Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Mức độ ưu tiên</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl focus:border-amber-500 outline-none font-bold"
              >
                <option value="NORMAL">Bình thường (NORMAL)</option>
                <option value="URGENT">Gấp - Cần ưu tiên (URGENT)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Ngày giao dự kiến</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">Ghi chú nội bộ</label>
              <input
                type="text"
                placeholder="VD: Khách quen, cần test mẫu kỹ..."
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          {/* SECTION 3: Sales Order Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                Danh Sách Sản Phẩm Đặt In ({items.length})
              </h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" /> Thêm sản phẩm
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 relative group space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">
                      # Sản phẩm {idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-neutral-400 hover:text-red-600 p-1 rounded-md transition-colors"
                        title="Xóa sản phẩm này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Tên sản phẩm / Tên túi (*):
                      </label>
                      <input
                        type="text"
                        placeholder="VD: Túi Kraft Bánh Mì Hoa Cúc"
                        value={item.productName}
                        onChange={(e) => handleItemChange(idx, 'productName', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Số lượng túi (*):
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="100"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none font-bold text-amber-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                        Loại giấy / Định lượng:
                      </label>
                      <input
                        type="text"
                        placeholder="VD: Kraft 70gsm, Trắng 80..."
                        value={item.paperPreference || ''}
                        onChange={(e) => handleItemChange(idx, 'paperPreference', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Dimensions & Image */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 border-t border-neutral-200/60">
                    <div>
                      <label className="block text-[10px] font-medium text-neutral-500 mb-0.5">Ngang (cm):</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="VD: 15"
                        value={item.bagWidth || ''}
                        onChange={(e) => handleItemChange(idx, 'bagWidth', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-neutral-500 mb-0.5">Dài (cm):</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="VD: 25"
                        value={item.bagLength || ''}
                        onChange={(e) => handleItemChange(idx, 'bagLength', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-neutral-500 mb-0.5">Hông/Đáy (cm):</label>
                      <input
                        type="number"
                        step="0.5"
                        placeholder="VD: 8"
                        value={item.bagGusset || ''}
                        onChange={(e) => handleItemChange(idx, 'bagGusset', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-neutral-500 mb-0.5">Mẫu ảnh:</label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleItemImageFile(idx, file);
                          e.currentTarget.value = '';
                        }}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none"
                      />
                      {(item.imageUrl || item.image) && !imageStorageService.isDataImage(item.imageUrl) && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <ResolvedImage image={item.image} legacyUrl={item.imageUrl} alt="Mẫu ảnh sản phẩm" className="h-7 w-7 rounded object-cover border border-neutral-200" />
                          <button
                            type="button"
                            onClick={() => {
                              imageStorageService.removePreview(item.localImage);
                              setItems((previous) => previous.map((current, itemIndex) => itemIndex === idx
                                ? {
                                  ...current,
                                  localImage: undefined,
                                  removedImage: current.image || current.removedImage,
                                  image: undefined,
                                  imageUrl: '',
                                }
                                : current));
                            }}
                            className="text-[10px] text-red-600 hover:underline"
                          >
                            Xóa ảnh
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <input
                      type="text"
                      placeholder="Ghi chú yêu cầu in ấn riêng cho sản phẩm này..."
                      value={item.note || ''}
                      onChange={(e) => handleItemChange(idx, 'note', e.target.value)}
                      className="w-full px-3 py-1 text-xs bg-white border border-neutral-200 rounded-lg focus:border-amber-500 outline-none text-neutral-600"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-blue-950">
                      <input
                        type="checkbox"
                        checked={item.requiresProduction}
                        onChange={(e) => handleItemChange(idx, 'requiresProduction', e.target.checked)}
                      />
                      Cần sản xuất / in
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-purple-950">
                      <input
                        type="checkbox"
                        checked={item.requiresFinishing}
                        onChange={(e) => handleItemChange(idx, 'requiresFinishing', e.target.checked)}
                      />
                      Cần gia công
                    </label>
                    <p className="sm:col-span-2 text-[11px] text-emerald-800">
                      {!item.requiresProduction && item.requiresFinishing
                        ? 'Không cần in: sản phẩm sẽ vào Gia công trực tiếp sau khi chốt đơn.'
                        : !item.requiresProduction
                          ? 'Không cần in và gia công: sản phẩm sẽ vào Kho trực tiếp sau khi chốt đơn.'
                          : item.requiresFinishing
                            ? 'Sản phẩm sẽ đi In → Gia công → Kho.'
                            : 'Sản phẩm sẽ đi In → checkpoint xác nhận → Kho.'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-neutral-100 bg-neutral-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-neutral-500 font-medium">
            Tổng cộng: <strong className="text-neutral-900">{items.length}</strong> sản phẩm |{' '}
            <strong className="text-amber-700">
              {items.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0).toLocaleString()}
            </strong>{' '}
            túi
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-sm rounded-xl transition-colors"
            >
              Hủy
            </button>

            {canEditCommercialSalesOrder(currentUser) && <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSave(false)}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-white border border-amber-500 hover:bg-amber-50 text-amber-700 font-bold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Bản Nháp (DRAFT)'}
            </button>}

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSave(true)}
              className="flex-1 sm:flex-initial px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Đang xử lý...' : 'Chốt Đơn (CONFIRM)'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
