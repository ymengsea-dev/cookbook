import { useEffect, useState } from 'react';
import { listen, type IndexProgress } from '../shared/ipc/index.ts';

const numberFormat = new Intl.NumberFormat();

/** "Indexing 120 of 10,000" in the sidebar while the search index catches up. */
export function IndexStatus() {
  const [progress, setProgress] = useState<IndexProgress | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let unmounted = false;
    void listen('index-progress', (update) => {
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
    <p className="index-status" role="status">
      Indexing {numberFormat.format(progress.done)} of {numberFormat.format(progress.total)}
    </p>
  );
}
