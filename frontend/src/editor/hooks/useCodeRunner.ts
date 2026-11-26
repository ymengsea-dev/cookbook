import type { StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, isCommandError, type RunEvent } from '../../shared/ipc/index.ts';
import { useVault } from '../../shared/vault/index.ts';
import { listCodeRunners, startCodeRun, stopCodeRun } from '../api/editorApi.ts';
import type { CodeBlock } from '../logic/codeFence.ts';
import { runCleared, runEvent, runFailed, runStarted, type CodeRunHost } from '../extensions/run/codeRun.ts';

let runCount = 0;

/**
 * Runs the open note's code blocks through Rust (E-11 to E-16). Null until the runners load.
 * Rust asks for consent and checks trust, so nothing here can skip those steps.
 */
export function useCodeRunner(path: string): CodeRunHost | null {
  const { info, showError, subscribeToChanges } = useVault();
  const [labels, setLabels] = useState<ReadonlySet<string> | null>(null);
  // Runs still going, so closing the note can stop them.
  const activeRuns = useRef(new Set<string>());

  useEffect(() => {
    if (info === null) return;
    let cancelled = false;
    const load = () => {
      listCodeRunners().then(
        (list) => {
          if (!cancelled) setLabels(new Set(list));
        },
        (cause: unknown) => {
          if (!cancelled) showError(cause);
        },
      );
    };
    load();
    // Runners live in settings.local.json, which can be edited by hand.
    const stopListening = subscribeToChanges((change) => {
      if (change.kind === 'settings') load();
    });
    return () => {
      cancelled = true;
      stopListening();
    };
  }, [info, showError, subscribeToChanges]);

  useEffect(() => {
    const runs = activeRuns.current;
    return () => {
      for (const runId of runs) stopRun(runId);
      runs.clear();
    };
  }, []);

  return useMemo(() => {
    if (labels === null) return null;
    return {
      labels,
      start: (view, block) => {
        startRun(view, block, path, activeRuns.current);
      },
      stop: stopRun,
    };
  }, [labels, path]);
}

function startRun(view: EditorView, block: CodeBlock, path: string, activeRuns: Set<string>) {
  runCount += 1;
  const runId = `run-${String(Date.now())}-${String(runCount)}`;
  activeRuns.add(runId);
  // Once the note closes, its editor is gone and the rest of the output is dropped.
  const show = (effect: StateEffect<unknown>) => {
    if (activeRuns.has(runId)) view.dispatch({ effects: effect });
  };

  view.dispatch({ effects: runStarted.of({ runId, blockFrom: block.from }) });
  const onEvent = (event: RunEvent) => {
    show(runEvent.of({ runId, event }));
    if (event.kind === 'finished') activeRuns.delete(runId);
  };
  const request = { runId, path, language: block.label, code: block.code };
  startCodeRun(request, onEvent).catch((cause: unknown) => {
    // Saying no to the safety question just removes the panel.
    const declined = isCommandError(cause) && cause.code === 'declined';
    show(declined ? runCleared.of(runId) : runFailed.of({ runId, message: errorMessage(cause) }));
    activeRuns.delete(runId);
  });
}

function stopRun(runId: string) {
  // A run that already ended has nothing to stop.
  stopCodeRun(runId).catch(() => undefined);
}
