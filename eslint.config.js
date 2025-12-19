// ESLint v9 configuration (flat config)
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  {
    files: ['**/*.ts'],
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
      ...tsPlugin.configs.recommended.rules,
      'quotes': ['error', 'double'],
      'indent': ['error', 2],
      'max-len': ['warn', { code: 120 }],
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
    },
  },
  {
    ignores: [
      'lib/**/*',
      'generated/**/*',
      'node_modules/**/*',
    ],
  },
];
