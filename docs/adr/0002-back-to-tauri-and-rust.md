# 0002: Back to Tauri and Rust

Nov 22, 2026 · Accepted · Supersedes [0001](0001-electron-typescript-esbuild.md)

## Context

ADR 0001 moved the app to Electron with a Node.js backend. The first build showed what that costs: Electron ships its own Chromium and Node.js, so the app is about 150 MB, and every window starts several processes that use much more memory than a Tauri app. For a notes app that stays open all day, the owner decided that cost is too high.

## Decision

Return to the original design in `docs/Architecture.md`:

- **Shell:** Tauri 2, using the macOS system WebView (WKWebView).
- **Core:** a Cargo workspace of small crates in `crates/`. Workspace lints forbid `unsafe` and deny `unwrap`, `expect` and `panic` outside tests.
- **IPC:** Tauri commands. Each command is declared in `build.rs` and granted in a capability file. Types are generated from Rust with `ts-rs`, because `tauri-specta` is not yet stable for Tauri 2.
- **Network ban:** `deny.toml` for `cargo-deny`, limited to macOS targets.

These parts of 0001 stay:

- pnpm as the package manager.
- esbuild as the UI bundler, and React with TypeScript (`strict`) for the UI. Tauri's templates assume Vite, which the owner does not want, so the UI is built by `scripts/build.mjs`.
- ESLint with `typescript-eslint`, and TypeScript pinned to `~6.0`.

## Consequences

- The app is a few MB and uses the system WebView, so memory use is much lower.
- The safety rules are compiler and lint checks again: clippy lints, crate boundaries and `cargo-deny`.
- Two languages: Rust for the core, TypeScript for the UI.
- WKWebView is not Chromium. UI code targets Safari 16 or later, and PDF.js and CodeMirror must be tested in WKWebView.
- The Electron scaffold is removed. It stays in git history at commit `7ae70f8`.
