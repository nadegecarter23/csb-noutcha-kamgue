import { z } from 'zod';
import { idSchema } from './primitives.js';

export const assessmentStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'LOCKED']);
export const absenceHandlingSchema = z.enum(['EXCLUDE', 'ZERO']);
export const academicPeriodSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  name: z.string(),
  orderIndex: z.number().int(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']),
});
export const assessmentTypeSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  defaultWeight: z.number().positive(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export const competencySchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export const gradingPolicySchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  cycle: z.enum(['CRECHE', 'MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']).nullable(),
  version: z.number().int().positive(),
  roundingDigits: z.number().int().min(0).max(2),
  weightingMode: z.enum(['WEIGHTED_AVERAGE', 'POINTS_TOTAL']),
  absenceHandling: absenceHandlingSchema,
  rankingEnabled: z.boolean(),
  isActive: z.boolean(),
});
export const gradeSchema = z.object({
  id: idSchema,
  enrollmentId: idSchema,
  studentId: idSchema,
  studentNumber: z.string(),
  studentName: z.string(),
  score: z.number().nonnegative().nullable(),
  isAbsent: z.boolean(),
  comment: z.string().nullable(),
});
export const assessmentSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  periodId: idSchema,
  periodName: z.string(),
  teachingAssignmentId: idSchema,
  classId: idSchema,
  className: z.string(),
  subjectName: z.string(),
  typeId: idSchema,
  typeName: z.string(),
  title: z.string(),
  date: z.string().date(),
  maxScore: z.number().positive(),
  weight: z.number().positive(),
  status: assessmentStatusSchema,
  competencies: competencySchema.array(),
  grades: gradeSchema.array(),
});
export const assessmentOverviewSchema = z.object({
  periods: academicPeriodSchema.array(),
  types: assessmentTypeSchema.array(),
  competencies: competencySchema.array(),
  policies: gradingPolicySchema.array(),
  assessments: assessmentSchema.array(),
});
export const assessmentQuerySchema = z.object({
  academic_year_id: idSchema,
  class_id: idSchema.optional(),
  period_id: idSchema.optional(),
});
export const createAcademicPeriodBodySchema = z
  .object({
    academicYearId: idSchema,
    name: z.string().trim().min(2).max(80),
    orderIndex: z.number().int().min(1).max(20),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: 'La fin doit suivre le début.',
    path: ['endDate'],
  });
export const updateAcademicPeriodStatusBodySchema = z
  .object({ status: z.enum(['OPEN', 'CLOSED']) })
  .strict();
export const createAssessmentTypeBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(80),
    defaultWeight: z.number().positive().max(100),
  })
  .strict();
export const createCompetencyBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export const createGradingPolicyBodySchema = z
  .object({
    academicYearId: idSchema,
    cycle: z.enum(['CRECHE', 'MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']).nullable().optional(),
    roundingDigits: z.number().int().min(0).max(2),
    weightingMode: z.enum(['WEIGHTED_AVERAGE', 'POINTS_TOTAL']),
    absenceHandling: absenceHandlingSchema.default('EXCLUDE'),
    rankingEnabled: z.boolean().default(true),
  })
  .strict();
export const createAssessmentBodySchema = z
  .object({
    academicYearId: idSchema,
    periodId: idSchema,
    teachingAssignmentId: idSchema,
    typeId: idSchema,
    title: z.string().trim().min(2).max(150),
    date: z.string().date(),
    maxScore: z.number().positive().max(1000),
    weight: z.number().positive().max(100).optional(),
    competencyIds: idSchema.array().max(20).default([]),
  })
  .strict();
export const saveGradesBodySchema = z
  .object({
    grades: z
      .array(
        z
          .object({
            enrollmentId: idSchema,
            score: z.number().nonnegative().nullable(),
            isAbsent: z.boolean().default(false),
            comment: z.string().trim().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.grades.map((grade) => grade.enrollmentId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Une inscription ne peut apparaître qu’une fois.',
        path: ['grades'],
      });
  });

export type AssessmentDto = z.infer<typeof assessmentSchema>;
export type AssessmentOverviewDto = z.infer<typeof assessmentOverviewSchema>;
export type CreateAcademicPeriodBody = z.infer<typeof createAcademicPeriodBodySchema>;
export type UpdateAcademicPeriodStatusBody = z.infer<typeof updateAcademicPeriodStatusBodySchema>;
export type CreateAssessmentTypeBody = z.infer<typeof createAssessmentTypeBodySchema>;
export type CreateCompetencyBody = z.infer<typeof createCompetencyBodySchema>;
export type CreateGradingPolicyBody = z.infer<typeof createGradingPolicyBodySchema>;
export type CreateAssessmentBody = z.infer<typeof createAssessmentBodySchema>;
export type SaveGradesBody = z.infer<typeof saveGradesBodySchema>;
