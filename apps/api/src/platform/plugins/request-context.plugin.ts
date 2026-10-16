import fp from 'fastify-plugin';
import { ulid } from 'ulid';
import { runWithContext, type RequestContext } from '../request-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Contexte de la requête courante. Toujours défini. */
    context: RequestContext;
  }
}

/**
 * Ouvre un contexte AsyncLocalStorage pour chaque requête et propage un
 * identifiant de corrélation (`x-request-id`) présent dans tous les logs et
 * dans toutes les réponses d'erreur.
 */
export const requestContextPlugin = fp(
  async (app) => {
    // Fastify exige que la décoration soit déclarée au démarrage pour que la
    // forme de l'objet request reste stable (optimisation V8). La valeur réelle
    // est posée dans le hook onRequest, avant tout handler : `context` n'est
    // jamais réellement null au moment où du code métier s'exécute.
    app.decorateRequest('context', null as unknown as RequestContext);

    app.addHook('onRequest', (request, reply, done) => {
      const incoming = request.headers['x-request-id'];
      const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : ulid();

      const context: RequestContext = {
        requestId,
        ...(request.ip !== undefined && { ipAddress: request.ip }),
        ...(request.headers['user-agent'] !== undefined && {
          userAgent: request.headers['user-agent'],
        }),
      };

      request.context = context;
      reply.header('x-request-id', requestId);

      // Le logger de la requête porte le requestId : toutes les lignes émises
      // pendant son traitement sont corrélables.
      request.log = request.log.child({ requestId });

      runWithContext(context, done);
    });
  },
  { name: 'request-context' },
);
