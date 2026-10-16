import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp, type CplanApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { createLogger } from '../../platform/logger.js';
import type { Database } from '../../platform/db.js';
import type { Storage } from '../../platform/storage.js';
import type { Redis } from 'ioredis';

/**
 * Test d'intégration HTTP du module health.
 *
 * Les dépendances externes sont ici remplacées par des doublures : l'objectif
 * est de valider le CÂBLAGE (routes, sérialisation, codes de statut), pas
 * PostgreSQL. Les tests sur une vraie base arrivent en Phase 01 avec
 * Testcontainers.
 */

const testEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5442/cplan',
  REDIS_URL: 'redis://localhost:6389',
  S3_ENDPOINT: 'http://localhost:9010',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'cplan-dev',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  JWT_SECRET: 'a'.repeat(32),
  CORS_ORIGINS: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1035',
  SMTP_FROM: 'school fees app <no-reply@cplan.local>',
  LOG_LEVEL: 'silent',
};

interface Doubles {
  dbUp: boolean;
  redisUp: boolean;
  storageUp: boolean;
}

async function buildTestApp(state: Doubles): Promise<CplanApp> {
  const config = loadConfig(testEnv);
  const logger = createLogger({ ...config, LOG_LEVEL: 'silent' });

  const db = {
    $queryRaw: async () => {
      if (!state.dbUp) throw new Error('connexion refusée');
      return [{ '?column?': 1 }];
    },
  } as unknown as Database;

  const redis = {
    ping: async () => {
      if (!state.redisUp) throw new Error('connexion refusée');
      return 'PONG';
    },
  } as unknown as Redis;

  const storage = {
    bucket: 'cplan-dev',
    ping: async () => {
      if (!state.storageUp) throw new Error('bucket introuvable');
    },
  } as unknown as Storage;

  const sms = {
    code: 'TEST',
    send: async () => ({ providerMessageId: 'test', cost: 0 }),
  };

  return buildApp({ config, logger, db, redis, storage, sms });
}

describe('GET /health (liveness)', () => {
  let app: CplanApp;

  beforeAll(async () => {
    app = await buildTestApp({ dbUp: true, redisUp: true, storageUp: true });
  });
  afterAll(async () => {
    await app.close();
  });

  it('répond 200 sans tester les dépendances', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', version: expect.any(String) });
    expect(response.json().uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('renvoie un identifiant de corrélation', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it("réutilise l'identifiant de corrélation fourni par l'appelant", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'trace-amont-123' },
    });
    expect(response.headers['x-request-id']).toBe('trace-amont-123');
  });

  // Les orchestrateurs sondent la racine ; les clients passent par le préfixe
  // versionné. Les deux doivent répondre, sans quoi le proxy du dashboard
  // tombe sur un 404 (défaut constaté en Phase 00).
  it('est exposée à la fois à la racine et sous /api/v1', async () => {
    const root = await app.inject({ method: 'GET', url: '/health' });
    const versioned = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(root.statusCode).toBe(200);
    expect(versioned.statusCode).toBe(200);
    expect(versioned.json().status).toBe('ok');
  });

  it('expose aussi la sonde de readiness sous /api/v1', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json().dependencies).toHaveLength(3);
  });
});

describe('GET /health/ready (readiness)', () => {
  it('répond 200 quand les trois dépendances répondent', async () => {
    const app = await buildTestApp({ dbUp: true, redisUp: true, storageUp: true });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.dependencies).toHaveLength(3);
    expect(body.dependencies.map((d: { name: string }) => d.name).sort()).toEqual([
      'postgres',
      'redis',
      'storage',
    ]);
    expect(body.dependencies.every((d: { status: string }) => d.status === 'up')).toBe(true);

    await app.close();
  });

  it('répond 503 et désigne la dépendance fautive quand PostgreSQL est HS', async () => {
    const app = await buildTestApp({ dbUp: false, redisUp: true, storageUp: true });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.status).toBe('degraded');

    const postgres = body.dependencies.find((d: { name: string }) => d.name === 'postgres');
    expect(postgres.status).toBe('down');
    expect(postgres.error).toContain('connexion refusée');

    // Les autres restent testées : on veut un diagnostic complet, pas le premier échec.
    const redis = body.dependencies.find((d: { name: string }) => d.name === 'redis');
    expect(redis.status).toBe('up');

    await app.close();
  });

  it('signale plusieurs dépendances HS simultanément', async () => {
    const app = await buildTestApp({ dbUp: false, redisUp: false, storageUp: false });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(
      response.json().dependencies.filter((d: { status: string }) => d.status === 'down'),
    ).toHaveLength(3);

    await app.close();
  });
});

describe('gestion des erreurs', () => {
  let app: CplanApp;

  beforeAll(async () => {
    app = await buildTestApp({ dbUp: true, redisUp: true, storageUp: true });
  });
  afterAll(async () => {
    await app.close();
  });

  it('renvoie le format d’erreur standard sur une route inconnue', async () => {
    const response = await app.inject({ method: 'GET', url: '/route-inexistante' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: expect.stringContaining('/route-inexistante'),
        request_id: expect.any(String),
      },
    });
  });
});
