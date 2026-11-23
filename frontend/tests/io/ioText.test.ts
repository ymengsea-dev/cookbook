/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImportReport } from '../../src/shared/ipc/index.ts';
import { outcomeText, progressText } from '../../src/io/ioText.ts';

function report(changes: Partial<ImportReport>): ImportReport {
  return {
    notes: 502,
    attachments: 1,
    linksFixed: 3,
    rekeyed: 0,
    renamed: [],
    skipped: [],
    cancelled: false,
    destination: 'Research',
    savedAs: '.vault/imports/import-1.md',
    ...changes,
  };
}

test('an import says what came in, where, and how many links were fixed', () => {
  assert.equal(
    outcomeText({ kind: 'imported', report: report({}) }),
    'Imported 502 notes and 1 attachment into Research. 3 links were fixed.',
  );
  assert.equal(
    outcomeText({ kind: 'imported', report: report({ notes: 1, attachments: 0, linksFixed: 0, destination: null }) }),
    'Imported 1 note and 0 attachments.',
  );
});

test('a cancelled import says nothing was lost', () => {
  assert.equal(
    outcomeText({ kind: 'imported', report: report({ notes: 3, cancelled: true }) }),
    'Import cancelled after 3 notes and 1 attachment. Everything copied so far was kept.',
  );
});

test('exports and progress read naturally', () => {
  assert.equal(outcomeText({ kind: 'exported', files: 1, place: '/Users/me/Trip.html' }), 'Exported 1 file to /Users/me/Trip.html.');
  assert.equal(progressText({ done: 120, total: 500 }), '120 of 500 files');
});
