import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idSchema, portalOverviewSchema } from '@cplan/contracts';
import { z } from 'zod';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { PortalService } from './portal.service.js';
export function portalRoutes(service: PortalService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/portal',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('portal.read'),
        ],
        schema: {
          tags: ['Portail'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({ academic_year_id: idSchema }),
          response: { 200: portalOverviewSchema },
        },
      },
      (r) => service.overview(requireSchool(r), requireAuth(r).id, r.query.academic_year_id),
    );
  };
}
