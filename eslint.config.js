import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// "Local first": only vault-sync-gdrive may open network connections.
const networkMessage = 'Only packages/vault-sync-gdrive may use the network.';
const networkModules = ['http', 'https', 'net', 'tls', 'dgram', 'http2'].flatMap((name) => [
  { name, message: networkMessage },
  { name: `node:${name}`, message: networkMessage },
]);
const networkImports = [
  ...networkModules,
  { name: 'undici', message: networkMessage },
  { name: 'electron', importNames: ['net'], message: networkMessage },
];
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: networkMessage,
}));

// "Dependencies point inward": core packages know nothing about Electron.
const electronInCore = { name: 'electron', message: 'Core packages must run in plain Node.js, without Electron.' };

export default defineConfig(
  { ignores: ['dist/**', 'out/**', '**/node_modules/**'] },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-imports': ['error', { paths: networkImports }],
      'no-restricted-globals': ['error', ...networkGlobals],
    },
  },
  {
    files: ['packages/vault-*/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [...networkImports, electronInCore] }],
    },
  },
  {
    files: ['packages/vault-sync-gdrive/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [electronInCore] }],
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] }] },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } },
  },
);
