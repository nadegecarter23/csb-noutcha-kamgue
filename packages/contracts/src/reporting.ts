import { z } from 'zod';
import { idSchema } from './primitives.js';

export const paymentSituationSchema = z.enum(['ON_TRACK', 'PARTIAL', 'UNPAID', 'OVERDUE']);
export const reportCriteriaSchema = z
  .object({
    academic_year_id: idSchema.optional(),
    grade_level_id: idSchema.optional(),
    class_id: idSchema.optional(),
    fee_type_id: idSchema.optional(),
    installment_order: z.number().int().min(0).optional(),
    situation: paymentSituationSchema.optional(),
    min_amount: z.number().int().min(0).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    payment_method: z.string().optional(),
    provider: z.string().optional(),
    status: z.string().optional(),
  })
  .strict();

export const savedReportQuerySchema = z.object({
  id: idSchema,
  name: z.string(),
  criteria: reportCriteriaSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const createSavedReportQuerySchema = z.object({
  name: z.string().trim().min(2).max(100),
  criteria: reportCriteriaSchema,
});
export const customReportQuerySchema = z.object({
  preset: z.number().int().min(1).max(9).optional(),
  criteria: reportCriteriaSchema.default({}),
  preview: z.boolean().default(false),
});

export const exportTypeSchema = z.enum([
  'STUDENTS_LIST',
  'STUDENTS_BY_CLASS',
  'PAID_STUDENTS',
  'UNPAID_STUDENTS',
  'STUDENT_FINANCIAL_STATEMENT',
  'PAYMENTS_BY_PERIOD',
  'PAYMENTS_BY_OPERATOR',
  'PAYMENTS_BY_CLASS',
  'RECEIPTS',
  'OUTSTANDING',
]);
export const exportFormatSchema = z.enum(['PDF', 'XLSX', 'CSV']);
export const createExportSchema = z.object({
  type: exportTypeSchema,
  format: exportFormatSchema,
  filters: z.record(z.unknown()).default({}),
  options: z.record(z.unknown()).default({}),
});
export const documentTemplateSchema = z.object({
  headerText: z.string().nullable(),
  footerText: z.string().nullable(),
  legalNotice: z.string().nullable(),
  defaultSignatory: z.string().nullable(),
  updatedAt: z.string(),
});
export const updateDocumentTemplateSchema = z.object({
  headerText: z.string().max(500).nullable().optional(),
  footerText: z.string().max(500).nullable().optional(),
  legalNotice: z.string().max(1000).nullable().optional(),
  defaultSignatory: z.string().max(150).nullable().optional(),
});

export type ReportCriteria = z.infer<typeof reportCriteriaSchema>;
export type CreateExportInput = z.infer<typeof createExportSchema>;
