import { useCallback, useEffect, useState } from 'react';
import { invoke, listen, type Book } from '../shared/ipc/index.ts';
import { useVault } from '../shared/vault/index.ts';
import { closePdf, openPdf, readDetails } from './pdf.ts';

interface BooksState {
  /** Most recently read first, or null while loading (R-2). */
  readonly books: readonly Book[] | null;
  readonly reload: () => void;
}

/** The library. Books without a title, page count or cover get them in the background (R-1). */
export function useBooks(): BooksState {
  const { info, showError } = useVault();
  const [books, setBooks] = useState<readonly Book[] | null>(null);
  // Books whose details failed once, so a broken PDF isn't opened again and again.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  const reload = useCallback(() => {
    invoke('book_list', {}).then(setBooks, showError);
  }, [showError]);

  useEffect(() => {
    if (info === null) return;
    reload();
    const stopListening = listen('books-imported', () => {
      reload();
    });
    return () => {
      void stopListening.then((stop) => {
        stop();
      });
    };
  }, [info, reload]);

  const next = books?.find((book) => !book.hasDetails && !failed.has(book.id));
  useEffect(() => {
    if (next === undefined) return;
    let cancelled = false;
    fillDetails(next).then(
      () => {
        if (!cancelled) reload();
      },
      () => {
        if (!cancelled) setFailed((known) => new Set([...known, next.id]));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [next, reload]);

  return { books, reload };
}

async function fillDetails(book: Book): Promise<void> {
  const doc = await openPdf(book.path);
  try {
    const details = await readDetails(doc);
    await invoke('book_save_details', {
      id: book.id,
      title: details.title ?? book.title,
      pages: details.pages,
      cover: Array.from(details.cover),
    });
  } finally {
    closePdf(doc);
  }
}
