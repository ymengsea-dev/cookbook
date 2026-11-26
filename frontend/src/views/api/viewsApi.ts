import {
  invoke,
  listen,
  type ContentHash,
  type NoteFile,
  type PropertyValue,
  type UnlistenFn,
  type ViewData,
  type ViewDefinition,
  type ViewKind,
  type ViewSource,
} from '../../shared/ipc/index.ts';

/** Rust calls for saved list and board views. */

export function listViews(): Promise<ViewDefinition[]> {
  return invoke('view_list', {});
}

export function createSavedView(name: string, kind: ViewKind, source: ViewSource): Promise<ViewDefinition> {
  return invoke('view_create', { name, kind, source });
}

export function saveView(definition: ViewDefinition): Promise<ViewDefinition> {
  return invoke('view_save', { definition });
}

/** Runs the view: source, filter, sort, group. */
export function openView(id: string): Promise<ViewData> {
  return invoke('view_open', { id });
}

/** A new note in the view's folder; on a board, `column` sets its group property. */
export function createNoteInView(id: string, column: string | null): Promise<NoteFile> {
  return invoke('view_new_note', { id, column });
}

export interface NotePropertyChange {
  path: string;
  key: string;
  value: PropertyValue;
  expectedHash: ContentHash;
}

/** Edits one front matter line and never adds a key. */
export function setNoteProperty(change: NotePropertyChange): Promise<NoteFile> {
  return invoke('note_set_property', change);
}

export interface BoardCardMove {
  id: string;
  path: string;
  expectedHash: ContentHash;
  column: string;
  /** Card keys of the target column, in their new order. */
  order: string[];
}

export function moveBoardCard(move: BoardCardMove): Promise<null> {
  return invoke('view_move_card', move);
}

/** Returns how many notes were changed. */
export function renameBoardColumn(id: string, from: string, to: string): Promise<number> {
  return invoke('view_rename_column', { id, from, to });
}

/** The index caught up with a change on disk, so open views should run again. */
export function onIndexUpdated(handler: () => void): Promise<UnlistenFn> {
  return listen('index-updated', handler);
}
