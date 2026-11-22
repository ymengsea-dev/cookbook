import { formatShortcut, useCommand } from '../shared/commands/index.ts';
import { Icon } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';
import { useViews } from '../views/index.ts';
import { FileTree } from './FileTree.tsx';
import { IndexStatus } from './IndexStatus.tsx';
import { ALL_VIEWS, LIBRARY, SETTINGS, TRASH, type Section, type SectionId } from './sections.ts';

interface SidebarProps {
  readonly current: SectionId;
  readonly openPath: string | null;
  readonly openViewId: string | null;
  readonly onOpenNote: (path: string) => void;
  readonly onOpenView: (id: string) => void;
}

export function Sidebar({ current, openPath, openViewId, onOpenNote, onOpenView }: SidebarProps) {
  const { info, tree } = useVault();
  const { views } = useViews();
  const pinned = views.filter((view) => view.pinned);

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar__titlebar" data-tauri-drag-region />
      <SearchButton />
      <nav className="sidebar__nav" aria-label="Library">
        <p className="sidebar__heading">Library</p>
        {LIBRARY.map((section) => (
          <SidebarItem key={section.id} section={section} current={current} />
        ))}
        <p className="sidebar__heading">Views</p>
        {pinned.map((view) => (
          <button
            key={view.id}
            type="button"
            className="sidebar__item"
            aria-current={current === 'view' && openViewId === view.id ? 'page' : undefined}
            onClick={() => {
              onOpenView(view.id);
            }}
          >
            <Icon name={view.type === 'board' ? 'board' : 'list'} />
            <span className="sidebar__item-label">{view.name}</span>
          </button>
        ))}
        <SidebarItem section={ALL_VIEWS} current={current} />
        {info !== null && (
          <>
            <p className="sidebar__heading">{info.name}</p>
            <FileTree entries={tree} openPath={openPath} onOpenNote={onOpenNote} />
          </>
        )}
      </nav>
      <div className="sidebar__footer">
        <SidebarItem section={TRASH} current={current} />
        <hr className="hairline" />
        <IndexStatus />
        <div className="sidebar__status">
          <span className="status-dot" aria-hidden="true" />
          <span className="sidebar__status-text">Sync off</span>
          <SettingsButton current={current} />
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ section, current }: { section: Section; current: SectionId }) {
  const { run } = useCommand(section.command);
  const active = section.id === current;
  return (
    <button
      type="button"
      className="sidebar__item"
      aria-current={active ? 'page' : undefined}
      onClick={run}
    >
      <Icon name={section.icon} />
      <span>{section.title}</span>
    </button>
  );
}

function SearchButton() {
  const { title, shortcut, enabled, run } = useCommand('search.quickOpen');
  return (
    <button type="button" className="sidebar__search" disabled={!enabled} onClick={run}>
      <Icon name="search" />
      <span className="sidebar__search-label">{title}</span>
      {shortcut !== undefined && <kbd className="sidebar__kbd">{formatShortcut(shortcut)}</kbd>}
    </button>
  );
}

function SettingsButton({ current }: { current: SectionId }) {
  const { title, shortcut, run } = useCommand(SETTINGS.command);
  const label = shortcut === undefined ? title : `${title} (${formatShortcut(shortcut)})`;
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={title}
      title={label}
      aria-current={current === SETTINGS.id ? 'page' : undefined}
      onClick={run}
    >
      <Icon name={SETTINGS.icon} />
    </button>
  );
}
