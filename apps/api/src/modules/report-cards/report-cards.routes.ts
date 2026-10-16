import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  generateReportCardsBodySchema,
  idSchema,
  publishReportCardsBodySchema,
  reportCardQuerySchema,
  reportCardSchema,
  updateReportCardBodySchema,
} from '@cplan/contracts';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { ReportCardsService } from './report-cards.service.js';
export function reportCardsRoutes(service: ReportCardsService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    const params = z.object({ id: idSchema });
    app.get(
      '/report-cards',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('report_cards.read'),
        ],
        schema: {
          tags: ['Bulletins'],
          security,
          querystring: reportCardQuerySchema,
          response: { 200: reportCardSchema.array() },
        },
      },
      (request) =>
        service.list(requireSchool(request), {
          academicYearId: request.query.academic_year_id,
          periodId: request.query.period_id,
          ...(request.query.class_id && { classId: request.query.class_id }),
        }),
    );
    app.post(
      '/report-cards/generate',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('report_cards.generate'),
        ],
        schema: {
          tags: ['Bulletins'],
          security,
          body: generateReportCardsBodySchema,
          response: { 200: z.object({ generated: z.number().int() }) },
        },
      },
      (request) => service.generate(requireSchool(request), request.body),
    );
    app.patch(
      '/report-cards/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('report_cards.comment'),
        ],
        schema: {
          tags: ['Bulletins'],
          security,
          params,
          body: updateReportCardBodySchema,
          response: { 200: reportCardSchema },
        },
      },
      (request) => service.update(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/report-cards/publish',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('report_cards.publish'),
        ],
        schema: {
          tags: ['Bulletins'],
          security,
          body: publishReportCardsBodySchema,
          response: { 200: z.object({ published: z.number().int() }) },
        },
      },
      (request) => service.publish(requireSchool(request), request.body.reportCardIds),
    );
    app.get(
      '/report-cards/:id/pdf',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('report_cards.read'),
        ],
        schema: { tags: ['Bulletins'], security, params },
      },
      async (request, reply) => {
        const { content, fileName } = await service.pdf(requireSchool(request), request.params.id);
        return reply
          .type('application/pdf')
          .header('Content-Disposition', `inline; filename="${fileName}"`)
          .send(Buffer.from(content));
      },
    );
  };
}
