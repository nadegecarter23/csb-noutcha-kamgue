import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createLeaveBodySchema,
  idSchema,
  leaveDecisionBodySchema,
  staffLeaveSchema,
  staffMemberSchema,
  staffOrganizationReferenceSchema,
  updateStaffBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { StaffService } from './staff.service.js';

export function staffRoutes(service: StaffService): FastifyPluginAsyncZod {
  return async (app) => {
    const security = [{ bearerAuth: [] }];
    const params = z.object({ id: idSchema });
    app.get(
      '/staff',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('staff.read'),
        ],
        schema: {
          tags: ['Personnel'],
          security,
          querystring: z.object({ academic_year_id: idSchema.optional() }),
          response: { 200: staffMemberSchema.array() },
        },
      },
      (request) => service.list(requireSchool(request), request.query.academic_year_id),
    );
    app.get(
      '/staff/organization',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('staff.read'),
        ],
        schema: {
          tags: ['Personnel'],
          security,
          response: { 200: staffOrganizationReferenceSchema },
        },
      },
      (request) => service.organization(requireSchool(request), requireAuth(request).id),
    );
    app.patch(
      '/staff/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('staff.manage'),
        ],
        schema: {
          tags: ['Personnel'],
          security,
          params,
          body: updateStaffBodySchema,
          response: { 200: staffMemberSchema },
        },
      },
      (request) => service.update(requireSchool(request), request.params.id, request.body),
    );
    app.get(
      '/staff-leaves',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('staff.read'),
        ],
        schema: { tags: ['Personnel'], security, response: { 200: staffLeaveSchema.array() } },
      },
      (request) => service.leaves(requireSchool(request)),
    );
    app.post(
      '/staff-leaves',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('staff_leaves.manage'),
        ],
        schema: {
          tags: ['Personnel'],
          security,
          body: createLeaveBodySchema,
          response: { 201: staffLeaveSchema },
        },
      },
      async (request, reply) =>
        reply.code(201).send(await service.createLeave(requireSchool(request), request.body)),
    );
    app.post(
      '/staff-leaves/:id/decision',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('staff_leaves.manage'),
        ],
        schema: {
          tags: ['Personnel'],
          security,
          params,
          body: leaveDecisionBodySchema,
          response: { 200: staffLeaveSchema },
        },
      },
      (request) => service.decideLeave(requireSchool(request), request.params.id, request.body),
    );
  };
}
