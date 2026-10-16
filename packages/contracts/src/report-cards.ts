import { z } from 'zod';
import { idSchema } from './primitives.js';

export const reportCardSubjectSchema = z.object({
  subjectId: idSchema,
  subjectName: z.string(),
  average: z.number().nullable(),
  coefficient: z.number().positive(),
  teacherComment: z.string().nullable(),
});
export const reportCardSchema = z.object({
  id: idSchema,
  enrollmentId: idSchema,
  studentId: idSchema,
  studentNumber: z.string(),
  studentName: z.string(),
  className: z.string(),
  periodId: idSchema,
  periodName: z.string(),
  overallAverage: z.number().nullable(),
  rank: z.number().int().positive().nullable(),
  generalComment: z.string().nullable(),
  decision: z.string().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  publishedAt: z.string().datetime().nullable(),
  subjects: reportCardSubjectSchema.array(),
});
export const reportCardQuerySchema = z.object({
  academic_year_id: idSchema,
  period_id: idSchema,
  class_id: idSchema.optional(),
});
export const generateReportCardsBodySchema = z
  .object({ academicYearId: idSchema, periodId: idSchema, classId: idSchema })
  .strict();
export const updateReportCardBodySchema = z
  .object({
    generalComment: z.string().trim().max(1000).nullable().optional(),
    decision: z.string().trim().max(200).nullable().optional(),
    subjectComments: z
      .array(z.object({ subjectId: idSchema, comment: z.string().trim().max(500).nullable() }))
      .optional(),
  })
  .strict();
export const publishReportCardsBodySchema = z
  .object({ reportCardIds: idSchema.array().min(1) })
  .strict();
export type ReportCardDto = z.infer<typeof reportCardSchema>;
export type UpdateReportCardBody = z.infer<typeof updateReportCardBodySchema>;

const fileNamePart = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Nom de fichier lisible d'un bulletin, partagé par l'API et les clients :
 * `Bulletin_NGO-BIYONG-Marie_Trimestre-1_CSB-2026-00142.pdf`. Les accents sont
 * retirés pour rester compatible avec tous les systèmes et messageries.
 */
export function reportCardFileName(
  card: Pick<ReportCardDto, 'studentName' | 'periodName' | 'studentNumber'>,
) {
  const parts = [card.studentName, card.periodName, card.studentNumber]
    .map(fileNamePart)
    .filter(Boolean);
  return `${['Bulletin', ...parts].join('_')}.pdf`;
}
