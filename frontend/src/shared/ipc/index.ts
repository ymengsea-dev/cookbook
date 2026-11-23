import { Channel, convertFileSrc, invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AdoptReport } from './bindings/AdoptReport.ts';
import type { AppInfo } from './bindings/AppInfo.ts';
import type { AppearanceSettings } from './bindings/AppearanceSettings.ts';
import type { FontSettings } from './bindings/FontSettings.ts';
import type { LayoutSettings } from './bindings/LayoutSettings.ts';
import type { Book } from './bindings/Book.ts';
import type { BookImport } from './bindings/BookImport.ts';
import type { BoardColumn } from './bindings/BoardColumn.ts';
import type { Column } from './bindings/Column.ts';
import type { CommandError } from './bindings/CommandError.ts';
import type { ContentHash } from './bindings/ContentHash.ts';
import type { Filter } from './bindings/Filter.ts';
import type { FilterOp } from './bindings/FilterOp.ts';
import type { ImportReport } from './bindings/ImportReport.ts';
import type { IndexProgress } from './bindings/IndexProgress.ts';
import type { IoOutcome } from './bindings/IoOutcome.ts';
import type { IoProgress } from './bindings/IoProgress.ts';
import type { LocalSettings } from './bindings/LocalSettings.ts';
import type { NoteFile } from './bindings/NoteFile.ts';
import type { OutputStream } from './bindings/OutputStream.ts';
import type { PropertyInfo } from './bindings/PropertyInfo.ts';
import type { PropertyType } from './bindings/PropertyType.ts';
import type { PropertyValue } from './bindings/PropertyValue.ts';
import type { ReaderDataKind } from './bindings/ReaderDataKind.ts';
import type { ReadingPosition } from './bindings/ReadingPosition.ts';
import type { RowGroup } from './bindings/RowGroup.ts';
import type { RunEvent } from './bindings/RunEvent.ts';
import type { RunOutcome } from './bindings/RunOutcome.ts';
import type { SearchHit } from './bindings/SearchHit.ts';
import type { SettingsSnapshot } from './bindings/SettingsSnapshot.ts';
import type { SidebarSide } from './bindings/SidebarSide.ts';
import type { Theme } from './bindings/Theme.ts';
import type { ThemeColors } from './bindings/ThemeColors.ts';
import type { ThemeFile } from './bindings/ThemeFile.ts';
import type { ThemeList } from './bindings/ThemeList.ts';
import type { ThemeMode } from './bindings/ThemeMode.ts';
import type { SortRule } from './bindings/SortRule.ts';
import type { TrashEntry } from './bindings/TrashEntry.ts';
import type { TreeEntry } from './bindings/TreeEntry.ts';
import type { VaultChange } from './bindings/VaultChange.ts';
import type { VaultInfo } from './bindings/VaultInfo.ts';
import type { VaultSettings } from './bindings/VaultSettings.ts';
import type { ViewContent } from './bindings/ViewContent.ts';
import type { ViewData } from './bindings/ViewData.ts';
import type { ViewDefinition } from './bindings/ViewDefinition.ts';
import type { ViewKind } from './bindings/ViewKind.ts';
import type { ViewRow } from './bindings/ViewRow.ts';
import type { ViewSource } from './bindings/ViewSource.ts';
import type { ZipOptions } from './bindings/ZipOptions.ts';

export type {
  AdoptReport,
  ThemeList,
  AppearanceSettings,
  FontSettings,
  LayoutSettings,
  SidebarSide,
  Theme,
  ThemeColors,
  ThemeFile,
  ThemeMode,
  ImportReport,
  IoOutcome,
  IoProgress,
  ZipOptions,
  Book,
  BookImport,
  ReadingPosition,
  BoardColumn,
  Column,
  Filter,
  FilterOp,
  PropertyInfo,
  PropertyType,
  PropertyValue,
  RowGroup,
  SortRule,
  ViewContent,
  ViewData,
  ViewDefinition,
  ViewKind,
  ViewRow,
  ViewSource,
  AppInfo,
  CommandError,
  ContentHash,
  IndexProgress,
  LocalSettings,
  NoteFile,
  OutputStream,
  RunEvent,
  RunOutcome,
  SearchHit,
  SettingsSnapshot,
  TrashEntry,
  TreeEntry,
  VaultChange,
  VaultInfo,
  VaultSettings,
};

type NoArgs = Record<string, never>;

/**
 * Every Rust command the UI may call. Types in `./bindings/` are generated from Rust
 * by `cargo test`. Argument names are camelCase versions of the Rust parameter names.
 */
interface CommandMap {
  app_info: { args: NoArgs; result: AppInfo };
  app_quit: { args: NoArgs; result: null };
  vault_choose: { args: NoArgs; result: VaultInfo | null };
  vault_restore: { args: NoArgs; result: VaultInfo | null };
  vault_tree: { args: NoArgs; result: TreeEntry[] };
  vault_adopt_preview: { args: NoArgs; result: string[] };
  vault_adopt: { args: NoArgs; result: AdoptReport };
  note_read: { args: { path: string }; result: NoteFile };
  note_save: { args: { path: string; content: string; expectedHash: ContentHash }; result: NoteFile };
  note_set_property: {
    args: { path: string; key: string; value: PropertyValue; expectedHash: ContentHash };
    result: NoteFile;
  };
  note_create: { args: { folder: string | null }; result: NoteFile };
  note_rename: { args: { path: string; newName: string }; result: string };
  note_move: { args: { path: string; folder: string | null }; result: string };
  note_delete: { args: { path: string }; result: TrashEntry };
  trash_list: { args: NoArgs; result: TrashEntry[] };
  trash_restore: { args: { id: string }; result: string };
  search_notes: { args: { query: string; limit: number }; result: SearchHit[] };
  view_list: { args: NoArgs; result: ViewDefinition[] };
  view_create: { args: { name: string; kind: ViewKind; source: ViewSource }; result: ViewDefinition };
  view_save: { args: { definition: ViewDefinition }; result: ViewDefinition };
  view_open: { args: { id: string }; result: ViewData };
  view_new_note: { args: { id: string; column: string | null }; result: NoteFile };
  view_move_card: {
    args: { id: string; path: string; expectedHash: ContentHash; column: string; order: string[] };
    result: null;
  };
  view_rename_column: { args: { id: string; from: string; to: string }; result: number };
  settings_get: { args: NoArgs; result: SettingsSnapshot };
  settings_save_vault: { args: { settings: VaultSettings }; result: null };
  settings_save_local: { args: { settings: LocalSettings }; result: null };
  theme_list: { args: NoArgs; result: ThemeList };
  /** Null when the user cancelled the file picker. */
  theme_import: { args: NoArgs; result: Theme | null };
  theme_export: { args: { theme: ThemeFile }; result: null };
  code_runners: { args: NoArgs; result: string[] };
  code_run: {
    args: { runId: string; path: string; language: string; code: string; onEvent: Channel<RunEvent> };
    result: null;
  };
  code_stop: { args: { runId: string }; result: null };
  book_list: { args: NoArgs; result: Book[] };
  book_import: { args: NoArgs; result: null };
  /** The PDF's raw bytes. */
  book_read: { args: { path: string }; result: ArrayBuffer };
  /** JPEG bytes, empty when no cover is cached yet. */
  book_cover: { args: { id: string }; result: ArrayBuffer };
  book_save_details: { args: { id: string; title: string; pages: number; cover: number[] }; result: null };
  book_save_position: { args: { id: string; position: ReadingPosition }; result: null };
  reader_data: { args: { kind: ReaderDataKind; name: string }; result: ArrayBuffer };
  io_import_folder: { args: NoArgs; result: null };
  io_import_files: { args: NoArgs; result: null };
  io_cancel: { args: NoArgs; result: null };
  io_export_zip: { args: { options: ZipOptions }; result: null };
  note_export_markdown: { args: { path: string }; result: null };
  note_export_html: { args: { path: string }; result: null };
}

export type CommandId = keyof CommandMap;

/** Calls a Rust command. Features use this, never `@tauri-apps/api` directly. */
export function invoke<K extends CommandId>(id: K, args: CommandMap[K]['args']): Promise<CommandMap[K]['result']> {
  return tauriInvoke<CommandMap[K]['result']>(id, args);
}

/** A stream of messages from one command call, such as a code run's output. Arrives in order. */
export function createChannel<T>(onMessage: (message: T) => void): Channel<T> {
  const channel = new Channel<T>();
  channel.onmessage = onMessage;
  return channel;
}

/** Every event Rust sends to the UI, by name. Names match `backend/app/src/events.rs`. */
interface EventMap {
  'vault-changed': VaultChange[];
  'before-quit': null;
  'index-progress': IndexProgress;
  'index-updated': null;
  'books-imported': BookImport;
  'io-progress': IoProgress;
  'io-finished': IoOutcome;
}

/** Listens to a Rust event. Call the returned function to stop listening. */
export function listen<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): Promise<UnlistenFn> {
  return tauriListen<EventMap[K]>(event, (message) => {
    handler(message.payload);
  });
}

/** A URL the webview can load for a file inside the open vault, such as an image. */
export function assetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}

export function isCommandError(error: unknown): error is CommandError {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

/** A message that is safe to show the user, whatever was thrown. */
export function errorMessage(error: unknown): string {
  if (isCommandError(error)) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong. Please try again.';
}
