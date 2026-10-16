import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { buildApp, type CplanApp } from '../../app.js';
import { loadConfig, type AppConfig } from '../../platform/config.js';
import { createLogger } from '../../platform/logger.js';
import type { Database } from '../../platform/db.js';
import type { Storage } from '../../platform/storage.js';
import type { SmsMessage, SmsProvider, SmsResult } from '../../platform/sms.js';

/**
 * Fabrique d'application pour les tests.
 *
 * Deux modes :
 *   · sans base   → doublures, pour les tests de câblage et d'architecture ;
 *   · avec base   → vraie instance PostgreSQL (`cplan_test`), pour les tests
 *                   d'intégration. On ne simule PAS la base : les contraintes,
 *                   les index uniques et la RLS font partie du comportement
 *                   qu'on veut vérifier (docs/06-CONVENTIONS-DEV.md §7).
 */

export const TEST_DATABASE_URL =
  process.env.DATABASE_TEST_URL ??
  'postgresql://cplan:cplan_dev_password@localhost:5442/cplan_test?schema=public';

const BASE_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6389',
  S3_ENDPOINT: 'http://localhost:9010',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'cplan-dev',
  S3_ACCESS_KEY_ID: 'cplan',
  S3_SECRET_ACCESS_KEY: 'cplan_dev_password',
  JWT_SECRET: 'secret-de-test-uniquement-32-caracteres-minimum',
  JWT_ACCESS_TTL: '15m',
  CORS_ORIGINS: 'http://localhost:5173',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1035',
  SMTP_FROM: 'school fees app <test@cplan.local>',
  LOG_LEVEL: 'silent',
};

export function testConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({ ...BASE_ENV, ...overrides });
}

/** Collecte les SMS au lieu de les envoyer — permet de lire les codes OTP. */
export class MemorySmsProvider implements SmsProvider {
  readonly code = 'MEMORY';
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<SmsResult> {
    this.sent.push(message);
    return { providerMessageId: `mem-${this.sent.length}`, cost: 0 };
  }

  lastTo(phone: string): SmsMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === phone);
  }

  /** Extrait le code à 6 chiffres du dernier SMS envoyé à ce numéro. */
  lastOtpFor(phone: string): string {
    const message = this.lastTo(phone);
    const match = message ? /\b(\d{6})\b/.exec(message.body) : null;
    if (!match?.[1]) {
      throw new Error(`Aucun code OTP trouvé dans les SMS envoyés à ${phone}.`);
    }
    return match[1];
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export interface TestApp extends CplanApp {
  /** Routes observées à l'enregistrement — pour le test d'architecture. */
  routeRegistry: Array<{ method: string; url: string; hasAuth: boolean; isPublic: boolean }>;
}

export interface BuildTestAppOptions {
  db?: Database;
  sms?: SmsProvider;
  env?: NodeJS.ProcessEnv;
}

export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<TestApp> {
  const config = testConfig(options.env);
  const logger = createLogger(config);

  const routeRegistry: TestApp['routeRegistry'] = [];

  const db =
    options.db ??
    ({
      $queryRaw: async () => [{ ok: 1 }],
    } as unknown as Database);

  const redis = {
    ping: async () => 'PONG',
    quit: async () => 'OK',
  } as unknown as Redis;

  const storage = {
    bucket: 'cplan-dev',
    ping: async () => undefined,
  } as unknown as Storage;

  const app = (await buildApp({
    config,
    logger,
    db,
    redis,
    storage,
    sms: options.sms ?? new MemorySmsProvider(),
    onRoute: (route) => routeRegistry.push(route),
  })) as TestApp;

  app.routeRegistry = routeRegistry;
  return app;
}

/* -------------------------------------------------------------------------- */
/* Base de test                                                                */
/* -------------------------------------------------------------------------- */

let sharedClient: PrismaClient | undefined;

export function testDatabase(): PrismaClient {
  sharedClient ??= new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
    log: [],
  });
  return sharedClient;
}

/**
 * Vide les tables métier entre deux suites.
 *
 * TRUNCATE CASCADE plutôt que des deleteMany en cascade : plus rapide, et
 * insensible à l'ordre des dépendances. `permissions` et `roles` sont
 * préservés — ils viennent du seed et sont du référentiel, pas de la donnée.
 */
export async function resetTestData(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      guardian_invite_uses, guardian_invites, guardian_link_requests,
      student_guardians, guardians, student_class_changes, enrollments, students,
      classes, academic_years, grade_levels, student_categories,
      sessions, otp_codes, idempotency_keys, audit_logs,
      user_roles, staff_profiles, users, files, number_sequences,
      school_settings, schools
    RESTART IDENTITY CASCADE
  `);
}

export async function closeTestDatabase(): Promise<void> {
  await sharedClient?.$disconnect();
  sharedClient = undefined;
}
