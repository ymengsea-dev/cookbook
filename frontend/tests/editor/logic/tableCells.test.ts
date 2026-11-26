/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableCells } from '../../../src/editor/logic/tableCells.ts';

test('table rows split into trimmed cells', () => {
  assert.deepEqual(tableCells('| Name | Status |'), ['Name', 'Status']);
  assert.deepEqual(tableCells('a | b'), ['a', 'b']);
  assert.deepEqual(tableCells('|  |  |'), ['', '']);
});
