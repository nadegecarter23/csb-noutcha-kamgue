import fp from 'fastify-plugin';
import type { preHandlerHookHandler } from 'fastify';
import type { Database } from '../db.js';
import { requireAuth } from './auth.plugin.js';
import { withPlatformScope } from '../school-scope.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Identifiants accessibles au parent, résolus exclusivement depuis les liens ACCEPTED. */
    parentStudentIds?: readonly string[];
  }
  interface FastifyInstance {
    requireParentScope: preHandlerHookHandler;
  }
}

export const parentScopePlugin = fp<{ db: Database }>(
  async (app, { db }) => {
    app.decorateRequest('parentStudentIds', undefined);
    app.decorate('requireParentScope', async (request) => {
      const auth = requireAuth(request);
      request.parentStudentIds = await withPlatformScope(db, async (tx) => {
        const links = await tx.studentGuardian.findMany({
          where: {
            status: 'ACCEPTED',
            guardian: { userId: auth.id, status: 'ACTIVE' },
            student: { status: { not: 'ARCHIVED' } },
          },
          select: { studentId: true },
        });
        return links.map((link) => link.studentId);
      });
    });
  },
  { name: 'parent-scope', dependencies: ['auth'] },
);
