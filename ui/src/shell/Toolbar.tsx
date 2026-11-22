import { formatShortcut, useCommand, type CommandId } from '../shared/commands/index.ts';
import { Icon, type IconName } from '../shared/ui/index.ts';

/** Flat header on the paper. Empty space drags the window, as a native toolbar does. */
export function Toolbar({ sidebarOpen }: { sidebarOpen: boolean }) {
  return (
    <header className={sidebarOpen ? 'toolbar' : 'toolbar toolbar--inset'} data-tauri-drag-region>
      <ToolbarButton command="sidebar.toggle" icon="sidebar" />
      <div className="toolbar__space" data-tauri-drag-region />
      <ToolbarButton command="note.delete" icon="trash" />
      <ToolbarButton command="note.new" icon="plus" />
    </header>
  );
}

function ToolbarButton({ command, icon }: { command: CommandId; icon: IconName }) {
  const { title, shortcut, enabled, run } = useCommand(command);
  const label = shortcut === undefined ? title : `${title} (${formatShortcut(shortcut)})`;
  return (
    <button type="button" className="icon-button" aria-label={title} title={label} disabled={!enabled} onClick={run}>
      <Icon name={icon} />
    </button>
  );
}
