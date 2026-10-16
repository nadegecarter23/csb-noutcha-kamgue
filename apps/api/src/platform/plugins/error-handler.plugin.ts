import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError, ErrorCode, isAppError, type ErrorDetail } from '../errors.js';

/**
 * Gestionnaire d'erreurs global.
 *
 * Format de réponse unique (docs/06-CONVENTIONS-DEV.md §2). Deux règles
 * absolues :
 *   1. Aucune stack trace, aucun message technique brut n'est exposé au client
 *      en production.
 *   2. Toute erreur 5xx est journalisée avec son contexte complet.
 */

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
    request_id: string;
  };
}

/** Lit `statusCode` sur une erreur de forme inconnue, sans jamais planter. */
function readStatusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const value = (error as { statusCode: unknown }).statusCode;
    if (typeof value === 'number') return value;
  }
  return undefined;
}

function zodIssuesToDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    code: issue.code,
    message: issue.message,
  })) as ErrorDetail[];
}

export const errorHandlerPlugin = fp(
  async (app) => {
    app.setNotFoundHandler((request, reply) => {
      void reply.status(404).send({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `Route introuvable : ${request.method} ${request.url}`,
          request_id: request.context?.requestId ?? 'unknown',
        },
      } satisfies ErrorResponseBody);
    });

    app.setErrorHandler((error, request, reply) => {
      const requestId = request.context?.requestId ?? 'unknown';
      const isProduction = process.env.NODE_ENV === 'production';

      /* --- Erreurs de validation de schéma (Zod via fastify) ------------- */
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details: ErrorDetail[] = error.validation.map((issue) => ({
          field: issue.instancePath.replace(/^\//, '') || undefined,
          message: issue.message ?? 'Valeur invalide.',
        })) as ErrorDetail[];

        request.log.info({ details }, 'requête invalide');
        return reply.status(400).send({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'La requête est invalide.',
            details,
            request_id: requestId,
          },
        } satisfies ErrorResponseBody);
      }

      /* --- ZodError levée manuellement dans un service ------------------- */
      if (error instanceof ZodError) {
        const details = zodIssuesToDetails(error);
        request.log.info({ details }, 'validation métier échouée');
        return reply.status(400).send({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Les données fournies sont invalides.',
            details,
            request_id: requestId,
          },
        } satisfies ErrorResponseBody);
      }

      /* --- Erreurs applicatives typées ----------------------------------- */
      if (isAppError(error)) {
        const payload: ErrorResponseBody = {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details }),
            request_id: requestId,
          },
        };

        // Le contexte est journalisé, jamais renvoyé.
        if (error.statusCode >= 500) {
          request.log.error({ err: error, context: error.context }, error.message);
        } else {
          request.log.info({ code: error.code, context: error.context }, error.message);
        }

        return reply.status(error.statusCode).send(payload);
      }

      /* --- À partir d'ici, l'erreur n'est plus d'un type connu ------------ */
      // Fastify type le paramètre de façon large ; on extrait prudemment ce
      // dont on a besoin plutôt que de supposer une forme.
      const statusCode = readStatusCode(error);
      const message = error instanceof Error ? error.message : String(error);

      /* --- Rate limiting (@fastify/rate-limit) --------------------------- */
      if (statusCode === 429) {
        return reply.status(429).send({
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: 'Trop de requêtes. Veuillez réessayer dans un instant.',
            request_id: requestId,
          },
        } satisfies ErrorResponseBody);
      }

      /* --- Erreurs 4xx émises par Fastify lui-même ----------------------- */
      if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
        request.log.info({ err: error }, 'erreur client');
        return reply.status(statusCode).send({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message,
            request_id: requestId,
          },
        } satisfies ErrorResponseBody);
      }

      /* --- Tout le reste : erreur inattendue ------------------------------ */
      request.log.error({ err: error }, 'erreur non gérée');

      return reply.status(500).send({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: isProduction
            ? 'Une erreur interne est survenue. Notre équipe a été notifiée.'
            : message,
          request_id: requestId,
        },
      } satisfies ErrorResponseBody);
    });
  },
  { name: 'error-handler' },
);

export { AppError };
