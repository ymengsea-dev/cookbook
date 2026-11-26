import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ViewDefinition, ViewKind, ViewSource } from '../../shared/ipc/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { createSavedView, listViews } from '../api/viewsApi.ts';

interface ViewsContextValue {
  /** Every saved view, sorted by name. */
  readonly views: readonly ViewDefinition[];
  readonly refreshViews: () => Promise<void>;
  /** Creates a view and returns it, or null when it failed (the error is shown). */
  readonly createView: (name: string, kind: ViewKind, source: ViewSource) => Promise<ViewDefinition | null>;
}

const ViewsContext = createContext<ViewsContextValue | null>(null);
const NO_VIEWS: readonly ViewDefinition[] = [];

/** The saved views of the open vault, for the sidebar and the views page (L-8). */
export function ViewsProvider({ children }: { children: ReactNode }) {
  const { info, showError } = useVault();
  const [views, setViews] = useState<readonly ViewDefinition[]>([]);
  const root = info?.root ?? null;

  const refreshViews = useCallback(async () => {
    try {
      setViews(await listViews());
    } catch (cause) {
      showError(cause);
    }
  }, [showError]);

  useEffect(() => {
    if (root === null) return;
    let cancelled = false;
    listViews().then(
      (loaded) => {
        if (!cancelled) setViews(loaded);
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [root, showError]);

  const createView = useCallback(
    async (name: string, kind: ViewKind, source: ViewSource) => {
      try {
        const created = await createSavedView(name, kind, source);
        await refreshViews();
        return created;
      } catch (cause) {
        showError(cause);
        return null;
      }
    },
    [refreshViews, showError],
  );

  // A different vault has different views; never show the old vault's list.
  const shown = root === null ? NO_VIEWS : views;
  const value = useMemo(() => ({ views: shown, refreshViews, createView }), [shown, refreshViews, createView]);
  return <ViewsContext.Provider value={value}>{children}</ViewsContext.Provider>;
}

export function useViews(): ViewsContextValue {
  const value = useContext(ViewsContext);
  if (value === null) throw new Error('useViews must be used inside a ViewsProvider');
  return value;
}
