import { AppConfig } from '../types';

export const APP_VERSION = '3.1.0';
export const SCHEMA_VERSION = 1;

/**
 * Default workshop configuration used on initial bootstrap
 * or when setting up a fresh workshop instance.
 * Admins can modify any of these values from the in-app Settings UI.
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  company: {
    name: import.meta.env.VITE_DEFAULT_WORKSHOP_NAME || 'XƯỞNG IN',
    shortName: import.meta.env.VITE_DEFAULT_WORKSHOP_SHORTNAME || 'XƯỞNG IN',
    logoUrl: import.meta.env.VITE_DEFAULT_WORKSHOP_LOGO || '',
    phone: import.meta.env.VITE_DEFAULT_WORKSHOP_PHONE || '',
    address: import.meta.env.VITE_DEFAULT_WORKSHOP_ADDRESS || '',
    website: import.meta.env.VITE_DEFAULT_WORKSHOP_WEBSITE || '',
    slogan: import.meta.env.VITE_DEFAULT_WORKSHOP_TAGLINE || 'Quản lý sản xuất tập trung',
  },

  production: {
    paperTypes: ['Kraft', 'OP', 'MG', 'Fort', 'Duplex', 'BB', 'Ivory', 'Khác'],
    defaultGsmList: ['40', '45', '50', '55', '58', '60', '70', '80', '90', '100', '120', '150', '250', '300'],
    defaultSizes: ['25 × 48 cm', '27.5 × 48 cm', '30 × 44 cm', '25 × 46 cm', '20 × 35 cm'],
    colorsList: ['Nâu cà phê', 'Xanh lá', 'Xanh dương', 'Đỏ tươi', 'Đen', 'Vàng chanh', '2 Màu', '3 Màu'],
    finishingTypes: ['Dán', 'Cắt', 'Bế', 'Xén', 'Đục lỗ', 'Đóng gói'],
    defaultPaperUnit: 'tờ',
    printersList: ['Máy In 1', 'Máy In 2', 'Máy In 4 màu', 'Máy In Cuộn', 'Máy In Offset'],
  },

  workflow: {
    printerAcceptanceTimeoutMinutes: 30,
    plateWaitingWarningMinutes: 60,
    printingStuckWarningMinutes: 60,
    autoCloseCompletedAfterHours: 24,
  },

  features: {
    production: true,
    finishing: true,
    customer: false,
    salesOrder: false,
    warehouseDispatch: true,
    shipping: false,
    
    comments: true,
    notifications: true,
    sampleLibrary: true,
    soundAlerts: true,
    autoPlayVoice: false,
    urgentBadges: true,
  },

  system: {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    deploymentMode: (import.meta.env.VITE_DEPLOYMENT_MODE as 'DEMO' | 'PRODUCTION') || 'PRODUCTION',
    lastMigratedAt: new Date().toISOString(),
  },
};
