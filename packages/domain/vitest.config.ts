import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/index.ts', 'src/**/index.ts'],
      // Le calcul financier est couvert à 100 % — exigence de la DoD.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
