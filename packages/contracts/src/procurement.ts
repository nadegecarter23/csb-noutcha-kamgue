import { z } from 'zod';
import { idSchema } from './primitives.js';
import { moneySchema } from './finance.js';

export const supplierStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const supplierSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  taxId: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  paymentTermsDays: z.number().int().nonnegative(),
  status: supplierStatusSchema,
  outstandingAmount: moneySchema.nonnegative(),
});
export const expenseCategorySchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});
export const purchaseOrderLineSchema = z.object({
  id: idSchema,
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: moneySchema.nonnegative(),
  lineTotal: moneySchema.nonnegative(),
});
export const purchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
export const purchaseOrderSchema = z.object({
  id: idSchema,
  reference: z.string(),
  supplierId: idSchema,
  supplierName: z.string(),
  status: purchaseOrderStatusSchema,
  subtotal: moneySchema.nonnegative(),
  totalAmount: moneySchema.nonnegative(),
  expectedDate: z.string().date().nullable(),
  notes: z.string().nullable(),
  requestedByName: z.string(),
  approvedByName: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  receivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  lines: purchaseOrderLineSchema.array(),
});
export const expenseStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
]);
export const supplierPaymentSchema = z.object({
  id: idSchema,
  reference: z.string(),
  amount: moneySchema.positive(),
  method: z.enum(['MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER']),
  externalReference: z.string().nullable(),
  paidAt: z.string().datetime(),
  status: z.enum(['SUCCESS', 'VOIDED']),
});
export const expenseDocumentSchema = z.object({
  id: idSchema,
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export const expenseDocumentUrlSchema = z.object({
  url: z.string().url(),
  expiresIn: z.number().int().positive(),
});
export const expenseSchema = z.object({
  id: idSchema,
  reference: z.string(),
  supplierId: idSchema,
  supplierName: z.string(),
  categoryId: idSchema,
  categoryName: z.string(),
  purchaseOrderId: idSchema.nullable(),
  purchaseOrderReference: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().date(),
  dueDate: z.string().date(),
  description: z.string(),
  amount: moneySchema.positive(),
  paidAmount: moneySchema.nonnegative(),
  balance: moneySchema.nonnegative(),
  status: expenseStatusSchema,
  attachmentFileId: idSchema.nullable(),
  createdByName: z.string(),
  approvedByName: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  approvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  payments: supplierPaymentSchema.array(),
});
export const procurementOverviewSchema = z.object({
  summary: z.object({
    supplierCount: z.number().int(),
    pendingApprovalCount: z.number().int(),
    payableAmount: moneySchema.nonnegative(),
    overdueAmount: moneySchema.nonnegative(),
    paidThisMonth: moneySchema.nonnegative(),
  }),
  suppliers: supplierSchema.array(),
  categories: expenseCategorySchema.array(),
  purchaseOrders: purchaseOrderSchema.array(),
  expenses: expenseSchema.array(),
});

export const createSupplierBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2).max(180),
    taxId: z.string().trim().max(60).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().email().nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    paymentTermsDays: z.number().int().min(0).max(365).default(30),
  })
  .strict();
export const updateSupplierBodySchema = createSupplierBodySchema
  .partial()
  .extend({ status: supplierStatusSchema.optional() })
  .strict();
export const createExpenseCategoryBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(30)
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export const createPurchaseOrderBodySchema = z
  .object({
    supplierId: idSchema,
    expectedDate: z.string().date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    lines: z
      .array(
        z.object({
          description: z.string().trim().min(2).max(500),
          quantity: z.number().positive().max(1000000),
          unitPrice: moneySchema.positive(),
        }),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const workflowDecisionBodySchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(3).max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.decision !== 'REJECT' || Boolean(v.reason), {
    message: 'Le motif du rejet est obligatoire.',
    path: ['reason'],
  });
export const createExpenseBodySchema = z
  .object({
    supplierId: idSchema,
    categoryId: idSchema,
    purchaseOrderId: idSchema.nullable().optional(),
    invoiceNumber: z.string().trim().max(80).nullable().optional(),
    invoiceDate: z.string().date(),
    dueDate: z.string().date(),
    description: z.string().trim().min(3).max(1000),
    amount: moneySchema.positive(),
    attachmentFileId: idSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => v.dueDate >= v.invoiceDate, {
    message: 'L’échéance doit suivre la date de facture.',
    path: ['dueDate'],
  });
export const payExpenseBodySchema = z
  .object({
    amount: moneySchema.positive(),
    method: z.enum(['MOBILE_MONEY', 'CASH', 'BANK_TRANSFER', 'BANK_DEPOSIT', 'CHEQUE', 'OTHER']),
    externalReference: z.string().trim().max(120).nullable().optional(),
    paidAt: z.string().datetime(),
    cashSessionId: idSchema.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type ProcurementOverviewDto = z.infer<typeof procurementOverviewSchema>;
export type SupplierDto = z.infer<typeof supplierSchema>;
export type ExpenseDto = z.infer<typeof expenseSchema>;
export type PurchaseOrderDto = z.infer<typeof purchaseOrderSchema>;
export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;
export type CreatePurchaseOrderBody = z.infer<typeof createPurchaseOrderBodySchema>;
export type CreateExpenseBody = z.infer<typeof createExpenseBodySchema>;
export type PayExpenseBody = z.infer<typeof payExpenseBodySchema>;
export type WorkflowDecisionBody = z.infer<typeof workflowDecisionBodySchema>;
