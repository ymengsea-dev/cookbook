import { formatShortcut, useCommand } from '../shared/commands/index.ts';
import { Icon, styles } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';
import { useViews } from '../views/index.ts';
import { FileTree } from './FileTree.tsx';
import { IndexStatus } from './IndexStatus.tsx';
import { ALL_VIEWS, LIBRARY, SETTINGS, TRASH, type Section, type SectionId } from './sections.ts';

const item =
  'flex items-center gap-2 h-(--control-height) px-2 border-0 rounded-sm bg-transparent text-left hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:font-medium [&_svg]:text-ink-secondary aria-[current=page]:[&_svg]:text-accent';
const heading = 'mt-3 mx-2 mb-1 first:mt-0 text-ink-secondary text-xs font-semibold';

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
    <aside className="flex flex-col min-h-0 px-3 pb-3 border-r border-rule bg-sidebar" aria-label="Sidebar">
      <div className="flex-none h-(--toolbar-height)" data-tauri-drag-region />
      <SearchButton />
      <nav className="flex flex-col flex-1 gap-1 min-h-0 overflow-y-auto pt-4" aria-label="Library">
        <p className={heading}>Library</p>
        {LIBRARY.map((section) => (
          <SidebarItem key={section.id} section={section} current={current} />
        ))}
        <p className={heading}>Views</p>
        {pinned.map((view) => (
          <button
            key={view.id}
            type="button"
            className={item}
            aria-current={current === 'view' && openViewId === view.id ? 'page' : undefined}
            onClick={() => {
              onOpenView(view.id);
            }}
          >
            <Icon name={view.type === 'board' ? 'board' : 'list'} />
            <span className="truncate">{view.name}</span>
          </button>
        ))}
        <SidebarItem section={ALL_VIEWS} current={current} />
        {info !== null && (
          <>
            <p className={heading}>{info.name}</p>
            <FileTree entries={tree} openPath={openPath} onOpenNote={onOpenNote} />
          </>
        )}
      </nav>
      <div className="flex flex-col gap-2">
        <SidebarItem section={TRASH} current={current} />
        <hr className={styles.hairline} />
        <IndexStatus />
        <div className="flex items-center gap-2 pl-2 text-ink-secondary text-sm">
          <span className="size-2 rounded-[50%] bg-stone" aria-hidden="true" />
          <span className="flex-1">Sync off</span>
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
      className={item}
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
    <button
      type="button"
      className="flex items-center gap-2 h-(--control-height) px-2 border border-rule rounded-sm bg-surface text-ink-secondary text-left disabled:opacity-70"
      disabled={!enabled}
      onClick={run}
    >
      <Icon name="search" />
      <span className="flex-1">{title}</span>
      {shortcut !== undefined && <kbd className="font-sans text-sm">{formatShortcut(shortcut)}</kbd>}
    </button>
  );
}

function SettingsButton({ current }: { current: SectionId }) {
  const { title, shortcut, run } = useCommand(SETTINGS.command);
  const label = shortcut === undefined ? title : `${title} (${formatShortcut(shortcut)})`;
  return (
    <button
      type="button"
      className={`${styles.iconButton} aria-[current=page]:bg-selected aria-[current=page]:text-accent`}
      aria-label={title}
      title={label}
      aria-current={current === SETTINGS.id ? 'page' : undefined}
      onClick={run}
    >
      <Icon name={SETTINGS.icon} />
    </button>
  );
}
