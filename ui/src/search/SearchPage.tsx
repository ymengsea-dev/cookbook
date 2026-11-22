import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { invoke, type SearchHit } from '../shared/ipc/index.ts';
import { EmptyState } from '../shared/ui/index.ts';
import { parentFolder, useVault } from '../shared/vault/index.ts';
import { MarkedTerms, Snippet } from './Highlighted.tsx';
import './search.css';

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
      const found = await invoke('search_notes', { query: text, limit: MAX_RESULTS });
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
    <section className="search-page">
      <input
        className="search-page__input"
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
      <p className="search-page__count" role="status">
        {resultLabel(query, hits.length)}
      </p>
      <div className="search-page__columns">
        <ul className="search-page__results" aria-label="Results">
          {hits.map((hit, index) => (
            <li key={hit.path}>
              <button
                type="button"
                className="search-hit"
                aria-current={index === selected ? 'true' : undefined}
                onClick={() => { setSelected(index); }}
                onDoubleClick={() => { onOpenNote(hit.path); }}
              >
                <span className="search-hit__title">{hit.title}</span>
                <span className="search-hit__folder">{parentFolder(hit.path) ?? 'Vault root'}</span>
                <span className="search-hit__snippet">
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
    invoke('note_read', { path }).then(
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
    <aside className="search-preview" aria-label="Preview">
      <div className="search-preview__header">
        <h2 className="search-preview__title">{hit.title}</h2>
        <button type="button" className="button" onClick={() => { onOpenNote(path); }}>
          Open
        </button>
      </div>
      <hr className="hairline" />
      {text !== null && (
        <p className="search-preview__text selectable">
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
