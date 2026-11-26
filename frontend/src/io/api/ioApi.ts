import {
  invoke,
  listen,
  type IoOutcome,
  type IoProgress,
  type UnlistenFn,
  type ZipOptions,
} from '../../shared/ipc/index.ts';

/** Rust calls for import and export jobs. Only one job runs at a time. */

export function exportVaultZip(options: ZipOptions): Promise<null> {
  return invoke('io_export_zip', { options });
}

export function cancelIoJob(): Promise<null> {
  return invoke('io_cancel', {});
}

export function onIoProgress(handler: (progress: IoProgress) => void): Promise<UnlistenFn> {
  return listen('io-progress', handler);
}

/** Every import or export ends with this event, even when cancelled or failed. */
export function onIoFinished(handler: (outcome: IoOutcome) => void): Promise<UnlistenFn> {
  return listen('io-finished', handler);
}
