import {
  PDFDocument,
  StandardFonts,
  degrees,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import type { ReportCardDto } from '@cplan/contracts';
import type { DocumentBrand } from '../../platform/document-brand.js';
import { documentPalette as C } from '../../platform/document-theme.js';

/** Données de contexte calculées à partir de la classe, non figées dans le bulletin. */
export interface ReportCardContext {
  academicYearName: string | null;
  studentBirthDate: string | null;
  headTeacherName: string | null;
  classSize: number;
  rankedCount: number;
  classAverage: number | null;
  highestAverage: number | null;
  lowestAverage: number | null;
  subjectAverages: Record<string, number>;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36;
const RIGHT = PAGE_W - M;
const CONTENT_W = PAGE_W - 2 * M;
const TABLE_BOTTOM = 72;
const FOOTER_TOP = 64;
const TOTAL_ROW_H = 24;
const SYNTHESIS_H = 100;
const SIGNATURE_H = 70;

// Les polices standard PDF ne couvrent que WinAnsi : on garde les accents
// français et la ponctuation typographique, on écarte le reste.
const WIN_ANSI_EXTRA = '‘’‚“”„†‡•…‰‹›€™ŒœŠšŽžŸƒˆ˜–—';
const isPrintable = (ch: string) => {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || WIN_ANSI_EXTRA.includes(ch)
  );
};
const printable = (value: string) =>
  [...value.normalize('NFC')]
    .map((ch) => (/\s/.test(ch) ? ' ' : ch))
    .filter(isPrintable)
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();

const decimal = (value: number, digits = 2) => value.toFixed(digits).replace('.', ',');
const score = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : decimal(value);
const coefficientLabel = (value: number) =>
  Number.isInteger(value) ? String(value) : decimal(value).replace(/0$/, '');
const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);
const formatDate = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));

export function mentionFor(average: number | null) {
  if (average === null) return null;
  if (average >= 16) return 'Très bien';
  if (average >= 14) return 'Bien';
  if (average >= 12) return 'Assez bien';
  if (average >= 10) return 'Passable';
  return 'Insuffisant';
}

function splitSchoolName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length < 4) return { kicker: null, title: name.trim() };
  return { kicker: words.slice(0, -2).join(' ').toUpperCase(), title: words.slice(-2).join(' ') };
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  serifItalic: PDFFont;
  serif: PDFFont;
}

interface TextOptions {
  size?: number;
  font?: PDFFont;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
  tracking?: number;
  opacity?: number;
}

function measure(value: string, font: PDFFont, size: number, tracking = 0) {
  return font.widthOfTextAtSize(value, size) + tracking * Math.max(0, value.length - 1);
}

function ellipsize(value: string, font: PDFFont, size: number, maxWidth: number, tracking = 0) {
  if (measure(value, font, size, tracking) <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && measure(`${result}…`, font, size, tracking) > maxWidth)
    result = result.slice(0, -1);
  return `${result.trimEnd()}…`;
}

function wrap(raw: string, font: PDFFont, size: number, maxWidth: number, maxLines: number) {
  const words = printable(raw).split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (let index = 0; index < words.length; index++) {
    const candidate = current ? `${current} ${words[index]}` : (words[index] ?? '');
    if (measure(candidate, font, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = words[index] ?? '';
    if (lines.length === maxLines) {
      lines[maxLines - 1] = ellipsize(
        `${lines[maxLines - 1]} ${words.slice(index).join(' ')}`,
        font,
        size,
        maxWidth,
      );
      return lines;
    }
  }
  if (current)
    lines.push(
      lines.length === maxLines - 1 || maxLines === 1
        ? ellipsize(current, font, size, maxWidth)
        : current,
    );
  return lines.slice(0, maxLines);
}

function createPainter(fonts: Fonts) {
  const text = (page: PDFPage, raw: string, x: number, y: number, options: TextOptions = {}) => {
    const {
      size = 9,
      font = fonts.regular,
      color = C.ink,
      align = 'left',
      tracking = 0,
      opacity,
    } = options;
    let value = printable(raw);
    if (options.maxWidth) value = ellipsize(value, font, size, options.maxWidth, tracking);
    const width = measure(value, font, size, tracking);
    let cursor = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    if (!tracking) {
      page.drawText(value, {
        x: cursor,
        y,
        size,
        font,
        color,
        ...(opacity !== undefined && { opacity }),
      });
      return width;
    }
    for (const ch of value) {
      page.drawText(ch, {
        x: cursor,
        y,
        size,
        font,
        color,
        ...(opacity !== undefined && { opacity }),
      });
      cursor += font.widthOfTextAtSize(ch, size) + tracking;
    }
    return width;
  };

  const roundRect = (
    page: PDFPage,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    style: { fill?: RGB; stroke?: RGB; strokeWidth?: number },
  ) => {
    const radius = Math.min(r, w / 2, h / 2);
    const path = `M ${radius} 0 H ${w - radius} Q ${w} 0 ${w} ${radius} V ${h - radius} Q ${w} ${h} ${w - radius} ${h} H ${radius} Q 0 ${h} 0 ${h - radius} V ${radius} Q 0 0 ${radius} 0 Z`;
    page.drawSvgPath(path, {
      x,
      y: y + h,
      // `color` toujours présent : sinon pdf-lib trace un contour noir par défaut.
      color: style.fill as RGB,
      ...(style.stroke && { borderColor: style.stroke, borderWidth: style.strokeWidth ?? 0.6 }),
    });
  };

  const diamond = (page: PDFPage, cx: number, cy: number, size: number, color: RGB) => {
    const half = size / 2;
    page.drawSvgPath(`M 0 ${-half} L ${half} 0 L 0 ${half} L ${-half} 0 Z`, {
      x: cx,
      y: cy,
      color,
    });
  };

  const star = (page: PDFPage, cx: number, cy: number, radius: number, color: RGB) => {
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const length = index % 2 === 0 ? radius : radius * 0.45;
      return `${(Math.cos(angle) * length).toFixed(2)} ${(Math.sin(angle) * length).toFixed(2)}`;
    });
    page.drawSvgPath(`M ${points.join(' L ')} Z`, { x: cx, y: cy, color });
  };

  const pill = (
    page: PDFPage,
    label: string,
    right: number,
    y: number,
    style: { fill: RGB; color: RGB; stroke?: RGB; size?: number },
  ) => {
    const size = style.size ?? 7;
    const value = printable(label);
    const width = measure(value, fonts.bold, size, 0.6) + 14;
    const height = size + 8;
    roundRect(page, right - width, y, width, height, height / 2, {
      fill: style.fill,
      ...(style.stroke && { stroke: style.stroke }),
    });
    text(page, value, right - width / 2, y + 4.4, {
      size,
      font: fonts.bold,
      color: style.color,
      align: 'center',
      tracking: 0.6,
    });
    return width;
  };

  return { text, roundRect, diamond, star, pill };
}

export async function renderReportCardPdf(
  brand: DocumentBrand,
  card: ReportCardDto,
  context: ReportCardContext,
) {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifItalic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const { text, roundRect, diamond, star, pill } = createPainter(fonts);
  let logo: PDFImage | null = null;
  if (brand.logo) {
    try {
      logo = await pdf.embedPng(brand.logo);
    } catch {
      logo = null;
    }
  }

  const isDraft = card.status !== 'PUBLISHED';
  const { kicker, title } = splitSchoolName(brand.name);
  const mention = mentionFor(card.overallAverage);

  pdf.setTitle(printable(`Bulletin ${card.periodName} — ${card.studentName}`));
  pdf.setAuthor(printable(brand.name));
  pdf.setSubject('Bulletin de notes');
  pdf.setCreator(printable(brand.name));
  pdf.setProducer(printable(brand.name));
  pdf.setLanguage('fr-FR');
  if (card.publishedAt) pdf.setCreationDate(new Date(card.publishedAt));

  const drawLogo = (page: PDFPage, x: number, y: number, height: number) => {
    if (logo) {
      const width = (logo.width / logo.height) * height;
      page.drawImage(logo, { x, y, width, height });
      return width;
    }
    // Repli sans écusson : monogramme sobre aux couleurs de l'établissement.
    const size = height * 0.86;
    page.drawCircle({ x: x + size / 2, y: y + height / 2, size: size / 2, color: C.navy });
    const initials = title
      .split(/\s+/)
      .map((word) => word[0] ?? '')
      .join('')
      .slice(0, 3)
      .toUpperCase();
    text(page, initials, x + size / 2, y + height / 2 - size * 0.12, {
      size: size * 0.32,
      font: fonts.bold,
      color: C.white,
      align: 'center',
    });
    return size;
  };

  const drawTopBand = (page: PDFPage) => {
    page.drawRectangle({ x: 0, y: PAGE_H - 7, width: PAGE_W, height: 7, color: C.navy });
    page.drawRectangle({ x: M, y: PAGE_H - 10, width: 84, height: 3, color: C.orange });
  };

  const drawDivider = (page: PDFPage, y: number) => {
    page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 0.8, color: C.navy });
    page.drawRectangle({ x: M, y: y - 1.1, width: 56, height: 2.2, color: C.orange });
  };

  const drawMainHeader = (page: PDFPage) => {
    drawTopBand(page);
    drawLogo(page, M, 742, 78);

    const x0 = M + 82;
    if (kicker)
      text(page, kicker, x0, 798, {
        size: 7.6,
        font: fonts.bold,
        color: C.royal,
        tracking: 1.3,
        maxWidth: 262,
      });
    text(page, title, x0, 776, { size: 21, font: fonts.bold, color: C.navy, maxWidth: 262 });

    let cursor = x0;
    const mottoParts = brand.mottos.primary.split(/\s*[—–]\s*/).filter(Boolean);
    mottoParts.forEach((part, index) => {
      cursor += text(page, part, cursor, 761, { size: 8.4, font: fonts.italic, color: C.royal });
      if (index < mottoParts.length - 1) {
        diamond(page, cursor + 6.5, 764, 4.2, C.orange);
        cursor += 13;
      }
    });

    const contact = [brand.address, brand.phone && `Tél. ${brand.phone}`, brand.email]
      .filter(Boolean)
      .join('   ·   ');
    if (contact) text(page, contact, x0, 747, { size: 7.2, color: C.muted, maxWidth: 262 });

    page.drawLine({
      start: { x: 393, y: 748 },
      end: { x: 393, y: 816 },
      thickness: 1.4,
      color: C.orange,
    });
    text(page, 'BULLETIN DE NOTES', RIGHT, 800, {
      size: 12.5,
      font: fonts.bold,
      color: C.navy,
      align: 'right',
      tracking: 1.1,
    });
    text(page, 'REPORT CARD', RIGHT, 788, {
      size: 6.8,
      font: fonts.bold,
      color: C.royal,
      align: 'right',
      tracking: 2.2,
    });
    const periodWidth = pill(page, card.periodName, RIGHT, 764, {
      fill: C.softBlue,
      color: C.royal,
      stroke: C.line,
      size: 8,
    });
    if (isDraft)
      pill(page, 'PROVISOIRE', RIGHT - periodWidth - 6, 764, {
        fill: C.warningBg,
        color: C.warning,
        stroke: C.warning,
        size: 6.6,
      });
    if (context.academicYearName)
      text(page, `Année scolaire ${context.academicYearName}`, RIGHT, 750, {
        size: 7.8,
        color: C.muted,
        align: 'right',
      });

    drawDivider(page, 730);
  };

  const drawContinuationHeader = (page: PDFPage) => {
    drawTopBand(page);
    const logoWidth = drawLogo(page, M, PAGE_H - 56, 38);
    text(page, title, M + logoWidth + 10, PAGE_H - 33, {
      size: 11.5,
      font: fonts.bold,
      color: C.navy,
      maxWidth: 260,
    });
    text(
      page,
      `${card.studentName}  ·  ${card.className}  ·  ${card.periodName}`,
      M + logoWidth + 10,
      PAGE_H - 46,
      { size: 7.8, color: C.muted, maxWidth: 280 },
    );
    text(page, 'BULLETIN DE NOTES — SUITE', RIGHT, PAGE_H - 36, {
      size: 8,
      font: fonts.bold,
      color: C.navy,
      align: 'right',
      tracking: 1,
    });
    drawDivider(page, PAGE_H - 66);
    return PAGE_H - 84;
  };

  const drawIdentity = (page: PDFPage) => {
    const top = 716;
    const height = 78;
    const y = top - height;
    const cardWidth = 356;
    roundRect(page, M, y, cardWidth, height, 10, { fill: C.softBlue, stroke: C.line });
    text(page, 'ÉLÈVE  ·  STUDENT', M + 14, top - 16, {
      size: 6.6,
      font: fonts.bold,
      color: C.muted,
      tracking: 1.4,
    });
    text(page, card.studentName, M + 14, top - 34, {
      size: 15,
      font: fonts.bold,
      color: C.navy,
      maxWidth: cardWidth - 28,
    });

    const fields: Array<[string, string]> = [
      ['MATRICULE', card.studentNumber],
      ['CLASSE', card.className],
      ['NÉ(E) LE', context.studentBirthDate ? formatDate(context.studentBirthDate, 'UTC') : '—'],
      ['EFFECTIF', context.classSize ? `${context.classSize} élèves` : '—'],
    ];
    // Le matricule est la valeur la plus longue : il reçoit la colonne la plus large.
    const weights = [1.4, 1.05, 0.85, 0.7];
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    let x = M + 14;
    fields.forEach(([label, value], index) => {
      const columnWidth = ((cardWidth - 28) * (weights[index] ?? 1)) / weightTotal;
      if (index > 0)
        page.drawLine({
          start: { x: x - 8, y: y + 10 },
          end: { x: x - 8, y: y + 32 },
          thickness: 0.5,
          color: C.line,
        });
      text(page, label, x, y + 25, { size: 6.2, font: fonts.bold, color: C.muted, tracking: 0.8 });
      text(page, value, x, y + 12, {
        size: 9.2,
        font: fonts.bold,
        color: C.ink,
        maxWidth: columnWidth - 14,
      });
      x += columnWidth;
    });

    const heroX = M + cardWidth + 10;
    const heroWidth = CONTENT_W - cardWidth - 10;
    roundRect(page, heroX, y, heroWidth, height, 10, { fill: C.navy });
    star(page, heroX + heroWidth - 38, top - 15, 3.4, C.orange);
    star(page, heroX + heroWidth - 27, top - 13, 4.6, C.gold);
    star(page, heroX + heroWidth - 16, top - 15, 3.4, C.orange);
    text(page, 'MOYENNE GÉNÉRALE', heroX + 14, top - 17, {
      size: 6.6,
      font: fonts.bold,
      color: C.onNavyMuted,
      tracking: 1.2,
    });
    const average = score(card.overallAverage);
    const averageWidth = text(page, average, heroX + 14, top - 47, {
      size: 27,
      font: fonts.bold,
      color: C.white,
    });
    if (card.overallAverage !== null)
      text(page, '/ 20', heroX + 18 + averageWidth, top - 47, { size: 10, color: C.onNavyMuted });

    const rankLabelWidth = text(page, 'Rang', heroX + 14, y + 11, {
      size: 8.2,
      color: C.onNavyMuted,
    });
    const rankValue = card.rank
      ? `${ordinal(card.rank)}${context.rankedCount ? ` / ${context.rankedCount}` : ''}`
      : '—';
    text(page, rankValue, heroX + 17 + rankLabelWidth, y + 11, {
      size: 8.6,
      font: fonts.bold,
      color: C.white,
    });
    if (mention)
      pill(page, mention.toUpperCase(), heroX + heroWidth - 12, y + 8, {
        fill: C.gold,
        color: C.navy,
        size: 6.4,
      });
  };

  // Colonnes du tableau des matières.
  const widths = {
    subject: 140,
    average: 48,
    coefficient: 34,
    points: 48,
    gauge: 84,
    classAverage: 48,
  };
  const colX = {
    subject: M,
    average: M + widths.subject,
    coefficient: M + widths.subject + widths.average,
    points: M + widths.subject + widths.average + widths.coefficient,
    gauge: M + widths.subject + widths.average + widths.coefficient + widths.points,
    classAverage:
      M + widths.subject + widths.average + widths.coefficient + widths.points + widths.gauge,
    comment:
      M +
      widths.subject +
      widths.average +
      widths.coefficient +
      widths.points +
      widths.gauge +
      widths.classAverage,
  };
  const commentWidth = RIGHT - colX.comment;

  const drawGauge = (
    page: PDFPage,
    cy: number,
    value: number | null,
    reference: number | null | undefined,
  ) => {
    const x = colX.gauge + 10;
    const width = widths.gauge - 20;
    roundRect(page, x, cy - 2.5, width, 5, 2.5, { fill: C.track });
    page.drawLine({
      start: { x: x + width / 2, y: cy - 4 },
      end: { x: x + width / 2, y: cy + 4 },
      thickness: 0.4,
      color: C.lineStrong,
    });
    if (value !== null && value > 0)
      roundRect(page, x, cy - 2.5, Math.max(5, (width * Math.min(value, 20)) / 20), 5, 2.5, {
        fill: value < 10 ? C.danger : C.royal,
      });
    if (reference !== null && reference !== undefined) {
      const markerX = x + (width * Math.min(reference, 20)) / 20;
      page.drawLine({
        start: { x: markerX, y: cy - 5.5 },
        end: { x: markerX, y: cy + 5.5 },
        thickness: 1.6,
        color: C.white,
      });
      page.drawLine({
        start: { x: markerX, y: cy - 5 },
        end: { x: markerX, y: cy + 5 },
        thickness: 1,
        color: C.navy,
      });
    }
  };

  const drawSectionTitle = (page: PDFPage, y: number) => {
    const width = text(page, 'Résultats par matière', M, y, {
      size: 11,
      font: fonts.bold,
      color: C.navy,
    });
    text(page, '·  Results by subject', M + width + 6, y, {
      size: 8,
      font: fonts.italic,
      color: C.muted,
    });
    const legendY = y + 1;
    const studentLabel = 'Moyenne de l’élève';
    const classLabel = 'Moyenne de la classe';
    const classWidth = measure(classLabel, fonts.regular, 7);
    text(page, classLabel, RIGHT, legendY, { size: 7, color: C.muted, align: 'right' });
    const markerX = RIGHT - classWidth - 8;
    page.drawLine({
      start: { x: markerX, y: legendY - 2 },
      end: { x: markerX, y: legendY + 7 },
      thickness: 1,
      color: C.navy,
    });
    const studentRight = markerX - 14;
    const studentWidth = measure(studentLabel, fonts.regular, 7);
    text(page, studentLabel, studentRight, legendY, { size: 7, color: C.muted, align: 'right' });
    roundRect(page, studentRight - studentWidth - 20, legendY + 0.5, 14, 4.5, 2.25, {
      fill: C.royal,
    });
  };

  const drawTableHeader = (page: PDFPage, top: number) => {
    const y = top - 10;
    const label = (value: string, x: number, align: 'left' | 'right' | 'center' = 'left') =>
      text(page, value, x, y, { size: 6.4, font: fonts.bold, color: C.navy, tracking: 0.8, align });
    label('MATIÈRE', colX.subject + 8);
    label('MOY. /20', colX.coefficient - 8, 'right');
    label('COEF.', colX.coefficient + widths.coefficient / 2, 'center');
    label('POINTS', colX.gauge - 8, 'right');
    label('NIVEAU', colX.gauge + 10);
    label('MOY. CL.', colX.comment - 8, 'right');
    label('APPRÉCIATION', colX.comment + 10);
    page.drawLine({
      start: { x: M, y: top - 16 },
      end: { x: RIGHT, y: top - 16 },
      thickness: 1.1,
      color: C.navy,
    });
    return top - 16;
  };

  const pages: PDFPage[] = [];
  const addPage = () => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    return page;
  };

  let page = addPage();
  drawMainHeader(page);
  drawIdentity(page);
  drawSectionTitle(page, 616);
  let y = drawTableHeader(page, 606);

  const rows = card.subjects.map((subject) => {
    const commentLines = subject.teacherComment
      ? wrap(subject.teacherComment, fonts.serifItalic, 8, commentWidth - 16, 2)
      : [];
    const subjectLines = wrap(subject.subjectName, fonts.bold, 8.6, widths.subject - 12, 2);
    return {
      subject,
      commentLines,
      subjectLines,
      tall: Math.max(commentLines.length, subjectLines.length) > 1,
    };
  });
  // Densité adaptative : on resserre les lignes si cela suffit à tenir sur une page.
  const rowsHeight = (single: number, double: number) =>
    rows.reduce((sum, row) => sum + (row.tall ? double : single), 0);
  const onePageBudget = y - TOTAL_ROW_H - 18 - SYNTHESIS_H - 16 - SIGNATURE_H - FOOTER_TOP;
  const [singleRowH, doubleRowH] = rowsHeight(21, 26) <= onePageBudget ? [21, 26] : [18, 23];

  rows.forEach(({ subject, commentLines, subjectLines, tall }, index) => {
    const height = tall ? doubleRowH : singleRowH;
    if (y - height < TABLE_BOTTOM) {
      page = addPage();
      y = drawTableHeader(page, drawContinuationHeader(page));
    }
    const top = y;
    const cy = top - height / 2;
    const baseline = (size: number) => cy - size * 0.35;
    if (index % 2 === 0)
      page.drawRectangle({ x: M, y: top - height, width: CONTENT_W, height, color: C.softBlue });
    page.drawLine({
      start: { x: M, y: top - height },
      end: { x: RIGHT, y: top - height },
      thickness: 0.4,
      color: C.line,
    });

    subjectLines.forEach((line, lineIndex) =>
      text(
        page,
        line,
        colX.subject + 8,
        baseline(8.6) + ((subjectLines.length - 1) * 10) / 2 - lineIndex * 10,
        { size: 8.6, font: fonts.bold, color: C.navy },
      ),
    );
    const failing = subject.average !== null && subject.average < 10;
    text(page, score(subject.average), colX.coefficient - 8, baseline(9.4), {
      size: 9.4,
      font: fonts.bold,
      color: failing ? C.danger : C.navy,
      align: 'right',
    });
    text(
      page,
      coefficientLabel(subject.coefficient),
      colX.coefficient + widths.coefficient / 2,
      baseline(8.6),
      { size: 8.6, color: C.ink, align: 'center' },
    );
    text(
      page,
      subject.average === null ? '—' : decimal(subject.average * subject.coefficient),
      colX.gauge - 8,
      baseline(8.6),
      { size: 8.6, color: C.ink, align: 'right' },
    );
    const classSubjectAverage = context.subjectAverages[subject.subjectId];
    drawGauge(page, cy, subject.average, classSubjectAverage);
    text(page, score(classSubjectAverage), colX.comment - 8, baseline(8.2), {
      size: 8.2,
      color: C.muted,
      align: 'right',
    });
    if (commentLines.length) {
      const lineHeight = 9.4;
      const firstBaseline = cy + ((commentLines.length - 1) * lineHeight) / 2 - 2.8;
      commentLines.forEach((line, lineIndex) =>
        text(page, line, colX.comment + 10, firstBaseline - lineIndex * lineHeight, {
          size: 8,
          font: fonts.serifItalic,
          color: C.ink,
        }),
      );
    } else {
      text(page, '—', colX.comment + 10, baseline(8), { size: 8, color: C.lineStrong });
    }
    y -= height;
  });

  // Ligne de totaux : seules les matières notées entrent dans la moyenne.
  const graded = card.subjects.filter((subject) => subject.average !== null);
  const totalCoefficient = graded.reduce((sum, subject) => sum + subject.coefficient, 0);
  const totalPoints = graded.reduce(
    (sum, subject) => sum + (subject.average ?? 0) * subject.coefficient,
    0,
  );
  if (y - TOTAL_ROW_H < TABLE_BOTTOM) {
    page = addPage();
    y = drawTableHeader(page, drawContinuationHeader(page));
  }
  {
    const height = TOTAL_ROW_H;
    const cy = y - height / 2;
    page.drawLine({ start: { x: M, y }, end: { x: RIGHT, y }, thickness: 0.9, color: C.navy });
    text(page, 'TOTAL', colX.subject + 8, cy - 2.4, {
      size: 7.2,
      font: fonts.bold,
      color: C.navy,
      tracking: 1.2,
    });
    text(page, score(card.overallAverage), colX.coefficient - 8, cy - 3.5, {
      size: 10,
      font: fonts.bold,
      color: C.navy,
      align: 'right',
    });
    text(
      page,
      coefficientLabel(totalCoefficient),
      colX.coefficient + widths.coefficient / 2,
      cy - 3,
      { size: 8.6, font: fonts.bold, color: C.navy, align: 'center' },
    );
    text(page, decimal(totalPoints), colX.gauge - 8, cy - 3, {
      size: 8.6,
      font: fonts.bold,
      color: C.navy,
      align: 'right',
    });
    drawGauge(page, cy, card.overallAverage, context.classAverage);
    text(page, score(context.classAverage), colX.comment - 8, cy - 3, {
      size: 8.2,
      font: fonts.bold,
      color: C.muted,
      align: 'right',
    });
    page.drawLine({
      start: { x: M, y: y - height },
      end: { x: RIGHT, y: y - height },
      thickness: 0.9,
      color: C.navy,
    });
    y -= height;
  }

  // Synthèse, décision et signatures restent groupées sur la même page.
  if (y - 18 - SYNTHESIS_H - 16 - SIGNATURE_H < FOOTER_TOP) {
    page = addPage();
    y = drawContinuationHeader(page) + 18;
  }

  const synthesisTop = y - 18;
  const gap = 10;
  const statsWidth = 160;
  const decisionWidth = 142;
  const commentCardWidth = CONTENT_W - statsWidth - decisionWidth - 2 * gap;
  const panel = (x: number, width: number, label: string) => {
    roundRect(page, x, synthesisTop - SYNTHESIS_H, width, SYNTHESIS_H, 10, {
      fill: C.white,
      stroke: C.line,
      strokeWidth: 0.7,
    });
    page.drawRectangle({
      x: x + 14,
      y: synthesisTop - 13,
      width: 18,
      height: 2.4,
      color: C.orange,
    });
    text(page, label, x + 14, synthesisTop - 26, {
      size: 6.6,
      font: fonts.bold,
      color: C.muted,
      tracking: 1.2,
    });
  };

  const statsX = M;
  panel(statsX, statsWidth, 'PROFIL DE LA CLASSE');
  const stats: Array<[string, string]> = [
    ['Moyenne de la classe', score(context.classAverage)],
    ['Plus forte moyenne', score(context.highestAverage)],
    ['Plus faible moyenne', score(context.lowestAverage)],
    ['Élèves classés', context.classSize ? `${context.rankedCount} / ${context.classSize}` : '—'],
  ];
  stats.forEach(([label, value], index) => {
    const rowY = synthesisTop - 44 - index * 14;
    text(page, label, statsX + 14, rowY, { size: 7.8, color: C.muted });
    text(page, value, statsX + statsWidth - 14, rowY, {
      size: 8.4,
      font: fonts.bold,
      color: C.navy,
      align: 'right',
    });
    if (index < stats.length - 1)
      page.drawLine({
        start: { x: statsX + 14, y: rowY - 4.5 },
        end: { x: statsX + statsWidth - 14, y: rowY - 4.5 },
        thickness: 0.35,
        color: C.line,
      });
  });

  const commentX = statsX + statsWidth + gap;
  panel(commentX, commentCardWidth, 'APPRÉCIATION GÉNÉRALE');
  text(page, '“', commentX + commentCardWidth - 16, synthesisTop - 40, {
    size: 34,
    font: fonts.serif,
    color: C.track,
    align: 'right',
  });
  if (card.generalComment) {
    wrap(card.generalComment, fonts.serifItalic, 9.6, commentCardWidth - 28, 5).forEach(
      (line, index) =>
        text(page, line, commentX + 14, synthesisTop - 44 - index * 12, {
          size: 9.6,
          font: fonts.serifItalic,
          color: C.ink,
        }),
    );
  } else {
    text(page, 'Aucune appréciation n’a été saisie.', commentX + 14, synthesisTop - 44, {
      size: 8.2,
      font: fonts.italic,
      color: C.muted,
    });
  }

  const decisionX = commentX + commentCardWidth + gap;
  panel(decisionX, decisionWidth, 'DÉCISION DU CONSEIL');
  if (card.decision) {
    wrap(card.decision, fonts.bold, 10.5, decisionWidth - 28, 3).forEach((line, index) =>
      text(page, line, decisionX + 14, synthesisTop - 46 - index * 13.5, {
        size: 10.5,
        font: fonts.bold,
        color: C.navy,
      }),
    );
  } else {
    text(page, 'En attente', decisionX + 14, synthesisTop - 46, {
      size: 9,
      font: fonts.italic,
      color: C.muted,
    });
  }
  if (card.publishedAt)
    text(
      page,
      `Arrêtée le ${formatDate(card.publishedAt, 'Africa/Douala')}`,
      decisionX + 14,
      synthesisTop - SYNTHESIS_H + 12,
      { size: 7, color: C.muted },
    );

  // Les signatures sont ancrées en bas de page, comme sur un document officiel imprimé.
  const signatureTop = FOOTER_TOP + SIGNATURE_H + 14;
  const signatureWidth = (CONTENT_W - 2 * gap) / 3;
  const signatures: Array<[string, string | null, string]> = [
    ['LE PROFESSEUR PRINCIPAL', context.headTeacherName, 'Signature'],
    ['LE CHEF D’ÉTABLISSEMENT', null, 'Cachet et signature'],
    ['LE PARENT OU TUTEUR', null, 'Signature'],
  ];
  signatures.forEach(([label, name, caption], index) => {
    const x = M + index * (signatureWidth + gap);
    text(page, label, x, signatureTop - 10, {
      size: 6.6,
      font: fonts.bold,
      color: C.navy,
      tracking: 1.1,
    });
    if (name)
      text(page, name, x, signatureTop - 22, { size: 8, color: C.ink, maxWidth: signatureWidth });
    page.drawLine({
      start: { x, y: signatureTop - 56 },
      end: { x: x + signatureWidth, y: signatureTop - 56 },
      thickness: 0.6,
      color: C.lineStrong,
      dashArray: [2, 2],
    });
    text(page, caption, x, signatureTop - 66, { size: 6.6, font: fonts.italic, color: C.muted });
  });

  // Pied de page, filigrane et pagination une fois toutes les pages connues.
  const issuedLabel = card.publishedAt
    ? `Document officiel publié le ${formatDate(card.publishedAt, 'Africa/Douala')}`
    : `Document provisoire généré le ${formatDate(new Date().toISOString(), 'Africa/Douala')} — sans valeur officielle`;
  const reference = `Réf. ${card.id.replace(/-/g, '').slice(-10).toUpperCase()}`;
  pages.forEach((current, index) => {
    if (isDraft)
      current.drawText('PROVISOIRE', {
        x: 120,
        y: 250,
        size: 92,
        font: fonts.bold,
        color: C.royal,
        opacity: 0.06,
        rotate: degrees(35),
      });
    current.drawLine({
      start: { x: M, y: 46 },
      end: { x: RIGHT, y: 46 },
      thickness: 0.5,
      color: C.line,
    });
    text(current, issuedLabel, M, 34, {
      size: 6.8,
      color: isDraft ? C.warning : C.muted,
      maxWidth: 230,
    });
    text(current, reference, M, 24, { size: 6.4, color: C.muted });
    const signatureWidthText = text(current, brand.mottos.signature, PAGE_W / 2, 30, {
      size: 8,
      font: fonts.italic,
      color: C.royal,
      align: 'center',
    });
    diamond(current, PAGE_W / 2 - signatureWidthText / 2 - 9, 32.6, 3.6, C.orange);
    diamond(current, PAGE_W / 2 + signatureWidthText / 2 + 9, 32.6, 3.6, C.orange);
    text(current, `Page ${index + 1} / ${pages.length}`, RIGHT, 30, {
      size: 6.8,
      color: C.muted,
      align: 'right',
    });
    current.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 4, color: C.navy });
    current.drawRectangle({ x: RIGHT - 84, y: 4, width: 84, height: 2.4, color: C.orange });
  });

  return pdf.save();
}
