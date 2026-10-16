import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Configuration ESLint partagée CSB Noutcha KAMGUE.
 *
 * Les règles marquées « garde-fou métier » ne sont pas stylistiques :
 * elles protègent des erreurs identifiées dans docs/01-VISION-PERIMETRE.md §8.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/.turbo/**', '**/coverage/**', '**/.expo/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Garde-fou métier : aucun log sauvage, on passe par le logger pino
      // (rédaction des champs sensibles — voir docs/02-ARCHITECTURE-TECHNIQUE.md §8)
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Garde-fou métier : les montants sont des entiers en FCFA (ADR-012).
      // parseFloat / Number.parseFloat sur un montant est toujours un bug.
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Montants en FCFA entiers uniquement (ADR-012).' },
      ],

      // Definition of Done : aucun TODO dans le code fusionné (docs/06 §9)
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme'], location: 'anywhere' }],

      // Une injection HTML doit passer par un composant de sanitation audité.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML est interdit sans sanitation centralisée.',
        },
      ],
    },
  },
);
