import { documentColors, spreadsheetColors } from '../../platform/document-theme.js';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export type TabularDocument = {
  title: string;
  filters: Record<string, unknown>;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  school: { name: string; address: string | null; phone: string | null; email: string | null };
  generatedBy: string;
  landscape?: boolean;
};
const cell = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : value === null || value === undefined
      ? ''
      : String(value);
const safe = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\xFF]/g, '');
export function renderCsv(doc: TabularDocument) {
  const quote = (v: unknown) => `"${cell(v).replace(/"/g, '""')}"`;
  return Buffer.from(
    `\uFEFF${doc.columns.map((c) => quote(c.label)).join(',')}\r\n${doc.rows.map((r) => doc.columns.map((c) => quote(r[c.key])).join(',')).join('\r\n')}\r\n`,
    'utf8',
  );
}
export async function renderXlsx(doc: TabularDocument) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CSB Noutcha KAMGUE';
  const sheet = workbook.addWorksheet(doc.title.slice(0, 31));
  sheet.addRow([doc.school.name]);
  sheet.addRow([doc.title]);
  sheet.addRow([
    `Filtres : ${
      Object.entries(doc.filters)
        .map(([k, v]) => `${k}=${cell(v)}`)
        .join(' - ') || 'Aucun'
    }`,
  ]);
  sheet.addRow([]);
  const header = sheet.addRow(doc.columns.map((c) => c.label));
  header.font = { bold: true, color: { argb: spreadsheetColors.white } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: spreadsheetColors.brand } };
  for (const row of doc.rows) sheet.addRow(doc.columns.map((c) => row[c.key] as ExcelJS.CellValue));
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, sheet.rowCount), column: doc.columns.length },
  };
  sheet.columns.forEach((column, index) => {
    column.width = Math.min(
      40,
      Math.max(
        12,
        ...doc.rows.slice(0, 200).map((r) => cell(r[doc.columns[index]?.key ?? '']).length + 2),
      ),
    );
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
export async function renderPdf(doc: TabularDocument) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size: [number, number] = doc.landscape ? [842, 595] : [595, 842];
  const margin = 32;
  const rowHeight = 18;
  const drawPage = (index: number) => {
    const page = pdf.addPage(size);
    page.drawText(safe(doc.school.name), {
      x: margin,
      y: size[1] - 35,
      size: 14,
      font: bold,
      color: documentColors.brand,
    });
    page.drawText(safe(doc.title), { x: margin, y: size[1] - 57, size: 12, font: bold });
    page.drawText(
      safe(
        `Filtres : ${
          Object.entries(doc.filters)
            .map(([k, v]) => `${k}=${cell(v)}`)
            .join(' - ') || 'Aucun'
        }`,
      ).slice(0, 120),
      { x: margin, y: size[1] - 74, size: 8, font: regular },
    );
    page.drawText(
      safe(
        `Genere le ${new Date().toLocaleString('fr-CM')} par ${doc.generatedBy} - Page ${index} - CSB Noutcha KAMGUE`,
      ),
      { x: margin, y: 18, size: 8, font: regular },
    );
    return page;
  };
  let page = drawPage(1);
  let pageNo = 1;
  let y = size[1] - 105;
  const width = (size[0] - margin * 2) / Math.max(1, doc.columns.length);
  const headers = () => {
    doc.columns.forEach((c, i) =>
      page.drawText(safe(c.label).slice(0, Math.floor(width / 5.8)), {
        x: margin + i * width,
        y,
        size: 9,
        font: bold,
      }),
    );
    y -= rowHeight;
    page.drawLine({
      start: { x: margin, y: y + 12 },
      end: { x: size[0] - margin, y: y + 12 },
      thickness: 1,
    });
  };
  headers();
  for (const row of doc.rows) {
    if (y < 42) {
      page = drawPage(++pageNo);
      y = size[1] - 105;
      headers();
    }
    doc.columns.forEach((c, i) =>
      page.drawText(safe(cell(row[c.key])).slice(0, Math.floor(width / 5.8)), {
        x: margin + i * width,
        y,
        size: 8,
        font: regular,
      }),
    );
    y -= rowHeight;
  }
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++)
    pages[i]?.drawText(`${i + 1}/${pages.length}`, {
      x: size[0] - 60,
      y: 18,
      size: 8,
      font: regular,
    });
  return Buffer.from(await pdf.save());
}
