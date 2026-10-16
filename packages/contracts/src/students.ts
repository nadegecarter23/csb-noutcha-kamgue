import { z } from 'zod';
import { idSchema } from './primitives.js';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';

export const genderSchema = z.enum(['M', 'F']);
export const studentStatusSchema = z.enum([
  'ACTIVE',
  'INACTIVE',
  'GRADUATED',
  'TRANSFERRED',
  'SUSPENDED',
  'ARCHIVED',
]);
export const enrollmentStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'COMPLETED',
  'WITHDRAWN',
  'CANCELLED',
]);
export const enrollmentTypeSchema = z.enum(['NEW', 'RE_ENROLLMENT', 'TRANSFER_IN']);

export const enrollmentSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  academicYearId: idSchema,
  academicYearName: z.string(),
  classId: idSchema.nullable(),
  className: z.string().nullable(),
  gradeLevelId: idSchema.nullable(),
  gradeLevelName: z.string().nullable(),
  studentCategoryId: idSchema.nullable(),
  studentCategoryName: z.string().nullable(),
  enrollmentDate: z.string().date(),
  enrollmentType: enrollmentTypeSchema,
  status: enrollmentStatusSchema,
});

export const studentSchema = z.object({
  id: idSchema,
  studentNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  dateOfBirth: z.string().date().nullable(),
  placeOfBirth: z.string().nullable(),
  gender: genderSchema.nullable(),
  photoFileId: idSchema.nullable(),
  status: studentStatusSchema,
  currentEnrollment: enrollmentSchema.nullable(),
  guardianCount: z.number().int().nonnegative(),
});

export const studentListQuerySchema = paginationQuerySchema.extend({
  academic_year_id: idSchema.optional(),
  grade_level_id: idSchema.optional(),
  class_id: z.union([idSchema, z.literal('none')]).optional(),
  status: studentStatusSchema.optional(),
  gender: genderSchema.optional(),
  enrollment_status: enrollmentStatusSchema.optional(),
  enrollment_type: enrollmentTypeSchema.optional(),
  has_guardian_account: z.coerce.boolean().optional(),
});
export const studentListSchema = paginatedSchema(studentSchema);

export const guardianInputSchema = z.object({
  id: idSchema.optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  relationship: z.enum(['PERE', 'MERE', 'TUTEUR', 'ONCLE', 'TANTE', 'GRAND_PARENT', 'AUTRE']),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  phoneSecondary: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable()
    .optional(),
  email: z.string().email().nullable().optional(),
  isPrimary: z.boolean().default(false),
  isFinancialResponsible: z.boolean().default(false),
  canPay: z.boolean().default(true),
  canViewFinances: z.boolean().default(true),
  canReceiveNotifications: z.boolean().default(true),
});

const studentCreateFields = z.object({
  studentNumber: z.string().trim().min(1).max(50).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().date().nullable().optional(),
  placeOfBirth: z.string().trim().max(150).nullable().optional(),
  gender: genderSchema.nullable().optional(),
});
const enrollmentCreateFields = z.object({
  academicYearId: idSchema,
  classId: idSchema.nullable().optional(),
  studentCategoryId: idSchema.nullable().optional(),
  enrollmentDate: z.string().date(),
  enrollmentType: enrollmentTypeSchema.default('NEW'),
  status: enrollmentStatusSchema.default('ACTIVE'),
});

export const createStudentBodySchema = z.object({
  student: studentCreateFields,
  enrollment: enrollmentCreateFields,
  guardians: z.array(guardianInputSchema).max(10).default([]),
  confirmDuplicate: z.boolean().default(false),
});
export const createStudentResultSchema = z.object({
  student: studentSchema,
  enrollment: enrollmentSchema,
  associationCode: z.string().nullable(),
});
export const updateStudentBodySchema = studentCreateFields
  .omit({ studentNumber: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');
export const correctStudentNumberBodySchema = z.object({
  studentNumber: z.string().trim().min(1).max(50),
  reason: z.string().trim().min(3).max(500),
});
export const changeStudentStatusBodySchema = z.object({
  status: studentStatusSchema,
  reason: z.string().trim().min(3).max(500),
});
export const createEnrollmentBodySchema = enrollmentCreateFields.extend({ studentId: idSchema });
export const updateEnrollmentBodySchema = enrollmentCreateFields
  .omit({ academicYearId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');
export const studentPhotoBodySchema = z.object({ fileId: idSchema.nullable() });
export const transferClassBodySchema = z.object({
  toClassId: idSchema.nullable(),
  reason: z.string().trim().min(3).max(500),
  effectiveAt: z.string().datetime().optional(),
});
export const cancelEnrollmentBodySchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const enrollmentListQuerySchema = z.object({
  student_id: idSchema.optional(),
  academic_year_id: idSchema.optional(),
  class_id: idSchema.optional(),
  status: enrollmentStatusSchema.optional(),
});
export const studentHistoryItemSchema = z.object({
  id: idSchema,
  kind: z.string(),
  label: z.string(),
  occurredAt: z.string().datetime(),
});
export const registrarDashboardSchema = z.object({
  activeStudents: z.number().int().nonnegative(),
  newEnrollments: z.number().int().nonnegative(),
  reenrollments: z.number().int().nonnegative(),
  unassignedStudents: z.number().int().nonnegative(),
  pendingGuardianLinks: z.number().int().nonnegative(),
});
export const globalSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });
export const globalSearchResultSchema = z.object({
  students: z.array(z.object({ id: idSchema, label: z.string(), subtitle: z.string() })),
  guardians: z.array(z.object({ id: idSchema, label: z.string(), subtitle: z.string() })),
  payments: z.array(z.object({ id: idSchema, label: z.string(), subtitle: z.string() })),
  receipts: z.array(z.object({ id: idSchema, label: z.string(), subtitle: z.string() })),
});

export type StudentDto = z.infer<typeof studentSchema>;
export type EnrollmentDto = z.infer<typeof enrollmentSchema>;
export type CreateStudentBody = z.infer<typeof createStudentBodySchema>;
export type GuardianInput = z.infer<typeof guardianInputSchema>;
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
export type CreateEnrollmentBody = z.infer<typeof createEnrollmentBodySchema>;
export type RegistrarDashboard = z.infer<typeof registrarDashboardSchema>;
export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>;
