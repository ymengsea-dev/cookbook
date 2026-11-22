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
  { ignores: ['dist/**', 'target/**', 'crates/**', '**/node_modules/**', 'ui/src/shared/ipc/bindings/**'] },

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
          paths: [{ name: '@tauri-apps/api/core', message: 'Use ui/src/shared/ipc instead.' }],
        },
      ],
    },
  },
  {
    files: ['ui/src/shared/ipc/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['ui/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
);
