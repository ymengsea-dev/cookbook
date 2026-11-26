import { invoke, listen, type IndexProgress, type UnlistenFn } from '../../shared/ipc/index.ts';

/** Rust calls for the app as a whole: quitting and background indexing. */

/** Rust asks before quitting, so the UI can save first (E-5). */
export function onQuitRequested(handler: () => void): Promise<UnlistenFn> {
  return listen('before-quit', handler);
}

export function quitApp(): Promise<null> {
  return invoke('app_quit', {});
}

export function onIndexProgress(handler: (progress: IndexProgress) => void): Promise<UnlistenFn> {
  return listen('index-progress', handler);
}
