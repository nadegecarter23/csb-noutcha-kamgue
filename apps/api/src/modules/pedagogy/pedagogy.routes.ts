import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createSubjectBodySchema,
  createTeachingAssignmentBodySchema,
  pedagogyOverviewQuerySchema,
  pedagogyOverviewSchema,
  subjectSchema,
  teachingAssignmentSchema,
  updateSubjectBodySchema,
  idSchema,
} from '@cplan/contracts';
import { z } from 'zod';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { PedagogyService } from './pedagogy.service.js';

export function pedagogyRoutes(service: PedagogyService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/pedagogy/overview',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('pedagogy.read'),
        ],
        schema: {
          tags: ['Pédagogie'],
          security: [{ bearerAuth: [] }],
          querystring: pedagogyOverviewQuerySchema,
          response: { 200: pedagogyOverviewSchema },
        },
      },
      (request) => service.overview(requireSchool(request), request.query.academic_year_id),
    );

    app.get(
      '/subjects',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('pedagogy.read'),
        ],
        schema: {
          tags: ['Pédagogie'],
          security: [{ bearerAuth: [] }],
          response: { 200: subjectSchema.array() },
        },
      },
      (request) => service.listSubjects(requireSchool(request)),
    );

    app.post(
      '/subjects',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('subjects.manage'),
        ],
        schema: {
          tags: ['Pédagogie'],
          security: [{ bearerAuth: [] }],
          body: createSubjectBodySchema,
          response: { 201: subjectSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createSubject(requireSchool(request), request.body)),
    );

    app.patch(
      '/subjects/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('subjects.manage'),
        ],
        schema: {
          tags: ['Pédagogie'],
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: updateSubjectBodySchema,
          response: { 200: subjectSchema },
        },
      },
      (request) => service.updateSubject(requireSchool(request), request.params.id, request.body),
    );

    app.post(
      '/teaching-assignments',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('teaching_assignments.manage'),
        ],
        schema: {
          tags: ['Pédagogie'],
          security: [{ bearerAuth: [] }],
          body: createTeachingAssignmentBodySchema,
          response: { 201: teachingAssignmentSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createAssignment(requireSchool(request), request.body)),
    );
  };
}
