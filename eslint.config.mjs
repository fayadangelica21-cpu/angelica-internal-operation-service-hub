import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/playwright-report/**', '**/test-results/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['backend/**/*.ts', 'frontend/**/*.ts', 'frontend/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
