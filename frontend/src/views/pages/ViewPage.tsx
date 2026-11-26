import { useState } from 'react';
import { formatShortcut, useCommand, type CommandId } from '../../shared/commands/index.ts';
import { Icon, styles } from '../../shared/ui/index.ts';
import { BoardView } from '../components/board/BoardView.tsx';
import { ListView } from '../components/list/ListView.tsx';
import type { OpenView } from '../hooks/useOpenView.ts';
import { noteCount, sourceLabel } from '../logic/values.ts';
import { ViewSettings } from '../components/settings/ViewSettings.tsx';

interface ViewPageProps {
  readonly view: OpenView;
  readonly onOpenNote: (path: string) => void;
}

/** One saved view: its heading, its settings and its list or board. */
export function ViewPage({ view, onOpenNote }: ViewPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data } = view;
  if (data === null) return null;

  const { definition, content } = data;
  return (
    <section className="flex flex-1 flex-col min-h-0 pt-2 px-10 pb-6">
      <header className="flex items-end gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className={styles.pageTitle}>{definition.name}</h1>
          <p className="mt-1 mx-0 mb-0 text-ink-secondary tabular-nums">
            {noteCount(data.total)} · {sourceLabel(definition.source)}
          </p>
        </div>
        <button
          type="button"
          className={styles.button}
          aria-expanded={settingsOpen}
          onClick={() => {
            setSettingsOpen((open) => !open);
          }}
        >
          <Icon name="sliders" />
          <span>Filter and sort</span>
        </button>
        <CommandButton command="view.togglePin" icon="pin" />
        <CommandButton command="view.newNote" icon="plus" primary />
      </header>
      {settingsOpen && <ViewSettings data={data} onSave={view.save} />}
      {content.type === 'list' ? (
        <ListView view={view} data={data} groups={content.groups} onOpenNote={onOpenNote} />
      ) : (
        <BoardView view={view} data={data} columns={content.columns} onOpenNote={onOpenNote} />
      )}
    </section>
  );
}

interface CommandButtonProps {
  readonly command: CommandId;
  readonly icon: 'pin' | 'plus';
  readonly primary?: boolean;
}

function CommandButton({ command, icon, primary = false }: CommandButtonProps) {
  const { title, shortcut, enabled, run } = useCommand(command);
  const tooltip = shortcut === undefined ? title : `${title} (${formatShortcut(shortcut)})`;
  return (
    <button
      type="button"
      className={primary ? styles.primaryButton : styles.button}
      title={tooltip}
      disabled={!enabled}
      onClick={run}
    >
      <Icon name={icon} />
      <span>{title}</span>
    </button>
  );
}
