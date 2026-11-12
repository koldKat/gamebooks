'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { isSupplementalSection, supplementalSectionSql, uncountedReadingSections } = require('../server/db/reading-section-counts');

test('supplemental prose is excluded consistently while actual numbered and lettered sections stay counted', t => {
  const db = new Database(':memory:');t.after(() => db.close());
  db.exec('CREATE TABLE book_sections(book_id,section_id)');
  const ignored = ['intro','Intro','introduction','prolog','prologue','opening','opening-prologue',
    'epilog','epilogue','epilog-won','epilogue-loss','sleep','Sleep','bonanza','Bonanza'];
  const counted = ['1','313','1A','А1','101-A','introspection','epilogue2','loc1','map7','sleeper','sleep-1','bonanza-1'];
  const add = db.prepare('INSERT INTO book_sections VALUES(1,?)');
  for (const id of [...ignored,...counted]) add.run(id);
  for (const id of ignored) assert.equal(isSupplementalSection(id),true,id);
  for (const id of counted) assert.equal(isSupplementalSection(id),false,id);
  assert.deepEqual(uncountedReadingSections(db,1),ignored);
  assert.deepEqual(uncountedReadingSections(db,1,'entry'),[...ignored,'entry']);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM book_sections WHERE ${supplementalSectionSql('section_id')}`).get().n,ignored.length);
});
