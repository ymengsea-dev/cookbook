/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatShortcut, isTextEditingKey, matchesShortcut, type KeyPress } from './shortcut.ts';

const press = (key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress => ({
  key,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  ...modifiers,
});

test('Mod matches the Command key', () => {
  assert.equal(matchesShortcut(press('p', { metaKey: true }), 'Mod-p'), true);
  assert.equal(matchesShortcut(press('P', { metaKey: true }), 'Mod-p'), true);
});

test('extra or missing modifiers do not match', () => {
  assert.equal(matchesShortcut(press('p'), 'Mod-p'), false);
  assert.equal(matchesShortcut(press('p', { metaKey: true, shiftKey: true }), 'Mod-p'), false);
  assert.equal(matchesShortcut(press('p', { ctrlKey: true }), 'Mod-p'), false);
});

test('formats like a macOS menu', () => {
  assert.equal(formatShortcut('Mod-p'), '⌘P');
  assert.equal(formatShortcut('Mod-Shift-n'), '⇧⌘N');
  assert.equal(formatShortcut('Mod-\\'), '⌘\\');
  assert.equal(formatShortcut('Mod-,'), '⌘,');
});

test('backspace and arrows count as text-editing keys', () => {
  assert.equal(isTextEditingKey('Backspace'), true);
  assert.equal(isTextEditingKey('ArrowLeft'), true);
  assert.equal(isTextEditingKey('p'), false);
});
