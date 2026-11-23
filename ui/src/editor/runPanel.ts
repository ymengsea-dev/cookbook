import type { OutputStream, RunEvent, RunOutcome } from '../shared/ipc/index.ts';

export interface OutputSegment {
  readonly stream: OutputStream;
  readonly text: string;
}

export type RunState =
  | { readonly kind: 'running' }
  | { readonly kind: 'finished'; readonly outcome: RunOutcome; readonly millis: number }
  | { readonly kind: 'failed'; readonly message: string };

/** The output panel under one code block (E-12). Output is not saved into the note. */
export interface RunPanel {
  readonly runId: string;
  /** Where the block starts, moved along as the text around it changes. */
  readonly blockFrom: number;
  readonly state: RunState;
  readonly segments: readonly OutputSegment[];
  /** The size limit, once the output reached it. */
  readonly truncatedAt: number | null;
}

export function newPanel(runId: string, blockFrom: number): RunPanel {
  return { runId, blockFrom, state: { kind: 'running' }, segments: [], truncatedAt: null };
}

export function applyRunEvent(panel: RunPanel, event: RunEvent): RunPanel {
  switch (event.kind) {
    case 'output':
      return { ...panel, segments: [...panel.segments, { stream: event.stream, text: event.text }] };
    case 'truncated':
      return { ...panel, truncatedAt: event.bytes };
    case 'finished':
      return { ...panel, state: { kind: 'finished', outcome: event.outcome, millis: event.millis } };
  }
}

export function failPanel(panel: RunPanel, message: string): RunPanel {
  return { ...panel, state: { kind: 'failed', message } };
}

/** The panel's status line: exit code and time, or why it stopped. */
export function statusText(state: RunState): string {
  switch (state.kind) {
    case 'running':
      return 'Running…';
    case 'failed':
      return 'Could not run';
    case 'finished':
      return outcomeText(state.outcome, state.millis);
  }
}

function outcomeText(outcome: RunOutcome, millis: number): string {
  const time = formatDuration(millis);
  switch (outcome.kind) {
    case 'exited':
      return outcome.code === null ? `Ended by a signal · ${time}` : `Exit code ${String(outcome.code)} · ${time}`;
    case 'stopped':
      return `Stopped · ${time}`;
    case 'timedOut':
      return `Stopped at the ${String(outcome.seconds)} s time limit`;
  }
}

/** True when the run did not end cleanly, so the status gets extra emphasis. */
export function isProblem(state: RunState): boolean {
  if (state.kind === 'failed') return true;
  if (state.kind === 'running') return false;
  const outcome = state.outcome;
  return outcome.kind === 'timedOut' || (outcome.kind === 'exited' && outcome.code !== 0);
}

export function formatDuration(millis: number): string {
  if (millis < 1000) return `${String(Math.round(millis))} ms`;
  return `${(millis / 1000).toFixed(1)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  return `${String(Math.round(bytes / 1024))} KB`;
}
