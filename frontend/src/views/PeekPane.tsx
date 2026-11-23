import { useEffect, useState } from 'react';
import { invoke } from '../shared/ipc/index.ts';
import { Icon, styles } from '../shared/ui/index.ts';
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
    <aside className="flex flex-none flex-col w-(--peek-width) min-h-0" aria-label={`Preview of ${title}`}>
      <header className="flex items-center gap-2 pb-3">
        <h2 className="flex-1 m-0 truncate text-lg font-regular">{title}</h2>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            onOpenNote(path);
          }}
        >
          Open
        </button>
        <button type="button" className={styles.iconButton} aria-label="Close preview" title="Close preview" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <hr className={styles.hairline} />
      <pre className={`${styles.selectable} flex-1 m-0 pt-3 overflow-y-auto font-sans whitespace-pre-wrap wrap-anywhere`}>{text}</pre>
    </aside>
  );
}
