import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idSchema,
  parentAcademicsSchema,
  parentChildDetailSchema,
  parentFileDownloadSchema,
  parentDashboardSchema,
  parentPaymentSchema,
} from '@cplan/contracts';
import { requireAuth } from '../../platform/plugins/auth.plugin.js';
import type { ParentService } from './parent.service.js';

export function parentRoutes(service: ParentService): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = [app.authenticate, app.requireParentScope, app.requireModule('PORTALS')];
    const params = z.object({ id: idSchema });
    app.get(
      '/parent/schools',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(z.object({ id: idSchema, name: z.string() })) },
        },
      },
      () => service.schools(),
    );
    app.get(
      '/parent/dashboard',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          response: { 200: parentDashboardSchema },
        },
      },
      (request) => service.dashboard(requireAuth(request).id),
    );
    app.get(
      '/parent/children/:id',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: parentChildDetailSchema },
        },
      },
      (request) => service.child(requireAuth(request).id, request.params.id),
    );
    app.get(
      '/parent/enrollments/:id/statement',
      { preHandler: guards, schema: { tags: ['Parent'], security: [{ bearerAuth: [] }], params } },
      (request) => service.statement(requireAuth(request).id, request.params.id),
    );
    app.get(
      '/parent/payments',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({ student_id: idSchema.optional() }),
          response: { 200: z.array(parentPaymentSchema) },
        },
      },
      (request) => service.listPayments(requireAuth(request).id, request.query.student_id),
    );
    app.get(
      '/parent/receipts/:id/pdf',
      { preHandler: guards, schema: { tags: ['Parent'], security: [{ bearerAuth: [] }], params } },
      async (request, reply) =>
        reply
          .type('application/pdf')
          .header('Content-Disposition', 'inline; filename="recu-cplan.pdf"')
          .send(Buffer.from(await service.receiptPdf(requireAuth(request).id, request.params.id))),
    );
    app.get(
      '/parent/children/:id/academics',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: parentAcademicsSchema },
        },
      },
      (request) => service.academics(requireAuth(request).id, request.params.id),
    );
    app.get(
      '/parent/report-cards/:id/download',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: parentFileDownloadSchema },
        },
      },
      async (request) => {
        const { content, fileName } = await service.reportCardPdf(
          requireAuth(request).id,
          request.params.id,
        );
        return {
          filename: fileName,
          mimeType: 'application/pdf' as const,
          base64: Buffer.from(content).toString('base64'),
        };
      },
    );
    app.get(
      '/parent/receipts/:id/download',
      {
        preHandler: guards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: {
            200: z.object({
              filename: z.string(),
              mimeType: z.literal('application/pdf'),
              base64: z.string(),
            }),
          },
        },
      },
      async (request) => ({
        filename: `recu-${request.params.id}.pdf`,
        mimeType: 'application/pdf' as const,
        base64: Buffer.from(
          await service.receiptPdf(requireAuth(request).id, request.params.id),
        ).toString('base64'),
      }),
    );
    app.get(
      '/parent/link-requests',
      { preHandler: guards, schema: { tags: ['Parent'], security: [{ bearerAuth: [] }] } },
      (request) => service.requests(requireAuth(request).id),
    );
  };
}
