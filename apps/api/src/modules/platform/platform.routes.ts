import { platformDashboardSchema } from '@cplan/contracts';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { PlatformService } from './platform.service.js';

export function platformRoutes(service: PlatformService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/platform/dashboard',
      {
        preHandler: [app.authenticate, app.requirePermission('schools.manage')],
        schema: {
          tags: ['Plateforme'],
          summary: 'Vue consolidée de tous les établissements',
          security: [{ bearerAuth: [] }],
          response: { 200: platformDashboardSchema },
        },
      },
      () => service.dashboard(),
    );
  };
}
