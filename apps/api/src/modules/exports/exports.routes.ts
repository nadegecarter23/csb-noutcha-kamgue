import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';
import { createExportSchema, idSchema, updateDocumentTemplateSchema } from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { ExportsService } from './exports.service.js';

export function exportsRoutes(service: ExportsService): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = (permission: Parameters<typeof app.requirePermission>[0]) => [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission(permission),
    ];
    const params = z.object({ id: idSchema });
    app.post(
      '/exports',
      {
        preHandler: guards('reports.export'),
        schema: { tags: ['Exports'], security: [{ bearerAuth: [] }], body: createExportSchema },
      },
      async (r, reply) =>
        reply.status(202).send(await service.create(requireSchool(r), requireAuth(r).id, r.body)),
    );
    app.get(
      '/exports',
      {
        preHandler: guards('reports.export'),
        schema: { tags: ['Exports'], security: [{ bearerAuth: [] }] },
      },
      (r) => service.list(requireSchool(r), requireAuth(r).id),
    );
    app.get(
      '/exports/:id',
      {
        preHandler: guards('reports.export'),
        schema: { tags: ['Exports'], security: [{ bearerAuth: [] }], params },
      },
      (r) => service.get(requireSchool(r), requireAuth(r).id, r.params.id),
    );
    app.get(
      '/exports/:id/download',
      {
        preHandler: guards('reports.export'),
        schema: { tags: ['Exports'], security: [{ bearerAuth: [] }], params },
      },
      (r) => service.download(requireSchool(r), requireAuth(r).id, r.params.id),
    );
    const sendPdf = async (reply: FastifyReply, promise: Promise<Buffer>, name: string) =>
      reply
        .type('application/pdf')
        .header('Content-Disposition', `inline; filename="${name}.pdf"`)
        .send(await promise);
    app.get(
      '/print/student/:id',
      {
        preHandler: guards('students.read'),
        schema: { tags: ['Impressions'], security: [{ bearerAuth: [] }], params },
      },
      (r, reply) =>
        sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'student', { id: r.params.id }),
          'fiche-eleve',
        ),
    );
    app.get(
      '/print/enrollment/:id',
      {
        preHandler: guards('enrollments.read'),
        schema: { tags: ['Impressions'], security: [{ bearerAuth: [] }], params },
      },
      (r, reply) =>
        sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'enrollment', { id: r.params.id }),
          'fiche-inscription',
        ),
    );
    app.get(
      '/print/class-list/:id',
      {
        preHandler: guards('classes.read'),
        schema: { tags: ['Impressions'], security: [{ bearerAuth: [] }], params },
      },
      (r, reply) =>
        sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'class-list', {
            class_id: r.params.id,
          }),
          'liste-classe',
        ),
    );
    app.get(
      '/print/class-payment-status/:id',
      {
        preHandler: guards('reports.financial.read'),
        schema: { tags: ['Impressions'], security: [{ bearerAuth: [] }], params },
      },
      (r, reply) =>
        sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'class-payment-status', {
            class_id: r.params.id,
          }),
          'etat-paiements',
        ),
    );
    app.get(
      '/print/student-statement/:id',
      {
        preHandler: guards('student_fees.read'),
        schema: { tags: ['Impressions'], security: [{ bearerAuth: [] }], params },
      },
      (r, reply) =>
        sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'student-statement', {
            enrollment_id: r.params.id,
          }),
          'situation-eleve',
        ),
    );
    app.get(
      '/print/receipts',
      {
        preHandler: guards('receipts.print'),
        schema: {
          tags: ['Impressions'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({ payment_ids: z.string().min(1) }),
        },
      },
      (r, reply) => {
        const ids = r.query.payment_ids.split(',').filter(Boolean).slice(0, 50);
        return sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'receipts', { payment_ids: ids }),
          'reçus',
        );
      },
    );
    app.get(
      '/print/outstanding',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Impressions'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            class_id: idSchema.optional(),
            min_amount: z.coerce.number().int().min(0).optional(),
          }),
        },
      },
      (r, reply) =>
        sendPdf(
          reply,
          service.print(requireSchool(r), requireAuth(r).id, 'outstanding', r.query),
          'impayes',
        ),
    );
    app.get(
      '/document-templates',
      {
        preHandler: guards('settings.read'),
        schema: { tags: ['Impressions'], security: [{ bearerAuth: [] }] },
      },
      (r) => service.template(requireSchool(r)),
    );
    app.patch(
      '/document-templates',
      {
        preHandler: guards('settings.update'),
        schema: {
          tags: ['Impressions'],
          security: [{ bearerAuth: [] }],
          body: updateDocumentTemplateSchema,
        },
      },
      (r) => service.updateTemplate(requireSchool(r), requireAuth(r).id, r.body),
    );
  };
}
