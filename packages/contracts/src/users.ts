import { z } from 'zod';
import { emailSchema, idSchema } from './primitives.js';
import { paginationMetaSchema, paginationQuerySchema } from './pagination.js';
import { ROLE_CODES } from './roles.js';

/**
 * Administration des comptes internes (Phase 01).
 *
 * Principe du §55 : chaque employé possède un compte individuel. Aucun compte
 * partagé — sans cela, le journal d'audit ne vaut rien.
 *
 * L'établissement ne définit JAMAIS le mot de passe d'un employé : il crée le
 * compte, l'employé reçoit une invitation par SMS et choisit lui-même son mot
 * de passe. Un mot de passe transmis par un tiers n'est plus un secret.
 */

export const userStatusSchema = z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED']);
export const accessScopeTypeSchema = z.enum([
  'SCHOOL',
  'UNIT',
  'LANGUAGE_SECTION',
  'TRACK',
  'CLASS',
  'OWN_ASSIGNMENTS',
]);
export const accessScopeSchema = z.object({
  id: idSchema.optional(),
  type: accessScopeTypeSchema,
  organizationalUnitId: idSchema.nullable().optional(),
  languageSectionId: idSchema.nullable().optional(),
  educationTrackId: idSchema.nullable().optional(),
  classId: idSchema.nullable().optional(),
  label: z.string().optional(),
});
export const replaceAccessScopesBodySchema = z
  .object({
    scopes: z
      .array(accessScopeSchema.omit({ id: true, label: true }))
      .min(1)
      .max(100),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const roleCodeSchema = z.enum(ROLE_CODES);
export const assignableRoleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Le code doit utiliser des majuscules, chiffres et underscores.');

/* -------------------------------------------------------------------------- */
/* Lecture                                                                     */
/* -------------------------------------------------------------------------- */

export const userSummarySchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  status: userStatusSchema,
  phoneVerified: z.boolean(),
  jobTitle: z.string().nullable(),
  roles: z.array(z.string()),
  accessScopes: z.array(accessScopeSchema),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const userListQuerySchema = paginationQuerySchema.extend({
  status: userStatusSchema.optional(),
  role: z.string().optional(),
});

export const userListSchema = z.object({
  data: z.array(userSummarySchema),
  meta: paginationMetaSchema,
});

/* -------------------------------------------------------------------------- */
/* Écriture                                                                    */
/* -------------------------------------------------------------------------- */

export const createUserBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(6).max(30),
    email: emailSchema.optional(),
    jobTitle: z.string().trim().max(120).optional(),
    employeeNumber: z.string().trim().max(50).optional(),
    /** Au moins un rôle : un compte sans rôle ne peut rien faire. */
    roles: z.array(assignableRoleCodeSchema).min(1, 'Attribuez au moins un rôle.'),
    /** Envoie le SMS d'invitation permettant de définir le mot de passe. */
    sendInvitation: z.boolean().default(true),
  })
  .strict();

export const updateUserBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: emailSchema.nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    employeeNumber: z.string().trim().max(50).nullable().optional(),
  })
  .strict();

export const assignRolesBodySchema = z
  .object({
    roles: z.array(assignableRoleCodeSchema).min(1, 'Attribuez au moins un rôle.'),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const deactivateUserBodySchema = z
  .object({ reason: z.string().trim().min(3, 'Le motif est obligatoire.').max(500) })
  .strict();

/* -------------------------------------------------------------------------- */
/* Rôles & permissions                                                         */
/* -------------------------------------------------------------------------- */

export const permissionSchema = z.object({
  code: z.string(),
  description: z.string(),
  group: z.string(),
});

export const roleDetailSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  userCount: z.number().int().nonnegative(),
});

export const createRoleBodySchema = z
  .object({
    code: assignableRoleCodeSchema,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z.array(z.string().trim().min(3)).default([]),
  })
  .strict();

export const updateRoleBodySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z.array(z.string().trim().min(3)).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');

/* -------------------------------------------------------------------------- */
/* Paramètres d'établissement                                                  */
/* -------------------------------------------------------------------------- */

export const schoolSettingsSchema = z.object({
  schoolId: idSchema,
  schoolName: z.string(),
  schoolCode: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  studentNumberPrefix: z.string(),
  studentNumberPadding: z.number().int(),
  receiptNumberFormat: z.string(),
  paymentRefFormat: z.string(),
  allocationStrategy: z.string(),
  allowOverpayment: z.boolean(),
  reminderDaysBefore: z.array(z.number().int()),
  reminderDaysAfter: z.array(z.number().int()),
  externalPaymentSlaHours: z.number().int(),
  smsEnabled: z.boolean(),
  smsAllowedTypes: z.array(z.string()),
  smsMonthlyLimit: z.number().int().nonnegative(),
  notificationStartHour: z.number().int(),
  notificationEndHour: z.number().int(),
  balanceReminderEnabled: z.boolean(),
  inviteTokenTtlDays: z.number().int(),
  discountApprovalThreshold: z.number().int().nonnegative(),
});

export const updateSettingsBodySchema = z
  .object({
    schoolName: z.string().trim().min(2).max(200).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: emailSchema.nullable().optional(),
    studentNumberPrefix: z.string().trim().max(20).optional(),
    studentNumberPadding: z.number().int().min(3).max(10).optional(),
    receiptNumberFormat: z.string().trim().max(60).optional(),
    paymentRefFormat: z.string().trim().max(60).optional(),
    allocationStrategy: z.enum(['BY_PRIORITY_THEN_DUE_DATE', 'MANUAL']).optional(),
    allowOverpayment: z.boolean().optional(),
    reminderDaysBefore: z.array(z.number().int().min(0).max(365)).max(6).optional(),
    reminderDaysAfter: z.array(z.number().int().min(0).max(365)).max(6).optional(),
    externalPaymentSlaHours: z.number().int().min(1).max(720).optional(),
    smsEnabled: z.boolean().optional(),
    smsAllowedTypes: z.array(z.string().min(1)).max(30).optional(),
    smsMonthlyLimit: z.number().int().min(0).max(1_000_000_000).optional(),
    notificationStartHour: z.number().int().min(0).max(23).optional(),
    notificationEndHour: z.number().int().min(1).max(24).optional(),
    balanceReminderEnabled: z.boolean().optional(),
    inviteTokenTtlDays: z.number().int().min(1).max(365).optional(),
    discountApprovalThreshold: z.number().int().min(0).max(1_000_000_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification fournie.');

export const switchSchoolBodySchema = z.object({ schoolId: idSchema }).strict();

export type UserSummary = z.infer<typeof userSummarySchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>;
export type SchoolSettingsDto = z.infer<typeof schoolSettingsSchema>;
export type AccessScopeDto = z.infer<typeof accessScopeSchema>;
export type ReplaceAccessScopesBody = z.infer<typeof replaceAccessScopesBodySchema>;
