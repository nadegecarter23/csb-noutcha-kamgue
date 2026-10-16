import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Les scénarios d'intégration recréent les fixtures PostgreSQL et certains
    // vérifient explicitement des écritures concurrentes. Sous charge, le délai
    // Vitest de 5 s interrompait un test alors que ses requêtes continuaient en
    // base ; le TRUNCATE suivant entrait alors en interblocage avec celles-ci.
    // Une même marge couvre les scénarios et leurs hooks de préparation.
    testTimeout: 30_000,
    hookTimeout: 30_000,

    /**
     * Exécution séquentielle des fichiers de test.
     *
     * Les tests d'intégration partagent une seule base `cplan_test` et la
     * vident entre les suites. En parallèle, un TRUNCATE d'un fichier efface
     * les fixtures d'un autre — produisant des échecs intermittents, le pire
     * type de défaut à diagnostiquer.
     *
     * Alternative envisagée : un schéma PostgreSQL par fichier de test. Plus
     * rapide, mais nettement plus complexe pour un gain nul à cette taille de
     * suite. À reconsidérer si la durée totale devient gênante.
     */
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/seed/**'],
    },
  },
});
