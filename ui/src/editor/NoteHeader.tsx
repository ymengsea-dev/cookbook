import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { folderPaths, noteTitle, parentFolder, useVault } from '../shared/vault/index.ts';
import type { SaveStatus } from './useNoteSaver.ts';

interface NoteHeaderProps {
  readonly path: string;
  readonly status: SaveStatus;
  readonly onRename: (newName: string) => void;
  readonly onMove: (folder: string | null) => void;
}

const ROOT_OPTION = '';

const STATUS_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Edited',
  saving: 'Saving…',
  conflict: 'Changed in another app',
};

/** The note's title (edit it to rename the file) and its folder (change it to move the file). */
export function NoteHeader({ path, status, onRename, onMove }: NoteHeaderProps) {
  const { tree } = useVault();
  const title = noteTitle(path);
  const [draft, setDraft] = useState(title);

  function commitRename(event?: SyntheticEvent) {
    event?.preventDefault();
    const newName = draft.trim();
    if (newName === '' || newName === title) {
      setDraft(title);
      return;
    }
    onRename(newName);
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setDraft(title);
      event.currentTarget.blur();
    }
  }

  return (
    <header className="note-header">
      <form onSubmit={commitRename}>
        <input
          className="note-header__title"
          aria-label="Note title"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); }}
          onBlur={() => { commitRename(); }}
          onKeyDown={onTitleKeyDown}
        />
      </form>
      <div className="note-header__meta">
        <label className="note-header__folder">
          <span>Folder</span>
          <select
            value={parentFolder(path) ?? ROOT_OPTION}
            onChange={(event) => { onMove(event.target.value === ROOT_OPTION ? null : event.target.value); }}
          >
            <option value={ROOT_OPTION}>Vault root</option>
            {folderPaths(tree).map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
        </label>
        <span className={`save-status save-status--${status}`} role="status">
          {STATUS_LABELS[status]}
        </span>
      </div>
    </header>
  );
}
