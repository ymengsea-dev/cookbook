/**
 * The only contract between the renderer and the main process.
 * Add a command here first, then its handler in `packages/app/src/commands.ts`.
 */
export interface CommandMap {
  'app.getVersion': { args: undefined; result: string };
}

export type CommandId = keyof CommandMap;
export type CommandArgs<K extends CommandId> = CommandMap[K]['args'];
export type CommandResult<K extends CommandId> = CommandMap[K]['result'];

// `satisfies` makes the compiler fail when a command is added to CommandMap but not here.
const COMMAND_IDS = {
  'app.getVersion': true,
} as const satisfies Record<CommandId, true>;

export function isCommandId(value: unknown): value is CommandId {
  return typeof value === 'string' && Object.hasOwn(COMMAND_IDS, value);
}

export type InvokeErrorCode = 'unknown-command' | 'invalid-args' | 'forbidden-sender' | 'internal';

export interface InvokeError {
  readonly code: InvokeErrorCode;
  readonly message: string;
}

export type InvokeResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: InvokeError };

export const INVOKE_CHANNEL = 'command:invoke';

/** What the preload script exposes on `window.api`. */
export interface RendererApi {
  invoke<K extends CommandId>(id: K, args: CommandArgs<K>): Promise<InvokeResult<CommandResult<K>>>;
}
