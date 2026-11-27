export interface PrinterCandidate {
  id: string;
  name: string;
  role: string;
  active?: boolean;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}

/** Returns a printer only when the text identifies exactly one active printer.
 * A one-character typo is accepted only for a token of at least four chars. */
export function findUniquePrinterMatch<T extends PrinterCandidate>(text: string, users: T[]): T | undefined {
  const normalizedText = ` ${normalize(text)} `;
  const textTokens = normalizedText.trim().split(/\s+/).filter(Boolean);
  const candidates = users.filter((user) => {
    if (user.role !== 'PRINTER' || user.active === false) return false;
    const normalizedName = normalize(user.name);
    const nameTokens = normalizedName.split(/\s+/).filter(Boolean);
    const exact = normalizedText.includes(` ${normalizedName} `)
      || nameTokens.some((token) => token.length >= 3 && normalizedText.includes(` ${token} `));
    if (exact) return true;
    return nameTokens.some((nameToken) => nameToken.length >= 4
      && textTokens.some((textToken) => textToken.length >= 4 && editDistanceAtMostOne(nameToken, textToken)));
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}
