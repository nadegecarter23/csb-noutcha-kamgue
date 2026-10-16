import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  announcementSchema,
  communicationsOverviewSchema,
  createAnnouncementBodySchema,
  createHomeworkBodySchema,
  createSchoolEventBodySchema,
  createSchoolMessageBodySchema,
  homeworkSchema,
  idSchema,
  schoolEventSchema,
  schoolMessageSchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { CommunicationsService } from './communications.service.js';
import { z } from 'zod';
export function communicationsRoutes(service: CommunicationsService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    app.get(
      '/communications',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('communications.read'),
        ],
        schema: {
          tags: ['Communication'],
          security,
          querystring: z.object({ academic_year_id: idSchema }),
          response: { 200: communicationsOverviewSchema },
        },
      },
      (r) => service.overview(requireSchool(r), requireAuth(r).id, r.query.academic_year_id),
    );
    app.post(
      '/announcements',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('communications.manage'),
        ],
        schema: {
          tags: ['Communication'],
          security,
          body: createAnnouncementBodySchema,
          response: { 201: announcementSchema },
        },
      },
      async (r, reply) =>
        reply.code(201).send(await service.announce(requireSchool(r), requireAuth(r).id, r.body)),
    );
    app.post(
      '/school-events',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('communications.manage'),
        ],
        schema: {
          tags: ['Communication'],
          security,
          body: createSchoolEventBodySchema,
          response: { 201: schoolEventSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.event(requireSchool(r), r.body)),
    );
    app.post(
      '/homework',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('communications.manage'),
        ],
        schema: {
          tags: ['Communication'],
          security,
          body: createHomeworkBodySchema,
          response: { 201: homeworkSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.homework(requireSchool(r), r.body)),
    );
    app.post(
      '/school-messages',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('messages.send'),
        ],
        schema: {
          tags: ['Communication'],
          security,
          body: createSchoolMessageBodySchema,
          response: { 201: schoolMessageSchema },
        },
      },
      async (r, reply) =>
        reply.code(201).send(await service.message(requireSchool(r), requireAuth(r).id, r.body)),
    );
  };
}
