# Notes App: Feature Summary

Nov 22, 2026 · @Meng Sea

This document combines Features 1 to 10 into one summary. It explains what each feature is for, what v1 must deliver, and how we know it is done. Every point carries its requirement ID (for example `V-4`), so commits, pull requests and tests can refer to it.

**Priorities:** **P0** = required for v1. **P1** = in v1 if time allows. **P2** = after v1.

## Product goal

A local-first notes app for one person on macOS. Notes are plain Markdown files in a folder you own. Every feature works offline with no account, apart from the optional sync. The app must never lose or silently rewrite your data, and files must stay usable in other tools such as VS Code and Obsidian.

## Feature overview

| # | Feature | Purpose | Main crate / UI folder |
| --- | --- | --- | --- |
| 1 | Markdown vault | Store notes as plain `.md` files in a normal folder | `vault-core` |
| 2 | JSON settings | Keep all settings in readable, versioned JSON files | `vault-core` / `settings` |
| 3 | Code editor | Write Markdown with live preview, and run code blocks | `vault-run` / `editor` |
| 4 | Note keys, index and search | Find any note instantly, in any language | `vault-index` / `search` |
| 5 | List view | See notes as a table of properties | `vault-views` / `views` |
| 6 | Board view | See notes as a Kanban board | `vault-views` / `views` |
| 7 | Book reader | Read PDFs and resume where you stopped | `vault-core` / `reader` |
| 8 | Import and export | Move notes in and out with no lock-in | `vault-io` |
| 9 | UI customization | Adjust theme, fonts and layout without a theme store | `shared/ui` / `settings` |
| 10 | Google Drive sync | Mirror the vault to your own Drive with no lost edits | `vault-sync`, `vault-sync-gdrive` / `sync` |

---

## 1. Markdown vault

**Goal:** Any folder of Markdown files is a vault. The files on disk are the only source of truth, and the app must never damage them.

**v1 must deliver (P0):**

- Open any folder as a vault, with no import step (V-1). One note is one `.md` file, and folders in the app are real folders on disk (V-2).
- Keep YAML front matter intact. The app writes only the keys it owns and preserves every other key, its order and the body (V-3).
- Give each note a stable `key` (a ULID) the first time it is saved. The key survives rename and move (V-4). Existing vaults get keys in bulk through an "adopt vault" step with a preview and a backup (V-5).
- Write atomically: temp file, flush, rename (V-6). Deletes go to `.vault/trash` and can be restored (V-8).
- Show outside edits within about one second. If a note with unsaved edits changes on disk, ask the user instead of overwriting (V-7).

**If time allows (P1):** copy pasted images into an attachments folder (V-9). Detect duplicate keys and re-key the copy (V-10).
**Later (P2):** `[[wikilinks]]` and backlinks (V-11).

**Done when:** the app opens an existing folder of notes, you edit in this app and in another editor, and nothing is lost or reformatted.

## 2. Settings stored as JSON

**Goal:** All settings live in three readable JSON files, each with one job. There is no hidden settings database.

**v1 must deliver (P0):**

- `app.json` in the macOS app-support folder holds app-level settings. `.vault/settings.json` holds vault settings and syncs. `.vault/settings.local.json` holds device-only state, such as window size and code runners, and never syncs (S-1).
- Files are pretty-printed and carry a `schemaVersion` (S-2). Unknown keys survive a save, so an older version never erases newer settings (S-3).
- Validate against a JSON Schema on load. A bad value falls back to its default with a warning, and the broken file is kept as `.bak` (S-4).
- Saves are atomic and debounced. A hand edit in another editor reloads live (S-5). The settings screen edits these same files (S-6).

**If time allows (P1):** shortcuts stored as a map from command id to key, so every command can be rebound (S-7).

**Done when:** deleting `settings.json` restores the defaults without a crash, and a hand edit changes the running app.

## 3. Code editor

**Goal:** A full day of note-taking, code included, without another editor. Built on CodeMirror 6, with Obsidian-style live preview and runnable code blocks.

**v1 must deliver (P0):**

- Live preview for common Markdown. Raw syntax shows only on the line being edited (E-1).
- Code blocks behave like a code editor: highlighting from the fence label, line numbers, bracket matching, folding and copy (E-2).
- Editing basics: undo/redo, multiple cursors, find and replace with regex, line moves, Tab indent (E-3). A `/` slash menu inserts common blocks (E-4).
- Autosave after a pause and on blur, with a saved/unsaved indicator (E-5).
- IME and complex scripts (Khmer, Chinese, Japanese, Thai) work correctly, with a font fallback chain (E-6).
- **Running code:**
  - A block whose label has a configured runner shows a Run button. Cmd+Enter runs the block under the cursor. Nothing runs on open, paste, sync or import (E-11).
  - Output streams into a panel under the block, with Stop and Clear (E-12). Each run has a time limit, 30 s by default, that kills the process tree (E-13).
  - Runners are defined in `settings.local.json`. Node, Python 3 and shell are set up by default (E-14).
  - The first run shows a warning that code is not sandboxed. A note from sync or import must be trusted once before it can run (E-15).
  - Code runs from a temp file, with the note's folder as the working directory, through one Rust command that accepts only configured runners (E-16).

**If time allows (P1):** table editing (E-7), opening `.json`/`.py`/`.ts` files (E-8), responsive 1 MB notes (E-9), and a "keep output" command (E-17).
**Later (P2):** Vim keybindings and wrap toggle (E-10), and "run all blocks" (E-18).

**Done when:** a JavaScript, a Python and a shell block each run from a note and show their output, and an endless loop is stopped by the time limit.

## 4. Note keys, index and global search

**Goal:** Find any note instantly, including in languages written without spaces. The index is a disposable cache built from the files.

**v1 must deliver (P0):**

- One index record per note `key`: title, path, headings, tags, properties, body, size and modified time (X-1).
- The index lives in `.vault/index/index.db`. It never syncs, can be deleted at any time, and rebuilds when its schema changes (X-2).
- Incremental updates compare modified time and size, then hash. The app's own writes never trigger a re-index loop (X-3).
- A quick-open palette (Cmd+P) with fuzzy matching, fully keyboard driven (X-4).
- Full-text search with live results, highlighted snippets and a preview pane (X-5). No-space languages work through a trigram tokenizer or word segmenter (X-6).
- **Performance targets (benchmarked):** first results within 50 ms of each keystroke, and a full rebuild of 10,000 notes in under 30 s on an M1 Pro (X-7).

**If time allows (P1):** query syntax (`tag:`, `path:`, `prop:status=doing`, `-term`) (X-8), ranking by title, then headings, then body (X-9), a user-set global hotkey that opens a floating search window and does not collide with Cmd+Space (X-10), and a rebuild command with a status line (X-11).

**Done when:** you delete the index, relaunch, and get the same results. A Khmer or Japanese word finds the notes that contain it.

## 5. List view

**Goal:** See and edit notes as a table of their front matter properties, like a Notion table without formulas or relations.

**v1 must deliver (P0):**

- The source is a folder (with or without subfolders), a tag or the whole vault (L-1). Rows are notes and columns are chosen properties. Column order and width are saved (L-2).
- Sort, filter (equals, contains, is empty, before/after) and group by a property (L-3).
- Property types (text, number, date, checkbox, select, multi-select, URL) are inferred from YAML and can be overridden (L-4).
- Edits in a cell write to that note's front matter atomically, with other keys untouched (L-5).
- A new note from a view lands in its folder with the view's filter values pre-filled (L-6). Full keyboard navigation and a side peek pane (L-7).
- Views are saved as JSON in `.vault/views/` and can be pinned to the sidebar (L-8).

**If time allows (P1):** virtualized rows so 10,000 notes scroll smoothly (L-9).
**Later (P2):** bulk edit and move (L-10).

**Done when:** 200 notes with a `status` property can be sorted, filtered and edited from the list, and each edit appears in the file in another editor.

## 6. Board view

**Goal:** A Kanban board on the same engine as the list view. Columns are the values of one select property, and cards are notes.

**v1 must deliver (P0):**

- Same sources, filters and properties as the list view. The one extra setting is the column property (B-1).
- Columns come from the property's values, in a saved order, plus a "No value" column (B-2). Cards show the title and up to three properties (B-3).
- Dragging a card to another column writes the new value into that note's front matter (B-4).
- Card order is stored in the view file as a list of keys, so reordering never edits a note (B-5). Missing keys are ignored, and new notes go to the bottom (B-7).
- Add, rename, reorder and hide columns. "Add card" creates a note with that column's value (B-6).

**If time allows (P1):** keyboard drag and drop with screen-reader announcements (B-8).
**Later (P2):** swimlanes (B-9).

**Done when:** moving a card changes exactly one line in one note file, and the same change made by hand moves the card.

## 7. Book reader

**Goal:** Read PDF books in a calm view inside the app and always resume where you stopped. Progress and highlights live beside the PDF, never inside it.

**v1 must deliver (P0):**

- Import a PDF by menu or drag. It is copied into `books/`, and its title, page count and cover are read (R-1).
- A library shows the cover, title, page count and progress, sorted by last read (R-2).
- PDF.js renders the book with scroll or single-page layout and fit width, fit page and zoom. Only visible pages are drawn, so 500 pages stay smooth (R-3).
- Progress (page and position) is saved shortly after every page change and on close. Quitting loses at most a few seconds (R-4).
- Table of contents from the PDF outline, a thumbnail strip, and jump to page (R-5).
- Progress is stored in `.vault/reader.json`, keyed by a hash of the PDF, so rename and move keep it (R-6).

**If time allows (P1):** reader themes and defaults (R-7), find and copy text (R-8), bookmarks and highlights in `reader.json` (R-9), and progress synced, with the newer position winning (R-10).
**Later (P2):** reading notes as a book (R-11), and EPUB (R-12).

**Done when:** you import a 300-page PDF, read to page 120, quit, and reopen on page 120 with the correct percent shown. Scanned and non-Latin PDFs display correctly.

## 8. Import and export

**Goal:** No lock-in. Notes come in and go out as plain files, and imports never destroy anything.

**v1 must deliver (P0):**

- Import a Markdown folder with its structure, attachments and fixed links. It runs in the background with progress and a skipped-items report (IO-1). Single `.md`/`.txt` files can be dropped or picked (IO-2).
- Imports never overwrite. Name clashes get a numeric suffix, and every import writes a report (IO-3).
- Export a note as Markdown with attachments, or as self-contained HTML (IO-4).
- Export a folder or the whole vault as a ZIP of plain files, optionally without `key` and `.vault` (IO-5).

**If time allows (P1):** PDF export (IO-6), Notion export import (IO-7), and HTML import (IO-8).
**Later (P2):** `.docx` import and export (IO-9).

An Obsidian vault needs no importer: open it (V-1) and adopt it (V-5).

**Done when:** a 500-note folder imports with its links intact, and a vault exported to ZIP and imported into an empty vault gives an identical tree.

## 9. UI customization

**Goal:** A small, clear set of appearance controls stored in JSON and CSS, not a theme store.

**v1 must deliver (P0):**

- Light, dark or system theme, plus an accent colour (U-1).
- Separate UI, editor and code fonts, plus size, line height and content width (U-2).
- Sidebar side and width, show/hide of the sidebar and status bar, and compact or comfortable density (U-3).
- Every colour, spacing step and radius is a CSS variable. A theme is a small JSON file of token values that can be imported and exported (U-4).
- Changes apply live, and each group has "reset to default" (U-5).
- Built-in themes meet WCAG AA, respect reduced motion and show focus rings (U-6).

**If time allows (P1):** toggleable CSS snippets in `.vault/snippets/` (U-7), and a shortcut rebinding screen (U-8).

**Done when:** accent, font and sidebar changes apply instantly and survive a restart, and a shared theme JSON loads on another machine.

## 10. Google Drive sync

**Goal:** Mirror the vault to a folder in your own Google Drive, with no server or account of ours, and never lose an edit.

A zero-code alternative already works: keep the vault inside a Google Drive for desktop folder (it relies on V-7). In-app sync is worth building only for in-app status, conflict handling and control.

**v1 must deliver (P0):**

- Google sign-in in the system browser: OAuth installed-app flow with PKCE, a loopback redirect and the `drive.file` scope. Tokens live only in the macOS Keychain (SY-1).
- One app-created Drive folder mirrors the vault tree (SY-2).
- A local manifest records, per file: path, key, last-synced hash, Drive file id and version (SY-3). Pull uses `changes.list` with a saved page token, push sends only changed files, and the first sync is a full scan (SY-4).
- If both sides changed, keep both: the remote version becomes a named conflict copy and you are notified (SY-5). Deletes go to the trash on both sides (SY-6).
- Never synced: `.vault/index/`, `settings.local.json`, `.vault/trash`, the manifest and OS junk files. Settings, views and snippets do sync (SY-7).
- Runs in the background at start, after changes and on a timer, with "Sync now" and a status indicator (SY-8). Fully usable offline, with queued retries, backoff and respect for rate limits (SY-9). Pause, sign out or disconnect (SY-10).
- The engine talks only to a `RemoteStore` trait and is tested against an in-memory fake that simulates two devices (SY-11).

**Later (P2):** Dropbox and WebDAV through the same trait (SY-12).

**Limit to know:** with `drive.file`, the app sees only files it created. A file dragged into the Drive folder in the browser is invisible to sync.

**Done when:** two devices, or two vault copies on one Mac, edit the same notes offline and reconnect, and every edit survives, either merged by file or kept as a conflict copy.
