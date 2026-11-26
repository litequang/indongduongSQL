import React, { useState } from 'react';
import { X, Scissors, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProductionOrder, FinishingType } from '../types';

interface FinishingHandoffModalProps {
  order: ProductionOrder | null;
  onClose: () => void;
}

const FINISHING_TYPES: FinishingType[] = ['Dán', 'Cắt', 'Bế', 'Xén', 'Đục lỗ', 'Đóng gói', 'Khác'];

export const FinishingHandoffModal: React.FC<FinishingHandoffModalProps> = ({ order, onClose }) => {
  const { handoffToFinishing, users, setSelectedOrder } = useApp();
  const [selectedFinisherId, setSelectedFinisherId] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<FinishingType[]>(['Dán', 'Đóng gói']);
  const [note, setNote] = useState(order?.finishingNote || 'Dán mép túi, đóng gói 100 túi/bó');

  if (!order) return null;

  const finisherUsers = users.filter(u => u.role === 'FINISHER' || u.role === 'ADMIN');
  const defaultFinisher = finisherUsers[0]?.id || users[0].id;

  const toggleType = (t: FinishingType) => {
    if (selectedTypes.includes(t)) {
      if (selectedTypes.length > 1) {
        setSelectedTypes(selectedTypes.filter(item => item !== t));
      }
    } else {
      setSelectedTypes([...selectedTypes, t]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handoffToFinishing(order.id, selectedFinisherId || defaultFinisher, selectedTypes, note.trim() || undefined);
    setSelectedOrder(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-purple-200 overflow-hidden text-neutral-800">
        
        {/* Header */}
        <div className="p-4 border-b border-purple-100 flex items-center justify-between bg-purple-50/70">
          <div className="flex items-center gap-2 text-purple-800">
            <Scissors className="w-5 h-5 text-purple-600" />
            <h3 className="font-extrabold text-base">
              Chuyển Gia Công #{order.code}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          
          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1.5">
              Chọn công đoạn gia công
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {FINISHING_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    selectedTypes.includes(type)
                      ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                      : 'bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">
              Người / Tổ nhận gia công
            </label>
            <select
              value={selectedFinisherId || defaultFinisher}
              onChange={(e) => setSelectedFinisherId(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:bg-white focus:border-purple-500 outline-hidden"
            >
              {finisherUsers.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'FINISHER' ? 'Tổ gia công' : 'Quản lý'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-600 uppercase tracking-wider block mb-1">
              Yêu cầu quy cách gia công
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Dán mép đáy 3cm, bó 100 túi..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:bg-white focus:border-purple-500 outline-hidden"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 active:scale-98 text-white font-extrabold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>CHUYỂN TỔ GIA CÔNG</span>
          </button>
        </form>

      </div>
    </div>
  );
};
