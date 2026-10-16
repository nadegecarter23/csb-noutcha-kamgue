import { documentColors } from '../../platform/document-theme.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
interface CashReport {
  id: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  collectedTotal: number;
  paymentCount: number;
  expectedAmounts: Record<string, number> | null;
  declaredAmounts: Record<string, number> | null;
  variance: number | null;
  varianceReason: string | null;
}
export async function renderCashReport(session: CashReport) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = (v: unknown) =>
    String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\xFF]/g, '');
  const text = (v: unknown, x: number, y: number, size = 10, strong = false) =>
    page.drawText(safe(v), {
      x,
      y,
      size,
      font: strong ? bold : regular,
      color: strong ? documentColors.brand : documentColors.ink,
    });
  text('RAPPORT DE CAISSE — CSB NOUTCHA KAMGUE', 40, 790, 18, true);
  text(`Session ${session.id}`, 40, 765, 9);
  text(`Caissier : ${session.cashierName}`, 40, 730, 11, true);
  text(`Ouverture : ${new Date(session.openedAt).toLocaleString('fr-CM')}`, 40, 710);
  text(
    `Cloture : ${session.closedAt ? new Date(session.closedAt).toLocaleString('fr-CM') : 'ouverte'}`,
    40,
    692,
  );
  text(`Fond de caisse : ${session.openingFloat.toLocaleString('fr-FR')} FCFA`, 40, 660);
  text(
    `Encaissements : ${session.collectedTotal.toLocaleString('fr-FR')} FCFA (${session.paymentCount})`,
    40,
    640,
    11,
    true,
  );
  let y = 600;
  text('Mode', 40, y, 10, true);
  text('Attendu', 240, y, 10, true);
  text('Declare', 390, y, 10, true);
  for (const method of ['CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER']) {
    y -= 24;
    text(method, 40, y);
    text(`${session.expectedAmounts?.[method] ?? 0} FCFA`, 240, y);
    text(`${session.declaredAmounts?.[method] ?? 0} FCFA`, 390, y);
  }
  y -= 38;
  text(`Ecart : ${(session.variance ?? 0).toLocaleString('fr-FR')} FCFA`, 40, y, 12, true);
  if (session.varianceReason) text(`Motif : ${session.varianceReason}`, 40, y - 22);
  text('Signature caissier', 70, 100, 10, true);
  text('Visa comptable', 390, 100, 10, true);
  return pdf.save();
}
