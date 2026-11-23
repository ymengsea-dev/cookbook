import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke, type Theme, type ThemeList } from '../ipc/index.ts';
import { useSettings } from '../settings/index.ts';
import { useVault } from '../vault/index.ts';
import { lookVariables, resolveScheme, type ThemeChoice } from './look.ts';
import { BUILT_IN_THEMES } from './themes.ts';

interface AppearanceContextValue {
  /** Built-in themes first, then the vault's own. */
  readonly themes: readonly ThemeChoice[];
  readonly reloadThemes: () => Promise<void>;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const DARK_QUERY = '(prefers-color-scheme: dark)';

const builtInChoices: ThemeChoice[] = BUILT_IN_THEMES.map((theme) => ({ ...theme, builtIn: true }));

/** Keeps the page's CSS variables in step with the look settings and macOS light or dark. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { info, showError } = useVault();
  const { snapshot } = useSettings();
  const [custom, setCustom] = useState<readonly Theme[]>([]);
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const follow = () => {
      setSystemIsDark(query.matches);
    };
    query.addEventListener('change', follow);
    return () => {
      query.removeEventListener('change', follow);
    };
  }, []);

  const showThemes = useCallback(
    (list: ThemeList) => {
      setCustom(list.themes);
      if (list.warnings.length > 0) showError(list.warnings.join(' '));
    },
    [showError],
  );

  const reloadThemes = useCallback(async () => {
    try {
      showThemes(await invoke('theme_list', {}));
    } catch (cause) {
      showError(cause);
    }
  }, [showThemes, showError]);

  useEffect(() => {
    if (info === null) return;
    let cancelled = false;
    invoke('theme_list', {}).then(
      (list) => {
        if (!cancelled) showThemes(list);
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [info, showThemes, showError]);

  const themes = useMemo<ThemeChoice[]>(
    () => [...builtInChoices, ...custom.map((theme) => ({ ...theme, builtIn: false }))],
    [custom],
  );

  const vaultSettings = snapshot?.vault ?? null;
  useEffect(() => {
    if (vaultSettings === null) return;
    const theme = themes.find((choice) => choice.id === vaultSettings.appearance.colors);
    const scheme = resolveScheme(vaultSettings.appearance.theme, systemIsDark);
    const style = document.documentElement.style;
    for (const [name, value] of Object.entries(lookVariables(vaultSettings, theme, scheme))) {
      style.setProperty(name, value);
    }
  }, [vaultSettings, themes, systemIsDark]);

  const value = useMemo(() => ({ themes, reloadThemes }), [themes, reloadThemes]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (value === null) throw new Error('useAppearance must be used inside an AppearanceProvider');
  return value;
}
