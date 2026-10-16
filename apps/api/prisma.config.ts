import { defineConfig } from 'prisma/config';

// Prisma 6 valide encore `env("DATABASE_URL")` dans schema.prisma, y compris
// pendant `prisma generate`. Cette URL factice n'est jamais utilisée pour une
// connexion : scripts/prisma.mjs injecte l'URL réelle avant toute migration.
process.env.DATABASE_URL ??= 'postgresql://prisma-build:prisma-build@localhost:5432/prisma-build';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/index.ts',
  },
  // `prisma generate` s'exécute pendant le build Docker, avant qu'une base ne
  // soit nécessaire. Les commandes de migration reçoivent toujours l'URL
  // réelle via scripts/prisma.mjs.
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
