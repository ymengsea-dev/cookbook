import { useState, type CSSProperties } from 'react';
import type { TreeEntry } from '../shared/ipc/index.ts';
import { classNames, Icon } from '../shared/ui/index.ts';
import { noteTitle } from '../shared/vault/index.ts';

const list = 'm-0 p-0 list-none';
const row =
  'flex items-center gap-1 w-full h-(--control-height) pr-2 border-0 rounded-sm bg-transparent text-left hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:font-medium [&_svg]:text-ink-secondary aria-[current=page]:[&_svg]:text-accent';
// The depth drives the indent, so the spacing still comes from tokens.
const folderIndent = 'pl-[calc(var(--space-2)+var(--space-4)*var(--depth,0))]';
// Notes have no chevron, so they are nudged to line up with folder names.
const noteIndent = 'pl-[calc(var(--space-2)+var(--space-4)+var(--space-4)*var(--depth,0))]';

interface FileTreeProps {
  readonly entries: readonly TreeEntry[];
  readonly openPath: string | null;
  readonly onOpenNote: (path: string) => void;
}

/**
 * The vault's folders and notes. Folders holding the open note start expanded and the
 * rest collapsed; `toggled` records the folders the user flipped from that default.
 */
export function FileTree({ entries, openPath, onOpenNote }: FileTreeProps) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());

  function isExpanded(folder: string): boolean {
    const holdsOpenNote = openPath !== null && openPath.startsWith(`${folder}/`);
    return holdsOpenNote !== toggled.has(folder);
  }

  function toggleFolder(path: string) {
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <ul className={list} role="tree" aria-label="Files">
      <TreeLevel entries={entries} depth={0} isExpanded={isExpanded} openPath={openPath} onToggleFolder={toggleFolder} onOpenNote={onOpenNote} />
    </ul>
  );
}

interface TreeLevelProps {
  readonly entries: readonly TreeEntry[];
  readonly depth: number;
  readonly isExpanded: (folder: string) => boolean;
  readonly openPath: string | null;
  readonly onToggleFolder: (path: string) => void;
  readonly onOpenNote: (path: string) => void;
}

function TreeLevel({ entries, depth, isExpanded, openPath, onToggleFolder, onOpenNote }: TreeLevelProps) {
  const indent = { '--depth': depth } as CSSProperties;

  return entries.map((entry) => {
    if (entry.kind === 'folder') {
      const isOpen = isExpanded(entry.path);
      return (
        <li key={entry.path} role="treeitem" aria-expanded={isOpen}>
          <button type="button" className={`${row} ${folderIndent}`} style={indent} onClick={() => { onToggleFolder(entry.path); }}>
            <span className={classNames('inline-flex', isOpen && 'rotate-90')}>
              <Icon name="chevron" />
            </span>
            <Icon name="folder" />
            <span className="truncate">{entry.name}</span>
          </button>
          {isOpen && (
            <ul className={list} role="group">
              <TreeLevel entries={entry.children} depth={depth + 1} isExpanded={isExpanded} openPath={openPath} onToggleFolder={onToggleFolder} onOpenNote={onOpenNote} />
            </ul>
          )}
        </li>
      );
    }

    const isCurrent = entry.path === openPath;
    return (
      <li key={entry.path} role="treeitem" aria-selected={isCurrent}>
        <button
          type="button"
          className={`${row} ${noteIndent}`}
          style={indent}
          aria-current={isCurrent ? 'page' : undefined}
          onClick={() => { onOpenNote(entry.path); }}
        >
          <Icon name="note" />
          <span className="truncate">{noteTitle(entry.path)}</span>
        </button>
      </li>
    );
  });
}
