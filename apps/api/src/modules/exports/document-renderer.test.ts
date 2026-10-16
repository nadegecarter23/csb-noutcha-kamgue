import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { renderCsv, renderPdf, renderXlsx, type TabularDocument } from './document-renderer.js';

const document: TabularDocument = {
  title: 'État des élèves',
  filters: { classe: '6e A' },
  columns: [
    { key: 'name', label: 'Élève' },
    { key: 'amount', label: 'Montant' },
  ],
  rows: [{ name: 'Nathan Fotsô', amount: 75000 }],
  school: {
    name: 'school fees app',
    address: 'Douala',
    phone: '+237600000000',
    email: 'contact@cplan.cm',
  },
  generatedBy: 'Marie Ngo',
};
describe('moteur documentaire phase 15', () => {
  it('préfixe les CSV avec le BOM UTF-8 et conserve les accents', () => {
    const bytes = renderCsv(document);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8')).toContain('Fotsô');
  });
  it('produit un classeur Excel exploitable', async () => {
    const bytes = await renderXlsx(document);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    expect(workbook.worksheets[0]?.getCell('A1').value).toBe('school fees app');
    expect(workbook.worksheets[0]?.rowCount).toBeGreaterThan(4);
  });
  it('produit un PDF paginé valide', async () => {
    const bytes = await renderPdf({
      ...document,
      rows: Array.from({ length: 100 }, (_, index) => ({
        name: `Élève ${index + 1}`,
        amount: index,
      })),
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
