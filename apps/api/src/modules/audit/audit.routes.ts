import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { auditLogListSchema, auditLogQuerySchema } from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { ReturnTypeOfAuditQueryService } from './audit.types.js';

export function auditRoutes(service: ReturnTypeOfAuditQueryService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/audit-logs',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requireAnyPermission(['audit.read', 'audit.read_financial']),
        ],
        schema: {
          tags: ['Audit'],
          security: [{ bearerAuth: [] }],
          querystring: auditLogQuerySchema,
          response: { 200: auditLogListSchema },
        },
      },
      (request) =>
        service.list(
          requireSchool(request),
          request.query,
          !requireAuth(request).permissions.has('audit.read'),
        ),
    );
  };
}
