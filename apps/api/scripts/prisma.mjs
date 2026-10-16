#!/usr/bin/env node
/**
 * Enveloppe autour de la CLI Prisma.
 *
 * Raison d'être : conformément à ADR-011 / ADR-015, le runtime se connecte avec
 * le rôle restreint `cplan_app`, tandis que les migrations doivent tourner avec
 * le rôle propriétaire `cplan`. Prisma n'utilisant qu'une seule variable
 * DATABASE_URL, ce script la substitue par DATABASE_MIGRATION_URL le temps de
 * la commande — de façon portable Windows / macOS / Linux.
 *
 * Usage :  node scripts/prisma.mjs migrate dev
 *          node scripts/prisma.mjs studio
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(apiRoot, '.env');

/** Analyseur .env minimal : suffisant ici, aucune dépendance à installer. */
function parseEnvFile(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// En local, on complète l'environnement avec apps/api/.env. Sur Railway et
// dans les autres plateformes managées, les variables sont injectées au
// processus : aucun fichier contenant des secrets ne doit être nécessaire.
const fileEnv = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? fileEnv.DATABASE_MIGRATION_URL;

if (!migrationUrl) {
  console.error(
    '\n  DATABASE_MIGRATION_URL est absente de l’environnement et de apps/api/.env\n',
  );
  process.exit(1);
}

/**
 * Résolution explicite du binaire Prisma.
 *
 * Le linker isolé de pnpm place les binaires dans le node_modules local du
 * paquet. Ils ne sont sur le PATH que si la commande est lancée par pnpm ;
 * exécuter `node scripts/prisma.mjs` directement doit fonctionner aussi.
 */
function resolvePrismaBin() {
  const candidates = [
    resolve(apiRoot, 'node_modules/.bin/prisma'),
    resolve(apiRoot, '../../node_modules/.bin/prisma'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) || existsSync(`${candidate}.CMD`)) return candidate;
  }
  // Dernier recours : le PATH (installation globale, CI).
  return 'prisma';
}

const child = spawn(resolvePrismaBin(), process.argv.slice(2), {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...fileEnv,
    ...process.env,
    // Le rôle propriétaire, le temps de la migration uniquement.
    DATABASE_URL: migrationUrl,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
