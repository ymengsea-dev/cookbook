import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import type { AppInfo } from './bindings/AppInfo.ts';

/**
 * Every Rust command the UI may call. Argument and result types come from
 * `./bindings/`, which `cargo test` generates from the Rust structs.
 */
interface CommandMap {
  app_info: { args: Record<string, never>; result: AppInfo };
}

export type CommandId = keyof CommandMap;

/** Calls a Rust command. Features use this, never `@tauri-apps/api` directly. */
export function invoke<K extends CommandId>(id: K, args: CommandMap[K]['args']): Promise<CommandMap[K]['result']> {
  return tauriInvoke<CommandMap[K]['result']>(id, args);
}
