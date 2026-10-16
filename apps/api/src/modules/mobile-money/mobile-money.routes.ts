import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  idSchema,
  initiateMobileMoneyBodySchema,
  mobileMoneyPaymentSchema,
  mobileMoneySimulationSchema,
  providerEventSchema,
  simulateMobileMoneyBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import { errors } from '../../platform/errors.js';
import type { MobileMoneyService } from './mobile-money.service.js';

const params = z.object({ id: idSchema });
export function mobileMoneyRoutes(service: MobileMoneyService): FastifyPluginAsyncZod {
  return async (app) => {
    const parentGuards = [app.authenticate, app.requireParentScope, app.requireModule('PAYMENTS')];
    const accountingGuards = [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission('payments.read'),
    ];
    app.get(
      '/parent/simulate-allocation',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Mobile Money'],
          security: [{ bearerAuth: [] }],
          querystring: simulateMobileMoneyBodySchema,
          response: { 200: mobileMoneySimulationSchema },
        },
      },
      (request) =>
        service.simulate(requireAuth(request).id, request.query.enrollmentId, request.query.amount),
    );
    app.post(
      '/parent/payments',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Mobile Money'],
          security: [{ bearerAuth: [] }],
          body: initiateMobileMoneyBodySchema,
          response: { 201: mobileMoneyPaymentSchema },
        },
      },
      async (request, reply) => {
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || key.length < 8)
          throw errors.validation('L’en-tête Idempotency-Key est obligatoire.');
        return reply
          .status(201)
          .send(await service.initiate(requireAuth(request).id, key, request.body));
      },
    );
    app.get(
      '/parent/payments/:id/status',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Mobile Money'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: mobileMoneyPaymentSchema },
        },
      },
      (request) => service.status(requireAuth(request).id, request.params.id),
    );
    app.post(
      '/parent/payments/:id/cancel',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Mobile Money'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: mobileMoneyPaymentSchema },
        },
      },
      (request) => service.abandon(requireAuth(request).id, request.params.id),
    );
    app.get(
      '/payments/pending-investigation',
      {
        preHandler: accountingGuards,
        schema: { tags: ['Mobile Money'], security: [{ bearerAuth: [] }] },
      },
      (request) => service.pendingInvestigations(requireSchool(request)),
    );
    app.post(
      '/payments/:id/force-check',
      {
        preHandler: accountingGuards,
        schema: { tags: ['Mobile Money'], security: [{ bearerAuth: [] }], params },
      },
      (request) => service.forceCheck(request.params.id),
    );
    app.get(
      '/admin/provider-events',
      {
        preHandler: accountingGuards,
        schema: {
          tags: ['Mobile Money'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(providerEventSchema) },
        },
      },
      (request) => service.events(requireSchool(request)),
    );
    app.post(
      '/admin/reconciliation/mobile-money',
      {
        preHandler: accountingGuards,
        schema: { tags: ['Mobile Money'], security: [{ bearerAuth: [] }] },
      },
      (request) => service.reconcile(requireSchool(request)),
    );

    await app.register(async (webhooks) => {
      webhooks.removeContentTypeParser('application/json');
      webhooks.addContentTypeParser(
        'application/json',
        { parseAs: 'string' },
        (_request, body, done) => done(null, body),
      );
      const handler =
        (provider: 'MTN_MOMO' | 'ORANGE_MONEY') =>
        async (request: {
          body: unknown;
          headers: Record<string, string | string[] | undefined>;
        }) => {
          const headers = Object.fromEntries(
            Object.entries(request.headers).map(([key, value]) => [
              key.toLowerCase(),
              Array.isArray(value) ? value[0] : value,
            ]),
          );
          return service.webhook(provider, String(request.body), headers);
        };
      webhooks.post(
        '/webhooks/mtn-momo',
        { config: { public: true }, schema: { tags: ['Webhooks'], body: z.any() } },
        handler('MTN_MOMO'),
      );
      webhooks.post(
        '/webhooks/orange-money',
        { config: { public: true }, schema: { tags: ['Webhooks'], body: z.any() } },
        handler('ORANGE_MONEY'),
      );
    });
  };
}
