import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { isTextEditingKey, matchesShortcut } from './shortcut.ts';

/**
 * Every user action. Menus, shortcuts, the palette and buttons call these by id,
 * so each action exists once and can be rebound (S-7, U-8).
 */
export type CommandId =
  | 'vault.open'
  | 'note.new'
  | 'note.delete'
  | 'code.run'
  | 'book.import'
  | 'search.quickOpen'
  | 'sidebar.toggle'
  | 'go.notes'
  | 'go.search'
  | 'go.views'
  | 'go.books'
  | 'go.trash'
  | 'app.settings'
  | 'view.newNote'
  | 'view.togglePin';

export interface Command {
  readonly title: string;
  /** Default binding in settings format, for example `Mod-p`. */
  readonly shortcut?: string;
  /** False until the feature behind the command exists or can run. */
  readonly enabled: boolean;
  readonly run: () => void;
}

export type CommandTable = Readonly<Record<CommandId, Command>>;

const CommandContext = createContext<CommandTable | null>(null);

export function CommandProvider({ commands, children }: { commands: CommandTable; children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // The editor already handled it, such as ⌘↩ running a code block.
      if (event.defaultPrevented) return;
      if (isTextEditingKey(event.key) && isTextField(event.target)) return;
      const match = Object.values(commands).find(
        (command) => command.shortcut !== undefined && matchesShortcut(event, command.shortcut),
      );
      if (match === undefined) return;
      event.preventDefault();
      if (match.enabled) match.run();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [commands]);

  return <CommandContext.Provider value={commands}>{children}</CommandContext.Provider>;
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function useCommand(id: CommandId): Command {
  const commands = useContext(CommandContext);
  if (commands === null) throw new Error('useCommand must be used inside a CommandProvider');
  return commands[id];
}
