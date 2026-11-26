import { invoke, listen, type BookImport, type UnlistenFn } from '../../shared/ipc/index.ts';

/** Rust calls behind the File menu's import and export commands (`commands/io.rs`, `commands/books.rs`). */

/** Opens a native picker; progress arrives as io events. */
export function importFolder(): Promise<null> {
  return invoke('io_import_folder', {});
}

export function importFiles(): Promise<null> {
  return invoke('io_import_files', {});
}

export function exportNoteMarkdown(path: string): Promise<null> {
  return invoke('note_export_markdown', { path });
}

export function exportNoteHtml(path: string): Promise<null> {
  return invoke('note_export_html', { path });
}

/** Opens a native picker; the result arrives as `books-imported`. */
export function importBooks(): Promise<null> {
  return invoke('book_import', {});
}

export function onBooksImported(handler: (report: BookImport) => void): Promise<UnlistenFn> {
  return listen('books-imported', handler);
}
