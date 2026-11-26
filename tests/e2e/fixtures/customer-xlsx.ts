import { strToU8, zipSync } from "fflate";

export function customerWorkbook(): Buffer {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  const packageNs = "http://schemas.openxmlformats.org/package/2006";
  const docRelationships =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const spreadsheet =
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries({
          "[Content_Types].xml": `<Types xmlns="${packageNs}/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    </Types>`,
          "_rels/.rels": `<Relationships xmlns="${packageNs}/relationships">
      <Relationship Id="rId1" Type="${docRelationships}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`,
          "xl/workbook.xml": `<workbook xmlns="${spreadsheet}" xmlns:r="${docRelationships}">
      <sheets><sheet name="Khach hang" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`,
          "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageNs}/relationships">
      <Relationship Id="rId1" Type="${docRelationships}/worksheet" Target="worksheets/sheet1.xml"/>
    </Relationships>`,
          "xl/worksheets/sheet1.xml": `<worksheet xmlns="${spreadsheet}"><dimension ref="A1:B2"/><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Tên khách hàng</t></is></c><c r="B1" t="inlineStr"><is><t>SĐT</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>Khách XLSX E2E</t></is></c><c r="B2" t="inlineStr"><is><t>0919900013</t></is></c></row>
    </sheetData></worksheet>`,
        }).map(([name, content]) => [name, strToU8(xml + content)]),
      ),
    ),
  );
}
