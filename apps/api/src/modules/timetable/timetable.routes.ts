import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createTimetableEntryBodySchema,
  createTimetableRoomBodySchema,
  idSchema,
  publishTimetableBodySchema,
  publishTimetableResultSchema,
  timetableEntrySchema,
  timetableQuerySchema,
  timetableRoomSchema,
} from '@cplan/contracts';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { TimetableService } from './timetable.service.js';

export function timetableRoutes(service: TimetableService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/timetable/rooms',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('timetable.read'),
        ],
        schema: {
          tags: ['Emplois du temps'],
          security: [{ bearerAuth: [] }],
          response: { 200: timetableRoomSchema.array() },
        },
      },
      (request) => service.listRooms(requireSchool(request)),
    );

    app.post(
      '/timetable/rooms',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('timetable.manage'),
        ],
        schema: {
          tags: ['Emplois du temps'],
          security: [{ bearerAuth: [] }],
          body: createTimetableRoomBodySchema,
          response: { 201: timetableRoomSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createRoom(requireSchool(request), request.body)),
    );

    app.get(
      '/timetable/entries',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('timetable.read'),
        ],
        schema: {
          tags: ['Emplois du temps'],
          security: [{ bearerAuth: [] }],
          querystring: timetableQuerySchema,
          response: { 200: timetableEntrySchema.array() },
        },
      },
      (request) =>
        service.listEntries(requireSchool(request), {
          academicYearId: request.query.academic_year_id,
          ...(request.query.class_id && { classId: request.query.class_id }),
          ...(request.query.teacher_user_id && { teacherUserId: request.query.teacher_user_id }),
        }),
    );

    app.post(
      '/timetable/entries',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('timetable.manage'),
        ],
        schema: {
          tags: ['Emplois du temps'],
          security: [{ bearerAuth: [] }],
          body: createTimetableEntryBodySchema,
          response: { 201: timetableEntrySchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createEntry(requireSchool(request), request.body)),
    );

    app.post(
      '/timetable/entries/:id/cancel',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('timetable.manage'),
        ],
        schema: {
          tags: ['Emplois du temps'],
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.cancelEntry(requireSchool(request), request.params.id);
        return reply.code(204).send(null);
      },
    );

    app.post(
      '/timetable/publish',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('timetable.publish'),
        ],
        schema: {
          tags: ['Emplois du temps'],
          security: [{ bearerAuth: [] }],
          body: publishTimetableBodySchema,
          response: { 200: publishTimetableResultSchema },
        },
      },
      (request) => service.publish(requireSchool(request), request.body.academicYearId),
    );
  };
}
