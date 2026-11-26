import { invoke, type AppInfo, type Theme, type ThemeFile } from '../../shared/ipc/index.ts';

/** Rust calls for the Settings page. Loading and saving settings is in `shared/settings`. */

export function getAppInfo(): Promise<AppInfo> {
  return invoke('app_info', {});
}

/** Null when the user cancelled the file picker. */
export function importThemeFile(): Promise<Theme | null> {
  return invoke('theme_import', {});
}

export function exportThemeFile(theme: ThemeFile): Promise<null> {
  return invoke('theme_export', { theme });
}
