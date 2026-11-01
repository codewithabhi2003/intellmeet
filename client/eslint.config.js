import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
export default [
  { ignores: ['dist/**', 'node_modules/**', 'tests/**'] },
  js.configs.recommended,
  { files: ['**/*.{js,jsx}'], plugins: { react, 'react-hooks': hooks },
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser } },
    settings: { react: { version: '18' } },
    rules: { ...hooks.configs.recommended.rules, 'react/jsx-uses-vars': 'error', 'react/jsx-uses-react': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] } },
  { files: ['*.config.js'], languageOptions: { globals: { ...globals.node } } },
];
