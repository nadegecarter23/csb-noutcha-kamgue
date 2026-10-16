import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  bulkReenrollBodySchema,
  createImportBodySchema,
  idSchema,
  importBatchSchema,
  importRowSchema,
  reenrollBodySchema,
  reenrollResultSchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { ImportsService } from './imports.service.js';

const params = z.object({ id: idSchema });
const rowParams = z.object({ id: idSchema, rowId: idSchema });
export function importsRoutes(service: ImportsService): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission('imports.students.run'),
    ];
    app.get(
      '/imports/template',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            type: z.literal('STUDENTS').default('STUDENTS'),
            academic_year_id: idSchema.optional(),
          }),
        },
      },
      async (request, reply) =>
        reply
          .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          .header('Content-Disposition', 'attachment; filename="modele-eleves-csb-nk.xlsx"')
          .send(
            Buffer.from(
              await service.template(requireSchool(request), request.query.academic_year_id),
            ),
          ),
    );
    app.post(
      '/imports',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          body: createImportBodySchema,
          response: { 201: importBatchSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(
            request.body.fileBase64
              ? await service.createFromWorkbook(
                  requireSchool(request),
                  requireAuth(request).id,
                  request.body.academicYearId,
                  request.body.fileBase64,
                )
              : await service.create(
                  requireSchool(request),
                  requireAuth(request).id,
                  request.body.academicYearId,
                  request.body.rows ?? [],
                ),
          ),
    );
    app.get(
      '/imports/:id',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: importBatchSchema },
        },
      },
      (request) => service.get(requireSchool(request), request.params.id),
    );
    app.get(
      '/imports/:id/rows',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          params,
          querystring: z.object({
            status: z.enum(['PENDING', 'VALID', 'ERROR', 'IMPORTED', 'SKIPPED']).optional(),
          }),
          response: { 200: z.array(importRowSchema) },
        },
      },
      (request) => service.rows(requireSchool(request), request.params.id, request.query.status),
    );
    app.patch(
      '/imports/:id/rows/:rowId',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          params: rowParams,
          body: z.record(z.string().optional()),
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.updateRow(
          requireSchool(request),
          request.params.id,
          request.params.rowId,
          request.body,
        );
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/imports/:id/validate',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: importBatchSchema },
        },
      },
      (request) =>
        service.validate(requireSchool(request), requireAuth(request).id, request.params.id),
    );
    app.post(
      '/imports/:id/execute',
      {
        preHandler: guards,
        schema: {
          tags: ['Imports'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: importBatchSchema },
        },
      },
      (request) =>
        service.execute(requireSchool(request), requireAuth(request).id, request.params.id),
    );
    app.get(
      '/imports/:id/report',
      { preHandler: guards, schema: { tags: ['Imports'], security: [{ bearerAuth: [] }], params } },
      async (request, reply) =>
        reply
          .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          .header('Content-Disposition', 'attachment; filename="rapport-import-csb-nk.xlsx"')
          .send(Buffer.from(await service.report(requireSchool(request), request.params.id))),
    );
    app.post(
      '/enrollments/reenroll',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('enrollments.create'),
        ],
        schema: {
          tags: ['Réinscriptions'],
          security: [{ bearerAuth: [] }],
          body: reenrollBodySchema,
        },
      },
      (request) => service.reenroll(requireSchool(request), requireAuth(request).id, request.body),
    );
    app.post(
      '/enrollments/bulk-reenroll/preview',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('enrollments.bulk_reenroll'),
        ],
        schema: {
          tags: ['Réinscriptions'],
          security: [{ bearerAuth: [] }],
          body: bulkReenrollBodySchema,
          response: { 200: reenrollResultSchema },
        },
      },
      (request) =>
        service.bulkReenroll(requireSchool(request), requireAuth(request).id, {
          ...request.body,
          preview: true,
        }),
    );
    app.post(
      '/enrollments/bulk-reenroll',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('enrollments.bulk_reenroll'),
        ],
        schema: {
          tags: ['Réinscriptions'],
          security: [{ bearerAuth: [] }],
          body: bulkReenrollBodySchema,
          response: { 200: reenrollResultSchema },
        },
      },
      (request) =>
        service.bulkReenroll(requireSchool(request), requireAuth(request).id, {
          ...request.body,
          preview: false,
        }),
    );
  };
}
