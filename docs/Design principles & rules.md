# Notes App: Design principles and rules

Nov 20, 2026 · @Meng Sea

Each principle comes with a rule that a reviewer or the CI can check, so none of them stays a slogan. Part of the Doc.

## Principles and rules

Each principle below comes with a rule that a reviewer or the CI can check, so none of them stays a slogan.

| Principle | Rule | Checked by |
| --- | --- | --- |
| Files are the truth | The vault's `.md` files and the JSON settings, view and theme files are the only user data. The index, manifest and caches are disposable. | A test deletes the index and manifest, rebuilds, and compares results. |
| Never lose a note | Every write goes through one `VaultWriter` (temp file, flush, rename). Deletes go to the trash. Conflicts keep both versions. No code overwrites a file without first checking its hash. | Only `vault-core` may write note files. Crash-injection and property tests cover the writer. |
| Local first | Every feature except sync works offline with no account. | Only `vault-sync-gdrive` may use the network. ESLint `no-restricted-imports` and `no-restricted-globals` ban `node:http`, `node:https`, `node:net`, `undici` and `fetch` elsewhere. The renderer's CSP sets `connect-src 'none'`. |
| Open formats, no lock-in | Notes are Markdown with YAML; settings, views and themes are JSON. Files edited by other tools must load, and unknown keys survive a save. | Round-trip tests: an untouched note is written back byte for byte. Fixtures come from other editors. |
| Simple by default | A new feature needs a half-page note: what it replaces, what it adds to the screen, and why it serves one person on one machine. Anything on the non-goals list is refused. | A checklist in the pull request template. |
| Dependencies point inward | Core packages know nothing about Electron or the UI. The UI knows nothing about disk layout and only calls typed commands. The file system, Google, the clock and token storage sit behind interfaces so tests can fake them. | `dependency-cruiser` checks the package graph in CI. `vault-core` must build and test in plain Node.js, without Electron. |
| One feature, one folder | UI features are vertical slices and talk to each other only through a public `index.ts`. Code moves to `shared` only when a third feature needs it. Modules have one reason to change; functions run about 40 lines and files about 300, and going over needs a reason in review. Prefer composition over inheritance. | `eslint-plugin-boundaries` or `dependency-cruiser` in CI, plus review. |
| Types at every boundary | IPC types live in `ipc-contract`, and the main process validates every payload at runtime. JSON files are validated against a schema on load. Front matter is parsed into typed values. No `any`, and no non-null assertions (`!`) or unchecked casts outside tests. | TypeScript `strict`; ESLint `no-explicit-any`, `no-non-null-assertion` and `no-unsafe-*` rules; schema tests. |
| Errors are handled, not hidden | Core functions return a typed `Result` for expected failures and never throw on user data. Every message to the user says what happened and what to do. A background task that fails shows in the status area. | One discriminated error union per package; a review of user-facing messages. |
| Never block the UI | Scanning, indexing, import, sync and code runs run in a `utilityProcess` or worker thread, never on the main process's event loop. They can be cancelled and report progress. Lists over about 200 rows are virtualized. Performance targets (X-7, L-9) are measured. | A benchmark job in CI. No blocking work in command handlers. |
| Every action is a command | Menus, shortcuts, the palette and buttons all call one command registry by id. That gives rebinding (U-8) and a keyboard-first UI for free. | A button without a registered command fails review. |
| Design tokens and accessibility | No hard-coded colour, spacing or font in components, only CSS variables. Spacing follows a 4 px grid. Colour never carries meaning alone. Everything works by keyboard, with visible focus and screen-reader labels. | A Stylelint rule, a contrast check on themes, and `axe` checks in component tests. |
| Private and least privilege | No telemetry. The renderer runs with `contextIsolation`, `sandbox` and no `nodeIntegration`, and the preload script exposes only the typed command API. The main process accepts only registered command ids and file paths inside the vault. A strict content security policy, sanitised rendered HTML, no `webview` tags, navigation and new windows blocked, and links that open in the default browser. Code runs only when you press Run, never on open, paste or sync, and the list of runners lives in the device-only settings file. Tokens are stored only through `safeStorage`, never in the vault or settings files, and the Drive scope is `drive.file`. | The `BrowserWindow` options and preload API are reviewed at each release, and a CSP test runs in CI. Electron fuses turn off `RunAsNode` and Node.js CLI options in release builds. Another test checks that opening, importing or syncing a note with code blocks never starts a process. |
| Versioned formats | Every stored format has a `schemaVersion`. Migrations only go forward, run on a backup copy and are tested against old fixtures. A file from a newer version opens read-only with a warning. | One fixture per format version in the tests. |
| Test what can hurt | Core logic gets unit and property tests. The sync engine is tested with a fake remote and simulated devices before it ever touches Google. The UI gets component tests and only a few full-app smoke tests. | CI must pass before merge. The target is covered risk, not a coverage percentage. |
| Write decisions down | A significant choice gets a one-page decision record: context, choice, alternatives, consequences. Pull requests stay small and cover one concern, even when you are the only author. | A `docs/adr/` folder and the pull request template. |

## Definition of done for any feature

- Its P0 requirements and its "done when" test pass.
- Tests exist at the right level, the feature works offline, and nothing outside the sync packages uses the network.
- No new hard-coded colours and no action outside the command registry.
- If a stored format changed: a schema version bump, a migration and a decision record.
