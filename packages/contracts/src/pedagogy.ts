import { z } from 'zod';
import { idSchema } from './primitives.js';

export const subjectStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const teachingAssignmentStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'INACTIVE']);

export const subjectSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  color: z.string(),
  status: subjectStatusSchema,
  organizationalUnitId: idSchema.nullable().optional(),
  languageSectionId: idSchema.nullable().optional(),
  educationTrackId: idSchema.nullable().optional(),
});

export const createSubjectBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(2).max(100),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .default('#2B6CB0'),
    organizationalUnitId: idSchema.nullable().optional(),
    languageSectionId: idSchema.nullable().optional(),
    educationTrackId: idSchema.nullable().optional(),
  })
  .strict();

export const updateSubjectBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase())
      .optional(),
    name: z.string().trim().min(2).max(100).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    status: subjectStatusSchema.optional(),
    organizationalUnitId: idSchema.nullable().optional(),
    languageSectionId: idSchema.nullable().optional(),
    educationTrackId: idSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Au moins une modification est requise.',
  });

export const teachingAssignmentSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  classId: idSchema,
  className: z.string(),
  subjectId: idSchema,
  subjectName: z.string(),
  subjectColor: z.string(),
  teacherUserId: idSchema.nullable(),
  teacherName: z.string().nullable(),
  weeklyHours: z.number().int().min(1).max(40),
  coefficient: z.number().positive().max(100),
  status: teachingAssignmentStatusSchema,
});

export const createTeachingAssignmentBodySchema = z
  .object({
    academicYearId: idSchema,
    classId: idSchema,
    subjectId: idSchema,
    teacherUserId: idSchema.nullable().optional(),
    weeklyHours: z.number().int().min(1).max(40),
    coefficient: z.number().positive().max(100).default(1),
  })
  .strict();

export const pedagogyOverviewQuerySchema = z.object({ academic_year_id: idSchema });
export const pedagogyOverviewSchema = z.object({
  subjectCount: z.number().int().nonnegative(),
  teacherCount: z.number().int().nonnegative(),
  coveredClassCount: z.number().int().nonnegative(),
  totalClassCount: z.number().int().nonnegative(),
  weeklyHours: z.number().int().nonnegative(),
  assignments: z.array(teachingAssignmentSchema),
  teachers: z.array(z.object({ id: idSchema, name: z.string(), jobTitle: z.string().nullable() })),
});

export type SubjectDto = z.infer<typeof subjectSchema>;
export type CreateSubjectBody = z.infer<typeof createSubjectBodySchema>;
export type UpdateSubjectBody = z.infer<typeof updateSubjectBodySchema>;
export type TeachingAssignmentDto = z.infer<typeof teachingAssignmentSchema>;
export type CreateTeachingAssignmentBody = z.infer<typeof createTeachingAssignmentBodySchema>;
export type PedagogyOverviewDto = z.infer<typeof pedagogyOverviewSchema>;
