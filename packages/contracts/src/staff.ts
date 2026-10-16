import { z } from 'zod';
import { idSchema } from './primitives.js';

const employmentTypeSchema = z.enum(['PERMANENT', 'FIXED_TERM', 'VACATION', 'INTERN']);
const staffStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'LEFT']);
export const staffAssignmentSummarySchema = z.object({
  id: idSchema,
  scopeType: z.enum(['SCHOOL', 'UNIT', 'LANGUAGE_SECTION', 'TRACK', 'CLASS', 'OWN_ASSIGNMENTS']),
  label: z.string(),
  isPrimary: z.boolean(),
});
export const staffMemberSchema = z.object({
  id: idSchema,
  userId: idSchema,
  employeeNumber: z.string().nullable(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  jobTitle: z.string().nullable(),
  employmentType: employmentTypeSchema.nullable(),
  hiredAt: z.string().date().nullable(),
  contractEnd: z.string().date().nullable(),
  weeklyWorkload: z.number().int().nonnegative(),
  status: staffStatusSchema,
  teachingHours: z.number().int().nonnegative(),
  departmentId: idSchema.nullable().optional(),
  departmentName: z.string().nullable().optional(),
  positionId: idSchema.nullable().optional(),
  positionName: z.string().nullable().optional(),
  supervisorId: idSchema.nullable().optional(),
  supervisorName: z.string().nullable().optional(),
  isStaffDelegate: z.boolean().optional(),
  assignments: z.array(staffAssignmentSummarySchema).optional(),
});
export const staffOrganizationReferenceSchema = z.object({
  departments: z.array(
    z.object({
      id: idSchema,
      code: z.string(),
      name: z.string(),
      organizationalUnitId: idSchema.nullable(),
      organizationalUnitName: z.string().nullable(),
    }),
  ),
  positions: z.array(
    z.object({
      id: idSchema,
      code: z.string(),
      name: z.string(),
      departmentId: idSchema.nullable(),
      rank: z.number().int(),
      isManagement: z.boolean(),
    }),
  ),
});
export const staffLeaveSchema = z.object({
  id: idSchema,
  staffProfileId: idSchema,
  staffName: z.string(),
  type: z.string(),
  startsAt: z.string().date(),
  endsAt: z.string().date(),
  reason: z.string(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
});
export const updateStaffBodySchema = z
  .object({
    employeeNumber: z.string().trim().min(1).max(30).nullable().optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    employmentType: employmentTypeSchema.nullable().optional(),
    hiredAt: z.string().date().nullable().optional(),
    contractEnd: z.string().date().nullable().optional(),
    weeklyWorkload: z.number().int().min(0).max(80).optional(),
    status: staffStatusSchema.optional(),
    departmentId: idSchema.nullable().optional(),
    positionId: idSchema.nullable().optional(),
    supervisorId: idSchema.nullable().optional(),
    isStaffDelegate: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !v.contractEnd || !v.hiredAt || v.contractEnd >= v.hiredAt, {
    message: 'La fin du contrat doit suivre la date d’embauche.',
    path: ['contractEnd'],
  });
export const createLeaveBodySchema = z
  .object({
    staffProfileId: idSchema,
    type: z.string().trim().min(2).max(60),
    startsAt: z.string().date(),
    endsAt: z.string().date(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict()
  .refine((v) => v.endsAt >= v.startsAt, {
    message: 'La fin doit suivre le début.',
    path: ['endsAt'],
  });
export const leaveDecisionBodySchema = z
  .object({ status: z.enum(['APPROVED', 'REJECTED']) })
  .strict();
export type StaffMemberDto = z.infer<typeof staffMemberSchema>;
export type StaffOrganizationReferenceDto = z.infer<typeof staffOrganizationReferenceSchema>;
export type StaffLeaveDto = z.infer<typeof staffLeaveSchema>;
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;
export type CreateLeaveBody = z.infer<typeof createLeaveBodySchema>;
export type LeaveDecisionBody = z.infer<typeof leaveDecisionBodySchema>;
