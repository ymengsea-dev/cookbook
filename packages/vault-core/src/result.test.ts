import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err, ok } from './result.ts';

test('ok wraps a value', () => {
  assert.deepEqual(ok(42), { ok: true, value: 42 });
});

test('err wraps an error', () => {
  assert.deepEqual(err({ code: 'not-found' }), { ok: false, error: { code: 'not-found' } });
});
