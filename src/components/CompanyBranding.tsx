import React from 'react';
import { useApp } from '../context/AppContext';
import { Layers } from 'lucide-react';
import { ResolvedImage } from './ResolvedImage';

interface CompanyBrandingProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSlogan?: boolean;
  variant?: 'full' | 'icon-only' | 'text-only';
  inverted?: boolean;
}

export const CompanyBranding: React.FC<CompanyBrandingProps> = ({
  className = '',
  size = 'md',
  showSlogan = false,
  variant = 'full',
  inverted = false,
}) => {
  const { appConfig } = useApp();
  const company = appConfig?.company || {
    name: 'XƯỞNG IN TÚI BÁNH MÌ',
    shortName: 'PRINT',
    slogan: 'Hệ thống Quản lý Tiến độ In'
  };

  const getLogoSize = () => {
    switch (size) {
      case 'sm':
        return 'w-6 h-6 text-sm';
      case 'lg':
        return 'w-10 h-10 text-xl';
      case 'md':
      default:
        return 'w-8 h-8 text-base';
    }
  };

  const getTitleSize = () => {
    switch (size) {
      case 'sm':
        return 'text-xs';
      case 'lg':
        return 'text-lg';
      case 'md':
      default:
        return 'text-sm sm:text-base';
    }
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {variant !== 'text-only' && (
        <div
          className={`${getLogoSize()} rounded-xl flex items-center justify-center font-black shrink-0 overflow-hidden shadow-xs transition-transform duration-200 ${
            inverted
              ? 'bg-white text-neutral-900'
              : 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white'
          }`}
        >
          {company.logoUrl || company.logoImage ? (
            <ResolvedImage
              image={company.logoImage}
              legacyUrl={company.logoUrl}
              alt={company.name}
              className="w-full h-full object-contain p-0.5"
              referrerPolicy="no-referrer"
            />
          ) : (
            <img
              src="/icon.svg"
              alt={company.name}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      )}

      {variant !== 'icon-only' && (
        <div className="flex flex-col min-w-0 max-w-[125px] sm:max-w-none">
          <span
            className={`font-black tracking-tight leading-tight truncate ${getTitleSize()} ${
              inverted ? 'text-white' : 'text-neutral-900'
            }`}
          >
            {company.name}
          </span>
          {showSlogan && company.slogan && (
            <span
              className={`text-[10px] truncate leading-tight font-medium hidden sm:inline ${
                inverted ? 'text-neutral-300' : 'text-neutral-500'
              }`}
            >
              {company.slogan}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
