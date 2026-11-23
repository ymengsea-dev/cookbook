import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// "Local first": the UI never talks to the network. The CSP blocks it too.
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'The UI never uses the network. Call a Rust command through shared/ipc instead.',
}));

export default defineConfig(
  { ignores: ['dist/**', 'target/**', 'backend/**', '**/node_modules/**', 'frontend/src/shared/ipc/bindings/**'] },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@tauri-apps/api/core', message: 'Use frontend/src/shared/ipc instead.' },
            { name: '@tauri-apps/api/event', message: 'Use listen from frontend/src/shared/ipc instead.' },
          ],
        },
      ],
    },
  },
  {
    files: ['frontend/src/shared/ipc/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/tests/**/*.ts'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] }] },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
