import type { AppearanceSettings as Appearance, ThemeMode } from '../../shared/ipc/index.ts';
import { AA_TEXT, contrastRatio, paletteFor, resolveScheme, useAppearance, withAccent } from '../../shared/appearance/index.ts';
import { classNames, styles } from '../../shared/ui/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { exportThemeFile, importThemeFile } from '../api/settingsApi.ts';
import { GroupHeading, SettingRow, select } from './SettingRow.tsx';

const MODES: readonly { readonly value: ThemeMode; readonly label: string }[] = [
  { value: 'system', label: 'Match macOS' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

interface AppearanceSettingsProps {
  readonly value: Appearance;
  readonly defaults: Appearance;
  readonly locked: boolean;
  readonly onChange: (value: Appearance) => void;
}

/** Theme, light or dark, accent and density (U-1, U-3, U-4). */
export function AppearanceSettings({ value, defaults, locked, onChange }: AppearanceSettingsProps) {
  const { themes, reloadThemes } = useAppearance();
  const { showError } = useVault();
  const theme = themes.find((choice) => choice.id === value.colors);
  const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const palette = withAccent(paletteFor(theme, resolveScheme(value.theme, systemIsDark)), value.accent);
  const accentContrast = contrastRatio(palette.accent, palette.paper);

  async function importTheme() {
    try {
      const imported = await importThemeFile();
      if (imported === null) return;
      await reloadThemes();
      onChange({ ...value, colors: imported.id });
    } catch (cause) {
      showError(cause);
    }
  }

  function exportTheme() {
    if (theme === undefined) return;
    const accent = value.accent;
    const file = accent === null
      ? { name: theme.name, light: theme.light, dark: theme.dark }
      : { name: `${theme.name} Custom`, light: { ...theme.light, accent }, dark: { ...theme.dark, accent } };
    exportThemeFile(file).catch(showError);
  }

  return (
    <>
      <GroupHeading title="Appearance" canReset={!locked && !sameAppearance(value, defaults)} onReset={() => { onChange(defaults); }} />
      <div className={styles.rows}>
        <SettingRow label="Theme" detail="Built-in themes, plus any in .vault/themes/.">
          <select className={select} disabled={locked} value={value.colors} onChange={(event) => { onChange({ ...value, colors: event.target.value }); }}>
            {themes.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.name}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Light or dark" detail="Match macOS follows the system setting as it changes.">
          <select className={select} disabled={locked} value={value.theme} onChange={(event) => { onChange({ ...value, theme: event.target.value as ThemeMode }); }}>
            {MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Accent colour" detail={accentDetail(value.accent, accentContrast)}>
          <span className="flex items-center gap-2">
            <input
              type="color"
              className="w-(--space-10) h-(--control-height) p-0 border border-rule rounded-sm bg-surface"
              disabled={locked}
              value={palette.accent}
              aria-label="Accent colour"
              onChange={(event) => { onChange({ ...value, accent: event.target.value }); }}
            />
            <button type="button" className={styles.quietButton} disabled={locked || value.accent === null} onClick={() => { onChange({ ...value, accent: null }); }}>
              Use Theme Accent
            </button>
          </span>
        </SettingRow>
        <SettingRow label="Density" detail="Compact fits more rows on the screen.">
          <select className={select} disabled={locked} value={value.density} onChange={(event) => { onChange({ ...value, density: event.target.value === 'compact' ? 'compact' : 'comfortable' }); }}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </SettingRow>
        <div className={classNames(styles.rowsRow, 'justify-end')}>
          <button type="button" className={styles.button} disabled={locked} onClick={() => { void importTheme(); }}>
            Import Theme…
          </button>
          <button type="button" className={styles.button} disabled={theme === undefined} onClick={exportTheme}>
            Export Theme…
          </button>
        </div>
      </div>
    </>
  );
}

// The ratio is in the words, so the warning never depends on colour alone.
function accentDetail(accent: string | null, ratio: number): string {
  const base = accent === null ? "The theme's own accent." : 'Your own accent. Text on it switches to whichever colour reads best.';
  if (ratio >= AA_TEXT) return base;
  return `${base} As text on the page it is hard to read (${ratio.toFixed(1)}:1; AA needs ${String(AA_TEXT)}:1).`;
}

function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.theme === b.theme && a.colors === b.colors && a.accent === b.accent && a.density === b.density;
}
