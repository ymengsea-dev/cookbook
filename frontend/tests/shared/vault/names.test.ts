/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TreeEntry } from '../../../src/shared/ipc/index.ts';
import { folderPaths, notePaths, noteTitle, parentFolder, treeHasPath } from '../../../src/shared/vault/names.ts';

test('note title drops the folder and the .md extension', () => {
  assert.equal(noteTitle('Projects/Website/Plan.md'), 'Plan');
  assert.equal(noteTitle('Inbox.MD'), 'Inbox');
  assert.equal(noteTitle('notes.md.md'), 'notes.md');
});

test('parent folder is null at the vault root', () => {
  assert.equal(parentFolder('Projects/Website/Plan.md'), 'Projects/Website');
  assert.equal(parentFolder('Plan.md'), null);
});

test('folder paths lists nested folders in tree order', () => {
  const folder = (path: string, children: TreeEntry[] = []): TreeEntry => ({ path, name: path, kind: 'folder', children });
  const note = (path: string): TreeEntry => ({ path, name: path, kind: 'note', children: [] });
  const tree = [folder('A', [folder('A/B'), note('A/n.md')]), folder('C'), note('x.md')];

  assert.deepEqual(folderPaths(tree), ['A', 'A/B', 'C']);
  assert.deepEqual(notePaths(tree), ['A/n.md', 'x.md']);
});

test('tree has path finds nested notes only', () => {
  const tree: TreeEntry[] = [
    { path: 'A', name: 'A', kind: 'folder', children: [{ path: 'A/n.md', name: 'n.md', kind: 'note', children: [] }] },
  ];
  assert.equal(treeHasPath(tree, 'A/n.md'), true);
  assert.equal(treeHasPath(tree, 'B/n.md'), false);
});
