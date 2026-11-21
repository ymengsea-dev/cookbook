# Notes App: Architecture and data design

Nov 20, 2026 · @Meng Sea

The vault folder on disk is the only source of truth. The index, the sync manifest and all UI state can be deleted and rebuilt from it. Part of the Doc, which also holds the system diagram.

## System layout

The vault folder on disk is the only source of truth. The index, the sync manifest and all UI state can be deleted and rebuilt from it.

The UI reaches the core only through typed commands and events, and the core reads and writes the vault folder. Only the Drive adapter talks to anything outside your machine, apart from programs you choose to run from a code block. The system diagram is on the summary page.

## Technology

The app is built with Electron, and everything is written in TypeScript.

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron |
| Language | TypeScript (`strict`) in every package and process |
| UI | React |
| Editor | CodeMirror 6 |
| Index and search | SQLite with FTS5 through `better-sqlite3` |
| PDF reader | PDF.js |
| File watcher | `@parcel/watcher` or `chokidar` |
| Validation | JSON Schema for stored files; runtime validation of every IPC payload |
| Token storage | Electron `safeStorage` (encryption key held in the macOS Keychain) |

## Process model

Electron runs three kinds of process. Each has one job.

| Process | Runs | May access |
| --- | --- | --- |
| Main | The core packages, the command handlers, windows, menus, the global hotkey and token storage | Node.js and the file system |
| Background (`utilityProcess` or worker threads) | Scanning, indexing, import, export, sync and code runs | Node.js and the file system; reports progress to main |
| Renderer | The React UI only | Nothing but the API that the preload script exposes |

The renderer is locked down: `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true`. The preload script exposes one typed API through `contextBridge`: invoke a command by id, and subscribe to events. The main process validates every incoming payload before it handles it, and rejects any command id that is not registered.

## TypeScript workspace

The code is a pnpm workspace of small packages. Dependencies point one way only, and only one package may touch the network.

| Package | Responsibility | May depend on |
| --- | --- | --- |
| `vault-core` | Notes, front matter, paths, atomic writes, trash, settings files, reader progress, file-watcher events | Node.js standard modules only: no Electron, no network |
| `vault-index` | SQLite schema, indexing, full-text and property queries | `vault-core` |
| `vault-views` | View files and the filter, sort and group engine. Property edits go back through `vault-core` | `vault-core`, `vault-index` |
| `vault-io` | Import and export | `vault-core` |
| `vault-run` | Finds the runner for a code block's label, writes the code to a temporary file, starts the process with a time limit, and streams its output. Contains no HTTP client | `vault-core` |
| `vault-sync` | Sync engine, manifest, conflict rules and the `RemoteStore` interface | `vault-core` |
| `vault-sync-gdrive` | Google Drive adapter for `RemoteStore`. The only package that opens network connections | `vault-sync` |
| `ipc-contract` | Command ids, payload and result types, event types and their runtime validators. Shared by main, preload and renderer | Nothing |
| `app` | Electron main process and preload script: command handlers, events, global hotkey, token storage, windows. Wires the packages together | All of the above |
| `ui` | The React renderer | `ipc-contract` only |

## UI structure

The React code in `ui` is split by feature, one folder each: `editor`, `views` (list and board), `reader`, `search`, `sync` and `settings`. Shared parts live in `shared/ui` (components and design tokens) and `shared/commands` (the command registry). A feature may import from `shared` and from another feature's public `index.ts`, and from nothing else.

## Vault on disk

```text
MyVault/
  Inbox/Meeting notes.md
  Projects/Website/Plan.md
  attachments/diagram.png
  books/Example Book.pdf
  .vault/
    settings.json          synced
    settings.local.json    this device only
    views/website-board.json   synced
    themes/night.json      synced
    snippets/tweaks.css    synced
    reader.json            synced
    trash/                 this device only
    index/index.db         this device only, rebuildable
    sync/manifest.json     this device only
```

App-level settings (known vaults, last vault) sit outside the vault, in the macOS app-support folder, as `app.json`.

## Example files

**A note.** Only `key` is added by the app; every other key belongs to you.

```markdown
---
key: 01JD8Y3N6Q4F9K2V7R5T0W1XZB
status: doing
tags: [project, web]
due: 2026-12-01
---
# Website plan

Draft the landing page copy first.
```

**A board view.** Card order lives here, not in the notes.

```json
{
  "schemaVersion": 1,
  "id": "website-board",
  "type": "board",
  "source": { "folder": "Projects/Website", "recursive": true },
  "filter": [{ "property": "archived", "op": "isNot", "value": true }],
  "sort": [{ "property": "due", "dir": "asc" }],
  "board": {
    "groupBy": "status",
    "columns": ["todo", "doing", "done"],
    "cardProperties": ["due", "tags"],
    "cardOrder": { "doing": ["01JD8Y3N6Q4F9K2V7R5T0W1XZB"] }
  }
}
```

**The vault settings file.**

```json
{
  "schemaVersion": 1,
  "appearance": { "theme": "system", "accent": "#4f7cff", "density": "comfortable" },
  "fonts": { "ui": "system-ui", "editor": "Inter", "code": "JetBrains Mono", "size": 16, "lineHeight": 1.6 },
  "layout": { "sidebarSide": "left", "sidebarWidth": 260 },
  "editor": { "lineNumbers": false, "autosaveMs": 800 },
  "reader": { "theme": "sepia", "zoom": "fit-width", "layout": "scroll" },
  "sync": { "provider": "gdrive", "intervalMinutes": 5 },
  "shortcuts": { "quickOpen": "Mod-p" }
}
```

## Index tables

The index file holds one set of rows per note key. Deleting it loses nothing.

| Table | Holds |
| --- | --- |
| `notes` | One row per key: path, title, modified time, size, content hash |
| `props` | Note key, property name, type, value. Drives list and board views and `prop:` search |
| `tags` | Note key and tag |
| `notes_fts` | FTS5 text index over title, headings and body, using a trigram tokenizer so no-space languages are searchable, plus a word-based table for ranking |

## How data moves

- **Saving a note.** The UI sends the text to the core after a short pause. The core writes it atomically, remembers the new file hash so the watcher ignores its own write, updates the index and tells the UI.
- **An outside edit.** The watcher reports a change. If the hash is not one the app wrote, the core re-indexes the note and tells the UI. If that note is open with unsaved edits, the UI asks which version to keep.
- **A property edit.** Moving a card or editing a list cell sends a `setProperty` command. The core rewrites only that front matter line, then follows the save path.
- **Sync.** It runs beside the UI path. It compares each file with the manifest and the remote copy. Every local write it makes goes through `vault-core`, so the index stays correct.

## Sync decisions

Each file is compared with the manifest, which records the hash from the last successful sync. Notes are matched across devices by `key`, not by path, so a rename on one side and an edit on the other can be applied together.

| Local file | Remote file | Action |
| --- | --- | --- |
| Unchanged | Unchanged | Nothing |
| Changed | Unchanged | Upload |
| Unchanged | Changed | Download |
| Changed | Changed, same content | Record the new hash; nothing to transfer |
| Changed | Changed, different content | Keep both: save the remote version as a conflict copy, keep the local file, notify you |
| Deleted | Unchanged | Move the remote file to the Drive trash |
| Unchanged | Deleted | Move the local file to `.vault/trash` |
| Deleted | Changed | Keep the changed remote file and restore it locally |
| Changed | Deleted | Keep the local file and upload it again |
