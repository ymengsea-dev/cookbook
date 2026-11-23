import { formatShortcut, useCommand, type CommandId } from '../shared/commands/index.ts';
import { classNames, Icon, styles, type IconName } from '../shared/ui/index.ts';

/** Flat header on the paper. Empty space drags the window, as a native toolbar does. */
export function Toolbar({ sidebarOpen }: { sidebarOpen: boolean }) {
  return (
    <header
      // The window buttons sit over the content when the sidebar is hidden.
      className={classNames(
        'flex flex-none items-center gap-1 h-(--toolbar-height) pr-3',
        sidebarOpen ? 'pl-3' : 'pl-(--traffic-light-inset)',
      )}
      data-tauri-drag-region
    >
      <ToolbarButton command="sidebar.toggle" icon="sidebar" />
      <div className="flex-1 self-stretch" data-tauri-drag-region />
      <ToolbarButton command="note.delete" icon="trash" />
      <ToolbarButton command="note.new" icon="plus" />
    </header>
  );
}

function ToolbarButton({ command, icon }: { command: CommandId; icon: IconName }) {
  const { title, shortcut, enabled, run } = useCommand(command);
  const label = shortcut === undefined ? title : `${title} (${formatShortcut(shortcut)})`;
  return (
    <button type="button" className={styles.iconButton} aria-label={title} title={label} disabled={!enabled} onClick={run}>
      <Icon name={icon} />
    </button>
  );
}
