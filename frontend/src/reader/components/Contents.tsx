import { useEffect, useState } from 'react';
import { classNames } from '../../shared/ui/index.ts';
import type { PDFDocumentProxy } from '../pdf/pdf.ts';

/** One line of the PDF's outline, the book's table of contents (R-5). */
interface OutlineEntry {
  readonly title: string;
  readonly dest: unknown;
  readonly items: readonly OutlineEntry[];
}

interface ContentsProps {
  readonly doc: PDFDocumentProxy;
  readonly onPick: (page: number) => void;
}

export function Contents({ doc, onPick }: ContentsProps) {
  const [entries, setEntries] = useState<readonly OutlineEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    doc.getOutline().then(
      (outline: unknown) => {
        if (!cancelled) setEntries(toEntries(outline));
      },
      () => {
        if (!cancelled) setEntries([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [doc]);

  async function pick(entry: OutlineEntry) {
    const page = await destinationPage(doc, entry.dest);
    if (page !== null) onPick(page);
  }

  if (entries === null) return null;
  if (entries.length === 0) {
    return <p className="m-0 p-4 text-ink-secondary text-sm">This book has no table of contents.</p>;
  }
  return <EntryList entries={entries} depth={0} onPick={(entry) => { void pick(entry); }} />;
}

function EntryList({ entries, depth, onPick }: { entries: readonly OutlineEntry[]; depth: number; onPick: (entry: OutlineEntry) => void }) {
  return (
    <ul className={classNames('m-0 list-none', depth === 0 ? 'py-2 px-0' : 'p-0 pl-4')}>
      {entries.map((entry, index) => (
        <li key={`${String(index)}-${entry.title}`}>
          <button
            type="button"
            className="block w-full py-1 px-3 border-0 rounded-sm bg-transparent text-left text-sm hover:bg-hover"
            onClick={() => { onPick(entry); }}
          >
            {entry.title}
          </button>
          {entry.items.length > 0 && <EntryList entries={entry.items} depth={depth + 1} onPick={onPick} />}
        </li>
      ))}
    </ul>
  );
}

// PDF.js types the outline loosely, so each level is checked before use.
function toEntries(value: unknown): OutlineEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: OutlineEntry[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const title = 'title' in item && typeof item.title === 'string' ? item.title : '';
    const dest = 'dest' in item ? item.dest : null;
    const items = 'items' in item ? toEntries(item.items) : [];
    entries.push({ title, dest, items });
  }
  return entries;
}

/** The page (from 1) an outline entry points at, or null if it points nowhere. */
async function destinationPage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  const explicit: unknown = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(explicit)) return null;
  const target: unknown = explicit[0];
  if (typeof target === 'number') return target + 1;
  if (isPageRef(target)) return (await doc.getPageIndex(target)) + 1;
  return null;
}

function isPageRef(value: unknown): value is { num: number; gen: number } {
  return typeof value === 'object' && value !== null && 'num' in value && 'gen' in value && typeof value.num === 'number' && typeof value.gen === 'number';
}
