# Notes App: Architecture and data design

Nov 20, 2026 · @Meng Sea

The vault folder on disk is the only source of truth. The index, the sync manifest and all UI state can be deleted and rebuilt from it. Part of the Doc, which also holds the system diagram.

## System layout

The vault folder on disk is the only source of truth. The index, the sync manifest and all UI state can be deleted and rebuilt from it.

The UI reaches the core only through typed commands and events, and the core reads and writes the vault folder. Only the Drive adapter talks to anything outside your machine, apart from programs you choose to run from a code block. The system diagram is on the summary page.

## Rust workspace

The core is a Cargo workspace of small crates. Dependencies point one way only, and only one crate may touch the network.

| Crate | Responsibility | May depend on |
| --- | --- | --- |
| `vault-core` | Notes, front matter, paths, atomic writes, trash, settings files, reader progress, file-watcher events | Standard libraries only: no Tauri, no network |
| `vault-index` | SQLite schema, indexing, full-text and property queries | `vault-core` |
| `vault-views` | View files and the filter, sort and group engine. Property edits go back through `vault-core` | `vault-core`, `vault-index` |
| `vault-io` | Import and export | `vault-core` |
| `vault-run` | Finds the runner for a code block's label, writes the code to a temporary file, starts the process with a time limit, and streams its output. Contains no HTTP client | `vault-core` |
| `vault-sync` | Sync engine, manifest, conflict rules and the `RemoteStore` trait | `vault-core` |
| `vault-sync-gdrive` | Google Drive adapter for `RemoteStore`. The only crate that opens network connections | `vault-sync` |
| `app` | Tauri shell: commands, events, global hotkey, Keychain, windows. Wires the crates together | All of the above |

## UI structure

The React code is split by domain, one folder each: `editor`, `views` (list and board), `reader`, `search`, `settings`, `io` (import and export) and `shell` (the app frame), with `sync` to come. Each domain uses the same folders:

| Folder | Holds |
| --- | --- |
| `index.ts` | The domain's public entry. Other domains import only this. |
| `api/` | One plain function per Rust command or event. The only place that calls `invoke` or `listen`; it mirrors `app/src/commands/`. |
| `pages/` | Full screens. |
| `components/` | Pieces of those screens. |
| `hooks/` | `use*` files and React context providers. |
| `logic/` | Pure functions, the ones with unit tests. No React and no Rust calls. |

Code used by three or more domains lives in `shared/`: `ipc` (typed `invoke`/`listen` and the generated types), `ui` (components and style class lists), `commands` (the command registry), `vault`, `settings` and `appearance`. ESLint enforces the domain boundaries, the `api/` rule and the purity of `logic/`.

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
    cache/covers/          this device only, rebuildable (book covers)
    imports/               this device only (one report per import)
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
  "name": "Website board",
  "type": "board",
  "source": { "kind": "folder", "folder": "Projects/Website", "recursive": true },
  "filter": [{ "property": "archived", "op": "isNot", "value": "true" }],
  "sort": [{ "property": "due", "dir": "asc" }],
  "groupBy": null,
  "columns": [],
  "propertyTypes": { "due": "date" },
  "pinned": true,
  "board": {
    "groupBy": "status",
    "columns": ["todo", "doing", "done"],
    "hidden": [],
    "cardProperties": ["due", "tags"],
    "cardOrder": { "doing": ["01JD8Y3N6Q4F9K2V7R5T0W1XZB"] }
  }
}
```

The source is `{ "kind": "vault" }`, a folder as above, or `{ "kind": "tag", "tag": "web" }`. Filter values are text, read by the property's type. The "No value" column is `""`. `groupBy` and `columns` at the top level belong to the list view.

**The vault settings file.** `appearance.theme` is light, dark or system, and `appearance.colors` names a built-in theme (`paper`, `linen`) or a file in `.vault/themes/`. One font for the whole app: `fonts.family` is null for the system font.

```json
{
  "schemaVersion": 1,
  "appearance": { "theme": "system", "colors": "paper", "accent": null, "density": "comfortable" },
  "fonts": { "family": null, "size": 15, "lineHeight": 1.5 },
  "layout": { "contentWidth": 1040, "sidebarSide": "left", "sidebarWidth": 232, "showSidebar": true, "showStatusBar": true },
  "editor": { "lineNumbers": false, "autosaveMs": 800 },
  "reader": { "theme": "sepia", "zoom": "fit-width", "layout": "scroll" },
  "sync": { "provider": "gdrive", "intervalMinutes": 5 },
  "shortcuts": { "quickOpen": "Mod-p" }
}
```

**A theme file** in `.vault/themes/<id>.json`. Colours are `#rrggbb` only; any left out keep Paper's.

```json
{
  "schemaVersion": 1,
  "name": "Night Owl",
  "light": { "accent": "#3f6f7a" },
  "dark": { "paper": "#101418", "surface": "#181d22", "ink": "#e8e6e1", "accent": "#7fb0ba" }
}
```

**The device-only settings file.** `codeRun` holds the code runners (E-14) and what this Mac has agreed to run (E-15). Leave out `runners` to get Node, Python 3 and shell. A `command` without a `/` is looked up on the PATH, then in `/opt/homebrew/bin` and `/usr/local/bin`. Sync and import add the keys of the notes they bring in to `untrustedNotes`.

```json
{
  "schemaVersion": 1,
  "lastNote": "Projects/Website/Plan.md",
  "codeRun": {
    "timeLimitSeconds": 30,
    "runners": [
      { "name": "Node", "labels": ["js", "javascript", "node"], "command": "node", "args": [], "extension": "js" },
      { "name": "Python 3", "labels": ["python", "py", "python3"], "command": "python3", "args": ["-u"], "extension": "py" },
      { "name": "Shell", "labels": ["sh", "shell", "bash"], "command": "/bin/bash", "args": [], "extension": "sh" }
    ],
    "warningAccepted": true,
    "untrustedNotes": ["01JD8Y3N6Q4F9K2V7R5T0W1XZB"]
  }
}
```

**The reader file.** One entry per book, keyed by a BLAKE3 hash of the PDF's size, first 64 KB and last 64 KB, so renaming or moving the PDF keeps its progress (R-6). `page` counts from 1, and `position` is how far down that page, from 0 to 1. The app sets only these keys and keeps the rest.

```json
{
  "schemaVersion": 1,
  "books": {
    "9f2c…e41a": { "title": "Deep Work", "pages": 300, "page": 120, "position": 0.25, "lastReadAt": 1763900000000 }
  }
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
- **A property edit.** Moving a card or editing a list cell sends a `set_property` command. The core rewrites only that front matter line, then follows the save path.
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
