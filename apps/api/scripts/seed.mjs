#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(apiRoot, '.env');

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const fileEnv = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
const environment = process.env.NODE_ENV ?? fileEnv.NODE_ENV ?? 'development';
const allowProductionSeed =
  (process.env.ALLOW_DEMO_SEED ?? fileEnv.ALLOW_DEMO_SEED)?.toLowerCase() === 'true';
if (environment === 'production' && !allowProductionSeed) {
  console.error(
    '\n  Seed de démonstration bloqué en production. Définissez temporairement ALLOW_DEMO_SEED=true uniquement pour un environnement de démonstration.\n',
  );
  process.exit(1);
}
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? fileEnv.DATABASE_MIGRATION_URL;
if (!databaseUrl) {
  console.error('\n  DATABASE_MIGRATION_URL est requise pour exécuter le seed.\n');
  process.exit(1);
}

const compiledSeed = resolve(apiRoot, 'dist/seed.js');
const tsx = resolve(apiRoot, 'node_modules/.bin/tsx');
const useCompiledSeed = existsSync(compiledSeed);
const executable = useCompiledSeed
  ? process.execPath
  : existsSync(`${tsx}.CMD`)
    ? `${tsx}.CMD`
    : tsx;
const args = useCompiledSeed ? [compiledSeed] : ['src/seed/index.ts'];
const child = spawn(executable, args, {
  cwd: apiRoot,
  stdio: 'inherit',
  shell: executable.toLowerCase().endsWith('.cmd'),
  env: { ...fileEnv, ...process.env, DATABASE_URL: databaseUrl },
});
child.on('exit', (code) => process.exit(code ?? 0));
