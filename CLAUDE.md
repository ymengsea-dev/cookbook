# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Needs Rust >= 1.90, Node >= 22.16 and pnpm (pinned in `package.json`). Use pnpm only.

```sh
pnpm install
pnpm dev          # tauri dev: esbuild serves the UI on :1420, Rust rebuilds on change
pnpm build        # tauri build: release .app and .dmg in target/release/bundle/
pnpm test         # cargo test --workspace (regenerates TS bindings) + pnpm test:ui
pnpm typecheck    # tsc over frontend/src
pnpm lint         # ESLint, then clippy with -D warnings
pnpm fmt          # cargo fmt --all
pnpm check        # fmt check + test + typecheck + lint
pnpm gen:types    # only regenerate TS bindings from Rust
pnpm bench        # search speed test on 10,000 generated notes (X-7)
pnpm sync:commands  # update build.rs and the capability file from main.rs

# One crate / one test
cargo test -p vault-core
cargo test -p vault-core notes_are_not_internal

# Network ban (cargo-deny is not installed by default)
cargo install --locked cargo-deny && cargo deny check bans
```

## Tooling constraints

- Do not add Vite, Vitest, Vue, Rspack/Rsbuild, Rolldown or other Chinese-origin tooling (owner's requirement). The UI bundler is esbuild (`scripts/build.mjs`), styles are built by the Tailwind v4 CLI from the same script (no PostCSS), and the UI is React. Tauri's templates assume Vite. Do not run `create-tauri-app` or copy its Vite config.
- TypeScript is pinned to `~6.0` because `typescript-eslint` does not support 7.x yet.
- `rust-version` is 1.90. Resolver v3 picks crate versions that fit it, so raise it when a dependency needs a newer Rust.
- `tauri-specta` is still a release candidate for Tauri 2, so IPC types are generated with `ts-rs`. `#[ts(export)]` types are written to `frontend/src/shared/ipc/bindings/` (set in `.cargo/config.toml`) whenever `cargo test` runs. Commit the generated files.

## Layout

- `backend/vault-core`: the vault, with no Tauri and no network. One file per topic:
  - `vault.rs`: open and read.
  - `vault_path.rs`: `VaultPath`, the only path type; it can never leave the vault.
  - `writer.rs`: `VaultWriter`, which does atomic writes and remembers their hashes.
  - `notes.rs`: save, create, rename, move, delete. Every write checks the expected hash.
  - `trash.rs`, `front_matter.rs` (line-based YAML edits), `keys.rs` (ULID keys and adopt vault), `watcher.rs` (outside changes), `settings/` (JSON files, unknown keys kept).
  - Books: `books.rs` (import into `books/`, every PDF in the vault, `BookId` fingerprint), `reader.rs` (`.vault/reader.json` details and progress; covers cached in `.vault/cache/covers/`), `library.rs` (the Books list, most recently read first).

- `backend/vault-index`: the SQLite search index in `.vault/index/index.db`, a disposable cache.
  - `extract.rs` (title, headings, tags, properties, body), `schema.rs` (tables and `SCHEMA_VERSION`; a mismatch rebuilds the DB), `index.rs` (`NoteIndex`: sync by modified time and size, then hash), `search.rs` (FTS5 trigram, plus a LIKE scan for terms under 3 characters).
  - `examples/bench.rs` is `pnpm bench`.

- `backend/vault-views`: saved list and board views.
  - `definition.rs` (the view file types), `store.rs` (`.vault/views/<id>.json`; unknown keys kept on save), `values.rs` (type inference, L-4), `filter.rs`, `engine.rs` (`run_view`: source, filter, sort, group), `board.rs` (columns and card order), `actions.rs` (new note, move card, rename column; note writes go through `vault-core`).
  - Views read notes from the index (`NoteIndex::notes`), not from the files.

- `backend/vault-run`: runs code blocks (E-11 to E-16). No Tauri, no network.
  - `config.rs` (runners and time limit from `settings.local.json`), `locate.rs` (finds the program; a Finder-launched app has a short PATH), `trust.rs` (the first-run warning and untrusted notes), `run.rs` (`start`: runner, then `Consent`, then the program), `program.rs` (own process group, time limit, Stop, streamed output), `output.rs` (UTF-8 across chunks, 256 KB limit).
  - Only `app` may depend on it (`deny.toml`), so import and sync can never run code.

  Add the other crates from `docs/Architecture.md` under `backend/` when their feature starts.
- `backend/app`: the Tauri shell.
  - `src/commands/`: one file per area. Commands return `CommandResult<T>` (`error.rs`) and run slow file work with `spawn_blocking`.
  - `state.rs`: the open vault, its watcher, and the asset-protocol scope (the vault folder only).
  - `events.rs`: event names sent to the UI.
  - `indexing.rs`: `Indexer`, a background thread that keeps the index in sync and sends `index-progress`, then `index-updated` when anything changed. Every command that writes a note calls `state.request_index_sync()`; open views run again on `index-updated`.
  - `lifecycle.rs`: closing the window or pressing ⌘Q waits for the UI to save, up to 3 s, and stops running code.
  - `book_drop.rs`: PDFs dropped on the window are imported in Rust, then `books-imported` is sent. `commands/books.rs` also serves PDF.js its bundled cMaps and fonts (`reader_data`, from `bundle.resources`).
  - `consent.rs`: the native "not sandboxed" and "trust this note" dialogs, shown from Rust so the UI can't answer them. `runs.rs`: code runs in progress, for `code_stop`.
  - `tauri.conf.json` holds the window, CSP and bundle settings; `capabilities/default.json` is generated.
- `frontend/`: the React UI. `index.html` is copied to `dist/`, `src/main.tsx` is bundled there, and Tailwind builds `src/app.css` into `dist/renderer.css`.
  - `src/shell/`: the app frame (sidebar, file tree, flat toolbar, section pages, trash, adopt card). The window uses `titleBarStyle: Overlay`, so the top 52 px of the sidebar and toolbar is a `data-tauri-drag-region` and must stay clear for the window buttons.
  - `src/editor/`: CodeMirror 6.
    - `NoteView` loads a note; `useNoteSaver` runs autosave, conflicts and outside changes.
    - `NoteEditor` wraps the CodeMirror view.
    - `setup/` holds the extensions: live preview, tables, code blocks, slash menu, front matter, theme.
    - `run/` holds running code: `codeRun.ts` (Run buttons, ⌘↩, output panels in a state field), `runWidgets.ts`, `useCodeRunner.ts` (calls `code_run` and streams its `Channel` into the panel). Pure logic in `codeFence.ts` and `runPanel.ts`.
  - `src/search/`: ⌘P quick open (`QuickOpen`, fuzzy titles in `fuzzy.ts`) and the Search page (full text through `search_notes`).
  - `src/views/`: list and board views. `useOpenView` holds the open view and reruns it on `index-updated`; `ViewsProvider` holds the list for the sidebar. Board drag uses pointer events, not HTML drag and drop (Tauri can intercept it). Pure logic in `values.ts`, `grid.ts`, `board.ts`. Class lists the list, board and settings share are in `styles.ts`.
  - `src/reader/`: the Books page and the PDF reader (PDF.js). `pdf.ts` opens books with worker fetch and wasm off, so nothing needs `fetch` or `wasm-unsafe-eval`; `scripts/build.mjs` copies the worker and the plain-JS image decoders to `dist/pdfjs/`. `PageStack` draws only on-screen pages; `useReadingPosition` saves progress. Pure logic in `readerLayout.ts` and `bookText.ts`.
  - `src/settings/`: the Settings page.
  - `src/shared/`:
    - `ipc` (typed `invoke`/`listen`, generated `bindings/`)
    - `vault` (open vault, tree, errors, outside-change subscription)
    - `settings` (settings context with debounced saves)
    - `commands` (the user-action registry: `CommandId`, `useCommand`; commands whose feature doesn't exist yet stay `enabled: false`)
    - `ui` (shared components, and `styles.ts`: class lists for buttons, pages, rows and cards, plus `classNames`)
    - `lifecycle.ts` (work to finish before quitting)
- UI tests: `node:test` files (`*.test.ts`) in `frontend/tests/`, in the same folders as the code they test under `frontend/src/`, run by `pnpm test:ui`. They run through Node's type stripping, so the UI allows only erasable TypeScript syntax (no `enum`, `namespace` or parameter properties), and test files add `/// <reference types="node" />`. Keep testable logic in plain `.ts` files (see `textDiff.ts`, `slashItems.ts`, `imagePath.ts`).
- Workspace lints in `Cargo.toml` forbid `unsafe` and deny `unwrap_used`, `expect_used` and `panic`. `clippy.toml` allows them in tests; integration tests in `tests/` add `#![allow(clippy::unwrap_used)]`.
- Writes and saving rules:
  - Saving text that equals the file writes nothing, so untouched notes stay byte for byte.
  - The first real editor save adds a `key`.
  - `set_note_property` never adds a key, so a property edit changes exactly one line.

### UI style

Warm editorial look: warm paper and ink neutrals, muted data colours, one accent (rust) action per view, hairline rules instead of cards, and a flat toolbar on the paper. Use **one font family only** (`--font`, the system font). Build hierarchy from size and weight (`--text-*`, `--weight-*`), never from a second typeface. Use `tabular-nums` for numbers. Every colour, size and space comes from a token in `frontend/src/app.css`, and every colour token has a dark-mode value.

Styling uses Tailwind utility classes in `className`; `frontend/src/app.css` is the only stylesheet. It holds the tokens on `:root` (plain CSS variables, also read by the CodeMirror theme in `editor/setup/theme.ts`), maps them to Tailwind names in `@theme` (`bg-paper`, `text-ink-secondary`, `text-sm`, `font-medium`, `rounded-md`), and removes Tailwind's default scales, so a utility exists only for a token. The spacing scale is the 4 px grid (`p-4` is `--space-4`). Layout sizes use the variable syntax, such as `w-(--sidebar-width)`. Preflight is left out: styles build on browser defaults. When a class list repeats, put it in a `styles.ts` constant rather than `@apply`, and never put two utilities for the same property in one list. CodeMirror's own elements are styled in `theme.ts`, not with classes.

### Adding a command

1. Write the `#[tauri::command]` in `backend/app/src/commands/<area>.rs` and register it in `generate_handler!` in `main.rs`. Argument and return types derive `Serialize`/`Deserialize` and `TS` with `#[ts(export)]`.
2. Run `pnpm sync:commands`. It updates `build.rs` and `capabilities/default.json` from `main.rs`; without it the call fails with a permission error.
3. Run `pnpm test` to regenerate the TypeScript bindings, then add the command to `CommandMap` in `frontend/src/shared/ipc/index.ts`. UI code calls `invoke` and `listen` from there. ESLint blocks `@tauri-apps/api/core` and `/event` anywhere else.

## Specs

The specs are the source of truth. Read them before implementing anything:

- `docs/Features detail.md`: features 1 to 10, with requirement IDs (`V-`, `S-`, `E-`, `X-`, `L-`, `B-`, `R-`, `IO-`, `U-`, `SY-`), priorities and "done when" tests.
- `docs/Architecture.md`: crate layout, vault layout on disk, example files, index tables, data flow and the sync decision table.
- `docs/Milestones.md`: build order as tasks `T-00`…`T-44`. When asked to build a task, check its **Needs first** tasks are ticked, build only its steps, make every "Check it works" item pass, then tick its box in the checklist once `pnpm check` passes.

Cite requirement IDs in commits and PRs. **P0** = required for v1, **P1** = in v1 if time allows, **P2** = after v1. Don't build P2 items unless asked.

## Code style

Write code that a junior engineer or an intern can read, change and maintain without help.

- **Readable over short.** Choose clear, beginner-friendly code over clever or compressed code. Use descriptive names, small steps and plain control flow. Name a value instead of nesting calls, and use an early return instead of a deep `if`. Avoid one-liners that pack in several ideas, chained ternaries, and macro or type tricks.
- **Well structured.** One file, one topic. One function, one job. Group code by feature, keep related code together, and keep public APIs small. Follow the existing folder layout. Don't add new top-level patterns.
- **Short comments.** A comment is a dev note of one to three lines, never a paragraph that retells the code. Explain *why* (a constraint, a spec ID, a gotcha), not *what*: the names already say what. Doc comments on public items are one or two lines.
- **Software design principles:**
  - Single responsibility, and separation of concerns.
  - KISS: the simplest design that meets the spec.
  - YAGNI: build only what the current requirement needs.
  - DRY: remove repetition once the same logic appears three times, not before.
  - Composition over inheritance.
  - Depend on traits or interfaces at boundaries (file system, clock, network), so tests can use fakes.
  - Make invalid states unrepresentable with types: enums and newtypes in Rust, unions in TypeScript.
  - Fail loudly with typed errors instead of hiding problems.

## What is being built

A local-first notes app for macOS for one person. It uses Tauri 2, a Rust core and a React + TypeScript UI. Notes are plain Markdown files with YAML front matter, stored in a folder the user picks (the "vault"). Every feature works offline except optional Google Drive sync.

## Architecture rules that span multiple files

- **The vault folder is the only source of truth.** The SQLite index (`.vault/index/index.db`), the sync manifest and all UI state are disposable caches that can be rebuilt from the files.
- **Notes are identified by front matter `key` (a ULID), not by path.** The index, board card order and sync matching all use the key, so renames and moves keep identity.
- **Every note write goes through `VaultWriter` in `vault-core`:** temp file, flush, rename. No other crate writes note files. The writer records the hash it wrote so the file watcher ignores the app's own writes. Never overwrite a file without checking its hash. Deletes go to `.vault/trash`.
- **Preserve what you don't own.** Front matter edits rewrite only the changed line and keep other keys, their order and the body. JSON files keep unknown keys. An untouched note must round-trip byte for byte.
- **Crate dependencies point one way.** `vault-core` uses no Tauri and no network. `vault-index`, `vault-views`, `vault-io`, `vault-run` and `vault-sync` build on it. `vault-sync-gdrive` is the only crate that may use an HTTP client (`deny.toml`, checked by `cargo-deny`). `app` is the Tauri shell that wires them together.
- **The file system, Google, the clock and the Keychain sit behind traits** so tests can fake them. The sync engine talks only to the `RemoteStore` trait and is tested against an in-memory fake that simulates two devices.
- **The UI calls the core only through typed Tauri commands and events.** IPC types are generated from Rust. The UI knows nothing about disk layout, and never uses the network: the CSP allows only `ipc:`, and ESLint bans `fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource`.
- **Least privilege:** capabilities grant only the commands and plugins in use, and file-system access covers only the vault folder. Never widen the CSP or a capability to make a feature work.
- **UI features are vertical slices:** `editor`, `views`, `reader`, `search`, `sync` and `settings`. A feature imports only from `shared/ui`, `shared/commands` and another feature's public `index.ts`. Code moves to `shared` only when a third feature needs it.
- **Every user action is a command in one registry** (`shared/commands`), called by id from menus, shortcuts, the palette and buttons. A button without a registered command fails review.
- **Synced vs device-only:** `.vault/settings.json`, views, themes, snippets and `reader.json` sync. `.vault/settings.local.json` (window state, code runners), trash, the index, `.vault/cache/` and the manifest never sync. App-level settings are in `app.json` in the macOS app-support folder.
- **Every stored format has a `schemaVersion`.** Migrations only go forward, run on a backup copy and need a fixture per version. A file from a newer version opens read-only.

## Code-running safety (`vault-run`)

Code blocks run with the user's rights and no sandbox. Runs start only when the user presses Run or Cmd+Enter. Nothing may run on open, paste, sync or import, and a test must check this. The UI may start programs only through one Rust command that accepts only the runners listed in `settings.local.json`. Do not add the Tauri shell plugin. Notes that arrive by sync or import must be trusted once before their blocks can run. Each run has a time limit (30 s by default) that kills the process tree.

## Conventions enforced in review and CI

- Rust: no `unwrap()`, `expect()` or `panic!` outside tests. Use one typed error enum per crate, and never panic on user data.
- TypeScript: `strict`, no `any`. UI feature boundaries (`eslint-plugin-boundaries` or `dependency-cruiser`) are not set up yet.
- Styling: no hard-coded colour, spacing or font, only token utilities on the 4 px spacing grid. Arbitrary values (`[...]`) only wrap tokens, such as `bg-[color-mix(in_srgb,var(--rust)_12%,var(--paper))]`. Colour never carries meaning alone, and components need `axe` checks.
- Functions run about 40 lines and files about 300. Going over needs a reason.
- Slow work (scanning, indexing, import, sync, code runs) runs on background threads, can be cancelled and reports progress. Command handlers never block: use `async` commands or `tauri::async_runtime::spawn_blocking`. Lists over about 200 rows are virtualized.
- Text input and search must handle no-space scripts (Khmer, Chinese, Japanese, Thai). The FTS5 index uses a trigram tokenizer.
- No telemetry. Drive scope is `drive.file`, and OAuth tokens live only in the macOS Keychain.
- A stored-format change needs a schema bump and a migration.
