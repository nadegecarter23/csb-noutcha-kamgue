#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REQUIRED = [
  'NODE_ENV',
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'REDIS_URL',
  'CORS_ORIGINS',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'JWT_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
  'PAYMENT_PROVIDER_MODE',
  'PAYMENT_WEBHOOK_BASE_URL',
  'ALLOW_DEMO_SEED',
];

const PLACEHOLDER = /(CHANGE_ME|CONFIGURER|VOTRE[_-]|GENERER_|XXXXXXXX|example\.invalid|\$\{\{)/i;

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function validUrl(value, protocols) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateDeploymentEnv(env, target) {
  const errors = [];
  if (!['staging', 'production'].includes(target)) {
    return ['La cible doit être staging ou production.'];
  }

  for (const key of REQUIRED) {
    if (!env[key]) errors.push(`${key} est absente.`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (PLACEHOLDER.test(value)) errors.push(`${key} contient encore une valeur fictive.`);
  }

  if (env.NODE_ENV && env.NODE_ENV !== 'production') {
    errors.push('NODE_ENV doit valoir production sur staging et production.');
  }
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET doit contenir au moins 32 caractères.');
  }
  if (env.PAYMENT_PROVIDER_MODE && env.PAYMENT_PROVIDER_MODE !== 'live') {
    errors.push('PAYMENT_PROVIDER_MODE doit valoir live.');
  }
  if (env.ALLOW_DEMO_SEED && env.ALLOW_DEMO_SEED !== 'false') {
    errors.push('ALLOW_DEMO_SEED doit valoir false.');
  }
  if (env.DATABASE_URL && !validUrl(env.DATABASE_URL, ['postgres:', 'postgresql:'])) {
    errors.push('DATABASE_URL doit être une URL PostgreSQL valide.');
  }
  if (
    env.DATABASE_MIGRATION_URL &&
    !validUrl(env.DATABASE_MIGRATION_URL, ['postgres:', 'postgresql:'])
  ) {
    errors.push('DATABASE_MIGRATION_URL doit être une URL PostgreSQL valide.');
  }
  if (env.REDIS_URL && !validUrl(env.REDIS_URL, ['redis:', 'rediss:'])) {
    errors.push('REDIS_URL doit être une URL Redis valide.');
  }

  for (const key of ['S3_ENDPOINT', 'PAYMENT_WEBHOOK_BASE_URL']) {
    if (env[key] && !validUrl(env[key], ['https:'])) errors.push(`${key} doit utiliser HTTPS.`);
  }

  for (const origin of (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    if (
      origin.includes('*') ||
      !validUrl(origin, ['https:']) ||
      /localhost|127\.0\.0\.1/i.test(origin)
    ) {
      errors.push('CORS_ORIGINS doit contenir uniquement des origines HTTPS exactes et publiques.');
      break;
    }
  }

  if (env.SMTP_FROM && !/^.+<[^<>\s@]+@[^<>\s@]+>$/.test(env.SMTP_FROM)) {
    errors.push('SMTP_FROM doit suivre le format Nom <adresse@domaine>.');
  }

  const providers = [
    ['MTN_MOMO_BASE_URL', 'MTN_MOMO_SUBSCRIPTION_KEY', 'MTN_MOMO_API_USER', 'MTN_MOMO_API_KEY'],
    [
      'ORANGE_MONEY_BASE_URL',
      'ORANGE_MONEY_TOKEN_URL',
      'ORANGE_MONEY_CLIENT_ID',
      'ORANGE_MONEY_CLIENT_SECRET',
      'ORANGE_MONEY_MERCHANT_KEY',
    ],
  ];
  const completeProviders = providers.filter((keys) => keys.every((key) => env[key]));
  if (completeProviders.length === 0) {
    errors.push('Au moins un fournisseur Mobile Money doit être entièrement configuré.');
  }
  for (const keys of providers) {
    const supplied = keys.filter((key) => env[key]);
    if (supplied.length > 0 && supplied.length < keys.length) {
      errors.push(
        `Configuration Mobile Money incomplète : ${keys.filter((key) => !env[key]).join(', ')}.`,
      );
    }
  }

  return [...new Set(errors)];
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const file = argument('--file');
  const target = argument('--target');
  if (!file || !target) {
    console.error(
      'Usage : node infra/env/validate-environment.mjs --file <fichier> --target <staging|production>',
    );
    process.exitCode = 2;
  } else {
    try {
      const errors = validateDeploymentEnv(parseEnv(readFileSync(resolve(file), 'utf8')), target);
      if (errors.length) {
        console.error(`Configuration ${target} refusée :`);
        for (const error of errors) console.error(`- ${error}`);
        process.exitCode = 1;
      } else {
        console.log(`Configuration ${target} valide (${REQUIRED.length} contrôles obligatoires).`);
      }
    } catch (error) {
      console.error(
        `Impossible de contrôler le fichier demandé : ${error instanceof Error ? error.message : 'erreur inconnue'}`,
      );
      process.exitCode = 2;
    }
  }
}
