/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GFM, parser } from '@lezer/markdown';
import { SLASH_ITEMS } from './slashItems.ts';

const markdown = parser.configure(GFM);

const EXPECTED_NODE: Record<string, string> = {
  'Heading 1': 'ATXHeading1',
  'Heading 2': 'ATXHeading2',
  'Heading 3': 'ATXHeading3',
  'Bulleted list': 'BulletList',
  'Numbered list': 'OrderedList',
  Task: 'Task',
  Quote: 'Blockquote',
  'Code block': 'FencedCode',
  Table: 'Table',
  Divider: 'HorizontalRule',
};

function nodeNames(text: string): Set<string> {
  const names = new Set<string>();
  markdown.parse(text).iterate({
    enter: (node) => {
      names.add(node.name);
    },
  });
  return names;
}

test('every slash menu item inserts valid Markdown', () => {
  for (const item of SLASH_ITEMS) {
    const expected = EXPECTED_NODE[item.label];
    assert.ok(expected !== undefined, `no expectation for ${item.label}`);
    // Typing a word where the cursor lands must give the expected block.
    const typed = `${item.text.slice(0, item.cursor)}word${item.text.slice(item.cursor)}`;
    assert.ok(nodeNames(typed).has(expected), `${item.label} should parse as ${expected}`);
  }
});

test('the cursor lands inside the inserted text', () => {
  for (const item of SLASH_ITEMS) {
    assert.ok(item.cursor >= 0 && item.cursor <= item.text.length, item.label);
  }
});
