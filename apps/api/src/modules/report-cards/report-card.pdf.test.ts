import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ReportCardDto } from '@cplan/contracts';
import { buildDocumentBrand } from '../../platform/document-brand.js';
import { mentionFor, renderReportCardPdf, type ReportCardContext } from './report-card.pdf.js';

const subject = (index: number) => ({
  subjectId: `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
  subjectName: index % 2 ? 'Sciences de la vie et de la Terre' : 'Éducation physique',
  average: 8 + (index % 10),
  coefficient: 1 + (index % 3),
  teacherComment: index % 3 ? 'Très bon trimestre — poursuivez vos efforts.' : null,
});

const card = (subjects: number, status: ReportCardDto['status']): ReportCardDto => ({
  id: '0192a7c4-5f2e-7b10-9c3d-4e5f6a7b8c9d',
  enrollmentId: '0192a7c4-5f2e-7b10-9c3d-4e5f6a7b8c9e',
  studentId: '0192a7c4-5f2e-7b10-9c3d-4e5f6a7b8c9f',
  studentNumber: 'CSB-2026-00142',
  studentName: 'NGO BIYONG Émilienne',
  className: '4e Bilingue A',
  periodId: '0192a7c4-5f2e-7b10-9c3d-4e5f6a7b8ca0',
  periodName: 'Trimestre 1',
  overallAverage: 14.36,
  rank: 3,
  generalComment: 'Élève sérieuse et appliquée ; résultats très satisfaisants.',
  decision: 'Félicitations',
  status,
  publishedAt: status === 'PUBLISHED' ? '2026-12-18T10:00:00.000Z' : null,
  subjects: Array.from({ length: subjects }, (_, index) => subject(index)),
});

const context: ReportCardContext = {
  academicYearName: '2026-2027',
  studentBirthDate: '2013-04-12T00:00:00.000Z',
  headTeacherName: 'Jean-Paul Tchouameni',
  classSize: 42,
  rankedCount: 41,
  classAverage: 11.84,
  highestAverage: 16.92,
  lowestAverage: 6.15,
  subjectAverages: {},
};

describe('renderReportCardPdf', () => {
  it('produit un bulletin A4 d’une page avec l’identité de l’établissement', async () => {
    const brand = await buildDocumentBrand({ name: 'Complexe Scolaire Bilingue Noutcha KAMGUE' });
    expect(brand.logo).not.toBeNull();
    const pdf = await PDFDocument.load(
      await renderReportCardPdf(brand, card(12, 'PUBLISHED'), context),
    );
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
    expect(pdf.getTitle()).toBe('Bulletin Trimestre 1 — NGO BIYONG Émilienne');
  });

  it('pagine les bulletins longs et reste valide sans logo ni contexte de classe', async () => {
    const brand = { ...(await buildDocumentBrand({ name: 'École Test' })), logo: null };
    const emptyContext = {
      ...context,
      academicYearName: null,
      classSize: 0,
      rankedCount: 0,
      classAverage: null,
    };
    const bytes = await renderReportCardPdf(
      brand,
      { ...card(40, 'DRAFT'), studentName: 'Zoë 😀 Ünal' },
      emptyContext,
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it('attribue la mention selon la moyenne générale', () => {
    expect(mentionFor(null)).toBeNull();
    expect(mentionFor(16)).toBe('Très bien');
    expect(mentionFor(14.36)).toBe('Bien');
    expect(mentionFor(12)).toBe('Assez bien');
    expect(mentionFor(10)).toBe('Passable');
    expect(mentionFor(9.99)).toBe('Insuffisant');
  });
});
