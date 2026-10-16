import { z } from 'zod';
import { dateSchema, idSchema, positiveAmountSchema } from './primitives.js';
import { manualAllocationSchema } from './finance.js';

export const externalPaymentMethodSchema = z.enum([
  'BANK_TRANSFER',
  'BANK_DEPOSIT',
  'CHEQUE',
  'OTHER',
]);
export const externalPaymentDecisionStatusSchema = z.enum([
  'AWAITING_VALIDATION',
  'CORRECTION_REQUESTED',
  'VALIDATED',
  'REJECTED',
  'CANCELLED',
]);

export const externalPaymentDeclarationBodySchema = z.object({
  enrollmentId: idSchema,
  amount: positiveAmountSchema,
  paymentMethod: externalPaymentMethodSchema,
  bankName: z.string().trim().max(120).optional(),
  paymentDate: dateSchema,
  externalReference: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(1000).optional(),
});

export const externalPaymentProofSchema = z.object({
  id: idSchema,
  filename: z.string().nullable(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});

export const externalPaymentSchema = z.object({
  id: idSchema,
  paymentId: idSchema,
  reference: z.string(),
  studentId: idSchema,
  enrollmentId: idSchema,
  studentName: z.string(),
  className: z.string().nullable(),
  amount: z.number().int(),
  creditedAmount: z.number().int().nullable(),
  paymentMethod: externalPaymentMethodSchema,
  bankName: z.string().nullable(),
  paymentDate: dateSchema,
  externalReference: z.string(),
  notes: z.string().nullable(),
  status: externalPaymentDecisionStatusSchema,
  rejectionReason: z.string().nullable(),
  correctionMessage: z.string().nullable(),
  duplicateWarning: z.boolean(),
  overdue: z.boolean(),
  submittedAt: z.string(),
  decidedAt: z.string().nullable(),
  proofs: z.array(externalPaymentProofSchema),
});

export const validateExternalPaymentBodySchema = z.object({
  creditedAmount: positiveAmountSchema.optional(),
  valueDate: dateSchema.optional(),
  allocations: z.array(manualAllocationSchema).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});
export const rejectExternalPaymentBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export const requestExternalPaymentCorrectionBodySchema = z.object({
  message: z.string().trim().min(3).max(500),
});
