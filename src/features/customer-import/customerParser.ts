import readXlsxFile from 'read-excel-file/browser';
import Papa from 'papaparse';

export interface ParsedData {
  headers: string[];
  rows: any[];
}

export const parseFile = async (file: File): Promise<ParsedData> => {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rawData = results.data as any[][];
            if (!rawData || rawData.length === 0) {
              throw new Error('File CSV không có dữ liệu');
            }
            resolve(processRaw2DArray(rawData));
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => reject(err)
      });
    });
  } else {
    // Excel file (.xlsx)
    const rows = await readXlsxFile(file);
    if (!rows || rows.length === 0) {
      throw new Error('File Excel không có dữ liệu');
    }
    return processRaw2DArray(rows as unknown as any[][]);
  }
};

function processRaw2DArray(rawData: any[][]): ParsedData {
  // Find the first row that actually has headers (sometimes first few rows are empty or titles)
  let headerRowIndex = 0;
  let maxCols = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const cols = (rawData[i] || []).filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
    if (cols > maxCols) {
      maxCols = cols;
      headerRowIndex = i;
    }
  }

  const rawHeaders = (rawData[headerRowIndex] || []).map(h => (h !== null && h !== undefined ? String(h).trim() : ''));

  // Transform following rows into objects keyed by header name
  const rows: any[] = [];
  for (let i = headerRowIndex + 1; i < rawData.length; i++) {
    const rowArray = rawData[i];
    if (!rowArray) continue;

    const hasData = rowArray.some(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (!hasData) continue;

    const rowObj: Record<string, any> = {};
    rawHeaders.forEach((header, colIndex) => {
      if (header) {
        const val = rowArray[colIndex];
        rowObj[header] = val !== null && val !== undefined ? val : '';
      }
    });
    rows.push(rowObj);
  }

  return {
    headers: rawHeaders.filter(h => h.length > 0),
    rows
  };
}
