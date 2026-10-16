import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  attendanceQuerySchema,
  attendanceSessionSchema,
  idSchema,
  openAttendanceSessionBodySchema,
  saveAttendanceBodySchema,
  updateJustificationBodySchema,
  validateAttendanceResultSchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { AttendanceService } from './attendance.service.js';

export function attendanceRoutes(service: AttendanceService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/attendance/sessions',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('attendance.read'),
        ],
        schema: {
          tags: ['Assiduité'],
          security: [{ bearerAuth: [] }],
          querystring: attendanceQuerySchema,
          response: { 200: attendanceSessionSchema.array() },
        },
      },
      (request) =>
        service.list(requireSchool(request), {
          academicYearId: request.query.academic_year_id,
          date: request.query.date,
          ...(request.query.class_id && { classId: request.query.class_id }),
        }),
    );
    app.post(
      '/attendance/sessions',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('attendance.take'),
        ],
        schema: {
          tags: ['Assiduité'],
          security: [{ bearerAuth: [] }],
          body: openAttendanceSessionBodySchema,
          response: { 201: attendanceSessionSchema },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(await service.open(requireSchool(request), requireAuth(request).id, request.body)),
    );
    app.put(
      '/attendance/sessions/:id/records',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('attendance.take'),
        ],
        schema: {
          tags: ['Assiduité'],
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: saveAttendanceBodySchema,
          response: { 200: attendanceSessionSchema },
        },
      },
      (request) => service.save(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/attendance/sessions/:id/validate',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('attendance.validate'),
        ],
        schema: {
          tags: ['Assiduité'],
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          response: { 200: validateAttendanceResultSchema },
        },
      },
      (request) =>
        service.validate(requireSchool(request), requireAuth(request).id, request.params.id),
    );
    app.patch(
      '/attendance/records/:id/justification',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('attendance.justify'),
        ],
        schema: {
          tags: ['Assiduité'],
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: updateJustificationBodySchema,
          response: { 200: attendanceSessionSchema },
        },
      },
      (request) =>
        service.updateJustification(requireSchool(request), request.params.id, request.body),
    );
  };
}
