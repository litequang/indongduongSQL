import {
  IMPORT_FIELDS,
  IMPORT_MAX_ROWS,
  type CustomerInput,
} from "../../../shared/business";

export type ImportField = keyof CustomerInput;
export type Sheet = {
  fileName: string;
  source: "CSV_IMPORT" | "EXCEL_IMPORT";
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
};

const aliases: Record<ImportField, string[]> = {
  name: [
    "ten khach hang",
    "ten",
    "ho ten",
    "customer",
    "customer name",
    "name",
  ],
  phone: ["sdt", "so dien thoai", "dien thoai", "phone", "mobile", "telephone"],
  contactName: ["nguoi lien he", "contact", "contact name"],
  email: ["email", "mail"],
  address: ["dia chi", "address"],
  province: ["tinh", "thanh pho", "tinh thanh", "province", "city"],
  district: ["quan", "huyen", "quan huyen", "district"],
  ward: ["phuong", "xa", "phuong xa", "ward"],
  zalo: ["zalo"],
  facebook: ["facebook"],
  note: ["ghi chu", "note", "notes"],
  externalSource: ["he thong ngoai", "external source"],
  externalId: [
    "ma khach hang",
    "ma ngoai",
    "ma doi tac",
    "external id",
    "customer code",
  ],
};
function plain(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
export function guessMapping(headers: string[]) {
  const assigned = new Set<ImportField>();
  return headers.map((header) => {
    const found = (Object.keys(IMPORT_FIELDS) as ImportField[]).find((key) =>
      aliases[key].includes(plain(header)),
    );
    if (!found || assigned.has(found)) return "";
    assigned.add(found);
    return found;
  });
}

// Read the ZIP central-directory metadata before handing compressed data to the workbook parser.
async function checkWorkbook(file: File) {
  const data = new DataView(await file.arrayBuffer());
  let end = data.byteLength - 22;
  while (end >= Math.max(0, data.byteLength - 65557)) {
    if (
      data.getUint32(end, true) === 0x06054b50 &&
      end + 22 + data.getUint16(end + 20, true) === data.byteLength
    )
      break;
    end--;
  }
  if (end < 0 || end < Math.max(0, data.byteLength - 65557))
    throw new Error("Tệp XLSX bị lỗi hoặc được mã hóa.");
  const count = data.getUint16(end + 10, true);
  let offset = data.getUint32(end + 16, true);
  let expanded = 0;
  if (count > 300) throw new Error("Tệp XLSX có quá nhiều thành phần.");
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || data.getUint32(offset, true) !== 0x02014b50)
      throw new Error("Cấu trúc tệp XLSX không hợp lệ.");
    expanded += data.getUint32(offset + 24, true);
    if (expanded > 16 * 1024 * 1024)
      throw new Error("Dữ liệu XLSX sau giải nén quá lớn.");
    offset +=
      46 +
      data.getUint16(offset + 28, true) +
      data.getUint16(offset + 30, true) +
      data.getUint16(offset + 32, true);
  }
}

export async function parseImportFile(file: File): Promise<Sheet> {
  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".csv") && !ext.endsWith(".xlsx"))
    throw new Error("Chọn tệp CSV hoặc Excel .xlsx.");
  if (!file.size || file.size > 2 * 1024 * 1024 || file.name.length > 180)
    throw new Error(
      "Tệp phải có dữ liệu, tối đa 2 MiB và tên tối đa 180 ký tự.",
    );
  const excel = ext.endsWith(".xlsx");
  let cells: unknown[][];
  if (excel) {
    await checkWorkbook(file);
    const { readSheet } = await import("read-excel-file/browser");
    cells = await readSheet(file, 1, { parseNumber: (value) => value });
  } else {
    const { default: Papaparse } = await import("papaparse");
    const csv = await file.text();
    if (csv.includes("\uFFFD") || csv.includes("\0"))
      throw new Error("Lưu CSV dưới dạng UTF-8 rồi thử lại.");
    const result = Papaparse.parse<string[]>(csv, { skipEmptyLines: false });
    if (result.errors.some((error) => error.code !== "UndetectableDelimiter"))
      throw new Error(
        "Tệp CSV có dấu phân cách hoặc dấu ngoặc kép không hợp lệ.",
      );
    cells = result.data;
  }
  const nonempty = cells
    .map((row, i) => ({
      rowNumber: i + 1,
      cells: row.map((value) =>
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value ?? "").trim(),
      ),
    }))
    .filter((row) => row.cells.some(Boolean));
  const [head, ...rows] = nonempty;
  if (!head || !rows.length)
    throw new Error("Tệp cần có một dòng tiêu đề và ít nhất một dòng dữ liệu.");
  if (
    rows.length > IMPORT_MAX_ROWS ||
    head.cells.length > 60 ||
    rows.some((row) => row.cells.slice(60).some(Boolean))
  )
    throw new Error(
      `Tách tệp thành các phần tối đa ${IMPORT_MAX_ROWS} dòng dữ liệu và 60 cột.`,
    );
  const width = Math.max(head.cells.length, ...rows.map((r) => r.cells.length));
  return {
    fileName: file.name,
    source: excel ? "EXCEL_IMPORT" : "CSV_IMPORT",
    rows,
    headers: Array.from(
      { length: Math.min(width, 60) },
      (_, index) => head.cells[index] || "Cột " + (index + 1),
    ),
  };
}
