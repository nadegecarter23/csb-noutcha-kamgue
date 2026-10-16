import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from './config.js';

/**
 * La configuration est la première barrière du système : ces tests vérifient
 * qu'elle échoue bruyamment plutôt que de laisser démarrer une API mal
 * configurée (docs/phases/PHASE-00-socle-projet.md §4).
 */

const validEnv = {
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
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:8081',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1035',
  SMTP_FROM: 'CSB Noutcha KAMGUE <no-reply@csb-noutcha-kamgue.local>',
} satisfies NodeJS.ProcessEnv;

afterEach(() => {
  vi.restoreAllMocks();
});

/** loadConfig appelle process.exit(1) en cas d'échec : on l'intercepte. */
function expectExit(env: NodeJS.ProcessEnv): string {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('__exit__');
  }) as never);

  expect(() => loadConfig(env)).toThrow('__exit__');
  expect(exitSpy).toHaveBeenCalledWith(1);
  return errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
}

describe('loadConfig', () => {
  it('accepte une configuration complète', () => {
    const config = loadConfig(validEnv);
    expect(config.PORT).toBe(3000);
    expect(config.isTest).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.DEFAULT_CURRENCY).toBe('XAF');
    expect(config.DEFAULT_TIMEZONE).toBe('Africa/Douala');
  });

  it('découpe CORS_ORIGINS en liste', () => {
    const config = loadConfig(validEnv);
    expect(config.CORS_ORIGINS).toEqual(['http://localhost:5173', 'http://localhost:8081']);
  });

  it('utilise uniquement les origines explicitement configurées en production', () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: 'production',
      PAYMENT_PROVIDER_MODE: 'live',
      CORS_ORIGINS: 'https://app.csb.example,https://app.csb.example',
    });
    expect(config.CORS_ORIGINS).toEqual(['https://app.csb.example']);
  });

  it('refuse de démarrer si DATABASE_URL est absente', () => {
    const { DATABASE_URL: _omit, ...env } = validEnv;
    const output = expectExit(env);
    expect(output).toContain('DATABASE_URL');
  });

  it('refuse un JWT_SECRET trop court', () => {
    const output = expectExit({ ...validEnv, JWT_SECRET: 'trop-court' });
    expect(output).toContain('JWT_SECRET');
  });

  it('refuse le secret de développement en production', () => {
    const output = expectExit({
      ...validEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'dev-only-secret-change-me-in-production-min-32-chars',
    });
    expect(output).toContain('production');
  });

  it('refuse un PORT non numérique', () => {
    expectExit({ ...validEnv, PORT: 'abc' });
  });

  it('énumère TOUTES les variables manquantes, pas seulement la première', () => {
    const { DATABASE_URL: _a, REDIS_URL: _b, JWT_SECRET: _c, ...env } = validEnv;
    const output = expectExit(env);
    expect(output).toContain('DATABASE_URL');
    expect(output).toContain('REDIS_URL');
    expect(output).toContain('JWT_SECRET');
  });
});
