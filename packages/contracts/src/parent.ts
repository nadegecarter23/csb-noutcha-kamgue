import { z } from 'zod';
import { idSchema } from './primitives.js';
import { moneySchema, paymentStatusSchema } from './finance.js';

export const parentBalanceSchema = z.object({
  totalDue: moneySchema,
  totalPaid: moneySchema,
  balance: moneySchema,
});
export const parentEnrollmentSchema = z.object({
  id: idSchema,
  academicYear: z.string(),
  className: z.string().nullable(),
  isCurrent: z.boolean(),
  balance: parentBalanceSchema,
});
export const parentDashboardChildSchema = z.object({
  studentId: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  studentNumber: z.string(),
  schoolId: idSchema,
  schoolName: z.string(),
  className: z.string().nullable(),
  canViewFinances: z.boolean(),
  canPay: z.boolean(),
  balance: parentBalanceSchema.nullable(),
  nextInstallment: z
    .object({ label: z.string(), amount: moneySchema, dueDate: z.string() })
    .nullable(),
});
export const parentPaymentSchema = z.object({
  id: idSchema,
  reference: z.string(),
  amount: moneySchema,
  method: z.string(),
  status: paymentStatusSchema,
  paidAt: z.string().nullable(),
  studentNames: z.array(z.string()),
  receiptId: idSchema.nullable(),
  payerLabel: z.literal('Payeur autorisé'),
});
export const parentDashboardSchema = z.object({
  children: z.array(parentDashboardChildSchema),
  totals: parentBalanceSchema,
  recentPayments: z.array(parentPaymentSchema),
  unreadNotifications: z.number().int(),
});
export const parentChildDetailSchema = parentDashboardChildSchema.extend({
  enrollments: z.array(parentEnrollmentSchema),
});
export const registerDeviceBodySchema = z.object({
  pushToken: z.string().trim().min(8),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  deviceLabel: z.string().trim().max(100).optional(),
});
export const deviceSchema = z.object({
  id: idSchema,
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  deviceLabel: z.string().nullable(),
  status: z.enum(['ACTIVE', 'REVOKED']),
  lastSeenAt: z.string(),
});
export const notificationSchema = z.object({
  id: idSchema,
  type: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
