# Notes App: Build plan

This plan breaks [Features detail](Features%20detail.md) into small tasks. Build them in order, one at a time.

## How to use

1. Pick the next unchecked task in the checklist below.
2. Ask Claude: **"Build task T-01 from docs/Milestones.md"**
3. When it's finished and `pnpm check` passes, the box is ticked.

Each task covers one feature only, and is small enough to build in one session.

---

## Checklist

**M0 · Foundation**

- [x] T-00 Project setup and app shell

**M1 · Open and edit a vault**

- [x] T-01 Open a folder as a vault
- [x] T-02 Save, create and delete notes safely
- [x] T-03 Keep front matter exactly as written
- [x] T-04 Give every note a key
- [x] T-05 Notice edits made in other apps
- [x] T-06 Settings files
- [x] T-07 Settings screen
- [x] T-08 Editor basics
- [x] T-09 Live preview and slash menu
- [x] T-10 Autosave

**M2 · Find anything**

- [ ] T-11 Search index
- [ ] T-12 Keep the index up to date
- [ ] T-13 Quick open (⌘P)
- [ ] T-14 Full-text search
- [ ] T-15 Speed test

**M3 · Organize**

- [ ] T-16 Saved views (the engine)
- [ ] T-17 List view
- [ ] T-18 Edit notes from the list
- [ ] T-19 Board view
- [ ] T-20 Drag cards between columns

**M4 · Run code**

- [ ] T-21 Code runner (the engine)
- [ ] T-22 Run button and output
- [ ] T-23 Safety warning and trust

**M5 · Read books**

- [ ] T-24 Import books
- [ ] T-25 PDF reader
- [ ] T-26 Remember the page

**M6 · Move notes in and out**

- [ ] T-27 Import Markdown
- [ ] T-28 Export one note
- [ ] T-29 Export everything as ZIP

**M7 · Make it yours**

- [ ] T-30 Themes and colours
- [ ] T-31 Fonts and layout

**M8 · Sync with Google Drive**

- [ ] T-32 Sync engine (tested without Google)
- [ ] T-33 Sign in with Google
- [ ] T-34 Talk to Google Drive
- [ ] T-35 Sync in the background

**M9 · Extras (only if time allows)**

- [ ] T-36 Attachments and duplicate keys
- [ ] T-37 Custom shortcuts (saved settings)
- [ ] T-38 Editor extras
- [ ] T-39 Search extras
- [ ] T-40 Fast list for 10,000 notes
- [ ] T-41 Move board cards with the keyboard
- [ ] T-42 Reader extras
- [ ] T-43 More import and export formats
- [ ] T-44 CSS snippets and shortcut screen

---

## M1 · Open and edit a vault

> **Goal:** open a folder of notes, edit them here and in another editor, and nothing gets lost or reformatted.

### T-01 · Open a folder as a vault

*Feature: Markdown vault · Spec: V-1, V-2 · Needs first: T-00*

**What you get:** you pick any folder, and its notes appear in the sidebar as a tree. Clicking a note shows its text.

**Steps:**

1. In `vault-core`, add a `Vault` that opens a folder and lists its folders and `.md` files. Skip `.vault/` and hidden files.
2. Add a folder picker with `tauri-plugin-dialog`, and allow it in the capability file.
3. Add the commands `vault_open`, `vault_tree` and `note_read`.
4. Enable the "Open Folder…" button, show the file tree in the sidebar, and show a note's text (read-only for now).

**Check it works:**

- [ ] An existing folder opens and shows its real folder tree.
- [ ] A note's text matches the file on disk exactly.

### T-02 · Save, create and delete notes safely

*Feature: Markdown vault · Spec: V-2, V-6, V-8 · Needs first: T-01*

**What you get:** you can create, rename, move and delete notes, and the app can never leave a half-written file. Deleted notes go to Trash and can be restored.

**Steps:**

1. Add `VaultWriter`. It writes to a temp file, flushes, then renames it over the original.
2. Remember the hash of every file the app writes. Refuse to save if the file changed on disk since it was read.
3. Add create, rename, move and delete. Delete moves the file into `.vault/trash`.
4. Add `trash_list` and `trash_restore`. The Trash page lists deleted notes with a Restore button.
5. Enable the "New Note" button.

**Check it works:**

- [ ] A test that interrupts a save never leaves half a file.
- [ ] Delete then restore gives back the same file at the same place.

### T-03 · Keep front matter exactly as written

*Feature: Markdown vault · Spec: V-3 · Needs first: T-02*

**What you get:** the app can read and change a note's properties (the YAML block at the top) without touching anything else in the file.

**Steps:**

1. Split a note into front matter and body, and read the YAML into typed values.
2. Add `set_property`, which rewrites only that one line. Don't let a YAML library rewrite the whole block, because it would reformat it.
3. Add test files copied from real Obsidian and VS Code notes.

**Check it works:**

- [ ] A note the app didn't change is saved back byte for byte.
- [ ] Changing one property changes exactly one line.

### T-04 · Give every note a key

*Feature: Markdown vault · Spec: V-4, V-5 · Needs first: T-03*

**What you get:** every note gets a permanent ID (`key`), so renaming or moving it never breaks anything. Existing vaults get their keys through an "Adopt vault" step.

**Steps:**

1. Add a ULID `key` to a note's front matter the first time the app saves it.
2. Add "Adopt vault": show which files will get a key, make a backup copy, then add the keys.

**Check it works:**

- [ ] The key stays the same after a rename or move.
- [ ] Adopting a vault changes nothing except adding the `key` line.

### T-05 · Notice edits made in other apps

*Feature: Markdown vault · Spec: V-7 · Needs first: T-04*

**What you get:** if you edit a note in VS Code or Obsidian, the app shows the change within about a second, and never overwrites your work by surprise.

**Steps:**

1. Watch the vault folder (`notify` crate) on a background thread, and send changes to the UI.
2. Ignore changes caused by the app's own saves (compare with the saved hash).
3. If an open note has unsaved edits and also changed on disk, ask which version to keep.

**Check it works:**

- [ ] An edit in another editor appears in about 1 second.
- [ ] A clash with unsaved edits shows the question instead of overwriting.

### T-06 · Settings files

*Feature: Settings · Spec: S-1 to S-5 · Needs first: T-02*

**What you get:** all settings live in readable JSON files, and the app reopens your last vault on launch.

**Steps:**

1. Load and save three files:
   - `app.json` in the app-support folder (known vaults, last vault)
   - `.vault/settings.json` (synced vault settings)
   - `.vault/settings.local.json` (this device only)
2. Write them pretty-printed with a `schemaVersion`. Keep keys the app doesn't know about.
3. Check the values on load. A bad value falls back to its default with a warning, and a broken file is kept as `.bak`.
4. Save through `VaultWriter`, a short moment after each change. Reload when a file changes on disk.

**Check it works:**

- [ ] Deleting `settings.json` brings back the defaults without a crash.
- [ ] Editing the file by hand changes the running app.

### T-07 · Settings screen

*Feature: Settings · Spec: S-6 · Needs first: T-06*

**What you get:** a Settings page that edits the same JSON files. There is no second, hidden store.

**Steps:**

1. Build the Settings page for the settings that exist so far. Appearance comes later, in T-30 and T-31.
2. Read from and write to the T-06 settings files only.

**Check it works:**

- [ ] A change on the screen shows up in the JSON file.
- [ ] A hand edit of the file shows up on the screen.

### T-08 · Editor basics

*Feature: Code editor · Spec: E-2, E-3, E-6 · Needs first: T-02*

**What you get:** a real editor for your notes, with good code blocks and correct typing in every language.

**Steps:**

1. Add CodeMirror 6 in `ui/src/editor/`. Open notes from the file tree, and save with ⌘S through `VaultWriter`.
2. Code blocks: syntax colours from the fence label, line numbers, bracket matching, folding and a copy button.
3. Editing: undo/redo, multiple cursors, find and replace (with regex), move lines, Tab to indent.
4. Test IME typing in Khmer, Chinese, Japanese and Thai inside the app window.

**Check it works:**

- [ ] You can write and save a note with code blocks.
- [ ] Typing Khmer and Japanese with an input method works.

### T-09 · Live preview and slash menu

*Feature: Code editor · Spec: E-1, E-4 · Needs first: T-08*

**What you get:** Markdown looks formatted while you write, like Obsidian. Typing `/` opens a menu to insert blocks.

**Steps:**

1. Live preview for headings, bold, italic, links, lists, tasks, quotes, tables and images. Raw syntax shows only on the line you're editing.
2. A `/` menu that inserts a heading, list, task, table, code block, quote or divider.

**Check it works:**

- [ ] Moving the cursor off a line hides its Markdown marks.
- [ ] Every slash menu item inserts valid Markdown.

### T-10 · Autosave

*Feature: Code editor · Spec: E-5 · Needs first: T-08, T-05*

**What you get:** notes save by themselves, and you can always see whether the current note is saved.

**Steps:**

1. Save after a short pause in typing, and when the editor loses focus.
2. Show a saved or unsaved indicator.
3. If the file changed on disk, use the question from T-05 instead of overwriting.

**Check it works:**

- [ ] Quitting right after typing loses nothing.
- [ ] The indicator always matches the file on disk.

---

## M2 · Find anything

> **Goal:** find any note instantly, in any language, including Khmer and Japanese.

### T-11 · Search index

*Feature: Search · Spec: X-1, X-2 · Needs first: T-04*

**What you get:** a search database built from your notes. You can delete it at any time, and it rebuilds.

**Steps:**

1. Create the crate `vault-index` with SQLite (`rusqlite`, bundled, with FTS5) at `.vault/index/index.db`.
2. Create the tables from `docs/Architecture.md`, and use the trigram tokenizer so languages without spaces work.
3. Rebuild on a background thread with progress, and rebuild by itself when the schema version changes.

**Check it works:**

- [ ] Deleting the index and rebuilding gives the same data.

### T-12 · Keep the index up to date

*Feature: Search · Spec: X-3 · Needs first: T-11, T-05*

**What you get:** the index updates by itself when notes change, without rebuilding everything.

**Steps:**

1. At start, compare each file's modified time and size. Hash it only when those differ.
2. After that, follow the file watcher and the app's own saves, without updating the same note twice.

**Check it works:**

- [ ] Editing one note re-indexes only that note.

### T-13 · Quick open (⌘P)

*Feature: Search · Spec: X-4 · Needs first: T-11*

**What you get:** press ⌘P, type part of a note's name, and press Enter to open it.

**Steps:**

1. Enable the Search command (⌘P).
2. Fuzzy-match titles and paths, and make the whole palette work by keyboard.

**Check it works:**

- [ ] You can open any note by typing part of its title, without the mouse.

### T-14 · Full-text search

*Feature: Search · Spec: X-5, X-6 · Needs first: T-12*

**What you get:** search inside all your notes, with results as you type, highlighted matches and a preview.

**Steps:**

1. Build a search page: live results, highlighted snippets and a preview pane.
2. Add test notes in Khmer, Japanese, Chinese and Thai.

**Check it works:**

- [ ] A word in a language without spaces finds every note that contains it.

### T-15 · Speed test

*Feature: Search · Spec: X-7 · Needs first: T-14*

**What you get:** proof that search stays fast with 10,000 notes.

**Steps:**

1. Write a script that generates a test vault of 10,000 notes.
2. Add `pnpm bench` to measure search time per keystroke and full rebuild time.

**Check it works:**

- [ ] First results arrive in under 50 ms, and a rebuild takes under 30 s, or the report names the slow step.

---

## M3 · Organize

> **Goal:** see notes as a table or a Kanban board, and edit their properties from there.

### T-16 · Saved views (the engine)

*Feature: List view · Spec: L-1, L-3, L-4, L-8 · Needs first: T-11, T-03*

**What you get:** the logic behind list and board views: which notes to show, and how to filter, sort and group them.

**Steps:**

1. Create the crate `vault-views`. A view is a JSON file in `.vault/views/` with a `schemaVersion`.
2. A view's source is a folder, a tag or the whole vault.
3. Add filters (equals, contains, is empty, before/after), sort and group by.
4. Work out property types (text, number, date, checkbox, select, multi-select, URL) from the YAML, and allow overriding them.

**Check it works:**

- [ ] Tests cover every filter and every property type.
- [ ] A view file saves back with unknown keys kept.

### T-17 · List view

*Feature: List view · Spec: L-2, L-7, L-8 · Needs first: T-16*

**What you get:** a table of notes with the columns you choose, which you can pin to the sidebar.

**Steps:**

1. Show notes as rows, with chosen property columns. Save column order and width.
2. Keyboard movement between rows and cells, and a side "peek" pane.
3. Pin a view to the sidebar.

**Check it works:**

- [ ] A pinned view reopens with the same columns, sort and filter after a restart.

### T-18 · Edit notes from the list

*Feature: List view · Spec: L-5, L-6 · Needs first: T-17*

**What you get:** change a property right in the table, or add a new note from the view.

**Steps:**

1. Editing a cell calls `set_property` (from T-03).
2. "New note" creates the note in the view's folder, with the view's filter values filled in.

**Check it works:**

- [ ] Each edit shows up in the file in another editor, with nothing else changed.

### T-19 · Board view

*Feature: Board view · Spec: B-1, B-2, B-3, B-6, B-7 · Needs first: T-16*

**What you get:** a Kanban board where each column is a value of one property, such as `status`.

**Steps:**

1. Columns come from the property's values, in a saved order, plus a "No value" column.
2. Cards show the title and up to three properties.
3. Add, rename, reorder and hide columns. "Add card" creates a note with that column's value.

**Check it works:**

- [ ] Every note appears in the right column.

### T-20 · Drag cards between columns

*Feature: Board view · Spec: B-4, B-5 · Needs first: T-19, T-18*

**What you get:** drag a card to another column, and the note's property changes.

**Steps:**

1. Dropping a card in another column writes the new value into the note.
2. Save the card order inside the view file as a list of keys, so reordering never edits a note.

**Check it works:**

- [ ] Moving a card changes exactly one line in one file.
- [ ] Changing the property by hand moves the card.

---

## M4 · Run code

> **Goal:** run JavaScript, Python and shell code blocks from a note, safely.

### T-21 · Code runner (the engine)

*Feature: Code editor · Spec: E-13, E-14, E-16 · Needs first: T-06*

**What you get:** the Rust side that runs a code block and streams its output, with a time limit.

**Steps:**

1. Create the crate `vault-run`. Read the runners from `settings.local.json`, with Node, Python 3 and shell set up by default.
2. Write the code to a temp file, and run it with the note's folder as the working folder.
3. Stop the program and everything it started after 30 seconds.
4. Add one command, `code_run`, that accepts only configured runners. Show a clear message when an interpreter is missing.

**Check it works:**

- [ ] An endless loop is stopped at the time limit, child processes included.
- [ ] An unknown language label is refused.

### T-22 · Run button and output

*Feature: Code editor · Spec: E-11, E-12 · Needs first: T-21, T-09*

**What you get:** a Run button on code blocks, with live output underneath.

**Steps:**

1. Show a Run button on blocks that have a runner. ⌘↩ runs the block under the cursor.
2. Show the output under the block as it arrives: stdout, stderr, exit code and time.
3. Add Stop and Clear, a size limit and scrolling. Don't start a block again while it's running.

**Check it works:**

- [ ] A JavaScript, a Python and a shell block each run and show their output.

### T-23 · Safety warning and trust

*Feature: Code editor · Spec: E-11, E-15 · Needs first: T-22*

**What you get:** code never runs by surprise, and notes from elsewhere must be trusted first.

**Steps:**

1. On the first run in a vault, warn that code runs with your rights and is not sandboxed.
2. Notes that arrived by sync or import must be trusted once before they can run.
3. Add a test that opening, pasting or importing a note never starts a program.

**Check it works:**

- [ ] The test passes.
- [ ] An untrusted note asks for trust before it runs.

---

## M5 · Read books

> **Goal:** read PDFs in the app and always come back to the right page.

### T-24 · Import books

*Feature: Book reader · Spec: R-1, R-2 · Needs first: T-02*

**What you get:** add PDFs to a library with covers and titles.

**Steps:**

1. Import a PDF from a menu or by dragging. Copy it into `books/`.
2. Read its title, page count and cover.
3. The Books page lists the books, most recently read first.

**Check it works:**

- [ ] An imported book shows the right cover, title and page count.

### T-25 · PDF reader

*Feature: Book reader · Spec: R-3, R-5 · Needs first: T-24*

**What you get:** a calm reading screen with zoom, a table of contents and page thumbnails.

**Steps:**

1. Use PDF.js in `ui/src/reader/`, with scroll or one-page-at-a-time layouts, fit width, fit page and zoom.
2. Draw only the visible pages.
3. Add a table of contents (from the PDF's outline), a thumbnail strip and jump to page.

**Check it works:**

- [ ] A 500-page book scrolls smoothly.
- [ ] Scanned PDFs and PDFs in non-Latin scripts display correctly.

### T-26 · Remember the page

*Feature: Book reader · Spec: R-4, R-6 · Needs first: T-25*

**What you get:** close a book, and it reopens where you stopped.

**Steps:**

1. Save the page and position to `.vault/reader.json` shortly after each page change, and when the book closes.
2. Key the progress by a hash of the PDF, so renaming the file keeps it.

**Check it works:**

- [ ] Read to page 120 of a 300-page book, quit, and reopen on page 120 with the right percent.
- [ ] Renaming the PDF keeps its progress.

---

## M6 · Move notes in and out

> **Goal:** no lock-in. Notes go in and out as plain files, and an import never destroys anything.

### T-27 · Import Markdown

*Feature: Import and export · Spec: IO-1, IO-2, IO-3 · Needs first: T-04*

**What you get:** bring in a folder of Markdown notes, or single files, safely.

**Steps:**

1. Create the crate `vault-io`.
2. Import a folder with its structure and attachments, and fix the links between notes.
3. Import single `.md` and `.txt` files by dragging or picking them.
4. Never overwrite: a name clash gets a number added. Run in the background with progress, and write a report.

**Check it works:**

- [ ] A 500-note folder imports with its links working.
- [ ] Importing the same folder again overwrites nothing.

### T-28 · Export one note

*Feature: Import and export · Spec: IO-4 · Needs first: T-27*

**What you get:** save a note as Markdown with its attachments, or as a single HTML file.

**Steps:**

1. Export as Markdown, with its attachments.
2. Export as one self-contained HTML file.

**Check it works:**

- [ ] The HTML file opens offline in a browser, with its images.

### T-29 · Export everything as ZIP

*Feature: Import and export · Spec: IO-5 · Needs first: T-27*

**What you get:** a ZIP of a folder or the whole vault, as plain files.

**Steps:**

1. Export a folder or the whole vault as a ZIP.
2. Add options to leave out the `key` lines and the `.vault` folder.

**Check it works:**

- [ ] Exporting a vault and importing the ZIP into an empty vault gives the same files.

---

## M7 · Make it yours

> **Goal:** change the look, and keep it after a restart.

### T-30 · Themes and colours

*Feature: UI customization · Spec: U-1, U-4, U-6 · Needs first: T-07*

**What you get:** light, dark or system theme, your own accent colour, and themes you can share as a file.

**Steps:**

1. Add theme (light, dark, system) and accent colour to Settings.
2. A theme is a small JSON file of colour values, and can be imported and exported.
3. Add a contrast check (WCAG AA) for the built-in themes. Keep focus rings and reduced motion.

**Check it works:**

- [ ] Importing a theme file restyles the app at once.
- [ ] The contrast check passes for every built-in theme.

### T-31 · Fonts and layout

*Feature: UI customization · Spec: U-2, U-3, U-5 · Needs first: T-30*

**What you get:** text size, spacing and sidebar options.

**Steps:**

1. Add font size, line height and content width.
2. Add sidebar side and width, show or hide the sidebar and status bar, and compact or comfortable density.
3. Changes apply at once, and each group has "Reset to default".

> ⚠️ **Decide first:** the spec (U-2) asks for separate fonts for the interface, the editor and code, but the design rule is one font. Choose whether users can override the font (the system font stays the default), or drop that part of U-2.

**Check it works:**

- [ ] Changing the accent, font size and sidebar side applies at once and survives a restart.

---

## M8 · Sync with Google Drive

> **Goal:** two Macs edit the same notes offline, reconnect, and no edit is lost.

### T-32 · Sync engine (tested without Google)

*Feature: Google Drive sync · Spec: SY-3, SY-5, SY-6, SY-7, SY-11 · Needs first: T-04*

**What you get:** the sync logic, proven safe with a fake cloud before any real Google code exists.

**Steps:**

1. Create the crate `vault-sync`, with a `RemoteStore` trait.
2. Keep a manifest per file: path, key, last-synced hash, remote ID and version.
3. Follow the sync decision table in `docs/Architecture.md`. When both sides changed, keep both as a conflict copy. Deletes go to the trash on both sides.
4. Never sync the index, `settings.local.json`, trash, the manifest or OS junk files.
5. Build an in-memory fake remote that acts like two devices.

**Check it works:**

- [ ] A test covers every row of the decision table, and no case loses text.

### T-33 · Sign in with Google

*Feature: Google Drive sync · Spec: SY-1 · Needs first: T-32*

**What you get:** sign in with Google in your normal browser, and stay signed in.

**Steps:**

1. OAuth sign-in in the system browser (PKCE, loopback redirect), with only the `drive.file` permission.
2. Store tokens only in the macOS Keychain.

**Check it works:**

- [ ] Sign-in works, and you stay signed in after a restart.
- [ ] No token appears in any file.

### T-34 · Talk to Google Drive

*Feature: Google Drive sync · Spec: SY-2, SY-4, SY-9 · Needs first: T-33*

**What you get:** the vault is mirrored into a folder in your Google Drive.

**Steps:**

1. Create the crate `vault-sync-gdrive`. It is the only crate allowed to use the internet.
2. Create the vault folder in Drive and mirror the folder tree.
3. Download changes with `changes.list` and a saved page token. Upload only changed files.
4. Retry with backoff when offline or rate-limited.
5. Add `cargo deny check bans` to `pnpm check`.

**Check it works:**

- [ ] The first sync uploads the vault, and a change on one side arrives on the other.
- [ ] The internet ban check still passes.

### T-35 · Sync in the background

*Feature: Google Drive sync · Spec: SY-8, SY-10 · Needs first: T-34*

**What you get:** sync runs by itself, and the sidebar shows its status.

**Steps:**

1. Sync at start, shortly after changes and on a timer, and add a "Sync now" action.
2. Show the status in the sidebar: idle, syncing, offline, error or conflicts.
3. Add pause, sign out and disconnect.

**Check it works:**

- [ ] Two vault copies on one Mac edit the same notes offline, reconnect, and every edit survives.

---

## M9 · Extras (only if time allows)

Build these after M1 to M8, in any order.

### T-36 · Attachments and duplicate keys

*Feature: Markdown vault · Spec: V-9, V-10 · Needs first: T-05*

1. Pasted or dropped images and files are copied into an attachments folder and linked by relative path.
2. If two notes have the same key (for example, a note copied in Finder), give the copy a new key.

### T-37 · Custom shortcuts (saved settings)

*Feature: Settings · Spec: S-7 · Needs first: T-06*

1. Save shortcuts in settings as a map from command ID to key.
2. Load them into the command registry when the app starts.

### T-38 · Editor extras

*Feature: Code editor · Spec: E-7, E-8, E-9, E-17 · Needs first: T-22*

1. Table editing: Tab moves between cells, and a toolbar adds and removes rows and columns.
2. Open `.json`, `.py` and `.ts` files in the editor.
3. Keep a 1 MB note smooth while typing.
4. A "Keep output" command saves a run's output into the note.

### T-39 · Search extras

*Feature: Search · Spec: X-8 to X-11 · Needs first: T-14*

1. Search syntax: `tag:`, `path:`, `prop:status=doing` and `-word`.
2. Rank title matches first, then headings, then body text.
3. A global hotkey that opens a small search window from any app.
4. A "Rebuild index" command, with a status line in Settings.

### T-40 · Fast list for 10,000 notes

*Feature: List view · Spec: L-9 · Needs first: T-17*

1. Only draw the visible rows, so 10,000 notes scroll smoothly.

### T-41 · Move board cards with the keyboard

*Feature: Board view · Spec: B-8 · Needs first: T-20*

1. Pick up, move and drop cards with the keyboard.
2. Announce each move to screen readers.

### T-42 · Reader extras

*Feature: Book reader · Spec: R-7 to R-10 · Needs first: T-26, T-35*

1. Reader themes (light, dark, sepia) and default zoom.
2. Find text in a book, and select and copy it.
3. Bookmarks and highlights, saved in `reader.json`.
4. Sync reading progress, where the newest position wins.

### T-43 · More import and export formats

*Feature: Import and export · Spec: IO-6, IO-7, IO-8 · Needs first: T-28*

1. Export a note as PDF.
2. Import a Notion export.
3. Import HTML files as Markdown.

### T-44 · CSS snippets and shortcut screen

*Feature: UI customization · Spec: U-7, U-8 · Needs first: T-31, T-37*

1. Turn CSS files in `.vault/snippets/` on and off, with live reload.
2. A screen for changing keyboard shortcuts.

---

## Later (after v1)

Not planned yet: wikilinks and backlinks, Vim keys, run all blocks, bulk edit, board swimlanes, notes as a book, EPUB, Word files, and Dropbox or WebDAV sync.
