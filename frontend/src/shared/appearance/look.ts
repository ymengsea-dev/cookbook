// Turns the look settings (U-1 to U-3) into CSS variables on the page. Every component reads
// tokens, so setting them restyles the app at once (U-5).

import type { ThemeColors, ThemeMode, VaultSettings } from '../ipc/index.ts';
import { bestTextOn } from './contrast.ts';
import { COLOR_VARIABLES, DEFAULT_THEME, type Palette } from './themes.ts';

export type Scheme = 'light' | 'dark';

/** A theme to choose from: built-in, or a file in `.vault/themes/`. */
export interface ThemeChoice {
  readonly id: string;
  readonly name: string;
  readonly light: ThemeColors;
  readonly dark: ThemeColors;
  readonly builtIn: boolean;
}

const SYSTEM_FONTS = "system-ui, -apple-system, 'Helvetica Neue', sans-serif";
const DENSITY = {
  comfortable: { controlHeight: '28px', rowPadding: '12px' },
  compact: { controlHeight: '24px', rowPadding: '8px' },
} as const;

export function resolveScheme(mode: ThemeMode, systemIsDark: boolean): Scheme {
  if (mode === 'system') return systemIsDark ? 'dark' : 'light';
  return mode;
}

/** The theme's colours for one scheme, with anything it leaves out taken from Paper. */
export function paletteFor(theme: ThemeChoice | undefined, scheme: Scheme): Palette {
  const defaults = DEFAULT_THEME[scheme];
  const chosen = theme?.[scheme] ?? {};
  return { ...defaults, ...definedColors(chosen) };
}

function definedColors(colors: ThemeColors): Partial<Palette> {
  const defined: Partial<Palette> = {};
  for (const key of Object.keys(COLOR_VARIABLES) as (keyof Palette)[]) {
    const value = colors[key];
    if (value !== undefined) defined[key] = value;
  }
  return defined;
}

/** Applies a custom accent, picking whichever text colour reads best on it. */
export function withAccent(palette: Palette, accent: string | null): Palette {
  if (accent === null) return palette;
  const onAccent = bestTextOn(accent, [palette.onAccent, palette.paper, palette.ink]);
  return { ...palette, accent, onAccent };
}

/** Every CSS variable the look sets, by name. */
export function lookVariables(settings: VaultSettings, theme: ThemeChoice | undefined, scheme: Scheme): Record<string, string> {
  const palette = withAccent(paletteFor(theme, scheme), settings.appearance.accent);
  const variables: Record<string, string> = { 'color-scheme': scheme };
  for (const [key, variable] of Object.entries(COLOR_VARIABLES)) {
    variables[variable] = palette[key as keyof Palette];
  }

  const { fonts, layout } = settings;
  const family = fonts.family?.trim();
  // Font names are limited to letters, digits, spaces and hyphens in Rust, so quoting is safe.
  variables['--font'] = family === undefined || family === '' ? SYSTEM_FONTS : `"${family}", ${SYSTEM_FONTS}`;
  variables['--editor-text-size'] = `${String(fonts.size)}px`;
  variables['--editor-line-height'] = String(fonts.lineHeight);
  variables['--content-width'] = `${String(layout.contentWidth)}px`;
  variables['--sidebar-width'] = `${String(layout.sidebarWidth)}px`;

  const density = DENSITY[settings.appearance.density];
  variables['--control-height'] = density.controlHeight;
  variables['--row-padding'] = density.rowPadding;
  return variables;
}
