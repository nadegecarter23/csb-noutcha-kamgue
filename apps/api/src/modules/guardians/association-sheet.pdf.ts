import { documentColors } from '../../platform/document-theme.js';
import { PDFDocument, StandardFonts, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';

export interface AssociationSheetEntry {
  schoolName: string;
  studentName: string;
  studentNumber: string;
  className: string | null;
  shortCode: string;
  linkUrl: string;
  expiresAt: string;
}

const A4 = { width: 595.28, height: 841.89 };

function writeCentered(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (A4.width - width) / 2, y, size, font, color: documentColors.ink });
}

export async function buildAssociationPdf(entries: AssociationSheetEntry[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const entry of entries) {
    const page = pdf.addPage([A4.width, A4.height]);
    page.drawRectangle({
      x: 36,
      y: 36,
      width: A4.width - 72,
      height: A4.height - 72,
      borderColor: documentColors.brand,
      borderWidth: 1.5,
    });
    writeCentered(page, entry.schoolName, 765, 18, bold);
    writeCentered(page, "Fiche d'association parent - eleve", 730, 16, bold);
    writeCentered(page, entry.studentName, 682, 22, bold);
    writeCentered(
      page,
      `${entry.studentNumber}${entry.className ? ` - ${entry.className}` : ''}`,
      655,
      12,
      regular,
    );

    const qrBytes = await QRCode.toBuffer(entry.linkUrl, {
      type: 'png',
      width: 280,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    const qr = await pdf.embedPng(qrBytes);
    page.drawImage(qr, { x: (A4.width - 250) / 2, y: 350, width: 250, height: 250 });

    writeCentered(page, 'Scannez ce QR code dans l application CSB-NK', 315, 12, regular);
    writeCentered(page, `Code court : ${entry.shortCode}`, 275, 18, bold);
    writeCentered(
      page,
      `Valable jusqu au ${new Intl.DateTimeFormat('fr-CM').format(new Date(entry.expiresAt))}`,
      245,
      10,
      regular,
    );
    writeCentered(page, 'Ce code est personnel et utilisable une seule fois.', 190, 11, regular);
    writeCentered(page, 'Le QR code ne contient aucune donnee personnelle.', 170, 9, regular);
  }

  return pdf.save();
}
