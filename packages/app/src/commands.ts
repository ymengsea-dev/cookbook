import { app } from 'electron';
import {
  isCommandId,
  type CommandArgs,
  type CommandId,
  type CommandResult,
  type InvokeResult,
} from '@notes/ipc-contract';

interface CommandHandler<K extends CommandId> {
  /** Runtime check of the payload. The renderer is never trusted. */
  validate(args: unknown): args is CommandArgs<K>;
  run(args: CommandArgs<K>): CommandResult<K> | Promise<CommandResult<K>>;
}

const handlers: { [K in CommandId]: CommandHandler<K> } = {
  'app.getVersion': {
    validate: (args): args is undefined => args === undefined,
    run: () => app.getVersion(),
  },
};

async function dispatch<K extends CommandId>(id: K, args: unknown): Promise<InvokeResult<CommandResult<K>>> {
  const handler: CommandHandler<K> = handlers[id];
  if (!handler.validate(args)) {
    return { ok: false, error: { code: 'invalid-args', message: `Invalid arguments for ${id}.` } };
  }
  try {
    return { ok: true, value: await handler.run(args) };
  } catch (error) {
    console.error(`Command ${id} failed`, error);
    return { ok: false, error: { code: 'internal', message: `${id} failed. See the app log for details.` } };
  }
}

export function invokeCommand(id: unknown, args: unknown): Promise<InvokeResult<unknown>> {
  if (!isCommandId(id)) {
    return Promise.resolve({ ok: false, error: { code: 'unknown-command', message: `Unknown command: ${String(id)}` } });
  }
  return dispatch(id, args);
}
