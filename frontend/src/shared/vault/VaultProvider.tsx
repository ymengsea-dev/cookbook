import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage, type TreeEntry, type VaultChange, type VaultInfo } from '../ipc/index.ts';
import { onVaultChanged, pickVaultFolder, readVaultTree, restoreVault } from './api/vaultApi.ts';

type ChangeListener = (change: VaultChange) => void;

interface VaultContextValue {
  /** The open vault, or null before a folder is chosen. */
  readonly info: VaultInfo | null;
  readonly tree: readonly TreeEntry[];
  /** The last error to show the user, or null. */
  readonly error: string | null;
  readonly chooseVault: () => Promise<void>;
  readonly refreshTree: () => Promise<void>;
  readonly showError: (error: unknown) => void;
  readonly clearError: () => void;
  /** Hears about changes made in other apps. Returns a function that stops listening. */
  readonly subscribeToChanges: (listener: ChangeListener) => () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [tree, setTree] = useState<readonly TreeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const listeners = useRef(new Set<ChangeListener>());

  const showError = useCallback((cause: unknown) => {
    setError(errorMessage(cause));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshTree = useCallback(async () => {
    try {
      setTree(await readVaultTree());
    } catch (cause) {
      showError(cause);
    }
  }, [showError]);

  const chooseVault = useCallback(async () => {
    try {
      const chosen = await pickVaultFolder();
      if (chosen === null) return;
      setInfo(chosen);
      setTree(await readVaultTree());
    } catch (cause) {
      showError(cause);
    }
  }, [showError]);

  // Reopen the vault from last time, if there is one (S-1).
  useEffect(() => {
    let cancelled = false;
    restoreVault().then(
      async (restored) => {
        if (cancelled || restored === null) return;
        setInfo(restored);
        setTree(await readVaultTree());
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [showError]);

  const subscribeToChanges = useCallback((listener: ChangeListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useOutsideChanges((changes) => {
    if (changes.some((change) => change.kind === 'tree')) void refreshTree();
    for (const change of changes) {
      for (const listener of listeners.current) listener(change);
    }
  });

  const value = useMemo(
    () => ({ info, tree, error, chooseVault, refreshTree, showError, clearError, subscribeToChanges }),
    [info, tree, error, chooseVault, refreshTree, showError, clearError, subscribeToChanges],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

/** Listens to the `vault-changed` event for as long as the provider is mounted. */
function useOutsideChanges(onChanges: (changes: VaultChange[]) => void) {
  // Keep the latest handler without re-subscribing on every render.
  const handler = useRef(onChanges);
  useEffect(() => {
    handler.current = onChanges;
  });

  useEffect(() => {
    let stop: (() => void) | undefined;
    let unmounted = false;
    void onVaultChanged((changes) => {
      handler.current(changes);
    }).then((unlisten) => {
      if (unmounted) unlisten();
      else stop = unlisten;
    });
    return () => {
      unmounted = true;
      stop?.();
    };
  }, []);
}

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);
  if (value === null) throw new Error('useVault must be used inside a VaultProvider');
  return value;
}
