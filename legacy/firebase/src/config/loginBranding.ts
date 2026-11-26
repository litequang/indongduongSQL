import { DEFAULT_APP_CONFIG } from './appConfig';

export interface LoginBranding {
  companyName: string;
  appName: string;
  logoUrl: string;
  tagline: string;
}

const textOr = (value: string | undefined, fallback: string) => value?.trim() || fallback;

/**
 * Branding available before a user has been authenticated. This intentionally
 * reads only the deployment-time defaults, never the protected Settings record.
 */
export const getLoginBranding = (): LoginBranding => {
  const company = DEFAULT_APP_CONFIG.company;
  const companyName = textOr(company.name, 'XƯỞNG IN');

  return {
    companyName,
    appName: textOr(company.shortName, companyName),
    logoUrl: company.logoUrl?.trim() || '',
    tagline: textOr(company.slogan, 'Hệ thống quản lý sản xuất'),
  };
};
