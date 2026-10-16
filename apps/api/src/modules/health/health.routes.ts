import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createHealthService, type HealthDependencies } from './health.service.js';
import { livenessResponseSchema, readinessResponseSchema } from './health.schemas.js';
import { renderMetrics } from './metrics.service.js';

/**
 * Gabarit de référence pour un module CSB Noutcha KAMGUE.
 *
 * Une route ne contient AUCUNE logique métier (docs/06-CONVENTIONS-DEV.md §3) :
 * elle déclare son schéma, ses permissions, appelle le service, sérialise.
 *
 * Ces deux routes sont publiques : elles portent `config.public = true`, seul
 * moyen d'échapper au test d'architecture qui exige une permission sur toute
 * route (le test ne concerne que les routes mutatives, mais la convention
 * s'applique dès la Phase 00).
 */
export function healthRoutes(deps: HealthDependencies): FastifyPluginAsyncZod {
  const service = createHealthService(deps);
  const startedAt = Date.now();
  const version = process.env.npm_package_version ?? '0.1.0';

  return async (app) => {
    app.get(
      '/metrics',
      { config: { public: true }, schema: { tags: ['Santé'], summary: 'Métriques Prometheus' } },
      async (_request, reply) => {
        const output = await renderMetrics(deps.db, startedAt);
        return reply.type('text/plain; version=0.0.4; charset=utf-8').send(output);
      },
    );
    app.get(
      '/health',
      {
        config: { public: true },
        schema: {
          tags: ['Santé'],
          summary: 'Liveness — le processus répond-il ?',
          description:
            "Ne teste aucune dépendance. Utilisé par l'orchestrateur pour décider d'un redémarrage.",
          response: { 200: livenessResponseSchema },
        },
      },
      async () => ({
        status: 'ok' as const,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        version,
      }),
    );

    app.get(
      '/health/ready',
      {
        config: { public: true },
        schema: {
          tags: ['Santé'],
          summary: 'Readiness — les dépendances répondent-elles ?',
          description:
            'Teste PostgreSQL, Redis et le stockage objet. Renvoie 503 si au moins une est HS.',
          response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
        },
      },
      async (_request, reply) => {
        const result = await service.checkReadiness();
        return reply.status(result.status === 'ok' ? 200 : 503).send(result);
      },
    );
  };
}
