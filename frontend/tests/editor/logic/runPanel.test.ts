/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRunEvent, failPanel, formatBytes, formatDuration, isProblem, newPanel, statusText } from '../../../src/editor/logic/runPanel.ts';

test('output and the end of a run fill the panel', () => {
  let panel = newPanel('r1', 0);
  assert.equal(statusText(panel.state), 'Running…');

  panel = applyRunEvent(panel, { kind: 'output', stream: 'stdout', text: 'hi\n' });
  panel = applyRunEvent(panel, { kind: 'output', stream: 'stderr', text: 'oops\n' });
  panel = applyRunEvent(panel, { kind: 'finished', outcome: { kind: 'exited', code: 0 }, millis: 42 });

  assert.deepEqual(panel.segments, [
    { stream: 'stdout', text: 'hi\n' },
    { stream: 'stderr', text: 'oops\n' },
  ]);
  assert.equal(statusText(panel.state), 'Exit code 0 · 42 ms');
  assert.equal(isProblem(panel.state), false);
});

test('the status says why a run ended', () => {
  const finished = (outcome: Parameters<typeof applyRunEvent>[1]) => applyRunEvent(newPanel('r', 0), outcome).state;

  const failed = finished({ kind: 'finished', outcome: { kind: 'exited', code: 1 }, millis: 1500 });
  assert.equal(statusText(failed), 'Exit code 1 · 1.5 s');
  assert.equal(isProblem(failed), true);

  const stopped = finished({ kind: 'finished', outcome: { kind: 'stopped' }, millis: 300 });
  assert.equal(statusText(stopped), 'Stopped · 300 ms');
  assert.equal(isProblem(stopped), false);

  const timedOut = finished({ kind: 'finished', outcome: { kind: 'timedOut', seconds: 30 }, millis: 30000 });
  assert.equal(statusText(timedOut), 'Stopped at the 30 s time limit');
  assert.equal(isProblem(timedOut), true);

  const signal = finished({ kind: 'finished', outcome: { kind: 'exited', code: null }, millis: 10 });
  assert.equal(statusText(signal), 'Ended by a signal · 10 ms');
});

test('a run that could not start keeps its message', () => {
  const panel = failPanel(newPanel('r1', 0), 'Node was not found.');
  assert.equal(statusText(panel.state), 'Could not run');
  assert.deepEqual(panel.state, { kind: 'failed', message: 'Node was not found.' });
});

test('truncation records the size limit', () => {
  const panel = applyRunEvent(newPanel('r1', 0), { kind: 'truncated', bytes: 262144 });
  assert.equal(panel.truncatedAt, 262144);
  assert.equal(formatBytes(262144), '256 KB');
});

test('durations read naturally', () => {
  assert.equal(formatDuration(0), '0 ms');
  assert.equal(formatDuration(999), '999 ms');
  assert.equal(formatDuration(1234), '1.2 s');
});
