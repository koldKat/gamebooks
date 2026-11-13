'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { isSupplementalSection, supplementalSectionSql, uncountedReadingSections } = require('../server/db/reading-section-counts');
const { hasFullBookCoverage } = require('../server/db/book-section-coverage');

test('supplemental prose is excluded consistently while actual numbered and lettered sections stay counted', t => {
  const db = new Database(':memory:');t.after(() => db.close());
  db.exec('CREATE TABLE book_sections(book_id,section_id)');
  const ignored = ['intro','Intro','introduction','prolog','prologue','opening','opening-prologue',
    'epilog','epilogue','epilog-won','epilogue-loss','sleep','Sleep','bonanza','Bonanza',
    'original-maps','Original-Maps','reference-43','Reference-101'];
  const counted = ['1','313','1A','А1','101-A','introspection','epilogue2','loc1','map7','sleeper','sleep-1','bonanza-1',
    'reference','reference1','reference-1A','reference-0','original-map'];
  const add = db.prepare('INSERT INTO book_sections VALUES(1,?)');
  for (const id of [...ignored,...counted]) add.run(id);
  for (const id of ignored) assert.equal(isSupplementalSection(id),true,id);
  for (const id of counted) assert.equal(isSupplementalSection(id),false,id);
  assert.deepEqual(uncountedReadingSections(db,1),ignored);
  assert.deepEqual(uncountedReadingSections(db,1,'entry'),[...ignored,'entry']);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM book_sections WHERE ${supplementalSectionSql('section_id')}`).get().n,ignored.length);
});

test('read-only copies and original maps cannot block completion of all actual sections', () => {
  const rows = ['1', '2', '3', 'reference-2', 'original-maps', 'opening-prologue'];
  const canonical = rows.filter(id => !isSupplementalSection(id));
  assert.equal(hasFullBookCoverage({total_sections:3}, new Set(['1','2','3']), canonical), true);
  assert.equal(hasFullBookCoverage({total_sections:3}, new Set(['1','2']), canonical), false);
});
