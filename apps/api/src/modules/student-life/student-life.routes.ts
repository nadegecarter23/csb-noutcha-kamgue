import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createHealthVisitBodySchema,
  createIncidentBodySchema,
  createSanctionBodySchema,
  healthVisitSchema,
  idSchema,
  incidentSchema,
  studentLifeQuerySchema,
} from '@cplan/contracts';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { StudentLifeService } from './student-life.service.js';
export function studentLifeRoutes(service: StudentLifeService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    const params = z.object({ id: idSchema });
    app.get(
      '/student-life/incidents',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('student_life.read'),
        ],
        schema: {
          tags: ['Vie scolaire'],
          security,
          querystring: studentLifeQuerySchema,
          response: { 200: incidentSchema.array() },
        },
      },
      (request) =>
        service.incidents(requireSchool(request), {
          academicYearId: request.query.academic_year_id,
          ...(request.query.class_id && { classId: request.query.class_id }),
          ...(request.query.status && { status: request.query.status }),
        }),
    );
    app.post(
      '/student-life/incidents',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('student_life.manage'),
        ],
        schema: {
          tags: ['Vie scolaire'],
          security,
          body: createIncidentBodySchema,
          response: { 201: incidentSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createIncident(requireSchool(request), request.body)),
    );
    app.post(
      '/student-life/incidents/:id/sanctions',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('student_life.manage'),
        ],
        schema: {
          tags: ['Vie scolaire'],
          security,
          params,
          body: createSanctionBodySchema,
          response: { 201: incidentSchema },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(await service.sanction(requireSchool(request), request.params.id, request.body)),
    );
    app.post(
      '/student-life/incidents/:id/close',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('student_life.manage'),
        ],
        schema: { tags: ['Vie scolaire'], security, params, response: { 204: z.null() } },
      },
      async (request, reply) => {
        await service.close(requireSchool(request), request.params.id);
        return reply.code(204).send(null);
      },
    );
    app.get(
      '/student-life/health-visits',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('health_records.read'),
        ],
        schema: {
          tags: ['Infirmerie'],
          security,
          querystring: z.object({ academic_year_id: idSchema }),
          response: { 200: healthVisitSchema.array() },
        },
      },
      (request) => service.health(requireSchool(request), request.query.academic_year_id),
    );
    app.post(
      '/student-life/health-visits',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('health_records.manage'),
        ],
        schema: {
          tags: ['Infirmerie'],
          security,
          body: createHealthVisitBodySchema,
          response: { 201: healthVisitSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createHealth(requireSchool(request), request.body)),
    );
  };
}
