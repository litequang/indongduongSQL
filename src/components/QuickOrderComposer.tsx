import React, { useState, useEffect, useRef } from 'react';
import {
  Zap,
  Clipboard,
  Plus,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  X,
  Scissors,
  Tag,
  Hash
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { parseQuickOrderText } from '../utils/textParser';
import { findUniquePrinterMatch } from '../utils/printerMatching';
import { PlateStatus } from '../types';
import { imageStorageService, PreparedImage } from '../services/imageStorageService';
import { useSynchronousSubmissionLock } from '../utils/submissionLock';
import { hasProductionTechnicalAuthority } from '../permissions';

export const QuickOrderComposer: React.FC = () => {
  const { currentUser, users, createOrder, setPreviewImage, appConfig } = useApp();

  const isDesigner = currentUser.role === 'DESIGNER';
  const [isAccordionOpen, setIsAccordionOpen] = useState(isDesigner);
  const [promptText, setPromptText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);
  const [isSubmitting, tryAcquireSubmit, releaseSubmit] = useSynchronousSubmissionLock();

  // Sync accordion state on role change
  useEffect(() => {
    setIsAccordionOpen(currentUser.role === 'DESIGNER');
  }, [currentUser.role]);

  // Listen for open-quick-composer event across the app
  useEffect(() => {
    const handleOpenComposer = () => {
      setIsAccordionOpen(true);
      setTimeout(() => {
        if (composerRef.current) {
          composerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        inputRef.current?.focus();
        inputRef.current?.classList.add('ring-4', 'ring-amber-400');
        setTimeout(() => inputRef.current?.classList.remove('ring-4', 'ring-amber-400'), 1500);
      }, 100);
    };

    window.addEventListener('open-quick-composer', handleOpenComposer);
    return () => window.removeEventListener('open-quick-composer', handleOpenComposer);
  }, []);

  // Mention Autocomplete state
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);

  // Form Fields
  const [paperType, setPaperType] = useState<string>('Kraft');
  const [paperGsm, setPaperGsm] = useState('70');
  const [paperWidth, setPaperWidth] = useState('25');
  const [paperHeight, setPaperHeight] = useState('48');
  const [color, setColor] = useState('Nâu');
  const [printerId, setPrinterId] = useState('');
  const [plateType, setPlateType] = useState<'NEW' | 'OLD' | 'UNKNOWN' | 'NONE'>('NEW');
  const [plateStatus, setPlateStatus] = useState<PlateStatus>('NOT_SENT');
  const [plateNote, setPlateNote] = useState('');
  const [note, setNote] = useState('');
  const [finishingNote, setFinishingNote] = useState('');
  const [requiresFinishing, setRequiresFinishing] = useState(true);
  const [sapoCode, setSapoCode] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Dynamic available paper types and GSMs from settings
  const availablePaperTypes = appConfig?.production?.paperTypes?.length
    ? appConfig.production.paperTypes
    : ['Kraft', 'OP', 'MG', 'Fort', 'Duplex', 'BB', 'Ivory', 'Couche', 'Khác'];

  const availableGsmList = appConfig?.production?.defaultGsmList?.length
    ? appConfig.production.defaultGsmList
    : ['40', '45', '50', '55', '58', '60', '70', '80', '90', '100', '120', '150', '250', '300'];

  // Attached images (supports 1 or multiple pasted images via Ctrl + V)
  const [images, setImages] = useState<Array<{
    id: string;
    url: string;
    localImage?: PreparedImage;
    customerName: string;
    quantity: number;
    color: string;
  }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const mentionMenuRef = useRef<HTMLDivElement>(null);
  const currentParsedQtyRef = useRef<number>(2600);

  // Filter printers for @ mention popup
  const printerUsers = users.filter(u => u.active && u.role === 'PRINTER');
  const filteredPrinters = printerUsers.filter(u =>
    u.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
    (mentionQuery.toLowerCase().includes('thiện') && u.name.toLowerCase().includes('thiện')) ||
    (mentionQuery.toLowerCase().includes('vinh') && u.name.toLowerCase().includes('vinh'))
  );

  // Global window paste handler: ANYWHERE user presses Ctrl+V with an image, it captures it!
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const clipboardItems = e.clipboardData?.items;
      if (!clipboardItems) return;

      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.indexOf('image') !== -1) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            try {
              const preparedImage = await imageStorageService.prepareImage(file);
              if (preparedImage) {
                const targetQty = currentParsedQtyRef.current || 2600;

                setImages((prev) => {
                  const updatedPrev = prev.map(img => ({
                    ...img,
                    quantity: img.quantity || targetQty
                  }));

                  return [
                    ...updatedPrev,
                    {
                      id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                      url: preparedImage.previewUrl,
                      localImage: preparedImage,
                      customerName: `Mẫu ${prev.length + 1}`,
                      quantity: targetQty,
                      color: color
                    }
                  ];
                });

                // Show toast & focus text input
                setPasteFeedback(`📸 Đã dán ảnh qua Ctrl+V (${targetQty.toLocaleString('vi-VN')} tờ/mẫu)!`);
                setTimeout(() => setPasteFeedback(null), 4000);
                setTimeout(() => inputRef.current?.focus(), 100);
              }
            } catch (err) {
              console.warn('Failed to compress global paste image:', err);
            }
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [color]);

  // Handle Text Change & @ Mention Triggering
  const handlePromptChange = (text: string) => {
    setPromptText(text);

    // Check for @ mention trigger
    const atIndex = text.lastIndexOf('@');
    if (atIndex !== -1) {
      const textAfterAt = text.substring(atIndex + 1);
      if (!textAfterAt.includes(' ') || textAfterAt.length < 15) {
        setMentionQuery(textAfterAt);
        setShowMentionMenu(true);
        setSelectedMentionIdx(0);
      } else {
        setShowMentionMenu(false);
      }
    } else {
      setShowMentionMenu(false);
    }

    // Auto-parse prompt text with dynamic paper types & GSMs
    applyParsedSyntax(text);
  };

  const applyParsedSyntax = (text: string) => {
    const parsed = parseQuickOrderText(text, {
      paperTypes: availablePaperTypes,
      defaultGsmList: availableGsmList
    });

    if (parsed.paperType) setPaperType(parsed.paperType);
    if (parsed.paperGsm) setPaperGsm(parsed.paperGsm);
    if (parsed.paperWidth) setPaperWidth(parsed.paperWidth);
    if (parsed.paperHeight) setPaperHeight(parsed.paperHeight);
    if (parsed.color) setColor(parsed.color);
    if (parsed.note !== undefined) setNote(parsed.note);
    if (parsed.sapoCode) setSapoCode(parsed.sapoCode);
    if (parsed.tags && parsed.tags.length > 0) {
      setTags(prev => Array.from(new Set([...prev, ...(parsed.tags || [])])));
    }

    const matchedPrinter = findUniquePrinterMatch(parsed.printerName || text, users);
    if (matchedPrinter) setPrinterId(matchedPrinter.id);

    if (parsed.plateType) {
      setPlateType(parsed.plateType);
      if (parsed.plateType === 'OLD') {
        setPlateStatus('OLD_PLATE');
        if (parsed.plateNote) setPlateNote(parsed.plateNote);
      } else if (parsed.plateType === 'NEW') {
        setPlateStatus('NOT_SENT');
      }
    }

    if (parsed.quantity && parsed.quantity > 0) {
      currentParsedQtyRef.current = parsed.quantity;
      setImages(prev => prev.map(img => ({ ...img, quantity: parsed.quantity! })));
    }
  };

  // Select printer from @ mention dropdown
  const handleSelectPrinterMention = (printer: typeof users[0]) => {
    const atIndex = promptText.lastIndexOf('@');
    if (atIndex !== -1) {
      const beforeAt = promptText.substring(0, atIndex);
      const newText = `${beforeAt}@Thợ in ${printer.name.split(' ').pop()} `;
      setPromptText(newText);
      setPrinterId(printer.id);
      applyParsedSyntax(newText);
    }
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  // Keyboard navigation for @ mention menu & instant Enter submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionMenu && filteredPrinters.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIdx(prev => (prev + 1) % filteredPrinters.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIdx(prev => (prev - 1 + filteredPrinters.length) % filteredPrinters.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const uniquePrinter = findUniquePrinterMatch(promptText, users);
        if (uniquePrinter && filteredPrinters.length === 1) {
          setPrinterId(uniquePrinter.id);
          setShowMentionMenu(false);
          void handleSubmit(e, true, uniquePrinter.id);
        } else {
          handleSelectPrinterMention(filteredPrinters[selectedMentionIdx]);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleSelectPrinterMention(filteredPrinters[selectedMentionIdx]);
      } else if (e.key === 'Escape') {
        setShowMentionMenu(false);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e, true);
    }
  };

  const handleAddSampleItem = () => {
    const nextIdx = images.length + 1;
    const targetQty = currentParsedQtyRef.current || 2600;

    setImages(prev => [
      ...prev,
      {
        id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        url: '',
        customerName: `Mẫu ${nextIdx}`,
        quantity: targetQty,
        color: color
      }
    ]);
  };

  const handleRemoveImage = (id: string) => {
    imageStorageService.removePreview(images.find((image) => image.id === id)?.localImage);
    setImages(images.filter(img => img.id !== id));
  };

  const handleAddTag = () => {
    const rawInput = tagInput.trim().replace(/^#/, '');
    if (!rawInput) return;
    
    // Phân tách bằng dấu phẩy
    const newTags = rawInput.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    
    const uniqueTags = [...new Set([...tags, ...newTags])];
    setTags(uniqueTags);
    
    // Check if any tag matches Sapo code
    for (const t of newTags) {
      if (/^sapo[-_]?[0-9]+/i.test(t) && !sapoCode) {
        setSapoCode(t.toUpperCase());
        break;
      }
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
    if (sapoCode === tagToRemove) {
      setSapoCode('');
    }
  };

  const calculatedTotalSheets = images.length > 0
    ? images.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    : (currentParsedQtyRef.current || 2600);

  const handleSubmit = async (e: React.FormEvent, isDraft = true, printerIdOverride?: string) => {
    e.preventDefault();

    if (calculatedTotalSheets <= 0) {
      alert('Vui lòng nhập số lượng tờ in hợp lệ (VD: 5150 hoặc 2600)!');
      return;
    }

    if (!tryAcquireSubmit()) return;
    try {

    const effectivePrinterId = printerIdOverride || printerId;
    const assignedPrinter = users.find(u => u.id === effectivePrinterId && u.role === 'PRINTER');

    const finalItems = images.length > 0
      ? images.map((it, idx) => {
          const isDefaultName = !it.customerName || it.customerName.startsWith('Mẫu ');
          const nameFromTags = tags.length > 0 ? tags.join(', ') : undefined;
          const finalName = (isDefaultName && nameFromTags) ? nameFromTags : (it.customerName || `Mẫu ${idx + 1}`);

          return {
            id: it.id,
            imageUrl: it.url || '',
            customerName: finalName,
            productName: finalName,
            sapoCode: sapoCode || undefined,
            tags: tags.length > 0 ? tags : undefined,
            quantity: Number(it.quantity) || 0,
            requiresFinishing,
            color: it.color || color,
            oldPlateReference: plateType === 'OLD' ? (plateNote || 'Kẽm cũ') : undefined
          };
        })
      : [{
          id: 'item-1',
          imageUrl: '',
          customerName: tags.length > 0 ? tags.join(', ') : 'Mẫu 1',
          productName: tags.length > 0 ? tags.join(', ') : `Túi ${paperType} ${paperWidth}x${paperHeight}`,
          sapoCode: sapoCode || undefined,
          tags: tags.length > 0 ? tags : undefined,
          quantity: calculatedTotalSheets,
          requiresFinishing,
          color: color,
          oldPlateReference: plateType === 'OLD' ? (plateNote || 'Kẽm cũ') : undefined
        }];

    const creation = createOrder({
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      designerId: currentUser.id,
      designerName: currentUser.name,
      printerId: assignedPrinter?.id || '',
      printerName: assignedPrinter?.name || '',
      instructionRaw: promptText.trim(),
      sapoCode: sapoCode || undefined,
      tags: tags.length > 0 ? tags : undefined,
      paperType: paperType as any,
      paperGsm,
      paperWidth,
      paperHeight,
      totalSheets: calculatedTotalSheets,
      color,
      note: note.trim() || undefined,
      finishingNote: finishingNote.trim() || undefined,
      plateType,
      plateStatus,
      plateNote: plateNote.trim() || (plateType === 'OLD' ? 'Kẽm cũ' : undefined),
      items: finalItems
    }, {
      isDraft,
      localImages: Object.fromEntries(images.flatMap((image) => image.localImage ? [[image.id, image.localImage]] : [])),
    });

    // Reset immediately; local draft persistence never waits for Firebase.
    setPromptText('');
    images.forEach((image) => imageStorageService.removePreview(image.localImage));
    setImages([]);
    setFinishingNote('');
    setRequiresFinishing(true);
    setNote('');
    setSapoCode('');
    setTags([]);
    setPrinterId('');
    setPaperType('Kraft');
    setPaperGsm('70');
    setPaperWidth('25');
    setPaperHeight('48');
    setColor('Nâu');
    setPlateType('NEW');
    setPlateStatus('NOT_SENT');
    setPlateNote('');
    currentParsedQtyRef.current = 2600;

    const created = await creation;

    // Keep focus on input for continuous ultra-fast workflow (Paste -> Enter -> Paste -> Enter)
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    if (isDraft) {
      setPasteFeedback(`⚡ ĐÃ TẠO LỆNH IN #${created.code}! (Bấm Enter hoặc dán tiếp để tạo lệnh kế)`);
    } else {
      setPasteFeedback(`🚀 Đã tạo & phát lệnh in #${created.code} cho thợ in @${assignedPrinter?.name || 'chưa chọn'}!`);
    }
    setTimeout(() => setPasteFeedback(null), 5000);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not create the production order. Please retry.');
    } finally {
      releaseSubmit();
    }
  };

  // This must follow every hook: a real-time role change must not alter the
  // component hook order while it remains mounted.
  if (!hasProductionTechnicalAuthority(currentUser)) return null;

  // Non-designer (Admin / Manager) collapsed accordion view
  if (!isDesigner && !isAccordionOpen) {
    return (
      <div
        ref={composerRef}
        id="quick-order-composer"
        className="bg-white rounded-3xl border border-amber-300 shadow-xs overflow-hidden transition-all duration-200"
      >
        <button
          type="button"
          onClick={() => {
            setIsAccordionOpen(true);
            setTimeout(() => inputRef.current?.focus(), 150);
          }}
          className="w-full bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 hover:from-amber-500/20 hover:to-orange-500/20 p-3 sm:p-4 flex items-center justify-between gap-3 text-left transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-500 text-white rounded-2xl group-hover:scale-105 transition-transform shadow-xs flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 fill-current animate-pulse" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                  ⚡ Ra Lệnh In Siêu Tốc
                </span>
                <span className="px-2 py-0.5 bg-amber-200/90 text-amber-900 text-[10px] font-black rounded-md">
                  Chế độ Quản Lý • Bấm để mở form
                </span>
              </div>
              <p className="text-[11px] text-neutral-600 truncate mt-0.5">
                Dán ảnh mẫu qua <b>Ctrl + V</b> và gõ lệnh in nhận diện tự động giấy Duplex, BB, Kraft...
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block text-xs font-black text-amber-900 bg-white/80 border border-amber-300 px-3 py-1.5 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-all shadow-2xs">
              + Mở Soạn Lệnh In
            </span>
            <div className="p-1.5 rounded-xl bg-amber-200 text-amber-950">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={composerRef}
      id="quick-order-composer"
      className={`bg-white rounded-3xl overflow-hidden transition-all duration-200 ${
        isDesigner
          ? 'border-2 border-amber-400 shadow-md ring-2 ring-amber-400/20'
          : 'border border-amber-300 shadow-sm'
      }`}
    >
      {/* 1. COMPOSER TOP HEADER */}
      <div className={`text-white p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
        isDesigner
          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 shadow-inner'
          : 'bg-gradient-to-r from-neutral-800 via-neutral-900 to-neutral-800'
      }`}>
        <div className="flex items-start md:items-center gap-2.5 flex-1 min-w-0 w-full">
          <span className="p-1.5 bg-white/20 rounded-xl backdrop-blur-xs shrink-0 mt-0.5 md:mt-0">
            <Zap className="w-5 h-5 fill-white text-white animate-pulse" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black tracking-tight shrink-0">
                RA LỆNH IN SIÊU TỐC
              </h2>
              {isDesigner ? (
                <span className="bg-white text-amber-900 text-[11px] font-black px-2 py-0.5 rounded-full shadow-2xs whitespace-nowrap">
                  Thiết Kế • 10 Giây
                </span>
              ) : (
                <span className="bg-amber-500 text-neutral-950 text-[11px] font-black px-2 py-0.5 rounded-full shadow-2xs whitespace-nowrap">
                  Quản Lý Xưởng
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-[11.5px] text-amber-100/90 font-medium break-words mt-0.5 leading-snug">
              Chụp màn hình mẫu → <b>Ctrl + V</b> dán ảnh → Gõ cú pháp: <br className="sm:hidden" />
              <i>Duplex 250 25x48 2600 tờ @Thiện #SAPO-123</i>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto mt-1 md:mt-0">
          <button
            type="button"
            onClick={handleAddSampleItem}
            className="text-xs font-bold bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
            title="Thêm mẫu thứ 2 để in ghép"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>+ Ghép mẫu</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-bold bg-black/20 hover:bg-black/30 text-white px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>{isExpanded ? 'Thu gọn' : 'Tùy chỉnh'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Accordion Collapse button for Admin / Developer */}
          {!isDesigner && (
            <button
              type="button"
              onClick={() => setIsAccordionOpen(false)}
              className="text-xs font-bold bg-white/20 hover:bg-white/30 text-white px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer ml-1"
              title="Thu gọn Accordion"
            >
              <span>Đóng</span>
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. PASTE NOTIFICATION TOAST */}
      {pasteFeedback && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {pasteFeedback}
          </span>
          <button onClick={() => setPasteFeedback(null)} className="text-white/80 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. MAIN COMPOSER FORM */}
      <form onSubmit={(e) => handleSubmit(e, true)} className="p-3.5 sm:p-5 space-y-4">
        
        {/* Top Row: Images Preview / Paste Dropzone + Prompt Input */}
        <div className="flex flex-col lg:flex-row gap-3.5 items-stretch">
          
          {/* Paste & Design Thumbnail Preview List */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 shrink-0">
            {images.length === 0 ? (
              <label className="w-full sm:w-44 h-20 sm:h-24 rounded-2xl border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-100/70 p-2.5 flex flex-col items-center justify-center text-center transition-all shrink-0 cursor-pointer select-none">
                <Clipboard className="w-5 h-5 text-amber-600 mb-1" />
                <span className="text-xs font-black text-amber-950 leading-tight">Ctrl + V để dán ảnh</span>
                <span className="text-[10px] text-amber-800/80 font-medium leading-none mt-1">
                  Chỉ hiện ảnh khi bạn dán
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      Array.from(e.target.files).forEach(file => {
                        imageStorageService.prepareImage(file).then((preparedImage) => {
                          const url = preparedImage.previewUrl;
                          const targetQty = currentParsedQtyRef.current || 2600;
                          setImages(prev => [
                            ...prev,
                            {
                              id: 'img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
                              url,
                              localImage: preparedImage,
                              customerName: `Mẫu ${prev.length + 1}`,
                              quantity: targetQty,
                              color: color
                            }
                          ]);
                        }).catch((error) => setPasteFeedback(imageStorageService.uploadErrorMessage(error)));
                      });
                    }
                  }}
                />
              </label>
            ) : (
              <>
                {images.map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-neutral-100 border-2 border-amber-400 overflow-hidden shrink-0 shadow-xs"
                  >
                    {item.url ? (
                      <img
                        src={item.url}
                        alt={item.customerName}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewImage(item.url)}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-neutral-100 text-neutral-400">
                        <Scissors className="w-4 h-4 mb-1 text-neutral-400" />
                        <span className="text-[9px] font-bold">Chưa có ảnh</span>
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent flex flex-col justify-end p-1.5 pointer-events-none">
                      <span className="text-[10px] font-bold text-white truncate">
                        {item.customerName || `Mẫu ${idx + 1}`}
                      </span>
                      <span className="text-[9px] text-amber-300 font-black">
                        {item.quantity?.toLocaleString('vi-VN')} tờ
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveImage(item.id)}
                      className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 opacity-90 group-hover:opacity-100 transition-opacity shadow-xs cursor-pointer"
                      title="Xóa mẫu này"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {/* Quick Drop / Paste Box for Ctrl + V to add more */}
                <label className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-dashed border-neutral-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-100/70 flex flex-col items-center justify-center text-center p-2 cursor-pointer transition-all shrink-0">
                  <Clipboard className="w-4 h-4 text-amber-600 mb-0.5" />
                  <span className="text-[10px] font-black text-amber-900 leading-tight">
                    Ctrl + V
                  </span>
                  <span className="text-[9px] text-neutral-500 font-medium leading-none mt-0.5">
                    + Dán thêm
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        imageStorageService.prepareImage(e.target.files[0]).then((preparedImage) => {
                          const url = preparedImage.previewUrl;
                          const targetQty = currentParsedQtyRef.current || 2600;
                          setImages(prev => [
                            ...prev,
                            {
                              id: 'img-' + Date.now(),
                              url: url,
                              localImage: preparedImage,
                              customerName: `Mẫu ${prev.length + 1}`,
                              quantity: targetQty,
                              color: color
                            }
                          ]);
                        }).catch((error) => setPasteFeedback(imageStorageService.uploadErrorMessage(error)));
                      }
                    }}
                  />
                </label>
              </>
            )}
          </div>

          {/* Quick Syntax Input & Action Button */}
          <div className="flex-1 flex flex-col justify-between gap-2.5">
            
            {/* Input with @ Mention Popup Dropdown */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={promptText}
                onChange={(e) => handlePromptChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="VD: Duplex 250 25x48 2600 tờ @Thiện #SAPO-9821 #banhmi → [Ấn Enter để tạo]"
                className="w-full px-4 py-3 sm:py-3.5 bg-neutral-50 hover:bg-white focus:bg-white text-xs sm:text-sm font-bold rounded-2xl border-2 border-neutral-200 focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20 text-neutral-900 outline-hidden transition-all placeholder:text-neutral-400 placeholder:font-normal"
              />

              {/* @ Mention Autocomplete Menu */}
              {showMentionMenu && filteredPrinters.length > 0 && (
                <div
                  ref={mentionMenuRef}
                  className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-neutral-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 max-h-56 overflow-y-auto"
                >
                  <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-100 flex items-center justify-between">
                    <span>Chọn thợ in phụ trách:</span>
                    <span className="text-amber-600 font-semibold">Dùng ↑ ↓ và Enter</span>
                  </div>

                  {filteredPrinters.map((printer, index) => {
                    const isSelected = index === selectedMentionIdx;
                    return (
                      <button
                        key={printer.id}
                        type="button"
                        onClick={() => handleSelectPrinterMention(printer)}
                        className={`w-full px-3.5 py-2 flex items-center justify-between text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-amber-50 text-amber-950 font-bold' : 'hover:bg-neutral-50 text-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={printer.avatar}
                            alt={printer.name}
                            className="w-7 h-7 rounded-full object-cover border border-neutral-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <p className="text-xs font-bold text-neutral-900 leading-tight">
                              @{printer.name}
                            </p>
                            <p className="text-[10px] text-neutral-500">
                              {printer.role === 'PRINTER' ? 'Thợ in' : 'Quản lý xưởng'}
                            </p>
                          </div>
                        </div>

                        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-md">
                          Chọn thợ
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* GHI CHÚ BỘ PHẬN GIA CÔNG */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-purple-50/90 p-2.5 rounded-2xl border border-purple-200/90 text-xs">
              <div className="flex items-center gap-1.5 text-purple-950 font-black shrink-0">
                <Scissors className="w-4 h-4 text-purple-700 stroke-[2.5]" />
                <span>Gia công:</span>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <label className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 font-bold text-purple-950">
                  <input
                    type="checkbox"
                    checked={requiresFinishing}
                    onChange={(event) => setRequiresFinishing(event.target.checked)}
                  />
                  Cần gia công
                </label>
                <input
                  type="text"
                  value={finishingNote}
                  onChange={(e) => setFinishingNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSubmit(e, true);
                    }
                  }}
                  placeholder="VD: Túi bế miệng, dán xong để riêng mỗi loại 1 thùng, xếp hông 5cm..."
                  className="flex-1 px-3 py-1.5 bg-white border border-purple-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-neutral-900 font-bold outline-hidden placeholder:text-neutral-400 placeholder:font-normal text-xs"
                />
                <div className="hidden md:flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFinishingNote(prev => prev ? `${prev}, Túi bế miệng` : 'Túi bế miệng')}
                    className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    + Bế miệng
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinishingNote(prev => prev ? `${prev}, Để riêng mỗi loại 1 thùng` : 'Để riêng mỗi loại 1 thùng')}
                    className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    + Riêng mỗi thùng
                  </button>
                </div>
              </div>
            </div>

            {/* TAGS / SAPO CODE ROW */}
            <div className="flex flex-wrap items-center gap-2 bg-blue-50/70 p-2 rounded-2xl border border-blue-200/70 text-xs">
              <div className="flex items-center gap-1.5 text-blue-950 font-black shrink-0">
                <Tag className="w-3.5 h-3.5 text-blue-700 stroke-[2.5]" />
                <span>Mã Sapo / Tags:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-900 font-bold rounded-lg text-[11px] border border-blue-300"
                  >
                    <Hash className="w-3 h-3 text-blue-600" />
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-blue-700 hover:text-red-600 ml-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    placeholder="+ Thêm mã Sapo/tag..."
                    className="px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-neutral-900 font-bold text-xs outline-hidden w-40"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Auto-Fill Chips Bar & Submit Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-neutral-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-neutral-400 font-bold text-[11px]">Đã nhận diện:</span>

                {sapoCode && (
                  <span className="bg-blue-600 text-white font-black px-2 py-0.5 rounded-lg text-xs flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    SAPO: {sapoCode}
                  </span>
                )}
                
                {note && (
                  <span className="bg-purple-100 text-purple-950 font-bold px-2 py-0.5 rounded-lg text-xs">
                    📝 {note}
                  </span>
                )}

                <span className="bg-amber-100 text-amber-950 font-black px-2.5 py-0.5 rounded-lg text-xs" title="Tổng số tờ in">
                  {calculatedTotalSheets.toLocaleString('vi-VN')} tờ
                  {images.length > 1 && (
                    <span className="font-semibold text-amber-800 ml-1 text-[11px]">
                      ({images.length} mẫu × {(images[0]?.quantity || 2600).toLocaleString('vi-VN')} tờ)
                    </span>
                  )}
                </span>
                
                <span className="bg-amber-500/15 text-amber-900 font-black px-2 py-0.5 rounded-lg text-xs border border-amber-300">
                  {paperType} {paperGsm}
                </span>

                <span className="bg-neutral-100 text-neutral-800 font-bold px-2 py-0.5 rounded-lg text-xs border border-neutral-200">
                  {paperWidth} × {paperHeight} cm
                </span>

                <span className="bg-neutral-100 text-neutral-800 font-bold px-2 py-0.5 rounded-lg text-xs border border-neutral-200">
                  Màu: {color}
                </span>

                <span className="bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-lg text-xs">
                  Thợ: @{users.find(u => u.id === printerId)?.name || 'Chưa chọn'}
                </span>

                <span className={`font-bold px-2 py-0.5 rounded-lg text-xs ${
                  plateStatus === 'NOT_SENT' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {plateStatus === 'NOT_SENT' ? '🔴 Kẽm mới' : '🟢 Kẽm cũ'}
                </span>
              </div>

              {/* Single Unified Action Button: Create Order with Enter shortcut */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:scale-98 text-white font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  title="Tạo lệnh in tạm thời. Bấm Enter trên bàn phím để tạo ngay!"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>TẠO LỆNH IN</span>
                  <span className="px-1.5 py-0.5 bg-black/20 text-white rounded-md text-[10px] font-bold border border-white/30 hidden sm:inline-block">
                    Enter ↵
                  </span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* 4. EXPANDABLE FINE-TUNING CONTROLS */}
        {isExpanded && (
          <div className="pt-3 border-t border-neutral-100 space-y-3 bg-neutral-50/70 p-3 sm:p-4 rounded-2xl">
            
            {/* Row 1: Paper Type, GSM, Size, Color */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              
              {/* Paper Type */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Loại giấy</label>
                <select
                  value={paperType}
                  onChange={(e) => setPaperType(e.target.value)}
                  className="w-full p-2 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 outline-hidden"
                >
                  {availablePaperTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* GSM */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Định lượng (GSM)</label>
                <div className="flex gap-1">
                  <select
                    value={availableGsmList.includes(paperGsm) ? paperGsm : 'custom'}
                    onChange={(e) => {
                      if (e.target.value !== 'custom') {
                        setPaperGsm(e.target.value);
                      }
                    }}
                    className="w-1/2 p-2 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 outline-hidden text-xs"
                  >
                    {availableGsmList.map(gsm => (
                      <option key={gsm} value={gsm}>{gsm} GSM</option>
                    ))}
                    <option value="custom">Khác...</option>
                  </select>
                  <input
                    type="text"
                    value={paperGsm}
                    onChange={(e) => setPaperGsm(e.target.value)}
                    placeholder="GSM"
                    className="w-1/2 p-2 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 outline-hidden text-xs text-center"
                  />
                </div>
              </div>

              {/* Size */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Khổ giấy (Rộng × Dài cm)</label>
                <div className="flex gap-1 items-center">
                  <input
                    type="text"
                    value={paperWidth}
                    onChange={(e) => setPaperWidth(e.target.value)}
                    className="w-1/2 p-2 text-center bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800"
                  />
                  <span>×</span>
                  <input
                    type="text"
                    value={paperHeight}
                    onChange={(e) => setPaperHeight(e.target.value)}
                    className="w-1/2 p-2 text-center bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800"
                  />
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Màu mực</label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full p-2 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 outline-hidden"
                />
              </div>

            </div>

            {/* Row 2: Printer & Plate Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              
              {/* Printer */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Thợ in nhận lệnh</label>
                <select
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="w-full p-2 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 outline-hidden"
                >
                  <option value="">@Chưa chọn</option>
                  {printerUsers.map(u => (
                    <option key={u.id} value={u.id}>@{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Plate Status */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Tình trạng kẽm in</label>
                <select
                  value={plateStatus}
                  onChange={(e) => setPlateStatus(e.target.value as PlateStatus)}
                  className="w-full p-2 bg-white border border-neutral-200 rounded-xl font-bold text-neutral-800 focus:border-amber-500 outline-hidden"
                >
                  <option value="NOT_SENT">🔴 Chưa gửi kẽm (Cần gửi ngay)</option>
                  <option value="SENT">🟡 Đã gửi kẽm (Chờ về xưởng)</option>
                  <option value="RECEIVED">🟢 Đã nhận kẽm</option>
                  <option value="OLD_PLATE">🟢 Dùng kẽm cũ sẵn có</option>
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="font-bold text-neutral-600 block mb-1">Ghi chú thêm</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: In trước 2000 tờ giao trước..."
                  className="w-full p-2 bg-white border border-neutral-200 rounded-xl font-medium text-neutral-800 focus:border-amber-500 outline-hidden"
                />
              </div>

            </div>

          </div>
        )}

      </form>
    </div>
  );
};
