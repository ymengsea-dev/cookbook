import { useEffect, useState } from 'react';
import type { IndexProgress } from '../../../shared/ipc/index.ts';
import { onIndexProgress } from '../../api/appApi.ts';

const numberFormat = new Intl.NumberFormat();

/** "Indexing 120 of 10,000" in the sidebar while the search index catches up. */
export function IndexStatus() {
  const [progress, setProgress] = useState<IndexProgress | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let unmounted = false;
    void onIndexProgress((update) => {
      setProgress(update.done < update.total ? update : null);
    }).then((unlisten) => {
      if (unmounted) unlisten();
      else stop = unlisten;
    });
    return () => {
      unmounted = true;
      stop?.();
    };
  }, []);

  if (progress === null) return null;
  return (
    <p className="m-0 pl-2 text-ink-secondary text-sm tabular-nums" role="status">
      Indexing {numberFormat.format(progress.done)} of {numberFormat.format(progress.total)}
    </p>
  );
}
