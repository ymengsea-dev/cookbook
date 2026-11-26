import type { ViewSource } from '../../../shared/ipc/index.ts';
import { folderPaths, useVault } from '../../../shared/vault/index.ts';
import * as styles from '../styles.ts';

interface SourcePickerProps {
  readonly source: ViewSource;
  readonly onChange: (source: ViewSource) => void;
}

/** The notes a view starts from: the whole vault, one folder, or one tag (L-1). */
export function SourcePicker({ source, onChange }: SourcePickerProps) {
  const { tree } = useVault();
  const folders = folderPaths(tree);
  // A saved folder that was renamed or removed still shows, so the setting isn't silently swapped.
  const folderChoices = source.kind === 'folder' && !folders.includes(source.folder) ? [source.folder, ...folders] : folders;

  function changeKind(kind: string) {
    if (kind === 'folder') {
      const first = folders[0];
      if (first !== undefined) onChange({ kind: 'folder', folder: first, recursive: true });
    } else if (kind === 'tag') {
      onChange({ kind: 'tag', tag: '' });
    } else {
      onChange({ kind: 'vault' });
    }
  }

  return (
    <div className={styles.line}>
      <select
        className={styles.select}
        aria-label="Notes from"
        value={source.kind}
        onChange={(event) => {
          changeKind(event.target.value);
        }}
      >
        <option value="vault">Whole vault</option>
        <option value="folder" disabled={folders.length === 0}>
          A folder
        </option>
        <option value="tag">A tag</option>
      </select>
      {source.kind === 'folder' && (
        <>
          <select
            className={styles.select}
            aria-label="Folder"
            value={source.folder}
            onChange={(event) => {
              onChange({ ...source, folder: event.target.value });
            }}
          >
            {folderChoices.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
          <label className={styles.check}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={source.recursive}
              onChange={(event) => {
                onChange({ ...source, recursive: event.target.checked });
              }}
            />
            Include subfolders
          </label>
        </>
      )}
      {source.kind === 'tag' && (
        <input
          // Remount when the saved tag changes, so the field shows it.
          key={source.tag}
          className={styles.input}
          aria-label="Tag"
          placeholder="tag"
          defaultValue={source.tag}
          onBlur={(event) => {
            const tag = event.target.value.trim().replace(/^#/, '');
            if (tag !== source.tag) onChange({ kind: 'tag', tag });
          }}
        />
      )}
    </div>
  );
}
