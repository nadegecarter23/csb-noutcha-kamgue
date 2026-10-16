import { pingDatabase, type Database } from '../../platform/db.js';
import { pingRedis } from '../../platform/redis.js';
import type { Redis } from 'ioredis';
import type { Storage } from '../../platform/storage.js';
import type { DependencyStatus, ReadinessResponse } from './health.schemas.js';

export interface HealthDependencies {
  db: Database;
  redis: Redis;
  storage: Storage;
}

/** Une sonde lente est un incident : au-delà, on considère la dépendance HS. */
const PROBE_TIMEOUT_MS = 3_000;

async function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Délai dépassé (${ms} ms)`)), ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probe(name: string, fn: () => Promise<unknown>): Promise<DependencyStatus> {
  const startedAt = performance.now();
  try {
    await withTimeout(fn(), PROBE_TIMEOUT_MS);
    return { name, status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      name,
      status: 'down',
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createHealthService(deps: HealthDependencies) {
  return {
    /**
     * Vérifie les dépendances externes. Les sondes tournent en parallèle :
     * la latence totale est celle de la plus lente, pas leur somme.
     */
    async checkReadiness(): Promise<ReadinessResponse> {
      const dependencies = await Promise.all([
        probe('postgres', () => pingDatabase(deps.db)),
        probe('redis', () => pingRedis(deps.redis)),
        probe('storage', () => deps.storage.ping()),
      ]);

      const allUp = dependencies.every((d) => d.status === 'up');

      return {
        status: allUp ? 'ok' : 'degraded',
        checkedAt: new Date().toISOString(),
        dependencies,
      };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
