# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Use pnpm only (`packageManager` is pinned in `package.json`). Node >= 22.16.

```sh
pnpm install
pnpm dev          # esbuild watch + Electron; restarts Electron after every rebuild
pnpm build        # bundle to dist/ (NODE_ENV=production pnpm build to minify)
pnpm start        # run the last build
pnpm typecheck    # tsc in every package
pnpm lint         # ESLint, type-aware
pnpm test         # node:test over packages/*/src/**/*.test.ts
pnpm check        # typecheck + lint + test

# One test file / one test by name
node --experimental-strip-types --test packages/vault-core/src/result.test.ts
node --experimental-strip-types --test --test-name-pattern="ok wraps" packages/vault-core/src/result.test.ts
```

There is no packaging step yet. When it is added, it must turn off the `RunAsNode` and Node.js CLI options fuses (`@electron/fuses`).

## Tooling constraints

- Do not add Vite, Vitest, Vue, electron-vite, Rspack/Rsbuild, Rolldown or other Chinese-origin tooling (owner's requirement). The bundler is esbuild (`scripts/build.mjs`), the test runner is `node:test`, and the UI is React.
- TypeScript is pinned to `~6.0` because `typescript-eslint` does not support 7.x yet.
- Tests run TypeScript directly through Node's type stripping, so only erasable syntax is allowed (`erasableSyntaxOnly`): no `enum`, `namespace` or parameter properties. Relative imports keep their `.ts`/`.tsx` extension.
- Workspace packages export their `src/index.ts` directly. There is no per-package build: esbuild bundles everything into `dist/main.cjs`, `dist/preload.cjs` and `dist/renderer/`.
- Shells started from VS Code may export `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node.js (`app` is undefined). `pnpm dev` and `pnpm start` unset it.

## Current code

- `packages/ipc-contract`: `CommandMap` is the single list of renderer-to-main commands. To add a command, add it to `CommandMap` and `COMMAND_IDS`, then add a handler with a `validate` guard in `packages/app/src/commands.ts`. The compiler fails if any of these is missing.
- `packages/app`: `main.ts` (window, hardening, IPC sender check), `preload.ts` (exposes only `window.api.invoke`), `commands.ts` (handlers).
- `packages/ui`: React renderer. Features call `shared/ipc`, never `window.api`. Tokens are in `shared/ui/tokens.css`. The CSP is in `src/index.html`.
- `packages/vault-core`: only the `Result` helpers so far. Add the other packages from `docs/Architecture.md` when their feature starts.
- The network ban and the no-Electron-in-core rule are in `eslint.config.js`. Package-graph and UI-feature boundaries (`dependency-cruiser` or `eslint-plugin-boundaries`) and Stylelint are not set up yet.

## Specs

The specs are the source of truth. Read them before implementing anything:

- `docs/Notes App Features.md`: features 1 to 10, with requirement IDs (`V-`, `S-`, `E-`, `X-`, `L-`, `B-`, `R-`, `IO-`, `U-`, `SY-`), priorities and "done when" tests.
- `docs/Architecture.md`: technology, process model, package layout, vault layout on disk, example files, index tables, data flow and the sync decision table.
- `docs/Design principles & rules.md`: the rules review and CI enforce, and the definition of done.

Cite requirement IDs in commits and PRs. **P0** = required for v1, **P1** = in v1 if time allows, **P2** = after v1. Don't build P2 items unless asked.

## What is being built

A local-first notes app for macOS for one person. It uses Electron, with TypeScript (`strict`) everywhere: core packages in the main process, heavy work in a `utilityProcess` or worker threads, and a React renderer. Main libraries: CodeMirror 6, PDF.js, and `better-sqlite3` with FTS5. The stack and process model are in `docs/Architecture.md`. Notes are plain Markdown files with YAML front matter, stored in a folder the user picks (the "vault"). Every feature works offline except optional Google Drive sync.

## Architecture rules that span multiple files

- **The vault folder is the only source of truth.** The SQLite index (`.vault/index/index.db`), the sync manifest and all UI state are disposable caches that can be rebuilt from the files.
- **Notes are identified by front matter `key` (a ULID), not by path.** The index, board card order and sync matching all use the key, so renames and moves keep identity.
- **Every note write goes through `VaultWriter` in `vault-core`:** temp file, flush, rename. No other package writes note files. The writer records the hash it wrote so the file watcher ignores the app's own writes. Never overwrite a file without checking its hash. Deletes go to `.vault/trash`.
- **Preserve what you don't own.** Front matter edits rewrite only the changed line and keep other keys, their order and the body. JSON files keep unknown keys. An untouched note must round-trip byte for byte.
- **Package dependencies in the pnpm workspace point one way.** `vault-core` uses no Electron and no network, and must build and test in plain Node.js. `vault-index`, `vault-views`, `vault-io`, `vault-run` and `vault-sync` build on it. `vault-sync-gdrive` is the only package that may use the network. ESLint `no-restricted-imports`/`no-restricted-globals` ban `node:http`, `node:https`, `node:net`, `undici` and `fetch` elsewhere, and `dependency-cruiser` checks the graph. `app` is the Electron main process and preload script, and wires the packages together. `ui` is the React renderer and depends only on `ipc-contract`.
- **The file system, Google, the clock and token storage sit behind interfaces** so tests can fake them. The sync engine talks only to the `RemoteStore` interface and is tested against an in-memory fake that simulates two devices.
- **The renderer calls the core only through typed commands and events.** The preload script exposes one `contextBridge` API (invoke a command by id, subscribe to events). Types live in `ipc-contract`, and the main process validates every payload at runtime and rejects unregistered command ids. The UI knows nothing about disk layout.
- **The renderer is locked down:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP with `connect-src 'none'`, no `webview`, navigation and new windows blocked, and external links open in the default browser. Never loosen these to make a feature work.
- **UI features are vertical slices:** `editor`, `views`, `reader`, `search`, `sync` and `settings`. A feature imports only from `shared/ui`, `shared/commands` and another feature's public `index.ts`. Code moves to `shared` only when a third feature needs it.
- **Every user action is a command in one registry** (`shared/commands`), called by id from menus, shortcuts, the palette and buttons. A button without a registered command fails review.
- **Synced vs device-only:** `.vault/settings.json`, views, themes, snippets and `reader.json` sync. `.vault/settings.local.json` (window state, code runners), trash, the index and the manifest never sync. App-level settings are in `app.json` in the macOS app-support folder.
- **Every stored format has a `schemaVersion`.** Migrations only go forward, run on a backup copy and need a fixture per version. A file from a newer version opens read-only.

## Code-running safety (`vault-run`)

Code blocks run with the user's rights and no sandbox. Runs start only when the user presses Run or Cmd+Enter. Nothing may run on open, paste, sync or import, and a test must check this. Programs start only through one main-process command (`child_process.spawn`) that accepts only the runners listed in `settings.local.json`. The renderer can never start a process itself. Notes that arrive by sync or import must be trusted once before their blocks can run. Each run has a time limit (30 s by default) that kills the process tree.

## Conventions enforced in review and CI

- TypeScript `strict`. Outside tests: no `any`, no non-null assertions (`!`) and no unchecked casts. Core functions return a typed `Result` for expected failures, with one discriminated error union per package, and never throw on user data.
- UI feature boundaries are checked by `eslint-plugin-boundaries` or `dependency-cruiser`.
- Styling: no hard-coded colour, spacing or font, only CSS variable design tokens, on a 4 px spacing grid (Stylelint). Colour never carries meaning alone, and components need `axe` checks.
- Functions run about 40 lines and files about 300. Going over needs a reason.
- Slow work (scanning, indexing, import, sync, code runs) runs in a `utilityProcess` or worker thread, never on the main process's event loop. It can be cancelled and reports progress. Command handlers never block. Lists over about 200 rows are virtualized.
- Text input and search must handle no-space scripts (Khmer, Chinese, Japanese, Thai). The FTS5 index uses a trigram tokenizer.
- No telemetry. Drive scope is `drive.file`. OAuth tokens are stored only through Electron `safeStorage` (key in the macOS Keychain), never in the vault or settings files. Release builds disable the `RunAsNode` and Node.js CLI options fuses.
- `better-sqlite3` is a native module. Rebuild it for the Electron version in use (`@electron/rebuild` or the packager's rebuild step). Tests run under plain Node.js, which needs a different build, so decide how tests load it when `vault-index` starts. Also add it to `allowBuilds` in `pnpm-workspace.yaml`.
- A significant decision gets a one-page record in `docs/adr/`. A stored-format change needs a schema bump, a migration and a decision record.
