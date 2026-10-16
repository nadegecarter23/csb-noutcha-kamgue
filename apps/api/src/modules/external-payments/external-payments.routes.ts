import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  externalPaymentDeclarationBodySchema,
  externalPaymentDecisionStatusSchema,
  externalPaymentSchema,
  idSchema,
  rejectExternalPaymentBodySchema,
  requestExternalPaymentCorrectionBodySchema,
  validateExternalPaymentBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { ExternalPaymentsService, UploadedProof } from './external-payments.service.js';
import { assertProofFile } from '../../platform/file-validation.js';

export function externalPaymentRoutes(service: ExternalPaymentsService): FastifyPluginAsyncZod {
  return async (app) => {
    const parent = [app.authenticate, app.requireParentScope];
    const staff = [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission('payments.validate_external'),
    ];
    const params = z.object({ id: idSchema });
    const proofResponse = z.object({
      proofs: z.array(
        z.object({
          id: idSchema,
          filename: z.string().nullable(),
          mimeType: z.string(),
          url: z.string(),
          expiresIn: z.literal(300),
        }),
      ),
    });
    app.post(
      '/parent/payments/external',
      {
        preHandler: parent,
        bodyLimit: 52 * 1024 * 1024,
        schema: {
          tags: ['Paiements externes parent'],
          security: [{ bearerAuth: [] }],
          consumes: ['multipart/form-data'],
          response: { 201: externalPaymentSchema },
        },
      },
      async (request, reply) => {
        const fields: Record<string, string> = {};
        const files: UploadedProof[] = [];
        for await (const part of request.parts({
          limits: { files: 5, fileSize: 10 * 1024 * 1024, fields: 20 },
        })) {
          if (part.type === 'file') {
            const body = await part.toBuffer();
            assertProofFile(body, part.mimetype);
            files.push({ filename: part.filename, mimeType: part.mimetype, body });
          } else fields[part.fieldname] = String(part.value);
        }
        const input = externalPaymentDeclarationBodySchema.parse({
          enrollmentId: fields.enrollmentId,
          amount: fields.amount ? Number(fields.amount) : undefined,
          paymentMethod: fields.paymentMethod,
          bankName: fields.bankName || undefined,
          paymentDate: fields.paymentDate,
          externalReference: fields.externalReference,
          notes: fields.notes || undefined,
        });
        return reply.status(201).send(await service.declare(requireAuth(request).id, input, files));
      },
    );
    app.get(
      '/parent/payments/external',
      {
        preHandler: parent,
        schema: {
          tags: ['Paiements externes parent'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(externalPaymentSchema) },
        },
      },
      (request) => service.parentList(requireAuth(request).id),
    );
    app.post(
      '/parent/payments/:id/cancel-declaration',
      {
        preHandler: parent,
        schema: {
          tags: ['Paiements externes parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.cancel(requireAuth(request).id, request.params.id);
        return reply.status(204).send(null);
      },
    );
    app.get(
      '/parent/payments/:id/proof',
      {
        preHandler: parent,
        schema: {
          tags: ['Paiements externes parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: proofResponse },
        },
      },
      (request) => service.parentProof(requireAuth(request).id, request.params.id),
    );

    app.get(
      '/external-payments',
      {
        preHandler: staff,
        schema: {
          tags: ['Paiements externes comptabilité'],
          security: [{ bearerAuth: [] }],
          querystring: z.object({
            status: externalPaymentDecisionStatusSchema.optional(),
            overdue: z.coerce.boolean().optional(),
            from: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            to: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            class_id: idSchema.optional(),
          }),
          response: { 200: z.array(externalPaymentSchema) },
        },
      },
      (request) =>
        service.list(requireSchool(request), request.query as Parameters<typeof service.list>[1]),
    );
    app.get(
      '/external-payments/stats',
      {
        preHandler: staff,
        schema: { tags: ['Paiements externes comptabilité'], security: [{ bearerAuth: [] }] },
      },
      (request) => service.stats(requireSchool(request)),
    );
    app.get(
      '/external-payments/:id',
      {
        preHandler: staff,
        schema: {
          tags: ['Paiements externes comptabilité'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: externalPaymentSchema },
        },
      },
      (request) => service.get(requireSchool(request), request.params.id),
    );
    app.get(
      '/external-payments/:id/proof',
      {
        preHandler: staff,
        schema: {
          tags: ['Paiements externes comptabilité'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: proofResponse },
        },
      },
      (request) => service.staffProof(requireSchool(request), request.params.id),
    );
    app.post(
      '/external-payments/:id/validate',
      {
        preHandler: staff,
        schema: {
          tags: ['Paiements externes comptabilité'],
          security: [{ bearerAuth: [] }],
          params,
          body: validateExternalPaymentBodySchema,
        },
      },
      (request) =>
        service.validate(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body as Parameters<typeof service.validate>[3],
        ),
    );
    app.post(
      '/external-payments/:id/reject',
      {
        preHandler: staff,
        schema: {
          tags: ['Paiements externes comptabilité'],
          security: [{ bearerAuth: [] }],
          params,
          body: rejectExternalPaymentBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.reject(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body.reason,
        );
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/external-payments/:id/request-correction',
      {
        preHandler: staff,
        schema: {
          tags: ['Paiements externes comptabilité'],
          security: [{ bearerAuth: [] }],
          params,
          body: requestExternalPaymentCorrectionBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.requestCorrection(
          requireSchool(request),
          requireAuth(request).id,
          request.params.id,
          request.body.message,
        );
        return reply.status(204).send(null);
      },
    );
  };
}
