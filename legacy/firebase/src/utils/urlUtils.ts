/**
 * Dynamic URL and Routing Helpers
 * Guarantees zero hardcoded domains across all deployed workshop instances.
 */

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
};

export const getOrderUrl = (orderCode: string): string => {
  return `${getBaseUrl()}/#order-${orderCode}`;
};

export const getOrderQrData = (orderCode: string): string => {
  return `${getBaseUrl()}/production/${orderCode}`;
};
