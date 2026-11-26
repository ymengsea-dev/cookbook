import type { Book } from '../../shared/ipc/index.ts';
import { percentRead } from './readerLayout.ts';

/** The line under a book in the library: its length and how far you got (R-2). */
export function progressText(book: Book): string {
  if (book.pages === null) return 'Not opened yet';
  const length = book.pages === 1 ? '1 page' : `${String(book.pages)} pages`;
  if (book.lastReadAt === null) return length;
  return `${length} · ${String(percentRead(book.page, book.pages))}% read`;
}

const CHUNK = 0x8000;

/** A `data:` URL for JPEG bytes, or null for none. The CSP allows `data:` images. */
export function jpegDataUrl(bytes: ArrayBuffer): string | null {
  if (bytes.byteLength === 0) return null;
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let start = 0; start < view.length; start += CHUNK) {
    binary += String.fromCharCode(...view.subarray(start, start + CHUNK));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** The PDF's own title, unless it is empty or the placeholder "Untitled". */
export function usableTitle(title: unknown): string | null {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed === '' || /^untitled$/i.test(trimmed)) return null;
  return trimmed;
}
