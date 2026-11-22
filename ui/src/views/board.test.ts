/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoardColumn, ViewRow } from '../shared/ipc/index.ts';
import { columnKeys, moveCardLocally, moveItem, savedColumnNames } from './board.ts';

function card(key: string): ViewRow {
  return { key, path: `${key}.md`, title: key, hash: '', properties: {} };
}

function column(value: string, keys: string[]): BoardColumn {
  return { value, hidden: false, cards: keys.map(card) };
}

const board = [column('todo', ['a', 'b']), column('done', ['c']), column('', [])];

test('a card dropped before another lands just above it', () => {
  const moved = moveCardLocally(board, { cardKey: 'a', toColumn: 'done', beforeKey: 'c' });
  assert.deepEqual(columnKeys(moved, 'todo'), ['b']);
  assert.deepEqual(columnKeys(moved, 'done'), ['a', 'c']);
});

test('a card dropped on empty space goes to the bottom', () => {
  const moved = moveCardLocally(board, { cardKey: 'a', toColumn: 'todo', beforeKey: null });
  assert.deepEqual(columnKeys(moved, 'todo'), ['b', 'a']);
});

test('an unknown card changes nothing', () => {
  const moved = moveCardLocally(board, { cardKey: 'zzz', toColumn: 'done', beforeKey: null });
  assert.deepEqual(moved, board);
});

test('No value is never saved as a named column', () => {
  assert.deepEqual(savedColumnNames(board), ['todo', 'done']);
});

test('moveItem moves within range only', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b'], 1, 5), ['a', 'b']);
});
