import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// "Local first": the UI never talks to the network. The CSP blocks it too.
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'The UI never uses the network. Call a Rust command through shared/ipc instead.',
}));

const tauriPaths = [
  { name: '@tauri-apps/api/core', message: 'Use frontend/src/shared/ipc instead.' },
  { name: '@tauri-apps/api/event', message: 'Use listen from frontend/src/shared/ipc instead.' },
];

// Folder rules for the UI (see "Frontend folders" in CLAUDE.md).
const rustCallsOnlyInApi = {
  regex: '(^|/)ipc/index\\.ts$',
  importNames: ['invoke', 'listen', 'createChannel'],
  message: "Call Rust only from this domain's api/ folder.",
};
const domainsOnlyThroughIndex = {
  regex: '^(\\./|(\\.\\./)+)(editor|views|reader|search|settings|io|shell|shared/[^/]+)/(?!index\\.ts$)',
  message: "Import another domain only through its index.ts.",
};
const logicStaysPure = {
  regex: '^(react|react-dom)(/|$)|(^|/)(api|hooks|components|pages)/',
  message: 'logic/ holds pure functions: no React, api, hooks, components or pages.',
};

function restrictedImports(...patterns) {
  return ['error', { paths: tauriPaths, patterns }];
}

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
      'no-restricted-imports': restrictedImports(),
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': restrictedImports(rustCallsOnlyInApi, domainsOnlyThroughIndex) },
  },
  {
    files: ['frontend/src/**/api/**'],
    rules: { 'no-restricted-imports': restrictedImports(domainsOnlyThroughIndex) },
  },
  {
    files: ['frontend/src/**/logic/**'],
    rules: { 'no-restricted-imports': restrictedImports(rustCallsOnlyInApi, domainsOnlyThroughIndex, logicStaysPure) },
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
