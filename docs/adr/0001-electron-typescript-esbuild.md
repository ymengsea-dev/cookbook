# 0001: Electron, TypeScript, esbuild and pnpm

Nov 22, 2026 · Superseded by [0002](0002-back-to-tauri-and-rust.md)

## Context

The first specs planned a Tauri shell with a Rust core. The owner prefers one language across the whole app, and wants Electron. The owner also does not want Chinese-origin tooling, which rules out Vite, Vitest, Vue, electron-vite, Rspack/Rsbuild and Rolldown. pnpm is the package manager.

## Decision

- **Shell:** Electron. The main process runs the core packages and command handlers. Heavy work runs in a `utilityProcess` or worker threads. The renderer is sandboxed and reaches the core only through the typed `window.api.invoke` bridge.
- **Language:** TypeScript (`strict`) everywhere, pinned to `~6.0` until `typescript-eslint` supports 7.x.
- **Workspace:** a pnpm workspace in `packages/*`. Packages export their TypeScript source directly.
- **Bundler:** esbuild, driven by `scripts/build.mjs` (build) and `scripts/dev.mjs` (watch and restart).
- **Tests:** `node:test`, running `.ts` files through Node's type stripping.
- **UI:** React.
- **Lint:** ESLint with `typescript-eslint` `strictTypeChecked`. The network ban and the no-Electron-in-core rule are lint rules.

## Alternatives considered

- **Tauri with Rust:** a smaller binary and compiler-enforced safety rules, but two languages. Rejected by the owner.
- **Electron with a Rust core through `napi-rs`:** keeps the Rust rules, but brings the complexity of both stacks.
- **Electron Forge with its webpack plugin:** more configuration than three esbuild entry points need.
- **Jest:** heavier than `node:test`, and needs its own TypeScript transform.

## Consequences

- The app is larger (about 150 MB) and uses more memory than a Tauri build would.
- Rules that Rust enforced at compile time (no network outside sync, no panics) become lint rules and review rules.
- Only erasable TypeScript syntax is allowed, because tests run without a build step.
- Native modules such as `better-sqlite3` need a separate build for Electron and for plain Node.js tests.
- Packaging is not chosen yet. It must turn off the `RunAsNode` and Node.js CLI options fuses.
