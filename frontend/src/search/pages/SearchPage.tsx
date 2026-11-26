import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { SearchHit } from '../../shared/ipc/index.ts';
import { EmptyState, styles } from '../../shared/ui/index.ts';
import { parentFolder, readNote, useVault } from '../../shared/vault/index.ts';
import { searchNotes } from '../api/searchApi.ts';
import { MarkedTerms, Snippet } from '../components/Highlighted.tsx';

const MAX_RESULTS = 50;

/** Search inside every note: results as you type, highlighted snippets and a preview (X-5). */
export function SearchPage({ onOpenNote }: { onOpenNote: (path: string) => void }) {
  const { info, showError } = useVault();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  // Each keystroke starts a search; only the answer to the latest one is shown.
  const latestSearch = useRef(0);

  async function search(text: string) {
    const ticket = ++latestSearch.current;
    try {
      const found = await searchNotes(text, MAX_RESULTS);
      if (ticket !== latestSearch.current) return;
      setHits(found);
      setSelected(0);
    } catch (cause) {
      showError(cause);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      const hit = hits[selected];
      if (hit !== undefined) onOpenNote(hit.path);
    } else if (event.key === 'Escape') {
      setQuery('');
      void search('');
    }
  }

  if (info === null) {
    return (
      <EmptyState title="Search" action="vault.open">
        Open a folder of notes to search inside all of them at once.
      </EmptyState>
    );
  }

  const terms = query.split(/\s+/).filter((term) => term !== '');
  const current = hits[selected];
  return (
    <section className="flex flex-1 flex-col w-full min-h-0 max-w-(--page-max-width) mx-auto pt-2 px-10 pb-0">
      <input
        // The border carries the focus state, so the ring isn't doubled. Escape clears the field,
        // and the browser's clear button doesn't match the theme.
        className="py-3 px-4 border border-rule rounded-md bg-surface text-ink font-sans text-lg appearance-none focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-accent focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
        type="search"
        aria-label="Search all notes"
        placeholder="Search all notes"
        // The page exists to be typed into the moment it opens.
        autoFocus
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          void search(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <p className="my-3 mx-0 text-ink-secondary tabular-nums" role="status">
        {resultLabel(query, hits.length)}
      </p>
      <div className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8 min-h-0">
        <ul className="m-0 p-0 overflow-y-auto border-t border-rule list-none" aria-label="Results">
          {hits.map((hit, index) => (
            <li key={hit.path}>
              <button
                type="button"
                className="flex flex-col gap-1 w-full py-3 px-2 border-0 border-b border-rule bg-transparent text-left hover:bg-hover aria-[current=true]:bg-selected"
                aria-current={index === selected ? 'true' : undefined}
                onClick={() => { setSelected(index); }}
                onDoubleClick={() => { onOpenNote(hit.path); }}
              >
                <span className="font-medium">{hit.title}</span>
                <span className="text-ink-secondary text-sm">{parentFolder(hit.path) ?? 'Vault root'}</span>
                <span className="text-ink-secondary text-sm wrap-anywhere">
                  <Snippet text={hit.snippet} />
                </span>
              </button>
            </li>
          ))}
        </ul>
        {current !== undefined && <SearchPreview key={current.path} hit={current} terms={terms} onOpenNote={onOpenNote} />}
      </div>
    </section>
  );
}

interface SearchPreviewProps {
  readonly hit: SearchHit;
  readonly terms: readonly string[];
  readonly onOpenNote: (path: string) => void;
}

function SearchPreview({ hit, terms, onOpenNote }: SearchPreviewProps) {
  const { path } = hit;
  const { showError } = useVault();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readNote(path).then(
      (note) => {
        if (!cancelled) setText(note.content);
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, showError]);

  return (
    <aside className="flex flex-col min-h-0" aria-label="Preview">
      <div className="flex items-center justify-between gap-4 pb-3">
        <h2 className="m-0 text-lg font-regular">{hit.title}</h2>
        <button type="button" className={styles.button} onClick={() => { onOpenNote(path); }}>
          Open
        </button>
      </div>
      <hr className={styles.hairline} />
      {text !== null && (
        <p className={`${styles.selectable} flex-1 m-0 pt-4 px-0 pb-8 overflow-y-auto whitespace-pre-wrap wrap-anywhere`}>
          <MarkedTerms text={text} terms={terms} />
        </p>
      )}
    </aside>
  );
}

function resultLabel(query: string, count: number): string {
  if (query.trim() === '') return 'Type to search inside every note. Works for languages written without spaces too.';
  if (count === 0) return `No notes contain “${query.trim()}”.`;
  const notes = count === 1 ? '1 note' : `${String(count)} notes`;
  return count === MAX_RESULTS ? `Showing the first ${notes}` : notes;
}
