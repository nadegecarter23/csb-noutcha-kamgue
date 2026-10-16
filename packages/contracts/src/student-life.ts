import { z } from 'zod';
import { idSchema } from './primitives.js';
export const incidentSchema = z.object({
  id: idSchema,
  enrollmentId: idSchema,
  studentNumber: z.string(),
  studentName: z.string(),
  className: z.string().nullable(),
  occurredAt: z.string().datetime(),
  category: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  description: z.string(),
  status: z.enum(['OPEN', 'CLOSED']),
  sanctions: z.array(
    z.object({
      id: idSchema,
      type: z.string(),
      description: z.string(),
      startsAt: z.string().date(),
      endsAt: z.string().date().nullable(),
    }),
  ),
});
export const healthVisitSchema = z.object({
  id: idSchema,
  enrollmentId: idSchema,
  studentNumber: z.string(),
  studentName: z.string(),
  visitedAt: z.string().datetime(),
  symptoms: z.string(),
  actionTaken: z.string(),
  guardianNotified: z.boolean(),
  followUpAt: z.string().datetime().nullable(),
});
export const studentLifeQuerySchema = z.object({
  academic_year_id: idSchema,
  class_id: idSchema.optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});
export const createIncidentBodySchema = z
  .object({
    enrollmentId: idSchema,
    occurredAt: z.string().datetime(),
    category: z.string().trim().min(2).max(80),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    description: z.string().trim().min(3).max(2000),
  })
  .strict();
export const createSanctionBodySchema = z
  .object({
    type: z.string().trim().min(2).max(80),
    description: z.string().trim().min(3).max(1000),
    startsAt: z.string().date(),
    endsAt: z.string().date().nullable().optional(),
  })
  .strict();
export const createHealthVisitBodySchema = z
  .object({
    enrollmentId: idSchema,
    visitedAt: z.string().datetime(),
    symptoms: z.string().trim().min(2).max(1000),
    actionTaken: z.string().trim().min(2).max(1000),
    guardianNotified: z.boolean().default(false),
    followUpAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type IncidentDto = z.infer<typeof incidentSchema>;
export type HealthVisitDto = z.infer<typeof healthVisitSchema>;
export type CreateIncidentBody = z.infer<typeof createIncidentBodySchema>;
export type CreateSanctionBody = z.infer<typeof createSanctionBodySchema>;
export type CreateHealthVisitBody = z.infer<typeof createHealthVisitBodySchema>;
