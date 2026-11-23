import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { notePaths, noteTitle, parentFolder, useVault } from '../shared/vault/index.ts';
import { rankNotes } from './fuzzy.ts';
import { MarkedCharacters } from './Highlighted.tsx';

const MAX_RESULTS = 50;

interface QuickOpenProps {
  readonly onOpenNote: (path: string) => void;
  readonly onClose: () => void;
}

/** ⌘P: type part of a note's title or path, then Enter (X-4). Works without the mouse. */
export function QuickOpen({ onOpenNote, onClose }: QuickOpenProps) {
  const { tree } = useVault();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const selectedRow = useRef<HTMLLIElement>(null);

  const notes = useMemo(() => notePaths(tree).map((path) => ({ path, title: noteTitle(path) })), [tree]);
  const results = useMemo(() => rankNotes(query, notes, MAX_RESULTS), [query, notes]);

  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  function open(path: string) {
    onOpenNote(path);
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choice = results[selected];
      if (choice !== undefined) open(choice.path);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  const activeId = results[selected] === undefined ? undefined : `quick-open-${String(selected)}`;
  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center pt-[calc(var(--toolbar-height)+var(--space-10))] bg-[color-mix(in_srgb,var(--ink)_18%,transparent)]"
      onMouseDown={onClose}
    >
      <div
        className="flex flex-col w-[min(560px,calc(100%-2*var(--space-8)))] max-h-[60vh] overflow-hidden border border-rule rounded-lg bg-surface"
        role="dialog" aria-modal="true" aria-label="Open a note" onMouseDown={(event) => { event.stopPropagation(); }}>
        <input
          className="py-4 px-5 border-0 border-b border-rule bg-transparent text-ink font-sans text-md focus-visible:outline-none"
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-open-results"
          aria-activedescendant={activeId}
          placeholder="Type a note's name"
          // The palette exists to be typed into the moment it opens.
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
        />
        {results.length === 0 ? (
          <p className="m-0 py-4 px-5 text-ink-secondary text-sm">No note matches “{query}”.</p>
        ) : (
          <ul id="quick-open-results" className="m-0 p-2 overflow-y-auto list-none" role="listbox" aria-label="Notes">
            {results.map((result, index) => (
              <li
                key={result.path}
                id={`quick-open-${String(index)}`}
                ref={index === selected ? selectedRow : undefined}
                className="flex items-baseline gap-3 py-2 px-3 rounded-sm cursor-default aria-selected:bg-selected"
                role="option"
                aria-selected={index === selected}
                onMouseDown={() => { open(result.path); }}
                onMouseMove={() => { setSelected(index); }}
              >
                <span className="truncate">
                  <MarkedCharacters text={result.title} positions={result.titlePositions} />
                </span>
                <span className="ml-auto whitespace-nowrap text-ink-secondary text-sm">{parentFolder(result.path) ?? 'Vault root'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
