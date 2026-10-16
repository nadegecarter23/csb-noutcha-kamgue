import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  broadcastNotificationSchema,
  idSchema,
  notificationPreferenceSchema,
  notificationSchema,
  notificationStatsSchema,
  notificationTemplateSchema,
  previewNotificationTemplateSchema,
  updateNotificationPreferenceSchema,
  updateNotificationTemplateSchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { NotificationsService } from './notifications.service.js';

export function notificationRoutes(service: NotificationsService): FastifyPluginAsyncZod {
  return async (app) => {
    const parentGuards = [app.authenticate, app.requireParentScope];
    const staff = (
      permission: 'notifications.manage' | 'notifications.broadcast' | 'notifications.read_stats',
    ) => [app.authenticate, app.requireSchoolContext, app.requirePermission(permission)];
    const params = z.object({ id: idSchema });
    const listResponse = z.object({
      data: z.array(notificationSchema),
      meta: z.object({
        page: z.number(),
        page_size: z.number(),
        total: z.number(),
        total_pages: z.number(),
      }),
    });
    app.get(
      '/parent/notifications',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            unread_only: z.coerce.boolean().optional(),
            page: z.coerce.number().int().positive().optional(),
          }),
          response: { 200: listResponse },
        },
      },
      (request) => service.list(requireAuth(request).id, request.query),
    );
    app.post(
      '/parent/notifications/:id/read',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.read(requireAuth(request).id, request.params.id);
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/parent/notifications/read-all',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.readAll(requireAuth(request).id);
        return reply.status(204).send(null);
      },
    );
    app.get(
      '/parent/notification-preferences',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          response: { 200: notificationPreferenceSchema },
        },
      },
      (request) => service.preferences(requireAuth(request).id),
    );
    app.patch(
      '/parent/notification-preferences',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          body: updateNotificationPreferenceSchema,
          response: { 200: notificationPreferenceSchema },
        },
      },
      (request) => service.updatePreferences(requireAuth(request).id, request.body),
    );
    app.post(
      '/parent/devices',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          body: z.object({
            token: z.string().min(8),
            platform: z.enum(['ANDROID', 'IOS', 'WEB']),
            app_version: z.string().max(40).optional(),
          }),
          response: { 201: z.object({ id: idSchema }) },
        },
      },
      async (request, reply) => {
        const row = await service.registerDevice(requireAuth(request).id, request.body);
        return reply.status(201).send({ id: row.id });
      },
    );
    app.get(
      '/parent/devices',
      {
        preHandler: parentGuards,
        schema: { tags: ['Notifications'], security: [{ bearerAuth: [] }] },
      },
      (request) => service.devices(requireAuth(request).id),
    );
    app.post(
      '/parent/devices/:id/revoke',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.revokeDevice(requireAuth(request).id, request.params.id);
        return reply.status(204).send(null);
      },
    );
    app.delete(
      '/parent/devices/:token',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Notifications'],
          security: [{ bearerAuth: [] }],
          params: z.object({ token: z.string().min(8) }),
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.deleteDevice(requireAuth(request).id, request.params.token);
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/notification-templates',
      {
        preHandler: staff('notifications.manage'),
        schema: {
          tags: ['Notifications staff'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(notificationTemplateSchema) },
        },
      },
      async (request) =>
        (await service.templates(requireSchool(request))).map((row) => ({
          ...row,
          updatedAt: row.updatedAt.toISOString(),
        })),
    );
    app.patch(
      '/notification-templates',
      {
        preHandler: staff('notifications.manage'),
        schema: {
          tags: ['Notifications staff'],
          security: [{ bearerAuth: [] }],
          body: updateNotificationTemplateSchema,
          response: { 200: notificationTemplateSchema },
        },
      },
      async (request) => {
        const row = await service.updateTemplate(requireSchool(request), request.body);
        return { ...row, updatedAt: row.updatedAt.toISOString() };
      },
    );
    app.post(
      '/notification-templates/preview',
      {
        preHandler: staff('notifications.manage'),
        schema: {
          tags: ['Notifications staff'],
          security: [{ bearerAuth: [] }],
          body: previewNotificationTemplateSchema,
          response: { 200: z.object({ title: z.string(), body: z.string() }) },
        },
      },
      (request) => service.preview(requireSchool(request), request.body),
    );
    app.get(
      '/notifications/stats',
      {
        preHandler: staff('notifications.read_stats'),
        schema: {
          tags: ['Notifications staff'],
          security: [{ bearerAuth: [] }],
          response: { 200: notificationStatsSchema },
        },
      },
      (request) => service.stats(requireSchool(request)),
    );
    app.post(
      '/notifications/broadcast',
      {
        preHandler: staff('notifications.broadcast'),
        schema: {
          tags: ['Notifications staff'],
          security: [{ bearerAuth: [] }],
          body: broadcastNotificationSchema,
          response: { 202: z.object({ queued: z.number().int() }) },
        },
      },
      async (request, reply) =>
        reply
          .status(202)
          .send({ queued: (await service.broadcast(requireSchool(request), request.body)).length }),
    );
  };
}
