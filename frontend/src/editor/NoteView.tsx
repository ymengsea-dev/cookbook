import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { invoke } from '../shared/ipc/index.ts';
import { useSettings } from '../shared/settings/index.ts';
import { styles } from '../shared/ui/index.ts';
import { useVault } from '../shared/vault/index.ts';
import { ConflictBar } from './ConflictBar.tsx';
import { NoteEditor, type NoteEditorHandle } from './NoteEditor.tsx';
import { NoteHeader } from './NoteHeader.tsx';
import { useCodeRunner } from './run/useCodeRunner.ts';
import { useNoteSaver } from './useNoteSaver.ts';


const DEFAULT_AUTOSAVE_MS = 800;

/** What the app shell can ask of the open note, for commands such as ⌘↩. */
export interface NoteViewHandle {
  runCodeAtCursor: () => void;
}

interface NoteViewProps {
  readonly path: string;
  readonly onRename: (newName: string) => void;
  readonly onMove: (folder: string | null) => void;
  readonly ref?: Ref<NoteViewHandle>;
}

/** One open note: its header, the editor, autosave and code runs. Remounted for each note. */
export function NoteView({ path, onRename, onMove, ref }: NoteViewProps) {
  const { info, showError } = useVault();
  const { snapshot } = useSettings();
  const editor = useRef<NoteEditorHandle>(null);
  const [initialText, setInitialText] = useState<string | null>(null);

  const editorSettings = snapshot?.vault.editor;
  const saver = useNoteSaver(path, editor, editorSettings?.autosaveMs ?? DEFAULT_AUTOSAVE_MS);
  const { start } = saver;
  const codeRunner = useCodeRunner(path);

  useImperativeHandle(ref, () => ({
    runCodeAtCursor: () => {
      editor.current?.runCodeAtCursor();
    },
  }));

  useEffect(() => {
    let cancelled = false;
    invoke('note_read', { path }).then(
      (note) => {
        if (cancelled) return;
        start(note);
        setInitialText(note.content);
      },
      (cause: unknown) => {
        if (!cancelled) showError(cause);
      },
    );
    // Ignore a late answer if another note was opened meanwhile.
    return () => {
      cancelled = true;
    };
  }, [path, showError, start]);

  // Save first, so a rename or move never leaves edits behind at the old path.
  async function renameAfterSaving(newName: string) {
    await saver.saveNow();
    onRename(newName);
  }

  async function moveAfterSaving(folder: string | null) {
    await saver.saveNow();
    onMove(folder);
  }

  return (
    <article className={styles.page}>
      <NoteHeader
        path={path}
        status={saver.status}
        onRename={(newName) => { void renameAfterSaving(newName); }}
        onMove={(folder) => { void moveAfterSaving(folder); }}
      />
      {saver.status === 'conflict' && (
        <ConflictBar onKeepMine={() => { void saver.keepMine(); }} onTakeTheirs={() => { void saver.takeTheirs(); }} />
      )}
      <hr className={styles.hairline} />
      {initialText !== null && info !== null && (
        <NoteEditor
          ref={editor}
          initialText={initialText}
          context={{ vaultRoot: info.root, notePath: path }}
          showLineNumbers={editorSettings?.lineNumbers ?? false}
          codeRunner={codeRunner}
          onEdit={saver.onEdit}
          onBlur={() => { void saver.saveNow(); }}
          onSave={() => { void saver.saveNow(); }}
          onClose={saver.saveOnClose}
        />
      )}
    </article>
  );
}
