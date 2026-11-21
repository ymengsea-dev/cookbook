import type { CommandArgs, CommandId, CommandResult, InvokeResult } from '@notes/ipc-contract';

/** Calls a main-process command. Features use this, never `window.api` directly. */
export function invoke<K extends CommandId>(id: K, args: CommandArgs<K>): Promise<InvokeResult<CommandResult<K>>> {
  return window.api.invoke(id, args);
}
