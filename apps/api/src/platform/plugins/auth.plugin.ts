import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { moduleForPermission, type PermissionCode, type SchoolModuleCode } from '@cplan/contracts';
import type { JwtService } from '../jwt.js';
import type { Database } from '../db.js';
import { AppError, ErrorCode, errors } from '../errors.js';
import { updateContext, type AccessScopeContext } from '../request-context.js';

/**
 * Authentification et autorisation (docs/05-RBAC-PERMISSIONS.md §6).
 *
 * Principe : on ne teste JAMAIS un rôle, uniquement une permission.
 * `if (user.role === 'ACCOUNTANT')` est interdit ; `requirePermission(...)`
 * est la seule forme admise — c'est ce qui permettra à un établissement
 * d'autoriser son caissier à imprimer des états sans redéploiement.
 */

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  schoolId: string | null;
  roles: readonly string[];
  permissions: ReadonlySet<string>;
  accessScopes: readonly AccessScopeContext[];
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Défini uniquement après passage de la garde `authenticate`. */
    auth?: AuthenticatedUser;
  }

  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    requirePermission: (permission: PermissionCode) => preHandlerHookHandler;
    requireAnyPermission: (permissions: readonly PermissionCode[]) => preHandlerHookHandler;
    requireModule: (moduleCode: SchoolModuleCode) => preHandlerHookHandler;
    requireSchoolContext: preHandlerHookHandler;
  }
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

function selectedScope(request: FastifyRequest, granted: readonly AccessScopeContext[]) {
  const header = request.headers['x-active-scope-type'];
  const type = Array.isArray(header) ? header[0] : header;
  if (!type) {
    const selectable = granted.filter((scope) => scope.type !== 'OWN_ASSIGNMENTS');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && selectable.length > 1) {
      throw errors.validation('Sélectionnez explicitement un périmètre avant cette action.');
    }
    return null;
  }
  const value = (name: string) => {
    const item = request.headers[name];
    return Array.isArray(item) ? item[0] : item;
  };
  // Un périmètre global peut se concentrer sur n'importe quel cycle, section,
  // filière ou classe de l'établissement : la RLS combine ce choix à ses droits.
  if (granted.some((scope) => scope.type === 'SCHOOL') && type !== 'SCHOOL') {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const focus = {
      UNIT: 'x-organizational-unit-id',
      LANGUAGE_SECTION: 'x-language-section-id',
      TRACK: 'x-education-track-id',
      CLASS: 'x-class-id',
    } as const;
    const header = focus[type as keyof typeof focus];
    const id = header ? value(header) : undefined;
    if (!header || !id || !uuid.test(id))
      throw errors.validation('Le périmètre actif demandé est invalide.');
    return {
      type: type as AccessScopeContext['type'],
      ...(type === 'UNIT' && { organizationalUnitId: id }),
      ...(type === 'LANGUAGE_SECTION' && { languageSectionId: id }),
      ...(type === 'TRACK' && { educationTrackId: id }),
      ...(type === 'CLASS' && { classId: id }),
    };
  }
  const match = granted.find(
    (scope) =>
      scope.type === type &&
      (scope.organizationalUnitId ?? undefined) === value('x-organizational-unit-id') &&
      (scope.languageSectionId ?? undefined) === value('x-language-section-id') &&
      (scope.educationTrackId ?? undefined) === value('x-education-track-id') &&
      (scope.classId ?? undefined) === value('x-class-id'),
  );
  if (!match) throw errors.forbidden('Le périmètre actif ne fait pas partie de vos autorisations.');
  return match;
}

export interface AuthPluginOptions {
  jwt: JwtService;
  db: Database;
}

export const authPlugin = fp<AuthPluginOptions>(
  async (app, options) => {
    const { jwt, db } = options;
    const disabledModuleCache = new WeakMap<FastifyRequest, Promise<ReadonlySet<string>>>();
    const disabledModules = (request: FastifyRequest, schoolId: string) => {
      let cached = disabledModuleCache.get(request);
      if (!cached) {
        cached = db.schoolModuleSetting
          .findMany({ where: { schoolId, enabled: false }, select: { moduleCode: true } })
          .then((rows) => new Set(rows.map((row) => row.moduleCode)));
        disabledModuleCache.set(request, cached);
      }
      return cached;
    };
    const assertModuleEnabled = async (
      request: FastifyRequest,
      auth: AuthenticatedUser,
      moduleCode: SchoolModuleCode | null,
    ) => {
      if (!moduleCode || !auth.schoolId) return;
      if ((await disabledModules(request, auth.schoolId)).has(moduleCode)) {
        request.log.info({ userId: auth.id, moduleCode }, 'module désactivé');
        throw errors.forbidden('Ce module est désactivé pour cet établissement.');
      }
    };

    app.decorateRequest('auth', undefined);

    /* --- Authentification -------------------------------------------------- */

    app.decorate('authenticate', async (request: FastifyRequest) => {
      const token = extractBearer(request);
      if (!token) {
        throw errors.unauthenticated('Jeton d’accès manquant.');
      }

      const payload = await jwt.verifyAccessToken(token);

      // Le JWT reste compact. La session et les périmètres sont relus à
      // chaque requête : une révocation ou un changement de périmètre est
      // donc effectif immédiatement, sans attendre l'expiration du jeton.
      const [session, scopeRows] = await Promise.all([
        db.session.findFirst({
          where: {
            id: payload.sid,
            userId: payload.sub,
            revokedAt: null,
            expiresAt: { gt: new Date() },
            user: { status: 'ACTIVE' },
          },
          select: { id: true, user: { select: { mustChangePassword: true } } },
        }),
        payload.schoolId
          ? db.userAccessScope.findMany({
              where: { userId: payload.sub, schoolId: payload.schoolId },
              select: {
                scopeType: true,
                organizationalUnitId: true,
                languageSectionId: true,
                educationTrackId: true,
                classId: true,
              },
            })
          : Promise.resolve([]),
      ]);
      if (!session) throw errors.unauthenticated('Session expirée ou révoquée.');
      // Fastify expose ici le chemin avec le préfixe d'enregistrement dans
      // l'application, et le chemin sans préfixe dans certains tests/plugins.
      // La liste reste exacte afin qu'un chemin se terminant pareil ne puisse
      // pas contourner le blocage.
      const passwordChangeRoutes = [
        '/auth/me',
        '/auth/password',
        '/auth/logout',
        '/api/v1/auth/me',
        '/api/v1/auth/password',
        '/api/v1/auth/logout',
      ];
      if (
        session.user.mustChangePassword &&
        !passwordChangeRoutes.includes(request.routeOptions.url ?? '')
      ) {
        throw errors.forbidden(
          "Vous devez remplacer votre mot de passe temporaire avant d'accéder à l'application.",
        );
      }

      const accessScopes: AccessScopeContext[] = scopeRows.map((scope) => ({
        type: scope.scopeType,
        ...(scope.organizationalUnitId && { organizationalUnitId: scope.organizationalUnitId }),
        ...(scope.languageSectionId && { languageSectionId: scope.languageSectionId }),
        ...(scope.educationTrackId && { educationTrackId: scope.educationTrackId }),
        ...(scope.classId && { classId: scope.classId }),
      }));
      const activeScope = selectedScope(request, accessScopes);
      const requestScopes = activeScope ? [activeScope] : accessScopes;

      request.auth = {
        id: payload.sub,
        sessionId: payload.sid,
        schoolId: payload.schoolId ?? null,
        roles: payload.roles,
        permissions: new Set(payload.permissions),
        accessScopes: requestScopes,
      };

      // Le contexte de requête porte désormais l'identité : le journal d'audit
      // et les logs la reprennent sans qu'on ait à la passer de main en main.
      request.context = updateContext({
        userId: payload.sub,
        ...(payload.schoolId && { schoolId: payload.schoolId }),
        permissions: payload.permissions,
        accessScopes: requestScopes,
        activeScope: activeScope && activeScope.type !== 'SCHOOL' ? activeScope : null,
      });
    });

    /* --- Autorisation ------------------------------------------------------ */

    function assertAuthenticated(request: FastifyRequest): AuthenticatedUser {
      if (!request.auth) {
        // Erreur de programmation, pas d'utilisateur : requirePermission a été
        // posé sans authenticate. Le test d'architecture doit l'attraper avant.
        throw new AppError({
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Garde de permission utilisée sans authentification préalable.',
          statusCode: 500,
        });
      }
      return request.auth;
    }

    app.decorate('requirePermission', (permission: PermissionCode) => {
      return async (request: FastifyRequest, _reply: FastifyReply) => {
        const auth = assertAuthenticated(request);
        if (!auth.permissions.has(permission)) {
          request.log.info({ userId: auth.id, required: permission }, 'permission refusée');
          throw errors.forbidden("Vous n'avez pas les droits nécessaires pour cette action.");
        }
        await assertModuleEnabled(request, auth, moduleForPermission(permission));
      };
    });

    app.decorate('requireAnyPermission', (permissions: readonly PermissionCode[]) => {
      return async (request: FastifyRequest, _reply: FastifyReply) => {
        const auth = assertAuthenticated(request);
        const granted = permissions.filter((permission) => auth.permissions.has(permission));
        if (!granted.length) {
          throw errors.forbidden("Vous n'avez pas les droits nécessaires pour cette action.");
        }
        if (granted.some((permission) => moduleForPermission(permission) === null)) return;
        const disabled = auth.schoolId
          ? await disabledModules(request, auth.schoolId)
          : new Set<string>();
        if (
          !granted.some((permission) => {
            const moduleCode = moduleForPermission(permission);
            return moduleCode && !disabled.has(moduleCode);
          })
        ) {
          throw errors.forbidden('Ce module est désactivé pour cet établissement.');
        }
      };
    });
    app.decorate(
      'requireModule',
      (moduleCode: SchoolModuleCode) => async (request: FastifyRequest) => {
        const auth = assertAuthenticated(request);
        await assertModuleEnabled(request, auth, moduleCode);
      },
    );

    /**
     * Exige un établissement dans le contexte.
     *
     * Première barrière de l'isolation multi-établissement (ADR-011). La
     * seconde est la RLS PostgreSQL, positionnée par `withSchoolContext`.
     */
    app.decorate('requireSchoolContext', async (request: FastifyRequest) => {
      const auth = assertAuthenticated(request);
      if (!auth.schoolId) {
        throw errors.forbidden(
          'Aucun établissement sélectionné. Choisissez un établissement pour continuer.',
        );
      }
    });
  },
  { name: 'auth' },
);

/** Récupère l'utilisateur authentifié, ou échoue si la garde a été oubliée. */
export function requireAuth(request: FastifyRequest): AuthenticatedUser {
  if (!request.auth) {
    throw errors.unauthenticated();
  }
  return request.auth;
}

/** Récupère l'établissement courant, ou échoue. */
export function requireSchool(request: FastifyRequest): string {
  const auth = requireAuth(request);
  if (!auth.schoolId) {
    throw errors.forbidden('Aucun établissement sélectionné.');
  }
  return auth.schoolId;
}
