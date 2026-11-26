import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isCommandError, type NoteFile } from '../../shared/ipc/index.ts';
import { onBeforeQuit } from '../../shared/lifecycle.ts';
import { readNote, useVault } from '../../shared/vault/index.ts';
import { saveNote } from '../api/editorApi.ts';
import type { NoteEditorHandle } from '../components/NoteEditor.tsx';

/** `conflict` means the file changed on disk while there were unsaved edits (V-7). */
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'conflict';

export interface NoteSaver {
  readonly status: SaveStatus;
  /** Call once the note is loaded: the version on disk the editor starts from. */
  readonly start: (note: NoteFile) => void;
  readonly onEdit: () => void;
  readonly saveNow: () => Promise<void>;
  /** Saves the editor's final text when it closes (switching notes). */
  readonly saveOnClose: (text: string) => void;
  readonly keepMine: () => Promise<void>;
  readonly takeTheirs: () => Promise<void>;
}

/**
 * Autosave for one note (E-5): saves after a pause and on blur, one save at a time,
 * and never overwrites a file that changed on disk. Instead it reports a conflict.
 */
export function useNoteSaver(path: string, editor: RefObject<NoteEditorHandle | null>, autosaveMs: number): NoteSaver {
  const { showError, subscribeToChanges } = useVault();
  const [status, setStatusState] = useState<SaveStatus>('saved');
  // Refs mirror state so timers and event handlers always read the current value.
  const statusRef = useRef<SaveStatus>('saved');
  const baseline = useRef<NoteFile | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const setStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const start = useCallback(
    (note: NoteFile) => {
      baseline.current = note;
      setStatus('saved');
    },
    [setStatus],
  );

  const writeOnce = useCallback(async () => {
    const current = editor.current;
    const base = baseline.current;
    if (current === null || base === null || statusRef.current === 'conflict') return;

    const sent = current.beginSave();
    if (sent === base.content) {
      current.finishSave(sent, sent);
      setStatus('saved');
      return;
    }
    setStatus('saving');
    try {
      const saved = await saveNote(path, sent, base.hash);
      baseline.current = saved;
      // The saved text can differ from what was sent: the first save adds a `key` (V-4).
      current.finishSave(sent, saved.content);
      setStatus(current.getText() === saved.content ? 'saved' : 'unsaved');
    } catch (cause) {
      current.finishSave(sent, sent);
      if (isCommandError(cause) && cause.code === 'changed-on-disk') {
        setStatus('conflict');
      } else {
        setStatus('unsaved');
        showError(cause);
      }
    }
  }, [editor, path, setStatus, showError]);

  // Saves run one after another, so two saves never race on the same file.
  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = queue.current.then(writeOnce);
    return queue.current;
  }, [writeOnce]);

  const onEdit = useCallback(() => {
    if (statusRef.current === 'conflict') return;
    setStatus('unsaved');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveNow();
    }, autosaveMs);
  }, [autosaveMs, saveNow, setStatus]);

  const saveOnClose = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      const base = baseline.current;
      if (base === null || text === base.content || statusRef.current === 'conflict') return;
      saveNote(path, text, base.hash).catch((cause: unknown) => {
        // A note that was just deleted can't be saved, and that is expected.
        if (!(isCommandError(cause) && cause.code === 'not-found')) showError(cause);
      });
    },
    [path, showError],
  );

  const takeTheirs = useCallback(async () => {
    try {
      const onDisk = await readNote(path);
      baseline.current = onDisk;
      editor.current?.replaceText(onDisk.content);
      setStatus('saved');
    } catch (cause) {
      showError(cause);
    }
  }, [editor, path, setStatus, showError]);

  const keepMine = useCallback(async () => {
    try {
      // Saving against the new version on disk replaces it with the editor's text.
      baseline.current = await readNote(path);
      setStatus('unsaved');
      await saveNow();
    } catch (cause) {
      showError(cause);
    }
  }, [path, saveNow, setStatus, showError]);

  // An edit in another app: reload if nothing is unsaved, otherwise ask (V-7).
  useEffect(
    () =>
      subscribeToChanges((change) => {
        if (change.kind !== 'note' || change.path !== path) return;
        if (statusRef.current === 'saved') void takeTheirs();
        else setStatus('conflict');
      }),
    [path, setStatus, subscribeToChanges, takeTheirs],
  );

  useEffect(() => onBeforeQuit(saveNow), [saveNow]);

  return { status, start, onEdit, saveNow, saveOnClose, keepMine, takeTheirs };
}
