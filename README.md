# Notes

A local-first Markdown notes app for macOS. Notes are plain `.md` files in a folder you choose. The app adds a live-preview editor with runnable code blocks, fast search in any language, list and board views, a PDF reader, and optional Google Drive sync. Everything except sync works offline, with no account and no telemetry.

> **Status:** early development. The app shell, typed IPC and tooling are in place. Features are being built from the specs in [`docs/`](docs/).

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Tauri 2 (system WebView) |
| Core | Rust, as a Cargo workspace of small crates |
| UI | React and TypeScript (`strict`) |
| UI bundler | esbuild |
| IPC types | Generated from Rust with `ts-rs` |
| Lint | clippy, ESLint with `typescript-eslint` |
| Package manager | pnpm |

## Requirements

- macOS with Xcode Command Line Tools
- Rust 1.90 or later (`rustup`)
- Node.js 22.16 or later
- pnpm 12 (`corepack enable` picks up the version pinned in `package.json`)

## Getting started

```sh
pnpm install
pnpm dev
```

`pnpm dev` serves the UI on port 1420 and runs the app. Rust changes rebuild and restart the app. UI changes rebuild the bundle: press Cmd+R in the window to reload. The first run compiles Tauri, which takes a few minutes.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in development mode |
| `pnpm build` | Build the release `.app` and `.dmg` into `target/release/bundle/` |
| `pnpm test` | Run the Rust tests (this also regenerates the TypeScript bindings) |
| `pnpm typecheck` | Type-check the UI |
| `pnpm lint` | Run ESLint and clippy |
| `pnpm fmt` | Format the Rust code |
| `pnpm check` | Format check, tests, type-check and lint |
| `pnpm gen:types` | Regenerate the TypeScript bindings only |

Run a single test:

```sh
cargo test -p vault-core notes_are_not_internal
```

## Project layout

```text
crates/
  app/          Tauri shell: commands, capabilities, window and bundle config
  vault-core/   Notes, files and atomic writes (no Tauri, no network)
ui/
  index.html
  src/          React UI; shared/ipc holds the typed command wrapper and generated bindings
scripts/        esbuild build script for the UI
docs/           Feature specs and architecture
```

More crates (`vault-index`, `vault-views`, `vault-io`, `vault-run`, `vault-sync`, `vault-sync-gdrive`) are added as their features start. See [Architecture](docs/Architecture.md).

## Documentation

- [Feature details](docs/Features%20detail.md): features 1 to 10, priorities and acceptance tests
- [Architecture](docs/Architecture.md): crates, vault layout, data flow and sync rules

## Contributing

- Read the specs before you implement a feature, and cite the requirement IDs (for example `V-4`) in commits and pull requests.
- Run `pnpm check` before you push.
- Use pnpm only. Do not add Vite, Vitest, Vue, Rspack, Rsbuild or Rolldown.
- A new Tauri command needs four steps: the Rust command, `build.rs`, the capability file, and `CommandMap` in `ui/src/shared/ipc`. See [CLAUDE.md](CLAUDE.md#adding-a-command).
- Only `vault-sync-gdrive` may use an HTTP client. Check with `cargo deny check bans`.
