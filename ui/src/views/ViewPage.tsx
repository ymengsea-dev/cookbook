import { useState } from 'react';
import { formatShortcut, useCommand, type CommandId } from '../shared/commands/index.ts';
import { Icon } from '../shared/ui/index.ts';
import { BoardView } from './BoardView.tsx';
import { ListView } from './ListView.tsx';
import type { OpenView } from './useOpenView.ts';
import { noteCount, sourceLabel } from './values.ts';
import { ViewSettings } from './ViewSettings.tsx';
import './views.css';

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
    <section className="view-page">
      <header className="view-page__header">
        <div className="view-page__heading">
          <h1 className="page__title">{definition.name}</h1>
          <p className="view-page__summary">
            {noteCount(data.total)} · {sourceLabel(definition.source)}
          </p>
        </div>
        <button
          type="button"
          className="button"
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
      className={primary ? 'button button--primary' : 'button'}
      title={tooltip}
      disabled={!enabled}
      onClick={run}
    >
      <Icon name={icon} />
      <span>{title}</span>
    </button>
  );
}
