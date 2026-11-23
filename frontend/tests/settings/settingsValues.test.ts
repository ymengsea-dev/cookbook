/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFontName, sameValues } from '../../src/settings/settingsValues.ts';

test('font names are checked like Rust checks them', () => {
  assert.equal(isFontName('Iowan Old Style'), true);
  assert.equal(isFontName('Noto Sans Khmer'), true);
  assert.equal(isFontName('ヒラギノ角ゴシック'), true);
  assert.equal(isFontName('x"; color: red'), false);
  assert.equal(isFontName('   '), false);
});

test('reset is offered only when a group differs from its defaults', () => {
  assert.equal(sameValues({ size: 15, family: null }, { size: 15, family: null }), true);
  assert.equal(sameValues({ size: 16, family: null }, { size: 15, family: null }), false);
});
