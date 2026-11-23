/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PAGE_GAP,
  clampPage,
  percentRead,
  scrollTopFor,
  spotAt,
  stackHeight,
  visiblePages,
  zoomIn,
  zoomScale,
} from '../../src/reader/readerLayout.ts';

const A4 = { width: 595, height: 842 };

test('fit width fills the viewport, fit page shows the whole page', () => {
  const viewport = { width: 800 + PAGE_GAP * 2, height: 600 + PAGE_GAP * 2 };
  assert.equal(zoomScale({ kind: 'fitWidth' }, { width: 400, height: 500 }, viewport), 2);
  assert.equal(zoomScale({ kind: 'fitPage' }, { width: 400, height: 500 }, viewport), 1.2);
  assert.equal(zoomScale({ kind: 'custom', scale: 99 }, A4, viewport), 4);
  assert.deepEqual(zoomIn(1), { kind: 'custom', scale: 1.25 });
});

test('a 500-page book draws only the pages on screen', () => {
  const pageHeight = 1000;
  const scrollTop = scrollTopFor({ page: 250, position: 0 }, pageHeight);

  const { first, last } = visiblePages(500, pageHeight, scrollTop, 900);

  assert.equal(first, 249);
  assert.equal(last, 251);
  assert.equal(stackHeight(500, pageHeight), PAGE_GAP + 500 * (pageHeight + PAGE_GAP));
});

test('a scroll position turns into a page and back again', () => {
  const pageHeight = 1000;
  const spot = { page: 120, position: 0.25 };

  const top = scrollTopFor(spot, pageHeight);

  assert.deepEqual(spotAt(300, pageHeight, top), spot);
  assert.deepEqual(spotAt(300, pageHeight, 0), { page: 1, position: 0 });
  assert.equal(spotAt(300, pageHeight, 10_000_000).page, 300);
});

test('page 120 of 300 is 40 percent', () => {
  assert.equal(percentRead(120, 300), 40);
  assert.equal(percentRead(300, 300), 100);
  assert.equal(percentRead(1, 0), 0);
});

test('typed page numbers stay inside the book', () => {
  assert.equal(clampPage(0, 300), 1);
  assert.equal(clampPage(999, 300), 300);
  assert.equal(clampPage(Number('abc'), 300), 1);
  assert.equal(clampPage(12.6, 300), 13);
});
