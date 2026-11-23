import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { invoke, type SettingsSnapshot, type VaultSettings } from '../ipc/index.ts';
import { useVault } from '../vault/index.ts';

/** Changes are saved this long after the last edit, so a slider drag writes once (S-5). */
const SAVE_DELAY_MS = 300;

interface SettingsContextValue {
  /** The open vault's settings, or null while loading or with no vault. */
  readonly snapshot: SettingsSnapshot | null;
  readonly updateVaultSettings: (settings: VaultSettings) => void;
  /** Remembers which note to reopen on the next launch. */
  readonly rememberLastNote: (path: string | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { info, showError, subscribeToChanges } = useVault();
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const loaded = await invoke('settings_get', {});
      setSnapshot(loaded);
      if (loaded.warnings.length > 0) showError(loaded.warnings.join(' '));
    } catch (cause) {
      showError(cause);
    }
  }, [showError]);

  // Load when a vault opens, and again whenever a settings file is edited by hand.
  useEffect(() => {
    if (info === null) return;
    let cancelled = false;
    invoke('settings_get', {}).then(
      (loaded) => {
        if (cancelled) return;
        setSnapshot(loaded);
        if (loaded.warnings.length > 0) showError(loaded.warnings.join(' '));
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    const stopListening = subscribeToChanges((change) => {
      if (change.kind === 'settings') void reload();
    });
    return () => {
      cancelled = true;
      stopListening();
    };
  }, [info, reload, showError, subscribeToChanges]);

  const updateVaultSettings = useCallback(
    (settings: VaultSettings) => {
      setSnapshot((current) => (current === null ? current : { ...current, vault: settings }));
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        invoke('settings_save_vault', { settings }).catch((cause: unknown) => {
          showError(cause);
          void reload();
        });
      }, SAVE_DELAY_MS);
    },
    [reload, showError],
  );

  const lastSavedNote = useRef<string | null>(null);
  const rememberLastNote = useCallback((path: string | null) => {
    if (path === lastSavedNote.current) return;
    lastSavedNote.current = path;
    // Not worth an error banner: the worst case is not reopening this note next time.
    invoke('settings_save_local', { settings: { lastNote: path } }).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ snapshot, updateVaultSettings, rememberLastNote }),
    [snapshot, updateVaultSettings, rememberLastNote],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) throw new Error('useSettings must be used inside a SettingsProvider');
  return value;
}
