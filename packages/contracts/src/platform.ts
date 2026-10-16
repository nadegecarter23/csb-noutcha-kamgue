import { z } from 'zod';
import { idSchema } from './primitives.js';

export const platformSchoolSummarySchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']),
  users: z.number().int().nonnegative(),
  students: z.number().int().nonnegative(),
  staff: z.number().int().nonnegative(),
  confirmedPayments: z.number().int().nonnegative(),
  collectedAmount: z.number().nonnegative(),
  lastActivityAt: z.string().datetime().nullable(),
});

export const platformActivitySchema = z.object({
  id: idSchema,
  action: z.string(),
  entityType: z.string(),
  schoolName: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const platformUnitSummarySchema = z.object({
  id: idSchema,
  schoolName: z.string(),
  code: z.enum(['CRECHE', 'MATERNELLE', 'PRIMAIRE', 'SECONDAIRE']),
  name: z.string(),
  students: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  occupancyRate: z.number().min(0),
  attendanceRate: z.number().min(0).max(100).nullable(),
  expectedAmount: z.number().nonnegative(),
  collectedAmount: z.number().nonnegative(),
  remainingAmount: z.number().nonnegative(),
  alerts: z.number().int().nonnegative(),
});

export const platformAlertSchema = z.object({
  id: z.string(),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']),
  title: z.string(),
  detail: z.string(),
  count: z.number().int().nonnegative(),
  unitName: z.string().nullable(),
});

const platformCoverageSchema = z.object({
  complete: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  rate: z.number().min(0).max(100),
});

export const platformDashboardSchema = z.object({
  summary: z.object({
    totalSchools: z.number().int().nonnegative(),
    activeSchools: z.number().int().nonnegative(),
    totalUsers: z.number().int().nonnegative(),
    activeSessions: z.number().int().nonnegative(),
    activeStudents: z.number().int().nonnegative(),
    confirmedPayments: z.number().int().nonnegative(),
    collectedAmount: z.number().nonnegative(),
    expectedAmount: z.number().nonnegative(),
    remainingAmount: z.number().nonnegative(),
    collectionRate: z.number().min(0).max(100),
    attendanceRate: z.number().min(0).max(100).nullable(),
    totalCapacity: z.number().int().nonnegative(),
    priorityAlerts: z.number().int().nonnegative(),
    activity24h: z.number().int().nonnegative(),
  }),
  academicYear: z.string().nullable(),
  units: z.array(platformUnitSummarySchema),
  alerts: z.array(platformAlertSchema),
  dataQuality: z.object({
    guardianCoverage: platformCoverageSchema,
    classConfiguration: platformCoverageSchema,
    teachingCoverage: platformCoverageSchema,
    feeCoverage: platformCoverageSchema,
  }),
  schools: z.array(platformSchoolSummarySchema),
  recentActivity: z.array(platformActivitySchema),
});

export type PlatformDashboardDto = z.infer<typeof platformDashboardSchema>;
