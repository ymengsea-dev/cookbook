import type { ThemeColors } from '../ipc/index.ts';

/** Every colour a theme sets. Built-in themes set them all; theme files may leave some out. */
export type Palette = Required<ThemeColors>;

export interface BuiltInTheme {
  readonly id: string;
  readonly name: string;
  readonly light: Palette;
  readonly dark: Palette;
}

/** The CSS variable for each theme colour, as in `app.css`. */
export const COLOR_VARIABLES: Readonly<Record<keyof Palette, string>> = {
  paper: '--paper',
  surface: '--surface',
  sidebar: '--sidebar',
  ink: '--ink',
  inkSecondary: '--ink-secondary',
  rule: '--rule',
  accent: '--accent',
  onAccent: '--on-accent',
};

/** The default: warm paper and ink. Must match the values in `app.css`; a test checks this. */
const PAPER: BuiltInTheme = {
  id: 'paper',
  name: 'Paper',
  light: {
    paper: '#f5f0e6',
    surface: '#fbf8f2',
    sidebar: '#efe8dc',
    ink: '#2a2521',
    inkSecondary: '#6f665d',
    rule: '#e3d9c8',
    accent: '#a34f35',
    onAccent: '#fffdf9',
  },
  dark: {
    paper: '#1d1a17',
    surface: '#27231f',
    sidebar: '#191613',
    ink: '#eee7db',
    inkSecondary: '#a69c90',
    rule: '#3a342d',
    accent: '#d27c5d',
    onAccent: '#1d1a17',
  },
};

/** A cooler, quieter paper with a slate-teal accent. */
const LINEN: BuiltInTheme = {
  id: 'linen',
  name: 'Linen',
  light: {
    paper: '#f3f1ec',
    surface: '#faf9f6',
    sidebar: '#ebe8e1',
    ink: '#26292b',
    inkSecondary: '#5f6467',
    rule: '#dcd8cf',
    accent: '#3f6f7a',
    onAccent: '#fbfaf7',
  },
  dark: {
    paper: '#181a1b',
    surface: '#212426',
    sidebar: '#141617',
    ink: '#e8e6e1',
    inkSecondary: '#a2a6a8',
    rule: '#33373a',
    accent: '#7fb0ba',
    onAccent: '#181a1b',
  },
};

export const DEFAULT_THEME = PAPER;
export const BUILT_IN_THEMES: readonly BuiltInTheme[] = [PAPER, LINEN];
