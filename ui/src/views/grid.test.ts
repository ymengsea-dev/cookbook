/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveCell } from './grid.ts';

test('arrows move one cell and stop at the edges', () => {
  const start = { row: 0, column: 0 };
  assert.deepEqual(moveCell(start, 'ArrowDown', 3, 4), { row: 1, column: 0 });
  assert.deepEqual(moveCell(start, 'ArrowUp', 3, 4), start);
  assert.deepEqual(moveCell(start, 'ArrowLeft', 3, 4), start);
  assert.deepEqual(moveCell({ row: 2, column: 3 }, 'ArrowDown', 3, 4), { row: 2, column: 3 });
  assert.deepEqual(moveCell({ row: 2, column: 3 }, 'ArrowRight', 3, 4), { row: 2, column: 3 });
});

test('Home and End jump to the first and last column', () => {
  assert.deepEqual(moveCell({ row: 1, column: 2 }, 'Home', 3, 4), { row: 1, column: 0 });
  assert.deepEqual(moveCell({ row: 1, column: 0 }, 'End', 3, 4), { row: 1, column: 3 });
});

test('other keys do not move', () => {
  assert.equal(moveCell({ row: 0, column: 0 }, 'a', 3, 4), null);
});
