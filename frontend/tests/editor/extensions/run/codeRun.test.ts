/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { codeRun, codeRunHost, runnableBlockAt, runPanels, runStarted, type CodeRunHost } from '../../../../src/editor/extensions/run/codeRun.ts';

const NOTE = ['# Note', '', '```sh', 'touch ran', '```', '', '```rust', 'fn main() {}', '```', ''].join('\n');

/** A host that records every run it is asked to start. */
function recordingHost(): { host: CodeRunHost; started: string[] } {
  const started: string[] = [];
  const host: CodeRunHost = {
    labels: new Set(['sh', 'js']),
    start: (_view, block) => {
      started.push(block.code);
    },
    stop: () => undefined,
  };
  return { host, started };
}

function openNote(doc: string, host: CodeRunHost): EditorState {
  return EditorState.create({ doc, extensions: [markdown(), codeRunHost.of(host), codeRun] });
}

test('opening, pasting or importing a note never starts a program (E-11)', () => {
  const { host, started } = recordingHost();

  let state = openNote(NOTE, host);
  const pasted = '```js\nconsole.log("pasted")\n```\n';
  state = state.update({ changes: { from: state.doc.length, insert: pasted }, userEvent: 'input.paste' }).state;
  // Import, sync and edits in other apps all arrive as new text for the note.
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: NOTE } }).state;
  const imported = openNote(`${NOTE}\n${pasted}`, host);

  assert.deepEqual(started, []);
  assert.deepEqual(state.field(runPanels), []);
  assert.deepEqual(imported.field(runPanels), []);
});

test('only a block whose label has a runner can run', () => {
  const state = openNote(NOTE, recordingHost().host);

  assert.equal(runnableBlockAt(state, NOTE.indexOf('touch'))?.code, 'touch ran');
  assert.equal(runnableBlockAt(state, NOTE.indexOf('fn main')), null);
  assert.equal(runnableBlockAt(state, 0), null);
});

test('an output panel follows its block and goes when the block is deleted', () => {
  const blockFrom = NOTE.indexOf('```sh');
  let state = openNote(NOTE, recordingHost().host);
  state = state.update({ effects: runStarted.of({ runId: 'r1', blockFrom }) }).state;

  state = state.update({ changes: { from: 0, insert: 'Intro\n' } }).state;
  assert.equal(state.field(runPanels)[0]?.blockFrom, blockFrom + 'Intro\n'.length);

  state = state.update({ changes: { from: 0, to: state.doc.length, insert: 'Gone' } }).state;
  assert.deepEqual(state.field(runPanels), []);
});
