import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // page.evaluate crosses into the browser context, where window hooks are untyped
    files: ['apps/web/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // service worker: runs in the worker global scope
    files: ['apps/web/public/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { URL: 'readonly', console: 'readonly', process: 'readonly' } },
  },
  {
    // The simulation core must stay deterministic and renderer-agnostic.
    files: ['packages/sim/src/**/*.ts', 'packages/content/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['phaser', 'phaser/*', '@dead-sector/game'] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use SeededRng.' },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'performance',
        'requestAnimationFrame',
      ],
    },
  },
);
