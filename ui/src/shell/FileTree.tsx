import { useState, type CSSProperties } from 'react';
import type { TreeEntry } from '../shared/ipc/index.ts';
import { Icon } from '../shared/ui/index.ts';
import { noteTitle } from '../shared/vault/index.ts';

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
    <ul className="file-tree" role="tree" aria-label="Files">
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
  // The depth drives the indent in CSS, so the spacing still comes from tokens.
  const indent = { '--depth': depth } as CSSProperties;

  return entries.map((entry) => {
    if (entry.kind === 'folder') {
      const isOpen = isExpanded(entry.path);
      return (
        <li key={entry.path} role="treeitem" aria-expanded={isOpen}>
          <button type="button" className="file-tree__row" style={indent} onClick={() => { onToggleFolder(entry.path); }}>
            <span className={isOpen ? 'file-tree__chevron file-tree__chevron--open' : 'file-tree__chevron'}>
              <Icon name="chevron" />
            </span>
            <Icon name="folder" />
            <span className="file-tree__name">{entry.name}</span>
          </button>
          {isOpen && (
            <ul role="group">
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
          className="file-tree__row file-tree__row--note"
          style={indent}
          aria-current={isCurrent ? 'page' : undefined}
          onClick={() => { onOpenNote(entry.path); }}
        >
          <Icon name="note" />
          <span className="file-tree__name">{noteTitle(entry.path)}</span>
        </button>
      </li>
    );
  });
}
