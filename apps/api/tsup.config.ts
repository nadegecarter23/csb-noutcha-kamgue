import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    worker: 'src/worker.ts',
    bootstrap: 'src/bootstrap.ts',
    seed: 'src/seed/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Prisma génère du binaire natif : il ne doit jamais être bundlé.
  external: ['@prisma/client', '.prisma/client'],

  // Les paquets du monorepo exportent du TypeScript brut (pas de build
  // intermédiaire, volontairement : c'est ce qui rend le refactor atomique
  // entre l'API, le web et le mobile). tsup externalise par défaut tout ce qui
  // figure dans `dependencies` — il faut donc lui dire explicitement de les
  // intégrer au bundle, sinon Node tente de charger du .ts à l'exécution.
  noExternal: [/^@cplan\//],
});
