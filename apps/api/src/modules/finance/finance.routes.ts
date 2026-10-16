import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  balanceSchema,
  createFeeStructureBodySchema,
  createPaymentBodySchema,
  discountBodySchema,
  discountSchema,
  feeStructureSchema,
  feeTypeSchema,
  idSchema,
  manualAllocationSchema,
  paginatedSchema,
  paymentListQuerySchema,
  paymentSchema,
  receiptSchema,
  studentFeeSchema,
  updateFeeStructureBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { FinanceService } from './finance.service.js';
import type { PaymentsService } from './payments.service.js';
import { errors } from '../../platform/errors.js';

const params = z.object({ id: idSchema });
const feeTypeBody = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().nullable().optional(),
  isMandatory: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export function financeRoutes(
  finance: FinanceService,
  payments: PaymentsService,
): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = (permission: Parameters<typeof app.requirePermission>[0]) => [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission(permission),
    ];
    app.get(
      '/fee-types',
      {
        preHandler: guards('fee_structures.read'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(feeTypeSchema) },
        },
      },
      (request) => finance.listFeeTypes(requireSchool(request)),
    );
    app.post(
      '/fee-types',
      {
        preHandler: guards('fee_types.manage'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          body: feeTypeBody,
          response: { 201: feeTypeSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await finance.createFeeType(requireSchool(request), request.body)),
    );
    app.get(
      '/fee-structures',
      {
        preHandler: guards('fee_structures.read'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            academic_year_id: idSchema.optional(),
            grade_level_id: idSchema.optional(),
            fee_type_id: idSchema.optional(),
            status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).optional(),
          }),
          response: { 200: z.array(feeStructureSchema) },
        },
      },
      (request) => finance.listStructures(requireSchool(request), request.query),
    );
    app.post(
      '/fee-structures',
      {
        preHandler: guards('fee_structures.manage'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          body: createFeeStructureBodySchema,
          response: { 201: feeStructureSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await finance.createStructure(requireSchool(request), request.body)),
    );
    app.patch(
      '/fee-structures/:id',
      {
        preHandler: guards('fee_structures.manage'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateFeeStructureBodySchema,
          response: { 200: feeStructureSchema },
        },
      },
      (request) => finance.updateStructure(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/fee-structures/:id/duplicate',
      {
        preHandler: guards('fee_structures.duplicate_year'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          body: z.object({ targetAcademicYearId: idSchema }),
          response: { 201: feeStructureSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(
            await finance.duplicateStructure(
              requireSchool(request),
              request.params.id,
              request.body.targetAcademicYearId,
            ),
          ),
    );
    app.post(
      '/fee-structures/:id/recalculate-assignments',
      {
        preHandler: guards('student_fees.recalculate'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          body: z.object({ preview: z.boolean().default(true) }),
        },
      },
      (request) =>
        finance.recalculateAssignments(
          requireSchool(request),
          request.params.id,
          request.body.preview,
        ),
    );
    for (const status of ['activate', 'deactivate'] as const)
      app.post(
        `/fee-structures/:id/${status}`,
        {
          preHandler: guards('fee_structures.manage'),
          schema: {
            tags: ['Finances'],
            security: [{ bearerAuth: [] }],
            params,
            response: { 200: feeStructureSchema },
          },
        },
        (request) =>
          finance.setStructureStatus(
            requireSchool(request),
            request.params.id,
            status === 'activate' ? 'ACTIVE' : 'INACTIVE',
          ),
      );
    app.get(
      '/fee-structures/:id/impact',
      {
        preHandler: guards('fee_structures.read'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: z.object({ studentCount: z.number(), totalAmount: z.number() }) },
        },
      },
      (request) => finance.impact(requireSchool(request), request.params.id),
    );
    app.get(
      '/enrollments/:id/fees',
      {
        preHandler: guards('student_fees.read'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: z.array(studentFeeSchema) },
        },
      },
      (request) => finance.enrollmentFees(requireSchool(request), request.params.id),
    );
    app.post(
      '/enrollments/:id/fees/assign',
      {
        preHandler: guards('student_fees.assign'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: z.object({ created: z.number() }) },
        },
      },
      (request) => finance.assignFees(requireSchool(request), request.params.id),
    );
    app.get(
      '/enrollments/:id/balance',
      {
        preHandler: guards('student_fees.read'),
        schema: {
          tags: ['Finances'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: balanceSchema },
        },
      },
      (request) => finance.balance(requireSchool(request), request.params.id),
    );
    app.post(
      '/discounts',
      {
        preHandler: guards('discounts.create'),
        schema: {
          tags: ['Remises'],
          security: [{ bearerAuth: [] }],
          body: discountBodySchema,
          response: { 201: discountSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(
            await finance.createDiscount(
              requireSchool(request),
              requireAuth(request).id,
              request.body,
            ),
          ),
    );
    for (const decision of ['approve', 'reject'] as const)
      app.post(
        `/discounts/:id/${decision}`,
        {
          preHandler: guards('discounts.approve'),
          schema: {
            tags: ['Remises'],
            security: [{ bearerAuth: [] }],
            params,
            response: { 204: z.null() },
          },
        },
        async (request, reply) => {
          await finance.decideDiscount(
            requireSchool(request),
            requireAuth(request).id,
            request.params.id,
            decision === 'approve',
          );
          return reply.status(204).send(null);
        },
      );

    app.get(
      '/payments',
      {
        preHandler: guards('payments.read'),
        schema: {
          tags: ['Paiements'],
          security: [{ bearerAuth: [] }],
          querystring: paymentListQuerySchema,
          response: { 200: paginatedSchema(paymentSchema) },
        },
      },
      (request) => payments.list(requireSchool(request), request.query),
    );
    app.get(
      '/payments/:id',
      {
        preHandler: guards('payments.read'),
        schema: { tags: ['Paiements'], security: [{ bearerAuth: [] }], params },
      },
      (request) => payments.get(requireSchool(request), request.params.id),
    );
    app.post(
      '/payments',
      {
        preHandler: guards('payments.create_cash'),
        schema: {
          tags: ['Paiements'],
          security: [{ bearerAuth: [] }],
          body: createPaymentBodySchema,
          response: { 201: paymentSchema },
        },
      },
      async (request, reply) => {
        if (request.body.paymentMethod === 'CASH')
          throw errors.validation('Utilisez /payments/cash avec une session de caisse ouverte.');
        return reply
          .status(201)
          .send(
            await payments.create(requireSchool(request), requireAuth(request).id, request.body),
          );
      },
    );
    app.post(
      '/payments/:id/succeed',
      {
        preHandler: guards('payments.validate_external'),
        schema: {
          tags: ['Paiements internes'],
          security: [{ bearerAuth: [] }],
          params,
          body: z.object({
            enrollmentIds: z.array(idSchema).min(1),
            allocations: z.array(manualAllocationSchema).optional(),
          }),
          response: { 200: paymentSchema },
        },
      },
      (request) =>
        payments.markSuccess(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body.enrollmentIds,
          request.body.allocations,
        ),
    );
    app.post(
      '/payments/:id/reverse',
      {
        preHandler: guards('payments.reverse'),
        schema: {
          tags: ['Paiements'],
          security: [{ bearerAuth: [] }],
          params,
          body: z.object({ reason: z.string().trim().min(3) }),
          response: { 201: paymentSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(
            await payments.reverse(
              requireSchool(request),
              requireAuth(request).id,
              request.params.id,
              request.body.reason,
            ),
          ),
    );
    app.post(
      '/payments/:id/reallocate',
      {
        preHandler: guards('payments.allocate_manual'),
        schema: {
          tags: ['Paiements'],
          security: [{ bearerAuth: [] }],
          params,
          body: z.object({ allocations: z.array(manualAllocationSchema).min(1) }),
          response: { 200: paymentSchema },
        },
      },
      (request) =>
        payments.reallocate(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body.allocations,
        ),
    );
    app.get(
      '/payments/:id/receipt',
      {
        preHandler: guards('receipts.read'),
        schema: { tags: ['ReÃ§us'], security: [{ bearerAuth: [] }], params },
      },
      async (request) => {
        const payment = await payments.get(requireSchool(request), request.params.id);
        if (!payment.receiptId) throw new Error('Aucun reçu pour ce paiement.');
        return payments.receipt(requireSchool(request), payment.receiptId);
      },
    );
    app.get(
      '/enrollments/:id/statement',
      {
        preHandler: guards('student_fees.read'),
        schema: { tags: ['Finances'], security: [{ bearerAuth: [] }], params },
      },
      (request) => payments.statement(requireSchool(request), request.params.id),
    );
    app.get(
      '/receipts/:id',
      {
        preHandler: guards('receipts.read'),
        schema: {
          tags: ['Reçus'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: receiptSchema },
        },
      },
      (request) => payments.receipt(requireSchool(request), request.params.id),
    );
    app.get(
      '/receipts/:id/pdf',
      {
        preHandler: guards('receipts.print'),
        schema: { tags: ['Reçus'], security: [{ bearerAuth: [] }], params },
      },
      async (request, reply) =>
        reply
          .type('application/pdf')
          .header('Content-Disposition', 'inline; filename="recu-cplan.pdf"')
          .send(Buffer.from(await payments.receiptPdf(requireSchool(request), request.params.id))),
    );
    app.post(
      '/admin/reconciliation/run',
      {
        preHandler: guards('payments.read'),
        schema: { tags: ['Contrôle financier'], security: [{ bearerAuth: [] }] },
      },
      (request) => payments.reconciliation(requireSchool(request)),
    );
  };
}
