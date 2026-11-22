import { useCallback } from 'react';
import { invoke } from '../shared/ipc/index.ts';
import { parentFolder, useVault } from '../shared/vault/index.ts';

export interface NoteActions {
  readonly createNote: () => Promise<void>;
  readonly deleteNote: () => Promise<void>;
  readonly renameNote: (newName: string) => Promise<void>;
  readonly moveNote: (folder: string | null) => Promise<void>;
}

/**
 * Create, delete, rename and move for the open note. Each action refreshes the
 * sidebar tree and tells the shell which note is open afterwards.
 */
export function useNoteActions(openPath: string | null, onOpenPathChange: (path: string | null) => void): NoteActions {
  const { refreshTree, showError } = useVault();

  const createNote = useCallback(async () => {
    try {
      // New notes go next to the open note, or in the vault root.
      const folder = openPath === null ? null : parentFolder(openPath);
      const created = await invoke('note_create', { folder });
      await refreshTree();
      onOpenPathChange(created.path);
    } catch (cause) {
      showError(cause);
    }
  }, [openPath, onOpenPathChange, refreshTree, showError]);

  const deleteNote = useCallback(async () => {
    if (openPath === null) return;
    try {
      await invoke('note_delete', { path: openPath });
      await refreshTree();
      onOpenPathChange(null);
    } catch (cause) {
      showError(cause);
    }
  }, [openPath, onOpenPathChange, refreshTree, showError]);

  const renameNote = useCallback(
    async (newName: string) => {
      if (openPath === null) return;
      try {
        const renamed = await invoke('note_rename', { path: openPath, newName });
        await refreshTree();
        onOpenPathChange(renamed);
      } catch (cause) {
        showError(cause);
      }
    },
    [openPath, onOpenPathChange, refreshTree, showError],
  );

  const moveNote = useCallback(
    async (folder: string | null) => {
      if (openPath === null) return;
      try {
        const moved = await invoke('note_move', { path: openPath, folder });
        await refreshTree();
        onOpenPathChange(moved);
      } catch (cause) {
        showError(cause);
      }
    },
    [openPath, onOpenPathChange, refreshTree, showError],
  );

  return { createNote, deleteNote, renameNote, moveNote };
}
