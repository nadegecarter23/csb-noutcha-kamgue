import { z } from 'zod';
import { idSchema } from './primitives.js';

export const importStudentRowSchema = z.object({
  studentNumber: z.string().trim().optional(),
  lastName: z.string().trim(),
  firstName: z.string().trim(),
  dateOfBirth: z.string().trim().optional(),
  gender: z.string().trim(),
  placeOfBirth: z.string().trim().optional(),
  className: z.string().trim(),
  categoryName: z.string().trim().optional(),
  guardian1LastName: z.string().trim().optional(),
  guardian1FirstName: z.string().trim().optional(),
  guardian1Relationship: z.string().trim().optional(),
  guardian1Phone: z.string().trim().optional(),
  guardian1Email: z.string().trim().optional(),
  guardian2LastName: z.string().trim().optional(),
  guardian2FirstName: z.string().trim().optional(),
  guardian2Relationship: z.string().trim().optional(),
  guardian2Phone: z.string().trim().optional(),
  guardian2Email: z.string().trim().optional(),
});
export const createImportBodySchema = z
  .object({
    academicYearId: idSchema,
    rows: z.array(importStudentRowSchema).min(1).max(5000).optional(),
    fileBase64: z.string().min(1).optional(),
    filename: z.string().max(255).optional(),
  })
  .refine((value) => Boolean(value.rows?.length || value.fileBase64), {
    message: 'Un fichier Excel ou des lignes sont obligatoires.',
  });
export const importBatchSchema = z.object({
  id: idSchema,
  academicYearId: idSchema.nullable(),
  status: z.string(),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  errorRows: z.number().int(),
  importedRows: z.number().int(),
  createdAt: z.string(),
});
export const importRowSchema = z.object({
  id: idSchema,
  rowNumber: z.number().int(),
  rawData: z.record(z.unknown()),
  normalizedData: z.record(z.unknown()).nullable(),
  errors: z.array(z.unknown()),
  status: z.string(),
  createdEntityId: idSchema.nullable(),
});
export const reenrollBodySchema = z.object({
  studentId: idSchema,
  sourceEnrollmentId: idSchema,
  academicYearId: idSchema,
  classId: idSchema.nullable().optional(),
  studentCategoryId: idSchema.nullable().optional(),
  enrollmentDate: z.string().date(),
  completeSource: z.boolean().default(true),
});
export const bulkReenrollBodySchema = z.object({
  sourceAcademicYearId: idSchema,
  targetAcademicYearId: idSchema,
  studentIds: z.array(idSchema).min(1),
  classByGradeLevel: z.record(idSchema),
  completeSource: z.boolean().default(true),
  preview: z.boolean().default(false),
});
export const reenrollResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ studentId: idSchema, message: z.string() })),
});
export type ImportBatchDto = z.infer<typeof importBatchSchema>;
export type ImportRowDto = z.infer<typeof importRowSchema>;
