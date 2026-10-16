import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createSavedReportQuerySchema,
  customReportQuerySchema,
  idSchema,
  paymentSituationSchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { ReportingService } from './reporting.service.js';

const yearQuery = z.object({ academic_year_id: idSchema.optional() });
export function reportingRoutes(service: ReportingService): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = (permission: Parameters<typeof app.requirePermission>[0]) => [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission(permission),
    ];
    app.get(
      '/reports/accountant-dashboard',
      {
        preHandler: guards('reports.financial.read'),
        schema: { tags: ['Reporting'], security: [{ bearerAuth: [] }], querystring: yearQuery },
      },
      (r) => service.accountantDashboard(requireSchool(r), r.query.academic_year_id),
    );
    app.get(
      '/reports/director-dashboard',
      {
        preHandler: guards('reports.director.read'),
        schema: { tags: ['Reporting'], security: [{ bearerAuth: [] }], querystring: yearQuery },
      },
      (r) => service.directorDashboard(requireSchool(r), r.query.academic_year_id),
    );
    app.get(
      '/reports/collection-by-class',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          querystring: yearQuery.extend({ grade_level_id: idSchema.optional() }),
        },
      },
      async (r) =>
        service.collection(
          requireSchool(r),
          await service.resolveYear(requireSchool(r), r.query.academic_year_id),
          'class',
          r.query.grade_level_id,
        ),
    );
    app.get(
      '/reports/collection-by-level',
      {
        preHandler: guards('reports.financial.read'),
        schema: { tags: ['Reporting'], security: [{ bearerAuth: [] }], querystring: yearQuery },
      },
      async (r) =>
        service.collection(
          requireSchool(r),
          await service.resolveYear(requireSchool(r), r.query.academic_year_id),
          'level',
        ),
    );
    app.get(
      '/reports/class-payment-status',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            class_id: idSchema,
            situation: paymentSituationSchema.optional(),
          }),
        },
      },
      (r) => service.classPaymentStatus(requireSchool(r), r.query.class_id, r.query.situation),
    );
    app.get(
      '/reports/payment-trends',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          querystring: yearQuery.extend({
            granularity: z.enum(['day', 'week', 'month']).default('day'),
          }),
        },
      },
      async (r) =>
        service.trends(
          requireSchool(r),
          await service.resolveYear(requireSchool(r), r.query.academic_year_id),
          r.query.granularity,
        ),
    );
    app.get(
      '/reports/payment-methods-breakdown',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
          }),
        },
      },
      (r) => service.paymentMethods(requireSchool(r), r.query.from, r.query.to),
    );
    app.get(
      '/reports/outstanding',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            min_amount: z.coerce.number().int().min(0).optional(),
            class_id: idSchema.optional(),
            grade_level_id: idSchema.optional(),
            academic_year_id: idSchema.optional(),
          }),
        },
      },
      (r) => service.outstanding(requireSchool(r), r.query),
    );
    app.get(
      '/reports/installment-status',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            installment_order: z.coerce.number().int().min(0),
            status: z.string().optional(),
          }),
        },
      },
      (r) => service.installmentStatus(requireSchool(r), r.query.installment_order, r.query.status),
    );
    app.get(
      '/reports/saved-queries',
      {
        preHandler: guards('reports.financial.read'),
        schema: { tags: ['Reporting'], security: [{ bearerAuth: [] }] },
      },
      (r) => service.savedQueries(requireSchool(r), requireAuth(r).id),
    );
    app.post(
      '/reports/saved-queries',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          body: createSavedReportQuerySchema,
        },
      },
      async (r, reply) =>
        reply
          .status(201)
          .send(await service.saveQuery(requireSchool(r), requireAuth(r).id, r.body)),
    );
    app.post(
      '/reports/custom-query',
      {
        preHandler: guards('reports.financial.read'),
        schema: {
          tags: ['Reporting'],
          security: [{ bearerAuth: [] }],
          body: customReportQuerySchema,
        },
      },
      (r) => service.customQuery(requireSchool(r), r.body),
    );
    app.get(
      '/search',
      {
        preHandler: guards('search.global'),
        schema: {
          tags: ['Recherche'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            q: z.string().trim().min(2).max(100),
            types: z.string().optional(),
          }),
        },
      },
      (r) =>
        service.search(
          requireSchool(r),
          r.query.q,
          r.query.types?.split(',').filter(Boolean) ?? [],
        ),
    );
  };
}
