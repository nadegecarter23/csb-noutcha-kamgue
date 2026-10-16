import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  assignTransportBodySchema,
  canteenMealSchema,
  createBookBodySchema,
  createInventoryItemBodySchema,
  createLoanBodySchema,
  createMealBodySchema,
  createTransportRouteWithFinanceBodySchema,
  idSchema,
  inventoryItemSchema,
  inventoryMovementBodySchema,
  libraryBookSchema,
  libraryLoanSchema,
  schoolServicesOverviewSchema,
  transportRouteSchema,
} from '@cplan/contracts';
import { requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { SchoolServicesService } from './school-services.service.js';
export function schoolServicesRoutes(service: SchoolServicesService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }],
      guard = [
        app.authenticate,
        app.requireSchoolContext,
        app.requirePermission('school_services.manage'),
      ],
      params = z.object({ id: idSchema });
    app.get(
      '/school-services',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('school_services.read'),
        ],
        schema: { tags: ['Services'], security, response: { 200: schoolServicesOverviewSchema } },
      },
      (r) => service.overview(requireSchool(r)),
    );
    app.post(
      '/library/books',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          body: createBookBodySchema,
          response: { 201: libraryBookSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.book(requireSchool(r), r.body)),
    );
    app.post(
      '/library/loans',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          body: createLoanBodySchema,
          response: { 201: libraryLoanSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.loan(requireSchool(r), r.body)),
    );
    app.post(
      '/library/loans/:id/return',
      {
        preHandler: guard,
        schema: { tags: ['Services'], security, params, response: { 204: z.null() } },
      },
      async (r, reply) => {
        await service.returnLoan(requireSchool(r), r.params.id);
        return reply.code(204).send(null);
      },
    );
    app.post(
      '/canteen/meals',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          body: createMealBodySchema,
          response: { 201: canteenMealSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.meal(requireSchool(r), r.body)),
    );
    app.post(
      '/transport/routes',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          body: createTransportRouteWithFinanceBodySchema,
          response: { 201: transportRouteSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.route(requireSchool(r), r.body)),
    );
    app.post(
      '/transport/enrollments',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          body: assignTransportBodySchema,
          response: { 201: transportRouteSchema },
        },
      },
      async (r, reply) =>
        reply.code(201).send(await service.assignTransport(requireSchool(r), r.body)),
    );
    app.post(
      '/inventory/items',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          body: createInventoryItemBodySchema,
          response: { 201: inventoryItemSchema },
        },
      },
      async (r, reply) => reply.code(201).send(await service.item(requireSchool(r), r.body)),
    );
    app.post(
      '/inventory/items/:id/movements',
      {
        preHandler: guard,
        schema: {
          tags: ['Services'],
          security,
          params,
          body: inventoryMovementBodySchema,
          response: { 201: inventoryItemSchema },
        },
      },
      async (r, reply) =>
        reply.code(201).send(await service.movement(requireSchool(r), r.params.id, r.body)),
    );
  };
}
