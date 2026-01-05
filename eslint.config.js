// ESLint v9 configuration (flat config)
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.ts'],
    ignores: [
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.dev.json'],
        sourceType: 'module',
      },
      ecmaVersion: 'latest',
      globals: {
        node: true,
        es6: true,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Basic formatting
      'quotes': ['error', 'double'],
      'indent': ['error', 2],
      'max-len': ['warn', { code: 120 }],
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      // TypeScript rules - disabled for Express middleware
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: [
      'lib/**/*',
      'generated/**/*',
      'node_modules/**/*',
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.spec.ts',
    ],
  },
];
