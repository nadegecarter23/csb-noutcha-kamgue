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

/* -------------------------------------------------------------------------- */
/* Scolarité de l'enfant (notes, présences, bulletins)                         */
/* -------------------------------------------------------------------------- */

export const parentReportCardSchema = z.object({
  id: idSchema,
  academicYear: z.string(),
  periodName: z.string(),
  className: z.string().nullable(),
  overallAverage: z.number().nullable(),
  rank: z.number().int().positive().nullable(),
  /** Nombre d'élèves classés de la classe pour cette période. */
  rankedCount: z.number().int().nonnegative(),
  decision: z.string().nullable(),
  publishedAt: z.string().datetime(),
});
export const parentGradeSchema = z.object({
  id: idSchema,
  date: z.string().date(),
  title: z.string(),
  subjectName: z.string(),
  periodName: z.string(),
  score: z.number().nullable(),
  maxScore: z.number().positive(),
  /** Note ramenée sur 20, pour comparer des évaluations de barèmes différents. */
  scoreOn20: z.number().nullable(),
  isAbsent: z.boolean(),
  comment: z.string().nullable(),
});
export const parentAttendanceEventSchema = z.object({
  id: idSchema,
  date: z.string().date(),
  mark: z.enum(['ABSENT', 'LATE', 'EXCUSED']),
  minutesLate: z.number().int().nonnegative(),
  subjectName: z.string().nullable(),
  justificationStatus: z.enum(['NONE', 'PENDING', 'ACCEPTED', 'REJECTED']),
});
export const parentAcademicsSchema = z.object({
  academicYear: z.string().nullable(),
  className: z.string().nullable(),
  attendance: z.object({
    sessions: z.number().int().nonnegative(),
    present: z.number().int().nonnegative(),
    late: z.number().int().nonnegative(),
    absent: z.number().int().nonnegative(),
    excused: z.number().int().nonnegative(),
    /** Présences et retards rapportés aux séances validées, en pourcentage. */
    rate: z.number().nullable(),
    unjustifiedAbsences: z.number().int().nonnegative(),
    /** Absences, retards et absences excusées, du plus récent au plus ancien. */
    events: z.array(parentAttendanceEventSchema),
  }),
  grades: z.array(parentGradeSchema),
  reportCards: z.array(parentReportCardSchema),
});
export const parentFileDownloadSchema = z.object({
  filename: z.string(),
  mimeType: z.literal('application/pdf'),
  base64: z.string(),
});

export type ParentAcademicsDto = z.infer<typeof parentAcademicsSchema>;
export type ParentReportCardDto = z.infer<typeof parentReportCardSchema>;
export type ParentGradeDto = z.infer<typeof parentGradeSchema>;
