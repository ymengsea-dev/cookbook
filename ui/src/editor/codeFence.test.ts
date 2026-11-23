/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { codeBlockAt, codeBlockStartingAt, fenceLabel } from './codeFence.ts';

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] });
}

test('the label is the first word after the fence, in lowercase', () => {
  assert.equal(fenceLabel('Python title="demo"'), 'python');
  assert.equal(fenceLabel('  js'), 'js');
  assert.equal(fenceLabel(''), '');
});

test('finds the code block around a position', () => {
  const doc = 'Intro\n\n```JS\nconst a = 1;\nconsole.log(a);\n```\n\nAfter';
  const state = stateOf(doc);

  const block = codeBlockAt(state, doc.indexOf('console'));

  assert.deepEqual(block, {
    from: doc.indexOf('```'),
    end: doc.lastIndexOf('```') + 3,
    label: 'js',
    code: 'const a = 1;\nconsole.log(a);',
  });
  assert.equal(codeBlockAt(state, doc.indexOf('Intro')), null);
  assert.equal(codeBlockAt(state, doc.indexOf('After')), null);
});

test('an unclosed block runs to the end of the note', () => {
  const doc = '```sh\necho one\necho two';
  const block = codeBlockAt(stateOf(doc), 0);
  assert.equal(block?.code, 'echo one\necho two');
});

test('a block is found by its start only where it really starts', () => {
  const doc = '```py\nprint(1)\n```\n';
  const state = stateOf(doc);
  assert.equal(codeBlockStartingAt(state, 0)?.label, 'py');
  assert.equal(codeBlockStartingAt(state, doc.indexOf('print')), null);
});
