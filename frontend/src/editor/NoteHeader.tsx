import { useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useCommand, type CommandId } from '../shared/commands/index.ts';
import { classNames, styles } from '../shared/ui/index.ts';
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
    <header className="flex flex-col gap-2 pb-4">
      <form onSubmit={commitRename}>
        <input
          className="w-full p-0 border-0 bg-transparent text-ink font-sans text-xl font-regular tracking-tight focus-visible:outline-none focus-visible:shadow-[0_1px_0_var(--accent)]"
          aria-label="Note title"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); }}
          onBlur={() => { commitRename(); }}
          onKeyDown={onTitleKeyDown}
        />
      </form>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-ink-secondary">
          <span>Folder</span>
          <select
            className="max-w-full py-1 px-2 border border-rule rounded-sm bg-surface text-ink [font:inherit]"
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
        <span
          // Text always says the state; the colour only adds emphasis.
          className={classNames(
            'text-sm',
            status === 'conflict'
              ? 'text-[color-mix(in_srgb,var(--rust),var(--ink)_40%)] font-medium'
              : 'text-ink-secondary',
          )}
          role="status"
        >
          {STATUS_LABELS[status]}
        </span>
      </div>
      <div className="flex gap-2">
        <CommandButton command="note.exportMarkdown" />
        <CommandButton command="note.exportHtml" />
      </div>
    </header>
  );
}

/** A small button for a note command, such as exporting it (IO-4). */
function CommandButton({ command }: { command: CommandId }) {
  const { title, enabled, run } = useCommand(command);
  return (
    <button type="button" className={classNames(styles.quietButton, 'px-2 text-ink-secondary text-sm')} disabled={!enabled} onClick={run}>
      {title}
    </button>
  );
}
