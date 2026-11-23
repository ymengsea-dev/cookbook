import { useEffect, useState } from 'react';
import { useCommand } from '../shared/commands/index.ts';
import { invoke, type Book } from '../shared/ipc/index.ts';
import { EmptyState, styles } from '../shared/ui/index.ts';
import { jpegDataUrl, progressText } from './bookText.ts';
import { ReaderView } from './ReaderView.tsx';
import { useBooks } from './useBooks.ts';

/** The library (R-2), or the open book. */
export function BooksPage() {
  const { books, reload } = useBooks();
  const [openId, setOpenId] = useState<string | null>(null);
  const importBooks = useCommand('book.import');

  const openBook = books?.find((book) => book.id === openId);
  if (openBook !== undefined) {
    return (
      <ReaderView
        key={openBook.id}
        book={openBook}
        onClose={() => {
          setOpenId(null);
          reload();
        }}
      />
    );
  }

  if (books === null || books.length === 0) {
    return (
      <EmptyState title="No books yet" action="book.import">
        Import PDFs, or drop them on the window. They are copied into the books folder, and the reader remembers the
        page where you stopped.
      </EmptyState>
    );
  }

  return (
    <section className={styles.page}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className={styles.pageTitle}>Books</h1>
          <p className={styles.pageSubtitle}>{books.length === 1 ? '1 book' : `${String(books.length)} books`}</p>
        </div>
        <button type="button" className={styles.primaryButton} disabled={!importBooks.enabled} onClick={importBooks.run}>
          {importBooks.title}
        </button>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(var(--book-cover-width),1fr))] gap-x-6 gap-y-8 m-0 p-0 list-none">
        {books.map((book) => (
          <li key={book.path}>
            <BookCard book={book} onOpen={() => { setOpenId(book.id); }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BookCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  return (
    <button type="button" className="flex flex-col gap-2 w-full p-0 border-0 bg-transparent text-left" onClick={onOpen}>
      <BookCover book={book} />
      <span className="line-clamp-2 text-base font-medium">{book.title}</span>
      <span className="text-ink-secondary text-sm tabular-nums">{progressText(book)}</span>
    </button>
  );
}

function BookCover({ book }: { book: Book }) {
  const [cover, setCover] = useState<string | null>(null);

  useEffect(() => {
    if (!book.hasDetails) return;
    let cancelled = false;
    invoke('book_cover', { id: book.id }).then(
      (bytes) => {
        if (!cancelled) setCover(jpegDataUrl(bytes));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [book.id, book.hasDetails]);

  if (cover === null) {
    return (
      <span className="flex items-end aspect-[3/4] p-3 border border-rule rounded-md bg-surface text-ink-secondary text-sm">
        {book.title}
      </span>
    );
  }
  return <img src={cover} alt="" className="block w-full aspect-[3/4] object-cover object-top border border-rule rounded-md bg-surface" />;
}
