import { z } from 'zod';
import { idSchema } from './primitives.js';
import { moneySchema, paymentSchema } from './finance.js';

export const tenderAmountsSchema = z.object({
  CASH: moneySchema.nonnegative().default(0),
  BANK_TRANSFER: moneySchema.nonnegative().default(0),
  BANK_DEPOSIT: moneySchema.nonnegative().default(0),
  CHEQUE: moneySchema.nonnegative().default(0),
  OTHER: moneySchema.nonnegative().default(0),
});
export const openCashSessionBodySchema = z.object({
  openingFloat: moneySchema.nonnegative().default(0),
  cashRegisterId: idSchema.optional(),
  notes: z.string().trim().max(500).optional(),
});
export const cashRegisterSchema = z.object({
  id: idSchema,
  organizationalUnitId: idSchema,
  unitName: z.string(),
  code: z.string(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export const unitAccountingDashboardSchema = z.object({
  totalCollected: moneySchema,
  totalExpenses: moneySchema,
  net: moneySchema,
  units: z.array(
    z.object({
      organizationalUnitId: idSchema,
      unitName: z.string(),
      collected: moneySchema,
      expenses: moneySchema,
      net: moneySchema,
      openCashSessions: z.number().int().nonnegative(),
    }),
  ),
});
export const closeCashSessionBodySchema = z.object({
  declaredAmounts: tenderAmountsSchema,
  varianceReason: z.string().trim().max(500).optional(),
});
export const cashSessionSchema = z.object({
  id: idSchema,
  cashierUserId: idSchema,
  cashierName: z.string(),
  status: z.enum(['OPEN', 'CLOSED', 'RECONCILED']),
  openingFloat: moneySchema,
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  expectedAmounts: tenderAmountsSchema.nullable(),
  declaredAmounts: tenderAmountsSchema.nullable(),
  variance: moneySchema.nullable(),
  varianceReason: z.string().nullable(),
  paymentCount: z.number().int(),
  collectedTotal: moneySchema,
  recentPayments: z.array(paymentSchema).default([]),
});
export const quickStudentSchema = z.object({
  studentId: idSchema,
  enrollmentId: idSchema,
  studentNumber: z.string(),
  fullName: z.string(),
  className: z.string().nullable(),
  guardianPhones: z.array(z.string()),
  balance: z.object({ totalDue: moneySchema, totalPaid: moneySchema, balance: moneySchema }),
});
export const allocationPreviewSchema = z.object({
  allocations: z.array(
    z.object({
      studentFeeAssignmentId: idSchema,
      studentFeeInstallmentId: idSchema.nullable(),
      label: z.string(),
      amount: moneySchema,
    }),
  ),
  unallocatedAmount: moneySchema,
});
export const cashPaymentBodySchema = z
  .object({
    enrollmentId: idSchema,
    amount: moneySchema.positive(),
    paymentMethod: z
      .enum(['CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER'])
      .default('CASH'),
    externalReference: z.string().trim().max(100).optional(),
    note: z.string().trim().max(500).optional(),
    paidAt: z.string().datetime().optional(),
    confirmOverpayment: z.boolean().default(false),
    allocations: z
      .array(
        z.object({
          studentFeeAssignmentId: idSchema,
          studentFeeInstallmentId: idSchema.nullable().optional(),
          amount: moneySchema.positive(),
        }),
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethod !== 'CASH' && !value.externalReference)
      ctx.addIssue({
        code: 'custom',
        path: ['externalReference'],
        message: 'La référence externe est obligatoire.',
      });
  });

export type CashSessionDto = z.infer<typeof cashSessionSchema>;
export type CashPaymentBody = z.infer<typeof cashPaymentBodySchema>;
export type AllocationPreviewDto = z.infer<typeof allocationPreviewSchema>;
export type QuickStudentDto = z.infer<typeof quickStudentSchema>;
export type CashRegisterDto = z.infer<typeof cashRegisterSchema>;
export type UnitAccountingDashboardDto = z.infer<typeof unitAccountingDashboardSchema>;
