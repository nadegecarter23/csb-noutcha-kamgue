import { z } from 'zod';
import { idSchema, phoneSchema, positiveAmountSchema } from './primitives.js';
import { paymentStatusSchema } from './finance.js';

export const mobileMoneyProviderSchema = z.enum(['MTN_MOMO', 'ORANGE_MONEY', 'FAKE']);
export const initiateMobileMoneyBodySchema = z.object({
  studentId: idSchema,
  enrollmentId: idSchema,
  amount: positiveAmountSchema,
  provider: mobileMoneyProviderSchema,
  payerPhone: phoneSchema,
});
export const mobileMoneyPaymentSchema = z.object({
  id: idSchema,
  reference: z.string(),
  provider: mobileMoneyProviderSchema,
  providerReference: z.string().nullable(),
  amount: positiveAmountSchema,
  status: paymentStatusSchema,
  statusReason: z.string().nullable(),
  receiptId: idSchema.nullable(),
  balanceAfter: z.number().int().nullable(),
  confirmedNoDebit: z.boolean(),
  uncertain: z.boolean(),
  trackingAbandonedAt: z.string().nullable(),
});
export const simulateMobileMoneyBodySchema = z.object({
  enrollmentId: idSchema,
  amount: positiveAmountSchema,
});
export const mobileMoneySimulationSchema = z.object({
  amount: positiveAmountSchema,
  balanceBefore: z.number().int().nonnegative(),
  allocated: z.number().int().nonnegative(),
  unallocated: z.number().int().nonnegative(),
  balanceAfter: z.number().int().nonnegative(),
});
export const providerEventSchema = z.object({
  id: idSchema,
  provider: z.string(),
  eventId: z.string(),
  paymentId: idSchema.nullable(),
  status: z.string(),
  signatureValid: z.boolean().nullable(),
  amount: z.number().int().nullable(),
  reason: z.string().nullable(),
  receivedAt: z.string(),
  processedAt: z.string().nullable(),
});
export const mobileMoneyReconciliationSchema = z.object({
  id: idSchema,
  provider: z.string(),
  providerReference: z.string().nullable(),
  paymentId: idSchema.nullable(),
  status: z.string(),
  operatorAmount: z.number().int().nullable(),
  localAmount: z.number().int().nullable(),
  detectedAt: z.string(),
});

export type MobileMoneyProviderCode = z.infer<typeof mobileMoneyProviderSchema>;
export type InitiateMobileMoneyBody = z.infer<typeof initiateMobileMoneyBodySchema>;
