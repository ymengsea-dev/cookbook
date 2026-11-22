import { useEffect, useState } from 'react';
import { invoke } from '../shared/ipc/index.ts';
import { Icon } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';

interface PeekPaneProps {
  readonly path: string;
  readonly title: string;
  readonly onOpenNote: (path: string) => void;
  readonly onClose: () => void;
}

/** A read-only look at the selected note beside the list (L-7). Space opens and closes it. */
export function PeekPane({ path, title, onOpenNote, onClose }: PeekPaneProps) {
  const { showError } = useVault();
  const [loaded, setLoaded] = useState<{ path: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke('note_read', { path }).then(
      (note) => {
        if (!cancelled) setLoaded({ path, text: note.content });
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, showError]);

  const text = loaded?.path === path ? loaded.text : '';
  return (
    <aside className="peek" aria-label={`Preview of ${title}`}>
      <header className="peek__header">
        <h2 className="peek__title">{title}</h2>
        <button
          type="button"
          className="button"
          onClick={() => {
            onOpenNote(path);
          }}
        >
          Open
        </button>
        <button type="button" className="icon-button" aria-label="Close preview" title="Close preview" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <hr className="hairline" />
      <pre className="peek__text selectable">{text}</pre>
    </aside>
  );
}
