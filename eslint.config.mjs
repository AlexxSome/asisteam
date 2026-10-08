import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default [
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**', 'graphify-out/**', '.pnpm-store/**', '**/coverage/**', 'packages/db/src/database.types.ts', 'supabase/functions/**'] },
  js.configs.recommended,
  { files: ['**/*.{js,mjs,ts,tsx}'], languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { 'no-unused-vars': 'off' } },
  // These fixtures intentionally discard private SQL/configuration diagnostics.
  { files: ['apps/web/e2e/local-fixtures.mjs', 'apps/web/e2e/server.mjs', 'scripts/ci/run.mjs'], rules: { 'preserve-caught-error': 'off' } },
  { files: ['apps/api/test/container-smoke.mjs'], rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: ts.parser, parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { 'no-undef': 'off' } },
  { files: ['apps/web/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { paths: [
    { name: '@asisteam/db', importNames: ['Database'], message: 'Usa DTO HTTP o el esquema de persistencia propio.' },
    { name: '@asisteam/db/legacy', message: 'Los tipos Supabase históricos quedan fuera de la web.' },
  ] }] } },
];
