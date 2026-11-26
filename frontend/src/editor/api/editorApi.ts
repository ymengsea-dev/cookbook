import { createChannel, invoke, type ContentHash, type NoteFile, type RunEvent } from '../../shared/ipc/index.ts';

/** Rust calls for the editor: saving notes and running code blocks. Reading a note is in `shared/vault`. */

/** Saves only if the file still matches `expectedHash`; otherwise fails with `changed-on-disk`. */
export function saveNote(path: string, content: string, expectedHash: ContentHash): Promise<NoteFile> {
  return invoke('note_save', { path, content, expectedHash });
}

/** The languages listed in `settings.local.json` (E-11). */
export function listCodeRunners(): Promise<string[]> {
  return invoke('code_runners', {});
}

export interface CodeRunRequest {
  runId: string;
  path: string;
  language: string;
  code: string;
}

/** Starts a run; output arrives in order through `onEvent` until a `finished` event (E-12). */
export function startCodeRun(request: CodeRunRequest, onEvent: (event: RunEvent) => void): Promise<null> {
  const channel = createChannel<RunEvent>(onEvent);
  return invoke('code_run', { ...request, onEvent: channel });
}

export function stopCodeRun(runId: string): Promise<null> {
  return invoke('code_stop', { runId });
}
