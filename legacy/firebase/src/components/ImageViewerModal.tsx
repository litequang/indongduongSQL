import React from 'react';
import { X, ZoomIn, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ImageViewerModal: React.FC = () => {
  const { previewImage, setPreviewImage } = useApp();

  if (!previewImage) return null;

  return (
    <div
      onClick={() => setPreviewImage(null)}
      className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 cursor-zoom-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-4xl max-h-[90dvh] flex flex-col items-center cursor-default"
      >
        <button
          onClick={() => setPreviewImage(null)}
          className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>

        <img
          src={previewImage}
          alt="Preview"
          className="max-h-[82dvh] w-auto object-contain rounded-2xl shadow-2xl border border-white/20"
          referrerPolicy="no-referrer"
        />

        <div className="mt-3 flex items-center gap-3 text-xs text-white/70">
          <span>Xem ảnh thiết kế túi thực tế</span>
          <span>•</span>
          <span>Bấm ra ngoài hoặc nút X để đóng</span>
        </div>
      </div>
    </div>
  );
};
