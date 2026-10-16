import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  schoolModuleCodeSchema,
  schoolModulesSchema,
  updateSchoolModuleBodySchema,
} from '@cplan/contracts';
import { z } from 'zod';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { SchoolModulesService } from './school-modules.service.js';

export function schoolModulesRoutes(service: SchoolModulesService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    app.get(
      '/modules',
      {
        preHandler: [app.authenticate, app.requireSchoolContext],
        schema: { tags: ['Paramètres'], security, response: { 200: schoolModulesSchema } },
      },
      (request) => service.list(requireSchool(request)),
    );
    app.patch(
      '/modules/:code',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('settings.update'),
        ],
        schema: {
          tags: ['Paramètres'],
          security,
          params: z.object({ code: schoolModuleCodeSchema }),
          body: updateSchoolModuleBodySchema,
          response: { 200: schoolModulesSchema },
        },
      },
      (request) =>
        service.update(
          requireSchool(request),
          requireAuth(request).id,
          request.params.code,
          request.body.enabled,
        ),
    );
  };
}
