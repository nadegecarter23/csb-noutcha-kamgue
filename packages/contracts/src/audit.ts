import { z } from 'zod';
import { idSchema } from './primitives.js';
import { paginatedSchema, paginationQuerySchema } from './pagination.js';

const auditJsonSchema = z.record(z.unknown()).nullable();

export const auditLogSchema = z.object({
  id: idSchema,
  userId: idSchema.nullable(),
  actorName: z.string().nullable(),
  actorType: z.enum(['USER', 'SYSTEM', 'WEBHOOK']),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  oldValues: auditJsonSchema,
  newValues: auditJsonSchema,
  metadata: auditJsonSchema,
  ipAddress: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const auditLogListSchema = paginatedSchema(auditLogSchema);

export const auditLogQuerySchema = paginationQuerySchema.extend({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  user_id: idSchema.optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entity_type: z.string().trim().min(1).max(100).optional(),
  entity_id: z.string().trim().min(1).max(255).optional(),
  ip: z.string().trim().min(1).max(64).optional(),
});

export type AuditLogDto = z.infer<typeof auditLogSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
