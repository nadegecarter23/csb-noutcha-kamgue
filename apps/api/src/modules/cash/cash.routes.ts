import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  allocationPreviewSchema,
  cashPaymentBodySchema,
  cashRegisterSchema,
  cashSessionSchema,
  closeCashSessionBodySchema,
  idSchema,
  openCashSessionBodySchema,
  paymentSchema,
  quickStudentSchema,
  unitAccountingDashboardSchema,
} from '@cplan/contracts';
import { errors } from '../../platform/errors.js';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { CashService } from './cash.service.js';
import { renderCashReport } from './cash-report.pdf.js';
export function cashRoutes(service: CashService): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = (permission: Parameters<typeof app.requirePermission>[0]) => [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission(permission),
    ];
    const params = z.object({ id: idSchema });
    app.get(
      '/cash-registers',
      {
        preHandler: guards('cash_sessions.read'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(cashRegisterSchema) },
        },
      },
      (request) => service.registers(requireSchool(request)),
    );
    app.get(
      '/accounting/unit-dashboard',
      {
        preHandler: guards('cash_sessions.read'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          response: { 200: unitAccountingDashboardSchema },
        },
      },
      (request) => service.dashboard(requireSchool(request)),
    );
    app.post(
      '/cash-sessions/open',
      {
        preHandler: guards('cash_sessions.operate'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          body: openCashSessionBodySchema,
          response: { 201: cashSessionSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.open(requireSchool(request), requireAuth(request).id, request.body)),
    );
    app.get(
      '/cash-sessions/current',
      {
        preHandler: guards('cash_sessions.operate'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          response: { 200: cashSessionSchema.nullable() },
        },
      },
      (request) => service.current(requireSchool(request), requireAuth(request).id),
    );
    app.get(
      '/cash-sessions',
      {
        preHandler: guards('cash_sessions.read'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(cashSessionSchema) },
        },
      },
      (request) => service.list(requireSchool(request)),
    );
    app.post(
      '/cash-sessions/:id/close',
      {
        preHandler: guards('cash_sessions.operate'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          params,
          body: closeCashSessionBodySchema,
          response: { 200: cashSessionSchema },
        },
      },
      (request) =>
        service.close(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body,
        ),
    );
    app.post(
      '/cash-sessions/:id/reconcile',
      {
        preHandler: guards('cash_sessions.reconcile'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: cashSessionSchema },
        },
      },
      (request) =>
        service.reconcile(requireSchool(request), requireAuth(request).id, request.params.id),
    );
    app.get(
      '/cash-sessions/:id/report.pdf',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requireAnyPermission(['cash_sessions.read', 'cash_sessions.operate']),
        ],
        schema: { tags: ['Caisse'], security: [{ bearerAuth: [] }], params },
      },
      async (request, reply) => {
        const auth = requireAuth(request);
        const session = await service.get(
          requireSchool(request),
          auth.id,
          request.params.id,
          auth.permissions.has('cash_sessions.read'),
        );
        return reply
          .type('application/pdf')
          .header('Content-Disposition', `inline; filename="caisse-${session.id}.pdf"`)
          .send(Buffer.from(await renderCashReport(session)));
      },
    );
    app.get(
      '/students/quick-search',
      {
        preHandler: guards('payments.create_cash'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({ q: z.string().trim().min(2) }),
          response: { 200: z.array(quickStudentSchema) },
        },
      },
      (request) => service.quickSearch(requireSchool(request), request.query.q),
    );
    app.get(
      '/payments/simulate-allocation',
      {
        preHandler: guards('payments.create_cash'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            enrollment_id: idSchema,
            amount: z.coerce.number().int().positive(),
          }),
          response: { 200: allocationPreviewSchema },
        },
      },
      (request) =>
        service.simulate(requireSchool(request), request.query.enrollment_id, request.query.amount),
    );
    app.post(
      '/payments/cash',
      {
        preHandler: guards('payments.create_cash'),
        schema: {
          tags: ['Caisse'],
          security: [{ bearerAuth: [] }],
          body: cashPaymentBodySchema,
          response: { 201: paymentSchema },
        },
      },
      async (request, reply) => {
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || key.length < 8)
          throw errors.validation('L’en-tête Idempotency-Key est obligatoire.');
        return reply
          .status(201)
          .send(
            await service.collect(
              requireSchool(request),
              requireAuth(request).id,
              key,
              request.body,
            ),
          );
      },
    );
  };
}
