import { invoke, type NoteFile, type TrashEntry } from '../../shared/ipc/index.ts';

/** Rust calls for note actions and the trash (`commands/notes.rs`). */

export function createNoteInFolder(folder: string | null): Promise<NoteFile> {
  return invoke('note_create', { folder });
}

/** Returns the note's new path. */
export function renameNoteFile(path: string, newName: string): Promise<string> {
  return invoke('note_rename', { path, newName });
}

/** Returns the note's new path. */
export function moveNoteToFolder(path: string, folder: string | null): Promise<string> {
  return invoke('note_move', { path, folder });
}

/** Moves the note to `.vault/trash`. */
export function moveNoteToTrash(path: string): Promise<TrashEntry> {
  return invoke('note_delete', { path });
}

export function listTrash(): Promise<TrashEntry[]> {
  return invoke('trash_list', {});
}

/** Returns the restored note's path. */
export function restoreFromTrash(id: string): Promise<string> {
  return invoke('trash_restore', { id });
}
