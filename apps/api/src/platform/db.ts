import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import type { Logger } from './logger.js';

export type Database = PrismaClient;

export function createDatabase(config: AppConfig, logger: Logger): Database {
  const prisma = new PrismaClient({
    datasources: { db: { url: config.DATABASE_URL } },
    log: config.isDevelopment
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ]
      : [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
  });

  if (config.isDevelopment) {
    prisma.$on('query', (event) => {
      logger.debug({ query: event.query, durationMs: event.duration }, 'sql');
    });
  }

  prisma.$on('warn', (event) => logger.warn({ prisma: event.message }, 'prisma'));
  prisma.$on('error', (event) => logger.error({ prisma: event.message }, 'prisma'));

  return prisma;
}

/** Sonde de santé — utilisée par /health/ready. */
export async function pingDatabase(db: Database): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}
