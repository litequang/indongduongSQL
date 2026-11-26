export const normalizePhone = (phone: string | undefined | null): string => {
  if (!phone) return '';
  // Remove all non-numeric characters, except leading +
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  }
  return cleaned;
};

export const normalizeString = (str: any): string => {
  if (!str) return '';
  return String(str).trim();
};

export const normalizeCustomer = (raw: any, mapping: Record<string, string>, source: string = 'EXCEL_IMPORT'): any => {
  const mapped: any = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field && raw[header] !== undefined) {
      mapped[field] = normalizeString(raw[header]);
    }
  }

  // Generate a code if none
  const code = mapped.externalId || `CUS-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

  const phoneNorm = normalizePhone(mapped.phone);

  return {
    ...mapped,
    code,
    phoneNormalized: phoneNorm,
    source,
    createdAt: new Date().toISOString()
  };
};