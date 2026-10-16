import { z } from 'zod';
import { idSchema } from './primitives.js';
import { paginationQuerySchema } from './pagination.js';

export const moneySchema = z.number().int().safe();
export const feeTypeSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isMandatory: z.boolean(),
  priority: z.number().int(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export const feeInstallmentInputSchema = z.object({
  name: z.string().trim().min(1),
  amount: moneySchema.positive(),
  dueDate: z.string().date(),
  orderIndex: z.number().int().nonnegative(),
});
export const feeStructureSchema = z.object({
  id: idSchema,
  academicYearId: idSchema,
  feeTypeId: idSchema,
  feeTypeName: z.string(),
  gradeLevelId: idSchema.nullable(),
  classId: idSchema.nullable(),
  studentCategoryId: idSchema.nullable(),
  name: z.string(),
  amount: moneySchema,
  isMandatory: z.boolean(),
  allowPartialPayment: z.boolean(),
  allowFullPayment: z.boolean(),
  allowFreeAmount: z.boolean(),
  enforceInstallmentOrder: z.boolean(),
  opensAt: z.string().nullable(),
  dueDate: z.string().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  installments: z.array(feeInstallmentInputSchema.extend({ id: idSchema })),
});
export const createFeeStructureBodySchema = z
  .object({
    academicYearId: idSchema,
    feeTypeId: idSchema,
    gradeLevelId: idSchema.nullable().optional(),
    classId: idSchema.nullable().optional(),
    studentCategoryId: idSchema.nullable().optional(),
    name: z.string().trim().min(2),
    amount: moneySchema.positive(),
    isMandatory: z.boolean().default(true),
    allowPartialPayment: z.boolean().default(true),
    allowFullPayment: z.boolean().default(true),
    allowFreeAmount: z.boolean().default(true),
    enforceInstallmentOrder: z.boolean().default(false),
    opensAt: z.string().date().nullable().optional(),
    dueDate: z.string().date().nullable().optional(),
    installments: z.array(feeInstallmentInputSchema).default([]),
  })
  .superRefine((value, context) => {
    const total = value.installments.reduce((sum, item) => sum + item.amount, 0);
    if (value.installments.length && total !== value.amount)
      context.addIssue({
        code: 'custom',
        path: ['installments'],
        message: `La somme des tranches (${total}) doit être égale au montant (${value.amount}).`,
      });
  });
export const updateFeeStructureBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    amount: moneySchema.positive().optional(),
    isMandatory: z.boolean().optional(),
    allowPartialPayment: z.boolean().optional(),
    allowFullPayment: z.boolean().optional(),
    allowFreeAmount: z.boolean().optional(),
    enforceInstallmentOrder: z.boolean().optional(),
    opensAt: z.string().date().nullable().optional(),
    dueDate: z.string().date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');
export const studentFeeSchema = z.object({
  id: idSchema,
  feeTypeName: z.string(),
  structureName: z.string(),
  originalAmount: moneySchema,
  discountAmount: moneySchema,
  finalAmount: moneySchema,
  paidAmount: moneySchema,
  status: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED']),
  installments: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      amount: moneySchema,
      paidAmount: moneySchema,
      dueDate: z.string(),
      status: z.string(),
    }),
  ),
});
export const balanceSchema = z.object({
  enrollmentId: idSchema,
  totalGross: moneySchema,
  totalDiscount: moneySchema,
  totalDue: moneySchema,
  totalPaid: moneySchema,
  balance: moneySchema,
  progression: z.number().int(),
});
export const discountBodySchema = z.object({
  studentFeeAssignmentId: idSchema,
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  value: z.number().positive(),
  reason: z.string().trim().min(3),
  category: z.enum(['FRATRIE', 'BOURSE', 'PERSONNEL', 'SOCIAL', 'COMMERCIAL', 'AUTRE']),
});
export const discountSchema = z.object({
  id: idSchema,
  studentFeeAssignmentId: idSchema,
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  value: z.number(),
  amount: moneySchema,
  reason: z.string(),
  category: z.string(),
  status: z.string(),
  createdAt: z.string(),
});
export const paymentStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'PENDING_INVESTIGATION',
  'AWAITING_VALIDATION',
  'CORRECTION_REQUESTED',
  'SUCCESS',
  'FAILED',
  'REJECTED',
  'CANCELLED',
  'REVERSED',
  'REFUNDED',
]);
export const paymentSchema = z.object({
  id: idSchema,
  reference: z.string(),
  amount: moneySchema,
  paymentMethod: z.enum([
    'MOBILE_MONEY',
    'CASH',
    'BANK_TRANSFER',
    'BANK_DEPOSIT',
    'CHEQUE',
    'OTHER',
  ]),
  provider: z.string().nullable(),
  providerReference: z.string().nullable(),
  status: paymentStatusSchema,
  statusReason: z.string().nullable(),
  channel: z.enum(['PARENT_APP', 'CASHIER', 'BACKOFFICE', 'WEBHOOK']),
  unallocatedAmount: moneySchema,
  paidAt: z.string().nullable(),
  studentNames: z.array(z.string()),
  receiptId: idSchema.nullable(),
  receiptNumber: z.string().nullable(),
});
export const createPaymentBodySchema = z.object({
  enrollmentIds: z.array(idSchema).min(1),
  amount: moneySchema.positive(),
  paymentMethod: z.enum([
    'MOBILE_MONEY',
    'CASH',
    'BANK_TRANSFER',
    'BANK_DEPOSIT',
    'CHEQUE',
    'OTHER',
  ]),
  provider: z.string().trim().nullable().optional(),
  providerReference: z.string().trim().nullable().optional(),
  payerName: z.string().trim().nullable().optional(),
  payerPhone: z.string().trim().nullable().optional(),
  channel: z.enum(['PARENT_APP', 'CASHIER', 'BACKOFFICE', 'WEBHOOK']).default('BACKOFFICE'),
});
export const manualAllocationSchema = z.object({
  studentFeeAssignmentId: idSchema,
  studentFeeInstallmentId: idSchema.nullable().optional(),
  amount: moneySchema.positive(),
});
export const paymentListQuerySchema = paginationQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  student_id: idSchema.optional(),
  academic_year_id: idSchema.optional(),
  class_id: idSchema.optional(),
  grade_level_id: idSchema.optional(),
  method: z.string().optional(),
  provider: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  min_amount: z.coerce.number().int().min(0).optional(),
  max_amount: z.coerce.number().int().min(0).optional(),
  sort: z
    .enum(['reference', 'amount', 'paidAt', 'status', 'paymentMethod', 'provider'])
    .default('paidAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export const receiptSchema = z.object({
  id: idSchema,
  receiptNumber: z.string(),
  paymentId: idSchema,
  snapshot: z.record(z.unknown()),
  issuedAt: z.string(),
  cancelledAt: z.string().nullable(),
});

export type FeeTypeDto = z.infer<typeof feeTypeSchema>;
export type FeeStructureDto = z.infer<typeof feeStructureSchema>;
export type CreateFeeStructureBody = z.infer<typeof createFeeStructureBodySchema>;
export type UpdateFeeStructureBody = z.infer<typeof updateFeeStructureBodySchema>;
export type StudentFeeDto = z.infer<typeof studentFeeSchema>;
export type BalanceDto = z.infer<typeof balanceSchema>;
export type DiscountBody = z.infer<typeof discountBodySchema>;
export type PaymentDto = z.infer<typeof paymentSchema>;
export type ReceiptDto = z.infer<typeof receiptSchema>;
