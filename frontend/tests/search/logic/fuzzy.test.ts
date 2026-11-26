/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuzzyMatch, rankNotes } from '../../../src/search/logic/fuzzy.ts';

test('matches characters in order, ignoring case and spaces', () => {
  assert.deepEqual(fuzzyMatch('wpl', 'Website plan')?.positions, [0, 8, 9]);
  assert.notEqual(fuzzyMatch('web plan', 'Website plan'), null);
  assert.equal(fuzzyMatch('plx', 'Website plan'), null);
});

test('consecutive letters and word starts score higher', () => {
  const together = fuzzyMatch('plan', 'Website plan');
  const scattered = fuzzyMatch('plan', 'people learn a note');
  assert.ok(together !== null && scattered !== null);
  assert.ok(together.score > scattered.score);
});

test('title matches rank above path-only matches', () => {
  const notes = [
    { path: 'Plans/Budget.md', title: 'Budget' },
    { path: 'Inbox/Plan.md', title: 'Plan' },
    { path: 'Archive/Old.md', title: 'Old' },
  ];
  const ranked = rankNotes('plan', notes, 10);
  assert.deepEqual(
    ranked.map((note) => note.path),
    ['Inbox/Plan.md', 'Plans/Budget.md'],
  );
});

test('works for non-Latin titles', () => {
  const ranked = rankNotes('ខ្មែរ', [{ path: 'ភាសាខ្មែរ.md', title: 'ភាសាខ្មែរ' }], 10);
  assert.equal(ranked.length, 1);
});
