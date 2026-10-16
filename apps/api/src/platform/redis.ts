import { Redis } from 'ioredis';
import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';

export function createRedis(config: AppConfig, logger: Logger): Redis {
  const redis = new Redis(config.REDIS_URL, {
    // Requis par BullMQ, et sain de manière générale : on préfère une erreur
    // immédiate à une commande qui reste en attente indéfiniment.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  });

  redis.on('error', (error: Error) => logger.error({ err: error }, 'redis'));
  redis.on('ready', () => logger.debug('redis prêt'));

  return redis;
}

/** Sonde de santé — utilisée par /health/ready. */
export async function pingRedis(redis: Redis): Promise<void> {
  const reply = await redis.ping();
  if (reply !== 'PONG') {
    throw new Error(`Réponse inattendue de Redis : ${reply}`);
  }
}
