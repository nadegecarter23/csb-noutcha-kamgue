import { z } from 'zod';
import { idSchema } from './primitives.js';

const dateSchema = z.string().date();
export const referenceStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const academicYearStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']);
export const educationCycleSchema = z.enum(['CRECHE', 'MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']);
export const organizationalUnitCodeSchema = educationCycleSchema;
export const languageSectionCodeSchema = z.enum(['FRANCOPHONE', 'ANGLOPHONE']);
export const educationTrackCodeSchema = z.enum(['GENERAL', 'TECHNIQUE']);

export const organizationTreeSchema = z.array(
  z.object({
    id: idSchema,
    code: organizationalUnitCodeSchema,
    name: z.string(),
    orderIndex: z.number().int(),
    status: referenceStatusSchema,
    languageSections: z.array(
      z.object({
        id: idSchema,
        code: languageSectionCodeSchema,
        name: z.string(),
        status: referenceStatusSchema,
      }),
    ),
    educationTracks: z.array(
      z.object({
        id: idSchema,
        code: educationTrackCodeSchema,
        name: z.string(),
        status: referenceStatusSchema,
      }),
    ),
  }),
);
export const updateOrganizationReferenceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    status: referenceStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');

export const academicYearSchema = z.object({
  id: idSchema,
  name: z.string(),
  startDate: dateSchema,
  endDate: dateSchema,
  status: academicYearStatusSchema,
  isCurrent: z.boolean(),
  classCount: z.number().int().nonnegative(),
});

const academicYearFieldsSchema = z.object({
  name: z.string().trim().min(4).max(30),
  startDate: dateSchema,
  endDate: dateSchema,
});

export const createAcademicYearBodySchema = academicYearFieldsSchema
  .strict()
  .refine((value) => value.endDate > value.startDate, {
    message: 'La date de fin doit être postérieure à la date de début.',
    path: ['endDate'],
  });

export const updateAcademicYearBodySchema = academicYearFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');

export const lifecycleBodySchema = z
  .object({ reason: z.string().trim().min(3).max(500).optional() })
  .strict();

export const duplicateStructureBodySchema = z
  .object({ targetYearId: idSchema, preview: z.boolean().default(false) })
  .strict();

export const duplicateStructureResultSchema = z.object({
  sourceYearId: idSchema,
  targetYearId: idSchema,
  gradeLevels: z.number().int().nonnegative(),
  classes: z.number().int().nonnegative(),
  preview: z.boolean(),
});

export const gradeLevelSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  orderIndex: z.number().int().nonnegative(),
  cycle: educationCycleSchema.nullable(),
  organizationalUnitId: idSchema,
  organizationalUnitName: z.string(),
  status: referenceStatusSchema,
  classCount: z.number().int().nonnegative(),
});

export const createGradeLevelBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    code: z.string().trim().min(1).max(30),
    orderIndex: z.number().int().nonnegative(),
    cycle: educationCycleSchema.nullable().optional(),
    organizationalUnitId: idSchema.optional(),
  })
  .strict();
export const updateGradeLevelBodySchema = createGradeLevelBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');
export const reorderGradeLevelsBodySchema = z
  .object({ orderedIds: z.array(idSchema).min(1) })
  .strict();

export const classSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  gradeLevelId: idSchema,
  gradeLevelName: z.string(),
  organizationalUnitId: idSchema,
  organizationalUnitName: z.string(),
  languageSectionId: idSchema,
  languageSectionName: z.string(),
  educationTrackId: idSchema.nullable(),
  educationTrackName: z.string().nullable(),
  name: z.string(),
  capacity: z.number().int().positive().nullable(),
  headTeacherUserId: idSchema.nullable(),
  headTeacherName: z.string().nullable(),
  status: referenceStatusSchema,
  enrollmentCount: z.number().int().nonnegative(),
  fillRate: z.number().nonnegative().nullable(),
});

export const classListQuerySchema = z.object({
  academic_year_id: idSchema,
  grade_level_id: idSchema.optional(),
  organizational_unit_id: idSchema.optional(),
  language_section_id: idSchema.optional(),
  education_track_id: idSchema.optional(),
  status: referenceStatusSchema.optional(),
});
export const createClassBodySchema = z
  .object({
    academicYearId: idSchema,
    gradeLevelId: idSchema,
    organizationalUnitId: idSchema.optional(),
    languageSectionId: idSchema.optional(),
    educationTrackId: idSchema.nullable().optional(),
    name: z.string().trim().min(1).max(100),
    capacity: z.number().int().positive().nullable().optional(),
    headTeacherUserId: idSchema.nullable().optional(),
  })
  .strict();
export const createClassesBodySchema = z
  .object({ classes: z.array(createClassBodySchema).min(1).max(50) })
  .strict();
export const updateClassBodySchema = createClassBodySchema
  .omit({ academicYearId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');

export const studentCategorySchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  status: referenceStatusSchema,
});
export const createStudentCategoryBodySchema = z
  .object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(100) })
  .strict();
export const updateStudentCategoryBodySchema = createStudentCategoryBodySchema
  .partial()
  .extend({ status: referenceStatusSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');

export type AcademicYearDto = z.infer<typeof academicYearSchema>;
export type GradeLevelDto = z.infer<typeof gradeLevelSchema>;
export type ClassDto = z.infer<typeof classSchema>;
export type StudentCategoryDto = z.infer<typeof studentCategorySchema>;
export type OrganizationTree = z.infer<typeof organizationTreeSchema>;
export type CreateAcademicYearBody = z.infer<typeof createAcademicYearBodySchema>;
export type UpdateAcademicYearBody = z.infer<typeof updateAcademicYearBodySchema>;
export type CreateGradeLevelBody = z.infer<typeof createGradeLevelBodySchema>;
export type UpdateGradeLevelBody = z.infer<typeof updateGradeLevelBodySchema>;
export type CreateClassBody = z.infer<typeof createClassBodySchema>;
export type UpdateClassBody = z.infer<typeof updateClassBodySchema>;
