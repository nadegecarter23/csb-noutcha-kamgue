import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  authSessionSchema,
  authTokensSchema,
  changePasswordBodySchema,
  confirmPhoneChangeBodySchema,
  currentUserSchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  otpSentSchema,
  refreshBodySchema,
  registerBodySchema,
  requestPhoneChangeBodySchema,
  resetPasswordBodySchema,
  sendOtpBodySchema,
  sessionSummarySchema,
  switchSchoolBodySchema,
  switchSchoolResponseSchema,
  verifyOtpBodySchema,
} from '@cplan/contracts';
import type { AuthService } from './auth.service.js';
import { requireAuth } from '../../platform/plugins/auth.plugin.js';

/**
 * Routes d'authentification.
 *
 * Aucune logique métier ici : validation, appel au service, sérialisation.
 *
 * Toutes ces routes sont publiques ou self-service, d'où `config.public = true`
 * sur les routes non authentifiées — marqueur exigé par le test d'architecture
 * qui interdit toute route mutative sans garde.
 */
export function authRoutes(
  service: AuthService,
  options: { relaxedRateLimits?: boolean } = {},
): FastifyPluginAsyncZod {
  const rate = (max: number, timeWindow: string) => ({
    max: options.relaxedRateLimits ? 10_000 : max,
    timeWindow,
  });
  return async (app) => {
    /* --- Inscription & vérification --------------------------------------- */

    app.post(
      '/auth/register',
      {
        config: { public: true, rateLimit: rate(10, '1 minute') },
        schema: {
          tags: ['Authentification'],
          summary: 'Créer un compte parent (P02)',
          body: registerBodySchema,
          response: {
            201: z.object({ phone: z.string(), nextStep: z.literal('VERIFY_PHONE') }),
          },
        },
      },
      async (request, reply) => {
        const { phone } = await service.register(request.body);
        return reply.status(201).send({ phone, nextStep: 'VERIFY_PHONE' as const });
      },
    );

    app.post(
      '/auth/otp/send',
      {
        config: { public: true, rateLimit: rate(3, '1 hour') },
        schema: {
          tags: ['Authentification'],
          summary: 'Envoyer un code de vérification par SMS',
          description:
            "La réponse est identique que le numéro existe ou non, afin d'empêcher l'énumération des comptes.",
          body: sendOtpBodySchema,
          response: { 200: otpSentSchema },
        },
      },
      async (request) => {
        const result = await service.sendOtp(request.body.phone, request.body.purpose, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
        return { sent: true as const, ...result };
      },
    );

    app.post(
      '/auth/otp/verify',
      {
        config: { public: true, rateLimit: rate(5, '1 hour') },
        schema: {
          tags: ['Authentification'],
          summary: 'Vérifier le code reçu par SMS (P03)',
          body: verifyOtpBodySchema,
          response: { 200: authSessionSchema },
        },
      },
      async (request) =>
        service.verifyPhone(request.body.phone, request.body.code, request.body.purpose, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        }),
    );

    /* --- Connexion --------------------------------------------------------- */

    app.post(
      '/auth/login',
      {
        config: { public: true, rateLimit: rate(10, '1 minute') },
        schema: {
          tags: ['Authentification'],
          summary: 'Se connecter par mot de passe',
          body: loginBodySchema,
          response: { 200: authSessionSchema },
        },
      },
      async (request) =>
        service.login(request.body.identifier, request.body.password, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          deviceLabel: request.body.deviceLabel,
        }),
    );

    app.post(
      '/auth/refresh',
      {
        config: { public: true },
        schema: {
          tags: ['Authentification'],
          summary: 'Renouveler les jetons (rotation)',
          description:
            'Présenter un jeton déjà consommé révoque toute la famille de sessions : ' +
            "c'est la signature d'un vol de jeton.",
          body: refreshBodySchema,
          response: { 200: authTokensSchema },
        },
      },
      async (request) =>
        service.refresh(request.body.refreshToken, {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        }),
    );

    app.post(
      '/auth/logout',
      {
        config: { public: true },
        schema: {
          tags: ['Authentification'],
          summary: 'Se déconnecter de cet appareil',
          body: logoutBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.logout(request.body.refreshToken);
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/auth/logout-all',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Déconnecter tous les appareils',
          security: [{ bearerAuth: [] }],
          response: { 200: z.object({ revokedSessions: z.number().int() }) },
        },
      },
      async (request) => {
        const auth = requireAuth(request);
        const revokedSessions = await service.logoutAll(auth.id);
        return { revokedSessions };
      },
    );

    /* --- Profil ------------------------------------------------------------ */

    app.get(
      '/auth/me',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Profil, rôles et permissions de l’utilisateur connecté',
          security: [{ bearerAuth: [] }],
          response: { 200: currentUserSchema },
        },
      },
      async (request) => {
        const auth = requireAuth(request);
        return service.getCurrentUser(auth.id, auth.schoolId);
      },
    );

    app.get(
      '/auth/sessions',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Appareils connectés',
          security: [{ bearerAuth: [] }],
          response: { 200: z.array(sessionSummarySchema) },
        },
      },
      async (request) => {
        const auth = requireAuth(request);
        const sessions = await service.listSessions(auth.id);
        return sessions.map((session) => ({
          id: session.id,
          deviceLabel: session.deviceLabel,
          ipAddress: session.ipAddress,
          lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
          createdAt: session.createdAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          current: session.id === auth.sessionId,
        }));
      },
    );

    app.delete(
      '/auth/sessions/:id',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Déconnecter un appareil',
          security: [{ bearerAuth: [] }],
          params: z.object({ id: z.string().uuid() }),
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        const auth = requireAuth(request);
        await service.revokeOwnedSession(auth.id, request.params.id);
        return reply.status(204).send(null);
      },
    );

    app.post(
      '/auth/switch-school',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Changer d’établissement actif',
          security: [{ bearerAuth: [] }],
          body: switchSchoolBodySchema,
          response: { 200: switchSchoolResponseSchema },
        },
      },
      async (request) => {
        const auth = requireAuth(request);
        return service.switchSchool(auth.id, request.body.schoolId, auth.sessionId);
      },
    );

    /* --- Mot de passe ------------------------------------------------------ */

    app.post(
      '/auth/password/forgot',
      {
        config: { public: true },
        schema: {
          tags: ['Authentification'],
          summary: 'Demander un code de réinitialisation',
          body: forgotPasswordBodySchema,
          response: { 200: otpSentSchema },
        },
      },
      async (request) => {
        const result = await service.sendOtp(request.body.phone, 'PASSWORD_RESET', {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
        return { sent: true as const, ...result };
      },
    );

    app.post(
      '/auth/password/reset',
      {
        config: { public: true },
        schema: {
          tags: ['Authentification'],
          summary: 'Réinitialiser le mot de passe avec un code',
          body: resetPasswordBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        await service.resetPassword(
          request.body.phone,
          request.body.code,
          request.body.newPassword,
        );
        return reply.status(204).send(null);
      },
    );

    app.patch(
      '/auth/password',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Changer son mot de passe',
          description: 'Déconnecte les autres appareils.',
          security: [{ bearerAuth: [] }],
          body: changePasswordBodySchema,
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        const auth = requireAuth(request);
        await service.changePassword(
          auth.id,
          request.body.currentPassword,
          request.body.newPassword,
          auth.sessionId,
        );
        return reply.status(204).send(null);
      },
    );

    /* --- Changement de numéro (§72) ---------------------------------------- */

    app.post(
      '/auth/phone-change/request',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Demander un changement de numéro',
          description:
            "Envoie un code sur l'ancien numéro ET sur le nouveau. Les deux sont " +
            'exigés pour confirmer : contrôler le compte ne suffit pas, il faut ' +
            'aussi contrôler la nouvelle ligne.',
          security: [{ bearerAuth: [] }],
          body: requestPhoneChangeBodySchema,
          response: { 200: z.object({ sent: z.literal(true) }) },
        },
      },
      async (request) => {
        const auth = requireAuth(request);
        const me = await service.getCurrentUser(auth.id, auth.schoolId);
        const context = {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        };
        await service.sendOtp(me.phone, 'PHONE_CHANGE', context);
        await service.sendOtp(request.body.newPhone, 'PHONE_CHANGE', context);
        return { sent: true as const };
      },
    );

    app.post(
      '/auth/phone-change/confirm',
      {
        preHandler: [app.authenticate],
        schema: {
          tags: ['Authentification'],
          summary: 'Confirmer le changement de numéro',
          security: [{ bearerAuth: [] }],
          body: confirmPhoneChangeBodySchema,
          response: { 200: z.object({ phone: z.string() }) },
        },
      },
      async (request) => {
        const auth = requireAuth(request);
        return service.confirmPhoneChange(
          auth.id,
          request.body.newPhone,
          request.body.currentPhoneCode,
          request.body.newPhoneCode,
          auth.sessionId,
        );
      },
    );
  };
}
