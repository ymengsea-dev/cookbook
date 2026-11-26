import { invoke, type SettingsSnapshot, type VaultSettings } from '../../ipc/index.ts';

/** Rust calls that load and save `.vault/settings.json` and `settings.local.json`. */

export function getSettings(): Promise<SettingsSnapshot> {
  return invoke('settings_get', {});
}

export function saveVaultSettings(settings: VaultSettings): Promise<null> {
  return invoke('settings_save_vault', { settings });
}

/** Remembers the open note for the next launch. Device-only, so it never syncs. */
export function saveLastNote(path: string | null): Promise<null> {
  return invoke('settings_save_local', { settings: { lastNote: path } });
}
