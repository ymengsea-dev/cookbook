# Notes

A local-first Markdown notes app for macOS. Notes are plain `.md` files in a folder you choose. The app adds a live-preview editor with runnable code blocks, fast search in any language, list and board views, a PDF reader, and optional Google Drive sync. Everything except sync works offline, with no account and no telemetry.

> **Status:** early development. The app shell, IPC bridge and tooling are in place. Features are being built from the specs in [`docs/`](docs/).

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron |
| Language | TypeScript (`strict`) everywhere |
| UI | React |
| Bundler | esbuild |
| Tests | `node:test` |
| Lint | ESLint with `typescript-eslint` |
| Package manager | pnpm |

## Requirements

- macOS
- Node.js 22.16 or later
- pnpm 12 (`corepack enable` picks up the version pinned in `package.json`)

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` builds the app, opens it, and restarts it whenever a source file changes. The first run downloads the Electron binary.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Build in watch mode and run the app |
| `pnpm build` | Bundle into `dist/`. Use `NODE_ENV=production pnpm build` to minify |
| `pnpm start` | Run the last build |
| `pnpm typecheck` | Type-check every package |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run all tests |
| `pnpm check` | Type-check, lint and test |

Run a single test file:

```sh
node --experimental-strip-types --test packages/vault-core/src/result.test.ts
```

## Project layout

```text
packages/
  app/            Electron main process and preload script
  ui/             React renderer
  ipc-contract/   Typed commands shared by main, preload and renderer
  vault-core/     Notes, files and atomic writes (no Electron, no network)
scripts/          esbuild build and dev scripts
docs/             Specs, architecture, design rules and decision records
```

More packages (`vault-index`, `vault-views`, `vault-io`, `vault-run`, `vault-sync`, `vault-sync-gdrive`) are added as their features start. See [Architecture](docs/Architecture.md).

## Documentation

- [Feature summary](docs/Notes%20App%20Features.md): features 1 to 10, priorities and acceptance tests
- [Architecture](docs/Architecture.md): process model, packages, vault layout, data flow and sync rules
- [Design principles and rules](docs/Design%20principles%20%26%20rules.md): the rules that review and CI enforce
- [Decision records](docs/adr/)

## Contributing

- Read the specs before you implement a feature, and cite the requirement IDs (for example `V-4`) in commits and pull requests.
- Run `pnpm check` before you push.
- Use pnpm only. Do not add Vite, Vitest, Vue, electron-vite, Rspack, Rsbuild or Rolldown.
- The renderer never touches Node.js or the disk. Add new main-process actions as commands in `packages/ipc-contract`.
- Only `vault-sync-gdrive` may use the network. ESLint enforces this.

## Troubleshooting

**`TypeError: Cannot read properties of undefined (reading 'on')` on start.** Your shell has `ELECTRON_RUN_AS_NODE=1` set (VS Code terminals sometimes export it), so Electron started as plain Node.js. `pnpm dev` and `pnpm start` unset it. If you run Electron another way, unset it first:

```sh
unset ELECTRON_RUN_AS_NODE
```
