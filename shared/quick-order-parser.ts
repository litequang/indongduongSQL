export interface ParsedOrderPrompt {
  quantity?: number;
  paperType?: string;
  paperGsm?: string;
  paperWidth?: string;
  paperHeight?: string;
  printerName?: string;
  color?: string;
  plateType?: "NEW" | "OLD" | "UNKNOWN" | "NONE";
  plateNote?: string;
  note?: string;
  sapoCode?: string;
  tags?: string[];
}

export interface ParseOptions {
  paperTypes?: string[];
  defaultGsmList?: string[];
}

/**
 * Super-fast and intelligent production order text parser.
 * Supports standard and dynamic workshop paper types (Kraft, OP, MG, Fort, Duplex, BB, Ivory, Couche, etc.),
 * dynamic GSMs (58, 250, 70, 60, 300, etc.), Sapo codes, tags, dimensions, quantities, and printer mentions.
 */
export function parseQuickOrderText(
  text: string,
  options?: ParseOptions,
): ParsedOrderPrompt {
  if (!text || !text.trim()) return {};

  const clean = text.trim();
  const lower = clean.toLowerCase();
  const result: ParsedOrderPrompt = {};

  // 1. Parse Tags & Sapo Codes (e.g. #SAPO-0198, #banhmi, sapo: SAPO-9821, tag: Bánh mì chả)
  const tags: string[] = [];
  const hashtagMatches = clean.match(/#([a-zA-Z0-9_\u00C0-\u1EF9-]+)/g);
  if (hashtagMatches) {
    hashtagMatches.forEach((tag) => {
      const cleanTag = tag.replace("#", "").trim();
      if (/^sapo[-_]?[0-9]+/i.test(cleanTag) && !result.sapoCode) {
        result.sapoCode = cleanTag.toUpperCase();
      }
      tags.push(cleanTag);
    });
  }

  const sapoDirectMatch = clean.match(
    /(?:sapo|mã\s*đơn|mã\s*sapo)[:\s]+([a-zA-Z0-9_-]+)/i,
  );
  if (sapoDirectMatch) {
    result.sapoCode = sapoDirectMatch[1].trim().toUpperCase();
    if (!tags.includes(result.sapoCode)) {
      tags.push(result.sapoCode);
    }
  }

  if (tags.length > 0) {
    result.tags = tags;
  }

  // 2. Parse Printer Mention (@Thợ in Thiện, @Thiện, @Bố Vinh, @Vinh, @Nguyễn Đức Thiện...)
  const mentionMatch = clean.match(/@([^\s,]+(?:\s+[^\s,]+)*)/);
  if (mentionMatch) {
    const rawMention = mentionMatch[1].trim();
    if (/thiện|thien/i.test(rawMention)) {
      result.printerName = "Nguyễn Đức Thiện";
    } else if (/vinh|bo\s*vinh|bố\s*vinh/i.test(rawMention)) {
      result.printerName = "Bố Vinh";
    } else {
      result.printerName = rawMention;
    }
  } else {
    // Fallback if typed without @
    if (/\b(?:nguyễn\s*đức\s*thiện|đức\s*thiện|thiện)\b/i.test(clean)) {
      result.printerName = "Nguyễn Đức Thiện";
    } else if (/\b(?:bố\s*vinh|vinh)\b/i.test(clean)) {
      result.printerName = "Bố Vinh";
    }
  }

  // 3. Parse Dimensions / Khổ giấy (e.g. 25x48, 27.5x46, 27,5 x 50, 30 × 44, 30*44, 25 x 48 cm)
  const sizeMatch = clean.match(
    /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i,
  );
  if (sizeMatch) {
    result.paperWidth = sizeMatch[1].replace(",", ".");
    result.paperHeight = sizeMatch[2].replace(",", ".");
  }

  // 4. Parse Paper Type (Dynamic + Standard: Duplex, BB, Kraft, OP, MG, Fort, Ivory, Couche, Bristol, etc.)
  const knownPaperTypes =
    options?.paperTypes && options.paperTypes.length > 0
      ? options.paperTypes
      : [
          "Kraft",
          "OP",
          "MG",
          "Fort",
          "Duplex",
          "BB",
          "Ivory",
          "Couche",
          "Bristol",
          "Decal",
        ];

  // Check in reverse or exact matching
  for (const pType of knownPaperTypes) {
    if (pType === "Khác" || pType === "ALL") continue;
    // Word boundary or alphanumeric combination check (e.g. "duplex 250", "BB 58", "bb58", "duplex250")
    const escaped = pType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?:\\b|(?<=\\s))${escaped}(?:\\b|(?=\\d)|(?=\\s))`,
      "i",
    );
    if (regex.test(clean)) {
      result.paperType = pType;
      break;
    }
  }

  // Generic fallback if not matched yet
  if (!result.paperType) {
    if (/\bduplex\b/i.test(clean) || /duplex\d+/i.test(clean)) {
      result.paperType = "Duplex";
    } else if (/\bbb\b/i.test(clean) || /bb\d+/i.test(clean)) {
      result.paperType = "BB";
    } else if (/kraft/i.test(clean) || /kraft\d+/i.test(clean)) {
      result.paperType = "Kraft";
    } else if (/\bop\b/i.test(clean) || /op\d+/i.test(clean)) {
      result.paperType = "OP";
    } else if (/\bmg\b/i.test(clean) || /mg\d+/i.test(clean)) {
      result.paperType = "MG";
    } else if (/fort|ford/i.test(clean) || /fort\d+/i.test(clean)) {
      result.paperType = "Fort";
    } else if (/ivory/i.test(clean) || /ivory\d+/i.test(clean)) {
      result.paperType = "Ivory";
    } else if (/couche/i.test(clean)) {
      result.paperType = "Couche";
    } else if (/bristol/i.test(clean)) {
      result.paperType = "Bristol";
    }
  }

  // 5. Parse Paper GSM (e.g. duplex 250, duplex250, bb 58, bb58, kraft 70, định lượng 58, 250gsm, 58g, dl 250)
  // Pattern A: Paper name immediately followed by GSM number (e.g. duplex 250, bb 58, bb58, duplex250, kraft 70, op60)
  const paperGsmCombo = clean.match(
    /(?:duplex|bb|kraft|op|mg|fort|ford|ivory|couche|bristol|decal)\s*(\d{2,3})/i,
  );
  if (paperGsmCombo) {
    result.paperGsm = paperGsmCombo[1];
  }

  // Pattern B: Explicit GSM prefix (định lượng 58, đl 250, dl 58, gsm 250, 58gsm, 250g, 58 g)
  if (!result.paperGsm) {
    const explicitGsm =
      clean.match(
        /(?:định\s*lượng|dinh\s*luong|đl|dl|gsm)\s*[:=]?\s*(\d{2,3})/i,
      ) || clean.match(/(\d{2,3})\s*(?:gsm|g\b)/i);
    if (explicitGsm) {
      result.paperGsm = explicitGsm[1];
    }
  }

  // Pattern C: If options defaultGsmList provided, match any exact GSM token
  if (
    !result.paperGsm &&
    options?.defaultGsmList &&
    options.defaultGsmList.length > 0
  ) {
    for (const gsm of options.defaultGsmList) {
      const gsmRegex = new RegExp(`\\b${gsm}\\b`);
      if (gsmRegex.test(clean)) {
        result.paperGsm = gsm;
        break;
      }
    }
  }

  // Pattern D: Comprehensive fallback list of known GSMs (includes 58, 250, 300, 350, 40-120)
  if (!result.paperGsm) {
    const gsmMatch = clean.match(
      /\b(40|45|50|52|55|58|60|65|70|75|80|90|100|115|120|140|150|160|180|200|230|250|280|300|350)\b/i,
    );
    if (gsmMatch) {
      result.paperGsm = gsmMatch[1];
    }
  }

  // Default GSM based on paper type if still not detected
  if (!result.paperGsm && result.paperType) {
    if (result.paperType === "Kraft") result.paperGsm = "70";
    else if (result.paperType === "OP") result.paperGsm = "60";
    else if (result.paperType === "MG") result.paperGsm = "45";
    else if (result.paperType === "Fort") result.paperGsm = "70";
    else if (result.paperType === "Duplex") result.paperGsm = "250";
    else if (result.paperType === "BB") result.paperGsm = "58";
    else if (result.paperType === "Ivory") result.paperGsm = "250";
  }

  // 6. Parse Quantity (e.g. 2600 tờ, 5150 tờ, 15.450 tờ, 2,600 to, 5000, 2500 pcs)
  const qtyMatch = clean.match(
    /(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:tờ|to|cái|tui|bản|pcs|sp)?/i,
  );
  if (qtyMatch) {
    const rawNum = qtyMatch[1].replace(/[.,]/g, "");
    const num = parseInt(rawNum, 10);
    // Ignore small numbers that could be GSM or size if not explicitly followed by "tờ"
    const isExplicitQty = /tờ|to|cái|tui|bản|pcs|sp/i.test(qtyMatch[0]);
    if (!isNaN(num) && num > 0) {
      if (
        isExplicitQty ||
        num > 400 ||
        (num !== parseInt(result.paperGsm || "0", 10) &&
          num !== parseInt(result.paperWidth || "0", 10) &&
          num !== parseInt(result.paperHeight || "0", 10))
      ) {
        result.quantity = num;
      }
    }
  }

  // 7. Parse Plate (Kẽm mới, kẽm cũ, kẽm cũ 5/2026, kẽm cũ ngày 12/02...)
  if (/kẽm\s*mới|kem\s*moi/i.test(clean)) {
    result.plateType = "NEW";
  } else if (/kẽm\s*cũ|kem\s*cu/i.test(clean)) {
    result.plateType = "OLD";
    const plateNoteMatch = clean.match(/(?:kẽm\s*cũ|kem\s*cu)\s*([^,\n.@#]+)/i);
    if (plateNoteMatch && plateNoteMatch[1].trim().length > 0) {
      result.plateNote = "Kẽm cũ " + plateNoteMatch[1].trim();
    } else {
      result.plateNote = "Kẽm cũ";
    }
  }

  // 8. Parse Color (Xanh, Nâu, Đỏ, Cam, Đen, Xanh lá, Vàng, Xanh + Nâu, 2 màu...)
  const colors: string[] = [];
  if (/\b(?:xanh\s*lá|green)\b/i.test(lower)) colors.push("Xanh lá");
  else if (/\b(?:xanh\s*dương|xanh\s*biển|xanh|blue)\b/i.test(lower))
    colors.push("Xanh");
  if (/\b(?:nâu\s*cà\s*phê|nâu|brown)\b/i.test(lower)) colors.push("Nâu");
  if (/\b(?:đỏ\s*tươi|đỏ|red)\b/i.test(lower)) colors.push("Đỏ");
  if (/\b(?:cam|orange)\b/i.test(lower)) colors.push("Cam");
  if (/\b(?:đen|black)\b/i.test(lower)) colors.push("Đen");
  if (/\b(?:vàng\s*chanh|vàng|yellow)\b/i.test(lower)) colors.push("Vàng");
  if (/\b(?:tím|purple)\b/i.test(lower)) colors.push("Tím");
  if (/\b(?:hồng|pink)\b/i.test(lower)) colors.push("Hồng");

  if (colors.length > 0) {
    result.color = colors.join(" + ");
  } else if (/3\s*màu|ba\s*màu/i.test(lower)) {
    result.color = "3 màu";
  } else if (/2\s*màu|hai\s*màu/i.test(lower)) {
    result.color = "2 màu";
  } else if (/1\s*màu|một\s*màu/i.test(lower)) {
    result.color = "1 màu";
  }

  // 9. Parse Note:
  if (qtyMatch && qtyMatch.index !== undefined && qtyMatch.index > 0) {
    const prefix = clean.substring(0, qtyMatch.index).trim();
    if (
      prefix.length > 0 &&
      !prefix.startsWith("@") &&
      !prefix.startsWith("#")
    ) {
      result.note = prefix;
    }
  } else if (
    /mỗi\s*màu|mỗi\s*mẫu|in\s*chung|mặt\s*sau|gấp|cần\s*sớm|giao\s*trước/i.test(
      clean,
    )
  ) {
    const noteMatch = clean.match(
      /(mỗi\s*màu|mỗi\s*mẫu|in\s*chung|mặt\s*sau|gấp|cần\s*sớm|giao\s*trước[^\d@,#]*)/i,
    );
    if (noteMatch) {
      result.note = noteMatch[1].trim();
    }
  }

  return result;
}
