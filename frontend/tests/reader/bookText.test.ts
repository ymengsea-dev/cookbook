/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Book } from '../../src/shared/ipc/index.ts';
import { jpegDataUrl, progressText, usableTitle } from '../../src/reader/bookText.ts';

function book(changes: Partial<Book>): Book {
  return {
    id: 'a'.repeat(64),
    path: 'books/Deep Work.pdf',
    title: 'Deep Work',
    pages: 300,
    page: 1,
    position: 0,
    lastReadAt: null,
    hasDetails: true,
    ...changes,
  };
}

test('the library line shows length and progress', () => {
  assert.equal(progressText(book({ pages: null })), 'Not opened yet');
  assert.equal(progressText(book({})), '300 pages');
  assert.equal(progressText(book({ page: 120, lastReadAt: 1 })), '300 pages · 40% read');
  assert.equal(progressText(book({ pages: 1 })), '1 page');
});

test('cover bytes become a data URL, and no bytes mean no cover', () => {
  assert.equal(jpegDataUrl(new ArrayBuffer(0)), null);
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
  assert.equal(jpegDataUrl(bytes), 'data:image/jpeg;base64,/9j/');
});

test('placeholder titles are ignored in favour of the file name', () => {
  assert.equal(usableTitle('  Deep Work '), 'Deep Work');
  assert.equal(usableTitle('untitled'), null);
  assert.equal(usableTitle(''), null);
  assert.equal(usableTitle(42), null);
});
