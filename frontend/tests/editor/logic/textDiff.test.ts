/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { singleChange, type TextChange } from '../../../src/editor/logic/textDiff.ts';

function apply(text: string, change: TextChange | null): string {
  if (change === null) return text;
  return text.slice(0, change.from) + change.insert + text.slice(change.to);
}

test('equal texts need no change', () => {
  assert.equal(singleChange('same', 'same'), null);
});

test('a key line added at the top is one insertion', () => {
  const before = 'Body\n';
  const after = '---\nkey: 01J\n---\nBody\n';
  const change = singleChange(before, after);
  assert.deepEqual(change, { from: 0, to: 0, insert: '---\nkey: 01J\n---\n' });
  assert.equal(apply(before, change), after);
});

test('works for edits in the middle, deletions and repeated letters', () => {
  for (const [before, after] of [
    ['hello world', 'hello brave world'],
    ['aaaa', 'aa'],
    ['abc', ''],
    ['', 'abc'],
    ['ខ្មែរ', 'ខ្មែរ ភាសា'],
  ] as const) {
    assert.equal(apply(before, singleChange(before, after)), after);
  }
});
