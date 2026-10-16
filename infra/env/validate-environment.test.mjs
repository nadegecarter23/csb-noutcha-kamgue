import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnv, validateDeploymentEnv } from './validate-environment.mjs';

const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://runtime:secret@db.csb.test:5432/csbnk',
  DATABASE_MIGRATION_URL: 'postgresql://owner:secret@db.csb.test:5432/csbnk',
  REDIS_URL: 'rediss://runtime:secret@redis.csb.test:6379',
  CORS_ORIGINS: 'https://app.csb.test',
  S3_ENDPOINT: 'https://storage.csb.test',
  S3_REGION: 'af-south-1',
  S3_BUCKET: 'csbnk-production',
  S3_ACCESS_KEY_ID: 'key-production',
  S3_SECRET_ACCESS_KEY: 'secret-production',
  JWT_SECRET: 'a'.repeat(48),
  SMTP_HOST: 'smtp.csb.test',
  SMTP_PORT: '587',
  SMTP_FROM: 'CSB Noutcha KAMGUE <no-reply@csb.test>',
  PAYMENT_PROVIDER_MODE: 'live',
  PAYMENT_WEBHOOK_BASE_URL: 'https://api.csb.test/api/v1/webhooks',
  ALLOW_DEMO_SEED: 'false',
  MTN_MOMO_BASE_URL: 'https://mtn.csb.test',
  MTN_MOMO_SUBSCRIPTION_KEY: 'subscription-key',
  MTN_MOMO_API_USER: 'api-user',
  MTN_MOMO_API_KEY: 'api-key',
};

test('analyse les commentaires, guillemets et valeurs contenant un signe égal', () => {
  assert.deepEqual(parseEnv('# commentaire\nA="un=deux"\nB=trois\n'), { A: 'un=deux', B: 'trois' });
});

test('accepte une configuration de production complète', () => {
  assert.deepEqual(validateDeploymentEnv(valid, 'production'), []);
});

test('refuse les placeholders sans révéler leur valeur', () => {
  const errors = validateDeploymentEnv(
    { ...valid, S3_SECRET_ACCESS_KEY: 'CHANGE_ME_SECRET' },
    'staging',
  );
  assert.ok(errors.some((error) => error.includes('S3_SECRET_ACCESS_KEY')));
  assert.ok(errors.every((error) => !error.includes('CHANGE_ME_SECRET')));
});

test('refuse le mode factice, les origines locales et une configuration opérateur partielle', () => {
  const errors = validateDeploymentEnv(
    {
      ...valid,
      PAYMENT_PROVIDER_MODE: 'fake',
      CORS_ORIGINS: 'http://localhost:5173',
      MTN_MOMO_API_KEY: '',
    },
    'production',
  );
  assert.ok(errors.some((error) => error.includes('PAYMENT_PROVIDER_MODE')));
  assert.ok(errors.some((error) => error.includes('CORS_ORIGINS')));
  assert.ok(errors.some((error) => error.includes('MTN_MOMO_API_KEY')));
});
