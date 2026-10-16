import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  budgetSchema,
  createExpenseBodySchema,
  createExpenseCategoryBodySchema,
  createPurchaseOrderBodySchema,
  createSupplierBodySchema,
  expenseCategorySchema,
  expenseDocumentSchema,
  expenseDocumentUrlSchema,
  expenseSchema,
  idSchema,
  payExpenseBodySchema,
  procurementOverviewSchema,
  purchaseOrderSchema,
  supplierPaymentSchema,
  supplierSchema,
  updateSupplierBodySchema,
  upsertBudgetBodySchema,
  workflowDecisionBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import { errors } from '../../platform/errors.js';
import type { ProcurementService } from './procurement.service.js';

export function procurementRoutes(service: ProcurementService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    const params = z.object({ id: idSchema });
    const auth = [app.authenticate, app.requireSchoolContext] as const;

    app.get(
      '/procurement/overview',
      {
        preHandler: [
          ...auth,
          app.requireAnyPermission(['suppliers.read', 'purchases.read', 'expenses.read']),
        ],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          response: { 200: procurementOverviewSchema },
        },
      },
      (request) => service.overview(requireSchool(request)),
    );

    app.post(
      '/suppliers',
      {
        preHandler: [...auth, app.requirePermission('suppliers.manage')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          body: createSupplierBodySchema,
          response: { 201: supplierSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createSupplier(requireSchool(request), request.body)),
    );
    app.patch(
      '/suppliers/:id',
      {
        preHandler: [...auth, app.requirePermission('suppliers.manage')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          body: updateSupplierBodySchema,
          response: { 200: supplierSchema },
        },
      },
      (request) => service.updateSupplier(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/expense-categories',
      {
        preHandler: [...auth, app.requirePermission('expenses.create')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          body: createExpenseCategoryBodySchema,
          response: { 201: expenseCategorySchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createCategory(requireSchool(request), request.body)),
    );

    app.put(
      '/budgets',
      {
        preHandler: [...auth, app.requirePermission('budgets.manage')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          body: upsertBudgetBodySchema,
          response: { 200: budgetSchema },
        },
      },
      (request) => service.upsertBudget(requireSchool(request), request.body),
    );

    app.post(
      '/purchase-orders',
      {
        preHandler: [...auth, app.requirePermission('purchases.create')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          body: createPurchaseOrderBodySchema,
          response: { 201: purchaseOrderSchema },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            await service.createPurchase(
              requireSchool(request),
              requireAuth(request).id,
              request.body,
            ),
          ),
    );
    app.post(
      '/purchase-orders/:id/submit',
      {
        preHandler: [...auth, app.requirePermission('purchases.create')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          response: { 200: purchaseOrderSchema },
        },
      },
      (request) =>
        service.submitPurchase(requireSchool(request), requireAuth(request).id, request.params.id),
    );
    app.post(
      '/purchase-orders/:id/decision',
      {
        preHandler: [...auth, app.requirePermission('purchases.approve')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          body: workflowDecisionBodySchema,
          response: { 200: purchaseOrderSchema },
        },
      },
      (request) =>
        service.decidePurchase(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body,
        ),
    );
    app.post(
      '/purchase-orders/:id/receive',
      {
        preHandler: [...auth, app.requirePermission('purchases.receive')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          response: { 200: purchaseOrderSchema },
        },
      },
      (request) => service.receivePurchase(requireSchool(request), request.params.id),
    );

    app.post(
      '/expense-documents',
      {
        preHandler: [...auth, app.requirePermission('expenses.create')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          response: { 201: expenseDocumentSchema },
        },
      },
      async (request, reply) => {
        const part = await request.file();
        if (!part) throw errors.validation('Une pièce justificative est obligatoire.');
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(part.mimetype))
          throw errors.validation('Formats acceptés : PDF, JPEG et PNG.');
        const body = await part.toBuffer();
        return reply.code(201).send(
          await service.uploadDocument(requireSchool(request), requireAuth(request).id, {
            filename: part.filename,
            mimetype: part.mimetype,
            body,
          }),
        );
      },
    );
    app.post(
      '/expenses',
      {
        preHandler: [...auth, app.requirePermission('expenses.create')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          body: createExpenseBodySchema,
          response: { 201: expenseSchema },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            await service.createExpense(
              requireSchool(request),
              requireAuth(request).id,
              request.body,
            ),
          ),
    );
    app.post(
      '/expenses/:id/submit',
      {
        preHandler: [...auth, app.requirePermission('expenses.create')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          response: { 200: expenseSchema },
        },
      },
      (request) =>
        service.submitExpense(requireSchool(request), requireAuth(request).id, request.params.id),
    );
    app.post(
      '/expenses/:id/decision',
      {
        preHandler: [...auth, app.requirePermission('expenses.approve')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          body: workflowDecisionBodySchema,
          response: { 200: expenseSchema },
        },
      },
      (request) =>
        service.decideExpense(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body,
        ),
    );
    app.post(
      '/expenses/:id/pay',
      {
        preHandler: [...auth, app.requirePermission('expenses.pay')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          headers: z.object({ 'idempotency-key': z.string().min(8) }).passthrough(),
          body: payExpenseBodySchema,
          response: { 201: supplierPaymentSchema },
        },
      },
      async (request, reply) =>
        reply
          .code(201)
          .send(
            await service.payExpense(
              requireSchool(request),
              requireAuth(request).id,
              request.params.id,
              request.headers['idempotency-key'],
              request.body,
            ),
          ),
    );
    app.get(
      '/expenses/:id/document',
      {
        preHandler: [...auth, app.requirePermission('expenses.read')],
        schema: {
          tags: ['Achats et dépenses'],
          security,
          params,
          response: { 200: expenseDocumentUrlSchema },
        },
      },
      (request) => service.documentUrl(requireSchool(request), request.params.id),
    );
  };
}
