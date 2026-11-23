/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PropertyValue } from '../../src/shared/ipc/index.ts';
import { displayValue, isChecked, noteCount, sameValue, sourceLabel, valueFromInput } from '../../src/views/values.ts';

test('lists read as comma-separated text', () => {
  const tags: PropertyValue = {
    type: 'list',
    value: [
      { type: 'text', value: 'web' },
      { type: 'number', value: 2 },
    ],
  };
  assert.equal(displayValue(tags), 'web, 2');
  assert.equal(displayValue(undefined), '');
  assert.equal(displayValue({ type: 'null' }), '');
});

test('typed input becomes a value of the column type', () => {
  assert.deepEqual(valueFromInput('number', ' 4.5 '), { type: 'number', value: 4.5 });
  assert.deepEqual(valueFromInput('number', 'soon'), { type: 'text', value: 'soon' });
  assert.deepEqual(valueFromInput('checkbox', 'true'), { type: 'bool', value: true });
  assert.deepEqual(valueFromInput('multiSelect', 'a, b,'), {
    type: 'list',
    value: [
      { type: 'text', value: 'a' },
      { type: 'text', value: 'b' },
    ],
  });
  assert.deepEqual(valueFromInput('date', ''), { type: 'null' });
  assert.deepEqual(valueFromInput('select', 'doing'), { type: 'text', value: 'doing' });
});

test('an unchanged value needs no write', () => {
  assert.ok(sameValue(undefined, { type: 'null' }));
  assert.ok(sameValue({ type: 'text', value: 'a' }, { type: 'text', value: 'a' }));
  assert.ok(!sameValue({ type: 'text', value: 'a' }, { type: 'text', value: 'b' }));
});

test('checkboxes read booleans and the text true', () => {
  assert.ok(isChecked({ type: 'bool', value: true }));
  assert.ok(isChecked({ type: 'text', value: 'True' }));
  assert.ok(!isChecked(undefined));
});

test('sources and counts read as plain words', () => {
  assert.equal(sourceLabel({ kind: 'vault' }), 'Whole vault');
  assert.equal(sourceLabel({ kind: 'folder', folder: 'Projects', recursive: true }), 'Projects and subfolders');
  assert.equal(sourceLabel({ kind: 'tag', tag: 'web' }), '#web');
  assert.equal(noteCount(1), '1 note');
  assert.equal(noteCount(0), '0 notes');
});
