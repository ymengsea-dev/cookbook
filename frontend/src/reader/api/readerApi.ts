import {
  invoke,
  listen,
  type Book,
  type BookImport,
  type ReaderDataKind,
  type ReadingPosition,
  type UnlistenFn,
} from '../../shared/ipc/index.ts';

/** Rust calls for the Books page and the PDF reader. */

export function listBooks(): Promise<Book[]> {
  return invoke('book_list', {});
}

/** The PDF's raw bytes. */
export function readBook(path: string): Promise<ArrayBuffer> {
  return invoke('book_read', { path });
}

/** JPEG bytes, empty when no cover is cached yet. */
export function readBookCover(id: string): Promise<ArrayBuffer> {
  return invoke('book_cover', { id });
}

export interface BookDetailsUpdate {
  id: string;
  title: string;
  pages: number;
  /** JPEG bytes of the first page. */
  cover: number[];
}

export function saveBookDetails(details: BookDetailsUpdate): Promise<null> {
  return invoke('book_save_details', details);
}

export function saveReadingPosition(id: string, position: ReadingPosition): Promise<null> {
  return invoke('book_save_position', { id, position });
}

/** PDF.js's bundled cMaps and fonts, which it would otherwise `fetch`. */
export function readReaderData(kind: ReaderDataKind, name: string): Promise<ArrayBuffer> {
  return invoke('reader_data', { kind, name });
}

export function onBooksImported(handler: (report: BookImport) => void): Promise<UnlistenFn> {
  return listen('books-imported', handler);
}
