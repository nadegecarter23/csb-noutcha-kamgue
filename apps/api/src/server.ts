import { loadConfig } from './platform/config.js';
import { createLogger } from './platform/logger.js';
import { createDatabase } from './platform/db.js';
import { createRedis } from './platform/redis.js';
import { createStorage } from './platform/storage.js';
import { createSmsProvider } from './platform/sms.js';
import { buildApp } from './app.js';

/**
 * Point d'entrée de l'API.
 *
 * Ordre volontaire : la configuration est validée AVANT toute connexion.
 * Une variable manquante fait échouer le démarrage immédiatement, plutôt que
 * de produire une panne à la première requête.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);

  const db = createDatabase(config, logger);
  const redis = createRedis(config, logger);
  const storage = createStorage(config);
  const sms = createSmsProvider(config, logger);

  const app = await buildApp({ config, logger, db, redis, storage, sms });

  /* --- Arrêt propre ------------------------------------------------------- */
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'arrêt en cours…');

    // Délai de grâce : si les connexions ne se ferment pas, on force.
    const forceExit = setTimeout(() => {
      logger.error('arrêt forcé après 10 s');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await app.close();
      await Promise.allSettled([db.$disconnect(), redis.quit()]);
      logger.info('arrêt terminé');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "échec de l'arrêt propre");
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'promesse rejetée non gérée');
    void shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'exception non interceptée');
    void shutdown('uncaughtException');
  });

  /* --- Démarrage ----------------------------------------------------------- */
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(
      {
        port: config.PORT,
        env: config.NODE_ENV,
        docs: config.isProduction ? undefined : `http://localhost:${config.PORT}/docs`,
      },
      'API CSB Noutcha KAMGUE démarrée',
    );
  } catch (error) {
    logger.fatal({ err: error }, 'échec du démarrage');
    process.exit(1);
  }
}

void main();
