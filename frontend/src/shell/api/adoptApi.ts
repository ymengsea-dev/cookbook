import { invoke, type AdoptReport } from '../../shared/ipc/index.ts';

/** Rust calls for adopting an existing folder as a vault (`commands/vault.rs`, V-5). */

/** The notes that would get a key if the user adopts this vault. */
export function previewAdopt(): Promise<string[]> {
  return invoke('vault_adopt_preview', {});
}

export function adoptVault(): Promise<AdoptReport> {
  return invoke('vault_adopt', {});
}
