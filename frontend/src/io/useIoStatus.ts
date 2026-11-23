import { useEffect, useState } from 'react';
import { listen, type IoOutcome, type IoProgress } from '../shared/ipc/index.ts';
import { useVault } from '../shared/vault/index.ts';

export interface IoStatus {
  /** The import or export under way, or null. */
  readonly progress: IoProgress | null;
  /** How the last one ended, or null. */
  readonly outcome: IoOutcome | null;
}

/**
 * Follows imports and exports, wherever they were started: a button, the menu or a drop
 * on the window. The app shell holds it, so the Import & Export page shows the last result.
 */
export function useIoStatus(onImported: () => void): IoStatus {
  const { refreshTree, showError } = useVault();
  const [progress, setProgress] = useState<IoProgress | null>(null);
  const [outcome, setOutcome] = useState<IoOutcome | null>(null);

  useEffect(() => {
    const stopProgress = listen('io-progress', setProgress);
    const stopFinished = listen('io-finished', (finished) => {
      setProgress(null);
      setOutcome(finished);
      if (finished.kind === 'imported') {
        void refreshTree();
        onImported();
      }
      if (finished.kind === 'failed') showError(finished.message);
    });
    return () => {
      for (const stopping of [stopProgress, stopFinished]) {
        void stopping.then((stop) => {
          stop();
        });
      }
    };
  }, [refreshTree, showError, onImported]);

  return { progress, outcome };
}
