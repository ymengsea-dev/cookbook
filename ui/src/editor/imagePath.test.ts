/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveImagePath } from './imagePath.ts';

test('relative links resolve from the note folder', () => {
  assert.equal(resolveImagePath('Projects/Plan.md', 'diagram.png'), 'Projects/diagram.png');
  assert.equal(resolveImagePath('Projects/Plan.md', '../attachments/My%20Diagram.png'), 'attachments/My Diagram.png');
  assert.equal(resolveImagePath('Plan.md', './a/b.png'), 'a/b.png');
});

test('web links and links outside the vault are refused', () => {
  assert.equal(resolveImagePath('Plan.md', 'https://example.com/a.png'), null);
  assert.equal(resolveImagePath('Plan.md', '../outside.png'), null);
  assert.equal(resolveImagePath('Plan.md', '/etc/passwd'), null);
});
