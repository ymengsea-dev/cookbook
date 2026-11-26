import { invoke, listen, type NoteFile, type TreeEntry, type UnlistenFn, type VaultChange, type VaultInfo } from '../../ipc/index.ts';

/** Rust calls for the open vault. Editor, views and search all read notes, so `readNote` lives here. */

export function readNote(path: string): Promise<NoteFile> {
  return invoke('note_read', { path });
}

export function readVaultTree(): Promise<TreeEntry[]> {
  return invoke('vault_tree', {});
}

/** Null when the user cancelled the folder picker. */
export function pickVaultFolder(): Promise<VaultInfo | null> {
  return invoke('vault_choose', {});
}

/** Reopens the last vault; null when there is none. */
export function restoreVault(): Promise<VaultInfo | null> {
  return invoke('vault_restore', {});
}

export function onVaultChanged(handler: (changes: VaultChange[]) => void): Promise<UnlistenFn> {
  return listen('vault-changed', handler);
}
