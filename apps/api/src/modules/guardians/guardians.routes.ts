import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createInviteBodySchema,
  guardianBodySchema,
  guardianInviteSchema,
  guardianQuerySchema,
  guardianRequestQuerySchema,
  guardianRequestSchema,
  guardianSchema,
  handleGuardianRequestBodySchema,
  idSchema,
  linkGuardianBodySchema,
  parentChildSchema,
  parentLinkRequestBodySchema,
  pendingParentLinkSchema,
  reasonBodySchema,
  redeemInviteBodySchema,
  studentGuardianSchema,
  updateStudentGuardianBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { GuardiansService } from './guardians.service.js';

const params = z.object({ id: idSchema });

export function guardiansRoutes(service: GuardiansService): FastifyPluginAsyncZod {
  return async (app) => {
    const guards = (permission: Parameters<typeof app.requirePermission>[0]) => [
      app.authenticate,
      app.requireSchoolContext,
      app.requirePermission(permission),
    ];
    app.get(
      '/guardians',
      {
        preHandler: guards('guardians.read'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          querystring: guardianQuerySchema,
          response: { 200: z.array(guardianSchema) },
        },
      },
      (request) => service.list(requireSchool(request), request.query),
    );
    app.post(
      '/guardians',
      {
        preHandler: guards('guardians.create'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          body: guardianBodySchema,
          response: { 201: guardianSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await service.create(requireSchool(request), request.body)),
    );
    app.patch(
      '/guardians/:id',
      {
        preHandler: guards('guardians.update'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          params,
          body: guardianBodySchema.partial(),
          response: { 200: guardianSchema },
        },
      },
      (request) => service.update(requireSchool(request), request.params.id, request.body),
    );
    app.get(
      '/students/:id/guardians',
      {
        preHandler: guards('guardian_links.read'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: z.array(studentGuardianSchema) },
        },
      },
      (request) => service.studentLinks(requireSchool(request), request.params.id),
    );
    app.post(
      '/students/:id/guardians',
      {
        preHandler: guards('guardian_links.create'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          params,
          body: linkGuardianBodySchema,
          response: { 201: studentGuardianSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.link(requireSchool(request), request.params.id, request.body)),
    );
    app.patch(
      '/student-guardians/:id',
      {
        preHandler: guards('guardians.update'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          params,
          body: updateStudentGuardianBodySchema,
          response: { 200: studentGuardianSchema },
        },
      },
      (request) => service.updateLink(requireSchool(request), request.params.id, request.body),
    );
    app.post(
      '/student-guardians/:id/revoke',
      {
        preHandler: guards('guardian_links.revoke'),
        schema: {
          tags: ['Responsables'],
          security: [{ bearerAuth: [] }],
          params,
          body: reasonBodySchema,
          response: { 200: studentGuardianSchema },
        },
      },
      (request) =>
        service.revoke(
          requireSchool(request),
          request.params.id,
          request.body.reason,
          requireAuth(request).id,
        ),
    );
    app.post(
      '/student-guardians/:id/resend-invite',
      {
        preHandler: guards('guardian_invites.manage'),
        schema: {
          tags: ['Invitations responsables'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 201: guardianInviteSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await service.resendInvite(requireSchool(request), request.params.id)),
    );

    app.post(
      '/students/:id/invites',
      {
        preHandler: guards('guardian_invites.manage'),
        schema: {
          tags: ['Invitations responsables'],
          security: [{ bearerAuth: [] }],
          params,
          body: createInviteBodySchema,
          response: { 201: guardianInviteSchema },
        },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(
            await service.createInvite(requireSchool(request), request.params.id, request.body),
          ),
    );
    app.get(
      '/students/:id/invites',
      {
        preHandler: guards('guardian_invites.manage'),
        schema: {
          tags: ['Invitations responsables'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: z.array(guardianInviteSchema) },
        },
      },
      (request) => service.listInvites(requireSchool(request), request.params.id),
    );
    app.post(
      '/invites/:id/revoke',
      {
        preHandler: guards('guardian_invites.manage'),
        schema: {
          tags: ['Invitations responsables'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 200: guardianInviteSchema },
        },
      },
      (request) => service.revokeInvite(requireSchool(request), request.params.id),
    );
    app.get(
      '/students/:id/invites/print',
      {
        preHandler: guards('guardian_invites.manage'),
        schema: {
          tags: ['Invitations responsables'],
          security: [{ bearerAuth: [] }],
          params,
        },
      },
      async (request, reply) => {
        const pdf = await service.printStudentInvites(requireSchool(request), request.params.id);
        return reply
          .type('application/pdf')
          .header('Content-Disposition', 'inline; filename="association-eleve.pdf"')
          .send(Buffer.from(pdf));
      },
    );
    app.post(
      '/classes/:id/invites/print',
      {
        preHandler: guards('guardian_invites.manage'),
        schema: {
          tags: ['Invitations responsables'],
          security: [{ bearerAuth: [] }],
          params,
        },
      },
      async (request, reply) => {
        const pdf = await service.printClassInvites(requireSchool(request), request.params.id);
        return reply
          .type('application/pdf')
          .header('Content-Disposition', 'attachment; filename="associations-classe.pdf"')
          .send(Buffer.from(pdf));
      },
    );

    app.get(
      '/guardian-requests',
      {
        preHandler: guards('guardian_requests.handle'),
        schema: {
          tags: ['Demandes responsables'],
          security: [{ bearerAuth: [] }],
          querystring: guardianRequestQuerySchema,
          response: { 200: z.array(guardianRequestSchema) },
        },
      },
      (request) => service.listRequests(requireSchool(request), request.query),
    );
    for (const decision of ['approve', 'reject'] as const) {
      app.post(
        `/guardian-requests/:id/${decision}`,
        {
          preHandler: guards('guardian_requests.handle'),
          schema: {
            tags: ['Demandes responsables'],
            security: [{ bearerAuth: [] }],
            params,
            body: handleGuardianRequestBodySchema,
            response: { 204: z.null() },
          },
        },
        async (request, reply) => {
          await service.handleRequest(
            requireSchool(request),
            request.params.id,
            decision === 'approve',
            requireAuth(request).id,
            request.body.reason,
            request.body.relationship,
          );
          return reply.status(204).send(null);
        },
      );
    }

    const parentGuards = [app.authenticate, app.requireParentScope];
    app.get(
      '/parent/pending-links',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(pendingParentLinkSchema) },
        },
      },
      (request) => service.pendingLinks(requireAuth(request).id),
    );
    app.post(
      '/parent/links/:id/accept',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.decideLink(requireAuth(request).id, request.params.id, true);
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/parent/links/:id/reject',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          params,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.decideLink(requireAuth(request).id, request.params.id, false);
        return reply.status(204).send(null);
      },
    );
    app.post(
      '/parent/links/redeem',
      {
        preHandler: parentGuards,
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 hour',
            keyGenerator: (request) => request.headers.authorization ?? request.ip,
          },
        },
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          body: redeemInviteBodySchema,
          response: { 200: z.object({ studentGuardianId: idSchema }) },
        },
      },
      (request) =>
        service.redeem(
          requireAuth(request).id,
          request.body,
          request.ip,
          request.headers['user-agent'],
        ),
    );
    app.post(
      '/parent/link-requests',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          body: parentLinkRequestBodySchema,
          response: { 201: z.object({ id: idSchema }) },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await service.createRequest(requireAuth(request).id, request.body)),
    );
    app.get(
      '/parent/children',
      {
        preHandler: parentGuards,
        schema: {
          tags: ['Parent'],
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(parentChildSchema) },
        },
      },
      (request) => service.children(requireAuth(request).id),
    );
  };
}
