import { z } from 'zod';
import { idSchema } from './primitives.js';

export const guardianRelationshipSchema = z.enum([
  'PERE',
  'MERE',
  'TUTEUR',
  'ONCLE',
  'TANTE',
  'GRAND_PARENT',
  'AUTRE',
]);
export const guardianLinkStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'REVOKED',
  'EXPIRED',
]);
export const guardianSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  phoneSecondary: z.string().nullable(),
  email: z.string().nullable(),
  occupation: z.string().nullable(),
  address: z.string().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  hasAccount: z.boolean(),
});
export const studentGuardianSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  guardian: guardianSchema,
  relationship: guardianRelationshipSchema,
  isPrimary: z.boolean(),
  isFinancialResponsible: z.boolean(),
  canPay: z.boolean(),
  canViewFinances: z.boolean(),
  canReceiveNotifications: z.boolean(),
  status: guardianLinkStatusSchema,
  acceptedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});
export const guardianQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  student_id: idSchema.optional(),
});
export const guardianBodySchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  phoneSecondary: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable()
    .optional(),
  email: z.string().email().nullable().optional(),
  occupation: z.string().trim().max(150).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});
export const linkGuardianBodySchema = guardianBodySchema.extend({
  guardianId: idSchema.optional(),
  relationship: guardianRelationshipSchema,
  isPrimary: z.boolean().default(false),
  isFinancialResponsible: z.boolean().default(false),
  canPay: z.boolean().default(true),
  canViewFinances: z.boolean().default(true),
  canReceiveNotifications: z.boolean().default(true),
});
export const updateStudentGuardianBodySchema = z
  .object({
    relationship: guardianRelationshipSchema.optional(),
    isPrimary: z.boolean().optional(),
    isFinancialResponsible: z.boolean().optional(),
    canPay: z.boolean().optional(),
    canViewFinances: z.boolean().optional(),
    canReceiveNotifications: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');
export const reasonBodySchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const guardianInviteSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  guardianId: idSchema.nullable(),
  shortCode: z.string(),
  linkUrl: z.string().nullable(),
  type: z.enum(['PHONE', 'SMS', 'CODE', 'QR_CODE']),
  expiresAt: z.string().datetime(),
  maxUses: z.number().int().positive(),
  usedCount: z.number().int().nonnegative(),
  status: z.enum(['ACTIVE', 'USED', 'EXPIRED', 'REVOKED']),
});
export const createInviteBodySchema = z.object({
  guardianId: idSchema.nullable().optional(),
  type: z.enum(['PHONE', 'SMS', 'CODE', 'QR_CODE']).default('QR_CODE'),
  maxUses: z.number().int().positive().max(10).default(1),
  expiresAt: z.string().datetime().optional(),
});
export const redeemInviteBodySchema = z.union([
  z.object({ token: z.string().min(20) }),
  z.object({ shortCode: z.string().min(8).max(20) }),
]);
export const pendingParentLinkSchema = z.object({
  id: idSchema,
  studentId: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  maskedStudentNumber: z.string(),
  className: z.string().nullable(),
  schoolName: z.string(),
  relationship: guardianRelationshipSchema,
});
export const parentChildSchema = z.object({
  studentId: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  studentNumber: z.string(),
  schoolId: idSchema,
  schoolName: z.string(),
  className: z.string().nullable(),
  canPay: z.boolean(),
  canViewFinances: z.boolean(),
});
export const parentLinkRequestBodySchema = z
  .object({
    schoolId: idSchema,
    claimedStudentNumber: z.string().trim().min(1).max(50).optional(),
    claimedStudentName: z.string().trim().min(2).max(200).optional(),
    relationship: guardianRelationshipSchema,
    message: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.claimedStudentNumber || value.claimedStudentName, 'Identifiez l’élève.');
export const guardianRequestSchema = z.object({
  id: idSchema,
  kind: z.enum(['LINK_REQUEST', 'DISPUTE']),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']),
  requesterName: z.string(),
  studentId: idSchema.nullable(),
  claimedStudentNumber: z.string().nullable(),
  claimedStudentName: z.string().nullable(),
  relationship: guardianRelationshipSchema.nullable(),
  message: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export const guardianRequestQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  kind: z.enum(['LINK_REQUEST', 'DISPUTE']).optional(),
});
export const handleGuardianRequestBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
  relationship: guardianRelationshipSchema.optional(),
});

export type GuardianDto = z.infer<typeof guardianSchema>;
export type StudentGuardianDto = z.infer<typeof studentGuardianSchema>;
export type GuardianInviteDto = z.infer<typeof guardianInviteSchema>;
export type GuardianRequestDto = z.infer<typeof guardianRequestSchema>;
export type GuardianRequestStatus = z.infer<typeof guardianRequestSchema>['status'];
export type GuardianRequestKind = z.infer<typeof guardianRequestSchema>['kind'];
