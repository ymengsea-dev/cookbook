import { useCallback, useEffect, useState } from 'react';
import type { TrashEntry } from '../../shared/ipc/index.ts';
import { EmptyState, styles } from '../../shared/ui/index.ts';
import { noteTitle, parentFolder, useVault } from '../../shared/vault/index.ts';
import { listTrash, restoreFromTrash } from '../api/notesApi.ts';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Deleted notes and folders, newest first, each with a Restore button. */
export function TrashPage() {
  const { info, refreshTree, showError } = useVault();
  const [entries, setEntries] = useState<readonly TrashEntry[] | null>(null);

  const loadTrash = useCallback(async () => {
    try {
      setEntries(await listTrash());
    } catch (cause) {
      showError(cause);
    }
  }, [showError]);

  useEffect(() => {
    if (info === null) return;
    let cancelled = false;
    listTrash().then(
      (loaded) => {
        if (!cancelled) setEntries(loaded);
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [info, showError]);

  async function restore(entry: TrashEntry) {
    try {
      await restoreFromTrash(entry.id);
      await Promise.all([loadTrash(), refreshTree()]);
    } catch (cause) {
      showError(cause);
    }
  }

  if (info === null || entries === null || entries.length === 0) {
    return (
      <EmptyState title="Trash is empty">
        Deleted notes stay here until you empty the trash, so you can always restore them.
      </EmptyState>
    );
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.pageTitle}>Trash</h1>
      <p className={styles.pageSubtitle}>
        {entries.length === 1 ? '1 deleted item' : `${String(entries.length)} deleted items`}
      </p>
      <ul className={styles.rows}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.rowsRow}>
            <div className={styles.rowsMain}>
              <span className={styles.rowsName}>{noteTitle(entry.path)}</span>
              <span className={styles.rowsDetail}>
                {parentFolder(entry.path) ?? 'Vault root'} · {dateFormat.format(entry.deletedAt)}
              </span>
            </div>
            <button type="button" className={styles.button} onClick={() => { void restore(entry); }}>
              Restore
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
