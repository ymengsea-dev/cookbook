import { invoke, type ThemeList } from '../../ipc/index.ts';

/** Rust calls for themes: the built-in list plus files in `.vault/themes/`. */

export function listThemes(): Promise<ThemeList> {
  return invoke('theme_list', {});
}
