import { documentColors } from '../../platform/document-theme.js';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { amount, amountToWordsWithCurrency } from '@cplan/domain';

export async function renderReceiptPdf(snapshot: Record<string, unknown>, cancelled = false) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 595]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const receipt = snapshot.receipt as { number: string; issuedAt: string };
  const safe = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\xFF]/g, '');
  if (snapshot.kind === 'CREDIT_NOTE') {
    const original = String(snapshot.originalPayment ?? '—');
    const reason = String(snapshot.reason ?? 'Contrepassation');
    const creditAmount = Number(snapshot.amount ?? 0);
    const text = (value: string, x: number, y: number, size = 10, strong = false) =>
      page.drawText(safe(value), {
        x,
        y,
        size,
        font: strong ? bold : regular,
        color: strong ? documentColors.brand : documentColors.ink,
      });
    text('AVOIR / CONTREPASSATION', 36, 520, 18, true);
    text(receipt.number, 36, 495, 11, true);
    text(`Paiement d'origine : ${original}`, 36, 440, 11);
    text(`Montant annule : ${creditAmount.toLocaleString('fr-FR')} FCFA`, 36, 410, 14, true);
    text(`Motif : ${reason}`, 36, 380, 10);
    text(`Emis le ${new Date(receipt.issuedAt).toLocaleString('fr-CM')}`, 36, 55, 8);
    return pdf.save();
  }
  const school = snapshot.school as { name: string; address?: string | null };
  const student = snapshot.student as {
    fullName: string;
    studentNumber: string;
    className: string;
    academicYear: string;
  };
  const payment = snapshot.payment as {
    amount: number;
    method: string;
    reference: string;
    paidAt: string;
  };
  const allocations = snapshot.allocations as Array<{ label: string; amount: number }>;
  const balance = snapshot.balanceAfter as { totalDue: number; totalPaid: number; balance: number };
  const text = (value: string, x: number, y: number, size = 10, strong = false) =>
    page.drawText(safe(value), {
      x,
      y,
      size,
      font: strong ? bold : regular,
      color: strong ? documentColors.brand : documentColors.ink,
    });
  text(school.name, 36, 550, 16, true);
  if (school.address) text(school.address, 36, 532, 9);
  text(cancelled ? 'RECU ANNULE' : 'RECU DE PAIEMENT', 36, 495, 18, true);
  text(receipt.number, 36, 475, 11, true);
  text(`${student.fullName} - ${student.studentNumber}`, 36, 440, 12, true);
  text(`${student.className} - ${student.academicYear}`, 36, 424, 10);
  text(`Paiement : ${payment.reference}`, 36, 392, 10);
  text(`Mode : ${payment.method}`, 36, 376, 10);
  text(`Montant : ${payment.amount.toLocaleString('fr-FR')} FCFA`, 36, 354, 13, true);
  text(amountToWordsWithCurrency(amount(payment.amount)), 36, 337, 9);
  let y = 302;
  text('AFFECTATION', 36, y, 10, true);
  for (const allocation of allocations) {
    y -= 18;
    text(allocation.label.slice(0, 45), 36, y, 9);
    text(`${allocation.amount.toLocaleString('fr-FR')} FCFA`, 305, y, 9, true);
  }
  y -= 35;
  text(`Total dû : ${balance.totalDue.toLocaleString('fr-FR')} FCFA`, 36, y, 9);
  text(`Cumul payé : ${balance.totalPaid.toLocaleString('fr-FR')} FCFA`, 36, y - 16, 9);
  text(`Solde : ${balance.balance.toLocaleString('fr-FR')} FCFA`, 36, y - 32, 10, true);
  text(`Émis le ${new Date(receipt.issuedAt).toLocaleString('fr-CM')}`, 36, 55, 8);
  if (cancelled)
    page.drawText('ANNULE', {
      x: 95,
      y: 250,
      size: 58,
      font: bold,
      color: rgb(0.8, 0.1, 0.1),
      rotate: degrees(35),
    });
  return pdf.save();
}
