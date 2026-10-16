import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  assignRolesBodySchema,
  createRoleBodySchema,
  createUserBodySchema,
  deactivateUserBodySchema,
  idSchema,
  permissionSchema,
  roleDetailSchema,
  updateUserBodySchema,
  updateRoleBodySchema,
  userListQuerySchema,
  userListSchema,
  userSummarySchema,
  replaceAccessScopesBodySchema,
} from '@cplan/contracts';
import { requireAuth, requireSchool } from '../../platform/plugins/auth.plugin.js';
import type { UsersService } from './users.service.js';

/**
 * Administration des comptes, rôles et permissions.
 *
 * Chaque route mutative porte sa permission : c'est ce que vérifie le test
 * d'architecture `route-guards.test.ts`.
 */
export function usersRoutes(service: UsersService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/users',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.read'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Lister les comptes de l’établissement',
          security: [{ bearerAuth: [] }],
          querystring: userListQuerySchema,
          response: { 200: userListSchema },
        },
      },
      async (request) => service.list(requireSchool(request), request.query),
    );

    app.get(
      '/users/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.read'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Détail d’un compte',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          response: { 200: userSummarySchema },
        },
      },
      async (request) => service.getById(requireSchool(request), request.params.id),
    );

    app.post(
      '/users',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.create'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Créer un compte et envoyer l’invitation',
          description:
            "L'établissement ne définit pas le mot de passe : l'employé le choisit " +
            'lui-même à partir du code reçu par SMS.',
          security: [{ bearerAuth: [] }],
          body: createUserBodySchema,
          response: { 201: userSummarySchema },
        },
      },
      async (request, reply) => {
        const created = await service.create(requireSchool(request), request.body);
        return reply.status(201).send(created);
      },
    );

    app.patch(
      '/users/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.update'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Modifier un compte',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: updateUserBodySchema,
          response: { 200: userSummarySchema },
        },
      },
      async (request) => service.update(requireSchool(request), request.params.id, request.body),
    );

    app.post(
      '/users/:id/roles',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.assign_roles'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Remplacer les rôles d’un compte',
          description: 'Révoque immédiatement les sessions actives de l’utilisateur.',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: assignRolesBodySchema,
          response: { 200: userSummarySchema },
        },
      },
      async (request) =>
        service.assignRoles(
          requireSchool(request),
          request.params.id,
          request.body.roles,
          request.body.reason,
          requireAuth(request).id,
        ),
    );

    app.put(
      '/users/:id/access-scopes',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.assign_roles'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Remplacer les périmètres d’accès d’un compte',
          description: 'Révoque immédiatement toutes les sessions actives.',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: replaceAccessScopesBodySchema,
          response: { 200: userSummarySchema },
        },
      },
      (request) =>
        service.replaceAccessScopes(
          requireSchool(request),
          request.params.id,
          request.body,
          requireAuth(request).id,
        ),
    );

    app.post(
      '/users/:id/deactivate',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.deactivate'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Désactiver un compte',
          description: 'Le compte n’est jamais supprimé : le journal d’audit doit rester lisible.',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: deactivateUserBodySchema,
          response: { 200: userSummarySchema },
        },
      },
      async (request) =>
        service.setActive(
          requireSchool(request),
          request.params.id,
          false,
          request.body.reason,
          requireAuth(request).id,
        ),
    );

    app.post(
      '/users/:id/reactivate',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('users.deactivate'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Réactiver un compte',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: deactivateUserBodySchema,
          response: { 200: userSummarySchema },
        },
      },
      async (request) =>
        service.setActive(
          requireSchool(request),
          request.params.id,
          true,
          request.body.reason,
          requireAuth(request).id,
        ),
    );

    /* --- Rôles & permissions ------------------------------------------------ */

    app.get(
      '/roles',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('roles.read'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Lister les rôles et leurs permissions',
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(roleDetailSchema) },
        },
      },
      async (request) => service.listRoles(requireSchool(request)),
    );

    app.get(
      '/permissions',
      {
        preHandler: [app.authenticate, app.requirePermission('roles.read')],
        schema: {
          tags: ['Administration'],
          summary: 'Catalogue des permissions',
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(permissionSchema) },
        },
      },
      async () => service.listPermissions(),
    );

    app.post(
      '/roles',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('roles.manage'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Créer un rôle personnalisé',
          security: [{ bearerAuth: [] }],
          body: createRoleBodySchema,
          response: { 201: roleDetailSchema },
        },
      },
      async (request, reply) => {
        const role = await service.createRole(
          requireSchool(request),
          request.body,
          requireAuth(request).id,
        );
        return reply.status(201).send(role);
      },
    );

    app.patch(
      '/roles/:id',
      {
        preHandler: [
          app.authenticate,
          app.requireSchoolContext,
          app.requirePermission('roles.manage'),
        ],
        schema: {
          tags: ['Administration'],
          summary: 'Modifier un rôle personnalisé',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: idSchema }),
          body: updateRoleBodySchema,
          response: { 200: roleDetailSchema },
        },
      },
      async (request) =>
        service.updateRole(
          requireSchool(request),
          request.params.id,
          request.body,
          requireAuth(request).id,
        ),
    );
  };
}
