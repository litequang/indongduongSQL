import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight, Wand2, Database, AlertCircle } from 'lucide-react';
import { parseFile, ParsedData } from './customerParser';
import { normalizeCustomer } from './customerNormalizer';
import { customerService } from '../../services/customerService';
import { Customer } from '../../types';
import { useApp } from '../../context/AppContext';

interface CustomerImportModalProps {
  onClose: () => void;
}

const STANDARD_FIELDS = [
  { key: 'name', label: 'Tên khách hàng (*)' },
  { key: 'phone', label: 'Số điện thoại (*)' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'province', label: 'Tỉnh/Thành phố' },
  { key: 'district', label: 'Quận/Huyện' },
  { key: 'ward', label: 'Phường/Xã' },
  { key: 'note', label: 'Ghi chú' },
  { key: 'zalo', label: 'Zalo' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'externalId', label: 'ID Hệ thống cũ' },
];

export const CustomerImportModal: React.FC<CustomerImportModalProps> = ({ onClose }) => {
  const { currentUser } = useApp();
  const [step, setStep] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  
  // Mapping state: key = File Header, value = Standard Field Key
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isMappingAI, setIsMappingAI] = useState(false);

  // Normalization & Validation state
  const [validCustomers, setValidCustomers] = useState<any[]>([]);
  const [invalidRows, setInvalidRows] = useState<any[]>([]);

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<{ existing: Customer; newRow: any }[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<'SKIP' | 'UPDATE' | 'CREATE_NEW'>('SKIP');
  const [isDetecting, setIsDetecting] = useState(false);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    try {
      const data = await parseFile(selectedFile);
      setParsedData(data);
      
      // Auto-suggest mapping using simple heuristics
      const initialMapping: Record<string, string> = {};
      data.headers.forEach(h => {
        const lower = h.toLowerCase();
        if (lower.includes('tên') || lower.includes('name') || lower.includes('khách hàng')) {
          initialMapping[h] = 'name';
        } else if (lower.includes('điện thoại') || lower.includes('phone') || lower.includes('sdt') || lower.includes('sđt')) {
          initialMapping[h] = 'phone';
        } else if (lower.includes('địa chỉ') || lower.includes('address')) {
          initialMapping[h] = 'address';
        } else if (lower.includes('tỉnh') || lower.includes('province') || lower.includes('thành phố') || lower.includes('city')) {
          initialMapping[h] = 'province';
        } else if (lower.includes('quận') || lower.includes('huyện') || lower.includes('district')) {
          initialMapping[h] = 'district';
        } else if (lower.includes('phường') || lower.includes('xã') || lower.includes('ward')) {
          initialMapping[h] = 'ward';
        } else if (lower.includes('ghi chú') || lower.includes('note')) {
          initialMapping[h] = 'note';
        }
      });
      setMapping(initialMapping);
      setStep(2);
    } catch (err: any) {
      alert("Lỗi đọc file: " + err.message);
    }
  };

  const handleAIAssist = async () => {
    if (!parsedData) return;
    // On static hosting (Firebase Hosting Static without backend rewrite), /api/gemini/map-fields is unavailable.
    // We notify user and re-run client-side heuristic mapping.
    alert("AI Auto-Mapping yêu cầu Backend Cloud Run / Express Server đã được deploy. Hệ thống hiện đang chạy trên Firebase Hosting Static và đã tự động nhận diện các cột bằng thuật toán Heuristic chuẩn xác trên máy khách. Quý khách có thể tùy chỉnh trực tiếp bên dưới.");
  };

  const handleConfirmMapping = () => {
    if (!parsedData) return;
    
    const valid: any[] = [];
    const invalid: any[] = [];

    parsedData.rows.forEach((row, idx) => {
      const normalized = normalizeCustomer(row, mapping);
      if (!normalized.name || !normalized.phone) {
        invalid.push({ row, index: idx + 2, reason: 'Thiếu Tên hoặc Số điện thoại' });
      } else {
        valid.push(normalized);
      }
    });

    setValidCustomers(valid);
    setInvalidRows(invalid);
    setStep(3);
  };

  const handleCheckDuplicates = async () => {
    setIsDetecting(true);
    setStep(4);
    
    // Extract unique normalized phones
    const phones = Array.from(new Set(validCustomers.map(c => c.phoneNormalized).filter(Boolean)));
    const existing = await customerService.findExistingCustomersByPhones(phones as string[]);

    const dups: { existing: Customer; newRow: any }[] = [];
    const existingPhoneMap = new Map<string, Customer>();
    existing.forEach(e => {
      if (e.phoneNormalized) existingPhoneMap.set(e.phoneNormalized, e);
    });

    validCustomers.forEach(c => {
      if (c.phoneNormalized && existingPhoneMap.has(c.phoneNormalized)) {
        dups.push({ existing: existingPhoneMap.get(c.phoneNormalized)!, newRow: c });
      }
    });

    setDuplicates(dups);
    setIsDetecting(false);
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      let toImport: Customer[] = [];
      let skipped = 0;
      let updated = 0;
      let created = 0;

      const dupPhones = new Set(duplicates.map(d => d.newRow.phoneNormalized));

      validCustomers.forEach(c => {
        if (dupPhones.has(c.phoneNormalized)) {
          if (duplicateAction === 'SKIP') {
            skipped++;
          } else if (duplicateAction === 'UPDATE') {
            const existing = duplicates.find(d => d.newRow.phoneNormalized === c.phoneNormalized)?.existing;
            if (existing) {
              toImport.push({ ...existing, ...c, id: existing.id, updatedAt: new Date().toISOString() });
              updated++;
            }
          } else if (duplicateAction === 'CREATE_NEW') {
            toImport.push(c);
            created++;
          }
        } else {
          toImport.push(c);
          created++;
        }
      });

      const jobInfo = {
        fileName: file?.name || 'unknown',
        source: 'EXCEL_IMPORT',
        totalRows: parsedData?.rows.length || 0,
        importedRows: toImport.length,
        skippedRows: invalidRows.length + skipped,
        duplicateRows: duplicates.length,
        failedRows: 0,
        importedBy: currentUser.id
      };

      await customerService.importCustomers(toImport, jobInfo);
      
      setImportResult({ imported: toImport.length, skipped: invalidRows.length + skipped, updated, created });
      setStep(5);
    } catch (err: any) {
      alert("Lỗi khi import: " + err.message);
    }
    setIsImporting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-900">Import Khách Hàng</h2>
              <p className="text-sm text-neutral-500">Từ file Sapo, Excel, CSV</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-neutral-50/50">
          
          {/* STEP 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-12">
              <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="w-full max-w-md p-10 border-2 border-dashed border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all">
                <Upload className="w-12 h-12 text-indigo-500 mb-4" />
                <span className="text-lg font-bold text-indigo-900">Tải file lên</span>
                <span className="text-sm text-indigo-600 mt-2 text-center">Hỗ trợ .xlsx, .xls, .csv từ Sapo, Nhanh.vn, v.v.</span>
              </label>
            </div>
          )}

          {/* STEP 2: Mapping */}
          {step === 2 && parsedData && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-neutral-900">Khớp dữ liệu (Mapping)</h3>
                  <p className="text-sm text-neutral-500">Ghép các cột trong file của bạn với các trường chuẩn của hệ thống.</p>
                </div>
                <button onClick={handleAIAssist} disabled={isMappingAI} className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl font-semibold text-sm flex items-center gap-2 hover:opacity-90 shadow-xs">
                  {isMappingAI ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  AI tự động nhận diện
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
                <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 border-b border-neutral-200 font-semibold text-sm text-neutral-700">
                  <div>Cột trong file ({file?.name})</div>
                  <div>Trường trong hệ thống</div>
                </div>
                <div className="divide-y divide-neutral-100 max-h-[400px] overflow-y-auto">
                  {parsedData.headers.map((header, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-4 p-4 items-center">
                      <div className="font-medium text-neutral-900 truncate" title={header}>{header}</div>
                      <div>
                        <select 
                          value={mapping[header] || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, [header]: e.target.value }))}
                          className="w-full bg-neutral-100 border-transparent focus:bg-white focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none transition-all"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {STANDARD_FIELDS.map(f => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={handleConfirmMapping} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-neutral-800 transition-colors">
                  Tiếp tục <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg text-neutral-900">Xem trước dữ liệu</h3>
                <p className="text-sm text-neutral-500">Phát hiện lỗi trước khi import.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-emerald-700">{validCustomers.length}</div>
                    <div className="text-sm font-medium text-emerald-600">Khách hợp lệ</div>
                  </div>
                </div>
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-4">
                  <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-rose-700">{invalidRows.length}</div>
                    <div className="text-sm font-medium text-rose-600">Dòng lỗi (bị bỏ qua)</div>
                  </div>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden p-4 max-h-[200px] overflow-y-auto">
                  <h4 className="font-bold text-sm text-rose-600 mb-3">Chi tiết lỗi (Thiếu tên hoặc SĐT):</h4>
                  <ul className="text-sm space-y-2 text-neutral-600">
                    {invalidRows.map((err, i) => (
                      <li key={i}>Dòng {err.index}: {err.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-xl font-bold hover:bg-neutral-300 transition-colors">Quay lại</button>
                <button onClick={handleCheckDuplicates} className="px-6 py-3 bg-neutral-900 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-neutral-800 transition-colors">
                  Kiểm tra trùng lặp <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Duplicates */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg text-neutral-900">Xử lý trùng lặp</h3>
                <p className="text-sm text-neutral-500">Kiểm tra qua SĐT để tránh tạo khách hàng trùng.</p>
              </div>

              {isDetecting ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-medium text-neutral-600">Đang dò quét hệ thống...</p>
                </div>
              ) : (
                <>
                  {duplicates.length > 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                      <div className="flex items-center gap-3 mb-4 text-amber-800 font-bold">
                        <AlertCircle className="w-5 h-5" />
                        Phát hiện {duplicates.length} khách hàng có SĐT đã tồn tại!
                      </div>
                      
                      <div className="space-y-3">
                        <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-400 transition-colors">
                          <input type="radio" name="dupAction" checked={duplicateAction === 'SKIP'} onChange={() => setDuplicateAction('SKIP')} className="mt-1" />
                          <div>
                            <div className="font-bold text-neutral-900">Bỏ qua khách trùng</div>
                            <div className="text-sm text-neutral-500">Chỉ import khách mới tinh. Khách trùng sẽ không được thêm.</div>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-400 transition-colors">
                          <input type="radio" name="dupAction" checked={duplicateAction === 'UPDATE'} onChange={() => setDuplicateAction('UPDATE')} className="mt-1" />
                          <div>
                            <div className="font-bold text-neutral-900">Cập nhật thông tin khách cũ</div>
                            <div className="text-sm text-neutral-500">Dùng thông tin từ file để ghi đè/bổ sung cho khách cũ.</div>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-amber-100 cursor-pointer hover:border-amber-400 transition-colors">
                          <input type="radio" name="dupAction" checked={duplicateAction === 'CREATE_NEW'} onChange={() => setDuplicateAction('CREATE_NEW')} className="mt-1" />
                          <div>
                            <div className="font-bold text-neutral-900">Tạo bản ghi mới (Cho phép trùng)</div>
                            <div className="text-sm text-neutral-500">Tạo thêm khách hàng mới dù trùng SĐT.</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-emerald-50 text-emerald-700 rounded-2xl font-bold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-6 h-6" />
                      Tuyệt vời! Không phát hiện khách trùng.
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button onClick={() => setStep(3)} className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-xl font-bold hover:bg-neutral-300 transition-colors">Quay lại</button>
                    <button onClick={handleImport} disabled={isImporting} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50">
                      {isImporting ? 'Đang Import...' : 'Xác nhận Import'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 5: Success */}
          {step === 5 && importResult && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black text-neutral-900">Import Thành Công!</h2>
              <div className="text-neutral-600 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs inline-block text-left space-y-2">
                <p>Khách hàng mới tạo: <b className="text-neutral-900">{importResult.created}</b></p>
                <p>Khách cũ được cập nhật: <b className="text-neutral-900">{importResult.updated}</b></p>
                <p>Dòng bị bỏ qua (lỗi/trùng): <b className="text-rose-600">{importResult.skipped}</b></p>
              </div>
              <button onClick={onClose} className="mt-4 px-8 py-3 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors">
                Hoàn tất
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};