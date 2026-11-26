import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  Zap,
  Layers,
  Send,
  UploadCloud,
  Check,
  RotateCcw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductionItem, PlateStatus, StoredImageReference } from '../types';
import { parseQuickOrderText } from '../utils/textParser';
import { SAMPLE_BAG_IMAGES } from '../data/initialData';
import { getTodayFormatted } from '../utils/dateUtils';
import { imageStorageService, PreparedImage } from '../services/imageStorageService';
import { workflowCallableService } from '../services/workflowCallableService';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';

const PAPER_TYPES = ['Kraft', 'OP', 'MG', 'Fort', 'Khác'] as const;
const COMMON_GSM = ['40', '60', '70', '80', '100'];
const COMMON_SIZES = [
  { width: '25', height: '48', label: '25 × 48' },
  { width: '27.5', height: '46', label: '27.5 × 46' },
  { width: '30', height: '44', label: '30 × 44' },
  { width: '27.5', height: '50', label: '27.5 × 50' },
];
const COMMON_COLORS = ['Xanh', 'Nâu', 'Đỏ', 'Cam', 'Đen', 'Xanh + Nâu', '2 màu'];

export const CreateOrderModal: React.FC = () => {
  const {
    currentUser,
    users,
    createOrder,
    isCreateModalOpen,
    setIsCreateModalOpen,
    prefilledOrderData,
    setPrefilledOrderData,
    appConfig
  } = useApp();
  const [isSubmitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();

  const activePaperTypes = appConfig?.production?.paperTypes && appConfig.production.paperTypes.length > 0
    ? appConfig.production.paperTypes
    : PAPER_TYPES;
  const activeGsmList = appConfig?.production?.defaultGsmList && appConfig.production.defaultGsmList.length > 0
    ? appConfig.production.defaultGsmList
    : COMMON_GSM;

  const [orderProductName, setOrderProductName] = useState('');
  const [quickInput, setQuickInput] = useState('');
  const [paperType, setPaperType] = useState<string>('Kraft');
  const [paperGsm, setPaperGsm] = useState('70');
  const [paperWidth, setPaperWidth] = useState('25');
  const [paperHeight, setPaperHeight] = useState('48');
  const [color, setColor] = useState('Nâu');
  const [printerId, setPrinterId] = useState('');
  const [plateType, setPlateType] = useState<'NEW' | 'OLD' | 'UNKNOWN' | 'NONE'>('NEW');
  const [plateStatus, setPlateStatus] = useState<PlateStatus>('NOT_SENT');
  const [plateDate, setPlateDate] = useState(getTodayFormatted());
  const [originalPlateDate, setOriginalPlateDate] = useState(getTodayFormatted());
  const [plateNote, setPlateNote] = useState('');
  const [note, setNote] = useState('');
  const [isReprint, setIsReprint] = useState(false);
  const [reprintFromCode, setReprintFromCode] = useState('');
  const [reprintFromDate, setReprintFromDate] = useState('');

  // Items / Ghép mẫu
  const [items, setItems] = useState<Array<{
    id: string;
    imageUrl: string;
    image?: StoredImageReference;
    localImage?: PreparedImage;
    customerName: string;
    productName: string;
    quantity: number;
    color: string;
    allocatedProductQuantity?: number;
    requiresFinishing?: boolean;
    salesOrderId?: string;
    salesOrderItemId?: string;
    sourceType?: 'SALES_ORDER' | 'MANUAL' | 'REPRINT';
    sampleId?: string;
    sampleVersionId?: string;
    bagWidth?: number;
    bagLength?: number;
    bagGusset?: number;
  }>>([
    {
      id: 'item-new-1',
      imageUrl: '',
      customerName: 'Bánh Mì Pate',
      productName: 'Mẫu 1',
      quantity: 5150,
      color: 'Nâu'
    }
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // Set default printer
  useEffect(() => {
    if (users.length > 0 && !printerId) {
      const defaultPrinter = users.find(u => u.role === 'PRINTER') || users[0];
      setPrinterId(defaultPrinter.id);
    }
  }, [users, printerId]);

  // Load prefilled data if duplicating past order
  useEffect(() => {
    if (prefilledOrderData) {
      if (prefilledOrderData.productName) setOrderProductName(prefilledOrderData.productName);
      if (prefilledOrderData.paperType) setPaperType(prefilledOrderData.paperType);
      if (prefilledOrderData.paperGsm) setPaperGsm(prefilledOrderData.paperGsm);
      if (prefilledOrderData.paperWidth) setPaperWidth(prefilledOrderData.paperWidth);
      if (prefilledOrderData.paperHeight) setPaperHeight(prefilledOrderData.paperHeight);
      if (prefilledOrderData.color) setColor(prefilledOrderData.color);
      if (prefilledOrderData.printerId) setPrinterId(prefilledOrderData.printerId);
      if (prefilledOrderData.plateType) setPlateType(prefilledOrderData.plateType);
      if (prefilledOrderData.plateStatus) setPlateStatus(prefilledOrderData.plateStatus);
      if (prefilledOrderData.plateDate) setPlateDate(prefilledOrderData.plateDate);
      if (prefilledOrderData.originalPlateDate) setOriginalPlateDate(prefilledOrderData.originalPlateDate);
      if (prefilledOrderData.plateNote) setPlateNote(prefilledOrderData.plateNote);
      if (prefilledOrderData.note) setNote(prefilledOrderData.note);
      if (prefilledOrderData.isReprint) setIsReprint(true);
      if (prefilledOrderData.reprintFromCode) setReprintFromCode(prefilledOrderData.reprintFromCode);
      if (prefilledOrderData.reprintFromDate) setReprintFromDate(prefilledOrderData.reprintFromDate);
      if (prefilledOrderData.items && prefilledOrderData.items.length > 0) {
        setItems(prefilledOrderData.items.map((it, idx) => ({
          id: 'item-' + idx,
          // Product photos remain product references; they are never silently
          // copied into the technical print/imposition image list.
          imageUrl: '',
          image: undefined,
          customerName: it.customerName || '',
          productName: it.productName || `Mẫu ${idx + 1}`,
          quantity: it.quantity || 5150,
          color: it.color || prefilledOrderData.color || 'Nâu',
          allocatedProductQuantity: it.allocatedProductQuantity,
          requiresFinishing: it.requiresFinishing,
          salesOrderId: it.salesOrderId,
          salesOrderItemId: it.salesOrderItemId,
          sourceType: it.sourceType,
          sampleId: it.sampleId,
          sampleVersionId: it.sampleVersionId,
          bagWidth: it.bagWidth,
          bagLength: it.bagLength,
          bagGusset: it.bagGusset
        })));
      }
    } else {
      setIsReprint(false);
      setReprintFromCode('');
      setReprintFromDate('');
      setOrderProductName('');
      setPlateDate(getTodayFormatted());
      setOriginalPlateDate(getTodayFormatted());
    }
  }, [prefilledOrderData]);

  // Paste image directly via Ctrl+V anywhere in modal
  useEffect(() => {
    if (!isCreateModalOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            try {
              const preparedImage = await imageStorageService.prepareImage(file);
              if (preparedImage) {
                // Update first item or add new item if first already has image
                setItems(prev => {
                  if (prev.length === 1 && !prev[0].imageUrl && !prev[0].localImage) {
                    return [{ ...prev[0], imageUrl: preparedImage.previewUrl, localImage: preparedImage }];
                  }
                  return [
                    ...prev,
                    {
                      id: 'item-' + Date.now(),
                      imageUrl: preparedImage.previewUrl,
                      localImage: preparedImage,
                      customerName: '',
                      productName: `Mẫu ${prev.length + 1}`,
                      quantity: 2600,
                      color: color
                    }
                  ];
                });
              }
            } catch (err) {
              console.warn('Failed to compress pasted image:', err);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isCreateModalOpen, color]);

  // Quick prompt parse handler
  const handleQuickParse = (text: string) => {
    setQuickInput(text);
    const parsed = parseQuickOrderText(text);

    if (parsed.paperType) setPaperType(parsed.paperType);
    if (parsed.paperGsm) setPaperGsm(parsed.paperGsm);
    if (parsed.paperWidth) setPaperWidth(parsed.paperWidth);
    if (parsed.paperHeight) setPaperHeight(parsed.paperHeight);
    if (parsed.color) setColor(parsed.color);
    if (parsed.note) setNote(parsed.note);

    if (parsed.printerName) {
      const matched = users.find(u => u.name.toLowerCase().includes(parsed.printerName!.toLowerCase()));
      if (matched) setPrinterId(matched.id);
    }

    if (parsed.plateType) {
      setPlateType(parsed.plateType);
      if (parsed.plateType === 'OLD') {
        setPlateStatus('OLD_PLATE');
        if (parsed.plateNote) setPlateNote(parsed.plateNote);
      } else if (parsed.plateType === 'NEW') {
        setPlateStatus('NOT_SENT');
      }
    }

    if (parsed.quantity) {
      setItems(prev => {
        if (prev.length === 1) {
          return [{ ...prev[0], quantity: parsed.quantity! }];
        }
        return prev;
      });
    }
  };

  // Add another design item (Ghép mẫu)
  const handleAddItem = () => {
    const nextIdx = items.length + 1;

    setItems([
      ...items,
      {
        id: 'item-' + Date.now(),
        imageUrl: '',
        customerName: '',
        productName: `Mẫu ${nextIdx}`,
        quantity: 2600,
        color: color
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    imageStorageService.removePreview(items.find((item) => item.id === id)?.localImage);
    setItems(items.filter(i => i.id !== id));
  };

  const handleItemImageUpload = async (index: number, file: File) => {
    try {
      const preparedImage = await imageStorageService.prepareImage(file);
      imageStorageService.removePreview(items[index]?.localImage);
      setItems(prev => prev.map((item, idx) => idx === index ? { ...item, imageUrl: preparedImage.previewUrl, localImage: preparedImage } : item));
    } catch (err) {
      console.warn('Image upload compress error:', err);
    }
  };

  // Calculate total sheets
  const totalSheets = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // Submit Handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (totalSheets <= 0) {
      alert('Vui lòng nhập số lượng tờ lớn hơn 0!');
      return;
    }

    if (!tryAcquireSubmit()) return;
    try {

    const assignedPrinter = users.find(u => u.id === printerId) || users.find(u => u.role === 'PRINTER') || users[0];

    const todayStr = getTodayFormatted();
    const finalPlateDate = plateType === 'OLD' ? (plateDate || originalPlateDate || todayStr) : todayStr;
    const finalOriginalPlateDate = plateType === 'OLD' ? (originalPlateDate || plateDate || todayStr) : todayStr;

    const localImages = Object.fromEntries(items.flatMap((item) => item.localImage ? [[item.id, item.localImage]] : []));
    const newOrder = await createOrder({
      productName: orderProductName.trim() || undefined,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      designerId: currentUser.id,
      designerName: currentUser.name,
      printerId: assignedPrinter.id,
      printerName: assignedPrinter.name,
      paperType,
      paperGsm,
      paperWidth,
      paperHeight,
      totalSheets,
      color,
      note: note.trim() || undefined,
      instructionRaw: quickInput.trim() || note.trim() || undefined,
      plateType,
      plateStatus,
      plateDate: finalPlateDate,
      originalPlateDate: finalOriginalPlateDate,
      plateNote: plateNote.trim() || (plateType === 'OLD' ? `In lại kẽm cũ ngày ${finalOriginalPlateDate}` : `Kẽm mới ngày ${todayStr}`),
      isReprint,
      reprintFromCode: isReprint ? reprintFromCode : undefined,
      reprintFromDate: isReprint ? reprintFromDate : undefined,
      items: items.map((it, idx) => {
        const rawTags = it.productName && !it.productName.startsWith('Mẫu ') ? it.productName.split(',').map(t => t.trim()).filter(Boolean) : undefined;
        const finalName = rawTags && rawTags.length > 0 ? rawTags.join(', ') : (it.customerName || `Mẫu ${idx + 1}`);

        return {
          id: it.id,
          imageUrl: it.imageUrl,
          image: it.image,
          customerName: finalName,
          productName: finalName,
          tags: rawTags,
          quantity: Number(it.quantity) || 0,
          // Sheet count belongs to the print image. Keep legacy allocation
          // only when it was explicitly supplied by an older record.
          allocatedProductQuantity: it.allocatedProductQuantity,
          requiresFinishing: it.requiresFinishing,
          color: it.color || color,
          oldPlateReference: plateType === 'OLD' ? (plateNote || `Kẽm cũ ngày ${finalOriginalPlateDate}`) : undefined,
          
          // Preserve SalesOrder links
          salesOrderId: it.salesOrderId,
          salesOrderItemId: it.salesOrderItemId,
          sourceType: it.sourceType || 'MANUAL',
          sampleId: it.sampleId,
          sampleVersionId: it.sampleVersionId,
          bagWidth: it.bagWidth,
          bagLength: it.bagLength,
          bagGusset: it.bagGusset
        };
      }),
      linkedProductIds: [...new Set(items.map((item) => item.salesOrderItemId).filter((id): id is string => Boolean(id)))],
      printImages: items.map((item, index) => ({
        id: item.id || `print-image-${index + 1}`,
        imageUrl: item.imageUrl || undefined,
        image: item.image,
        label: item.productName && !item.productName.startsWith('Mẫu ') ? item.productName : `Ảnh ghép ${index + 1}`,
        sheetCount: Number(item.quantity) || 0,
      }))
    // This modal is the explicit CREATE/SEND action. Persist the Production
    // Order before reverse-linking Products; local drafts are dispatched by
    // their separate workflow and must never be linked as official orders.
    }, { isDraft: false, localImages });

    items.forEach((item) => imageStorageService.removePreview(item.localImage));

    // Link SalesOrderItems if module is enabled
    if (appConfig?.features?.salesOrder && newOrder.items.length > 0) {
      const salesItemsToLink = newOrder.items.filter(item => item.salesOrderId && item.salesOrderItemId);
      if (salesItemsToLink.length > 0) {
          await workflowCallableService.linkProductionOrder(newOrder.id);
      }
    }

    // Reset & Close
    setIsCreateModalOpen(false);
    setPrefilledOrderData(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not create the production order. Please retry.');
    } finally {
      releaseSubmit();
    }
  };

  if (!isCreateModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl border border-neutral-200 overflow-hidden my-auto">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🥖</span>
              <h3 className="text-lg font-black text-neutral-900">
                Tạo Lệnh In Sản Xuất
              </h3>
              <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                10-20 giây
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Paste ảnh mẫu (Ctrl+V) hoặc kéo thả trực tiếp vào app
            </p>
          </div>

          <button
            onClick={() => {
              setIsCreateModalOpen(false);
              setPrefilledOrderData(null);
            }}
            className="p-2 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-neutral-800">
          
          {/* Reprint Notice Banner */}
          {isReprint && (
            <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl flex items-start gap-3">
              <RotateCcw className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold text-blue-900 flex items-center gap-2">
                  <span>🔁 Đang tạo lệnh in lại từ #{reprintFromCode}</span>
                  {reprintFromDate && (
                    <span className="font-normal text-blue-700">(Lệnh ngày {reprintFromDate})</span>
                  )}
                </div>
                <p className="text-blue-800 mt-1">
                  Đã tự động sao chép thông số và chọn <strong>kẽm cũ ngày {originalPlateDate}</strong>. Bạn có thể thay đổi số lượng in hoặc kích thước nếu cần.
                </p>
              </div>
            </div>
          )}

          {/* Quick Parser Bar */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-2xl border border-amber-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-current" />
                Nhập nhanh như tin nhắn Zalo (Auto-fill)
              </span>
              <span className="text-[11px] text-amber-700">Tự điền số lượng, giấy, khổ, thợ</span>
            </div>
            <div className="flex gap-2">
              <input
                ref={quickInputRef}
                type="text"
                value={quickInput}
                onChange={(e) => handleQuickParse(e.target.value)}
                placeholder="VD: 5150 tờ kraft 70 25x48 @Bố Vinh kẽm cũ"
                className="flex-1 px-3 py-2 bg-white text-xs sm:text-sm font-medium rounded-xl border border-amber-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 text-neutral-900"
              />
              <button
                type="button"
                onClick={() => handleQuickParse(quickInput)}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                Nhận diện
              </button>
            </div>
          </div>

          {/* Product Name Field (Dễ tìm kiếm in lại) */}
          <div className="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Tên sản phẩm / Tên túi (Tùy chọn)
              </label>
              <span className="text-[11px] text-amber-800 font-medium">
                💡 Dễ tìm kiếm để in lại sau này
              </span>
            </div>
            <input
              type="text"
              value={orderProductName}
              onChange={(e) => setOrderProductName(e.target.value)}
              placeholder="VD: Túi Bánh Mì Cay Hải Phòng 27.5x46, Túi Kebab Istanbul..."
              className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs sm:text-sm font-semibold text-neutral-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>

          {/* Technical print images are independent from Sales Product photos. */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-amber-600" />
                Ảnh ghép in kỹ thuật ({items.length} ảnh)
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                + THÊM ẢNH GHÉP IN
              </button>
            </div>

            {/* Items Grid */}
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="p-3 bg-neutral-50 rounded-2xl border border-neutral-200 flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                >
                  {/* Image Preview & Upload */}
                  <div className="relative group w-20 h-20 sm:w-24 sm:h-24 bg-neutral-200 rounded-xl overflow-hidden shrink-0 border border-neutral-300">
                    <img
                      src={item.imageUrl || SAMPLE_BAG_IMAGES.kraft_pate}
                      alt="Sample"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer text-[10px] font-semibold text-center p-1">
                      <UploadCloud className="w-4 h-4 mb-0.5" />
                      Đổi ảnh
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleItemImageUpload(index, e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Item Details */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase">
                        Nhãn ảnh ghép in (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={item.productName.startsWith('Mẫu ') ? '' : item.productName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItems(prev => prev.map((it, idx) => idx === index ? { ...it, productName: val || `Mẫu ${index + 1}`, customerName: val } : it));
                        }}
                        placeholder={`VD: Thanh Quang, Duy Uyên`}
                        className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium focus:border-amber-500 outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-neutral-500 uppercase">
                        Số tờ của ảnh này
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setItems(prev => prev.map((it, idx) => idx === index ? { ...it, quantity: val } : it));
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-amber-900 focus:border-amber-500 outline-hidden"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-neutral-500 uppercase">
                          Màu in riêng
                        </label>
                        <input
                          type="text"
                          value={item.color}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems(prev => prev.map((it, idx) => idx === index ? { ...it, color: val } : it));
                          }}
                          placeholder={color}
                          className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium focus:border-amber-500 outline-hidden"
                        />
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 mt-3.5 text-neutral-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Xóa mẫu này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-neutral-400 italic">
              💡 Ảnh ghép in do Thiết kế dán/upload riêng. Ảnh Product bán hàng chỉ để nhận diện, không tự dùng ở đây.
            </p>
          </div>

          {/* 2. SPECS: PAPER TYPE & GSM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Paper Type */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5 block">
                Loại giấy
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activePaperTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setPaperType(type);
                      if (type.toLowerCase() === 'kraft') setPaperGsm('70');
                      if (type.toLowerCase() === 'op') setPaperGsm('60');
                    }}
                    className={`py-2 px-3 text-xs font-bold rounded-xl transition-all border cursor-pointer text-center ${
                      paperType.toLowerCase() === type.toLowerCase()
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Paper GSM */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5 block">
                Định lượng (GSM)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activeGsmList.map((gsm) => (
                  <button
                    key={gsm}
                    type="button"
                    onClick={() => setPaperGsm(gsm)}
                    className={`py-2 px-3 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                      paperGsm === gsm
                        ? 'bg-neutral-900 text-white border-neutral-950 shadow-xs'
                        : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    {gsm}
                  </button>
                ))}
                <input
                  type="text"
                  value={paperGsm}
                  onChange={(e) => setPaperGsm(e.target.value)}
                  placeholder="Khác"
                  className="w-16 px-2 py-1 text-center bg-white border border-neutral-200 rounded-xl text-xs font-bold"
                />
              </div>
            </div>
          </div>

          {/* 3. SIZE & COLOR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Size */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5 block">
                Khổ giấy (cm)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(e.target.value)}
                  placeholder="25"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-center focus:bg-white focus:border-amber-500 outline-hidden"
                />
                <span className="font-bold text-neutral-400">×</span>
                <input
                  type="text"
                  value={paperHeight}
                  onChange={(e) => setPaperHeight(e.target.value)}
                  placeholder="48"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-center focus:bg-white focus:border-amber-500 outline-hidden"
                />
              </div>
              {/* Quick Size Chips */}
              <div className="flex gap-1.5 mt-1.5">
                {COMMON_SIZES.map((sz) => (
                  <button
                    key={sz.label}
                    type="button"
                    onClick={() => {
                      setPaperWidth(sz.width);
                      setPaperHeight(sz.height);
                    }}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium cursor-pointer ${
                      paperWidth === sz.width && paperHeight === sz.height
                        ? 'bg-amber-100 border-amber-300 text-amber-900 font-bold'
                        : 'bg-neutral-100/80 border-neutral-200 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5 block">
                Màu in
              </label>
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="VD: Xanh + Nâu, Đỏ mận..."
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold focus:bg-white focus:border-amber-500 outline-hidden"
              />
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {COMMON_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setColor(col)}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium cursor-pointer ${
                      color === col
                        ? 'bg-neutral-900 border-neutral-950 text-white font-bold'
                        : 'bg-neutral-100/80 border-neutral-200 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {col}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. PRINTER & PLATE (KẼM) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Printer Selection */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5 block">
                Thợ in phụ trách
              </label>
              <select
                value={printerId}
                onChange={(e) => setPrinterId(e.target.value)}
                className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold focus:bg-white focus:border-amber-500 outline-hidden cursor-pointer"
              >
                {users
                  .filter(u => u.role === 'PRINTER' || u.role === 'ADMIN')
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      @{u.name} ({u.role === 'PRINTER' ? 'Thợ in' : 'Quản lý'})
                    </option>
                  ))}
              </select>
            </div>

            {/* Plate (Kẽm) */}
            <div className="sm:col-span-2 bg-neutral-50/80 p-3.5 rounded-2xl border border-neutral-200">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-2 flex items-center justify-between">
                <span>Tình trạng bản kẽm</span>
                <span className="text-[11px] font-normal text-neutral-500">Quy trình kẽm xưởng in</span>
              </label>
              
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlateType('NEW');
                    setPlateStatus('NOT_SENT');
                    setPlateDate(getTodayFormatted());
                    setOriginalPlateDate(getTodayFormatted());
                    setPlateNote('');
                  }}
                  className={`py-2.5 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1 ${
                    plateType === 'NEW'
                      ? 'bg-red-500 text-white border-red-600 shadow-xs ring-2 ring-red-300/50'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <span className="text-sm">🔴</span>
                  <span>Kẽm mới</span>
                  <span className="text-[10px] opacity-80">Ra kẽm hôm nay</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPlateType('OLD');
                    setPlateStatus('OLD_PLATE');
                  }}
                  className={`py-2.5 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1 ${
                    plateType === 'OLD'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300/50'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <span className="text-sm">🟢</span>
                  <span>In kẽm cũ</span>
                  <span className="text-[10px] opacity-80">Dùng lại kẽm đã có</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPlateType('NONE');
                    setPlateStatus('NOT_REQUIRED');
                    setPlateNote('Không cần kẽm');
                  }}
                  className={`py-2.5 px-2 text-xs font-bold rounded-xl border transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-1 ${
                    plateType === 'NONE'
                      ? 'bg-neutral-800 text-white border-neutral-900 shadow-xs ring-2 ring-neutral-300/50'
                      : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <span className="text-sm">⚪</span>
                  <span>Không cần</span>
                  <span className="text-[10px] opacity-80">Gia công/khác</span>
                </button>
              </div>

              {/* Kẽm cũ details */}
              {plateType === 'OLD' && (
                <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-bold text-emerald-900 block mb-1">
                        📅 Kẽm cũ ra ngày:
                      </label>
                      <input
                        type="text"
                        value={originalPlateDate || plateDate}
                        onChange={(e) => {
                          setPlateDate(e.target.value);
                          setOriginalPlateDate(e.target.value);
                        }}
                        placeholder="VD: 12/02/2025"
                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-emerald-950 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-emerald-900 block mb-1">
                        📦 Vị trí lưu kẽm / Ghi chú:
                      </label>
                      <input
                        type="text"
                        value={plateNote}
                        onChange={(e) => setPlateNote(e.target.value)}
                        placeholder="VD: Kệ O1, Hộp kẽm số 3..."
                        className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-medium text-emerald-950 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-emerald-800 flex items-center gap-1">
                    <span>💡</span>
                    <span>Hệ thống tự động ghi nhớ ngày kẽm gốc (<strong>{originalPlateDate || plateDate || '12/02/2025'}</strong>) để kế thừa qua các đợt in lại sau này.</span>
                  </p>
                </div>
              )}

              {/* Kẽm mới details */}
              {plateType === 'NEW' && (
                <div className="mt-2 text-[11px] text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200">
                  📌 Kẽm mới xuất ngày hôm nay ({getTodayFormatted()}). Khi tạo lệnh xong, bạn nhớ giục nhà kẽm gửi sang xưởng in!
                </div>
              )}
            </div>

          </div>

          {/* 5. GHI CHÚ */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1.5 block">
              Ghi chú sản xuất cho thợ
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Xanh nâu mỗi màu 2600 tờ, giao hàng gấp chiều mai..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm font-medium focus:bg-white focus:border-amber-500 outline-hidden"
            />
          </div>

          {/* Total Sheets Counter preview */}
          <div className="p-3.5 bg-amber-500/10 rounded-2xl border border-amber-300/60 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase">
              Tổng số tờ in (tổng các ảnh ghép):
            </span>
            <span className="text-2xl font-black text-amber-950">
              {totalSheets.toLocaleString('vi-VN')} <span className="text-sm font-semibold text-amber-800">tờ ({paperType} {paperGsm})</span>
            </span>
          </div>

          {/* Modal Footer / Giant Action Button */}
          <div className="pt-2">
            <button
              id="btn-submit-create-order"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 active:scale-98 text-white font-black text-base sm:text-lg rounded-2xl shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-5 h-5 stroke-[2.5]" />
              <span>RA LỆNH IN NGAY</span>
            </button>
          </div>

        </form>

      </div>

    </div>
  );
};
