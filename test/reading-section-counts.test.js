'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { isSupplementalSection, supplementalSectionSql, uncountedReadingSections, initializeReadingSupplements } = require('../server/db/reading-section-counts');
const { hasFullBookCoverage } = require('../server/db/book-section-coverage');

test('manual named sections count only in explicit alphanumeric mode without imported canonical IDs', () => {
  const covered = new Set(['Пролог', '1', '2', '0', '-1', 'intro', 'notes']);
  const manual = { alphanumericSections: true, uncountedSections: ['notes'] };
  assert.equal(hasFullBookCoverage({ total_sections: 3 }, covered, [], manual), true);
  assert.equal(hasFullBookCoverage({ total_sections: 4 }, covered, [], manual), false);
  assert.equal(hasFullBookCoverage({ total_sections: 3 }, covered, []), false);
  assert.equal(hasFullBookCoverage({ total_sections: 3 }, covered, ['1', '2', '3'], manual), false);
  assert.equal(hasFullBookCoverage({ total_sections: 3 }, covered, ['1', '2'], manual), false);
});

test('completed ending repairs only a matching, actually finished destination', () => {
  const { restoreCompletedEndingMappings, isMappedGraphNode } = require('../server/db/reading-section-counts');
  const state = { graph: {
    4: { discovered: true, choices: [0] },
    5: { discovered: true, choices: [-1] },
    6: { discovered: true, choices: [0] },
    7: { discovered: true, choices: [] },
  }, playthroughs: [
    { path: [1,4], completed: true, result: 'success' },
    { path: [1,5], completed: false, result: null },
    { path: [1,6], completed: true, result: 'battle' },
    { path: [1,7], completed: true, result: 'death' },
  ] };
  restoreCompletedEndingMappings(state);
  assert.equal(isMappedGraphNode(state.graph[4]), true);
  for (const id of [5,6,7]) assert.equal(isMappedGraphNode(state.graph[id]), false);
  assert.deepEqual(state.playthroughs[0].path, [1,4]);
});

test('supplemental prose is excluded consistently while actual numbered and lettered sections stay counted', t => {
  const db = new Database(':memory:');t.after(() => db.close());
  db.exec('CREATE TABLE book_sections(book_id,section_id)');
  initializeReadingSupplements(db);
  const ignored = ['intro','Intro','introduction','prolog','prologue','opening','opening-prologue',
    'epilog','epilogue','epilog-won','epilogue-loss','sleep','Sleep','bonanza','Bonanza',
    'original-maps','Original-Maps','K-map','k-MAP','reference-43','Reference-101'];
  const counted = ['1','313','1A','А1','101-A','introspection','epilogue2','loc1','map7','sleeper','sleep-1','bonanza-1',
    'reference','reference1','reference-1A','reference-0','original-map','K1','K42','K81'];
  const add = db.prepare('INSERT INTO book_sections VALUES(1,?)');
  for (const id of [...ignored,...counted]) add.run(id);
  for (const id of ignored) assert.equal(isSupplementalSection(id),true,id);
  for (const id of counted) assert.equal(isSupplementalSection(id),false,id);
  assert.deepEqual(uncountedReadingSections(db,1),ignored);
  assert.deepEqual(uncountedReadingSections(db,1,'entry'),[...ignored,'entry']);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM book_sections WHERE ${supplementalSectionSql('section_id')}`).get().n,ignored.length);
});

test('several printed introductory pages are excluded only in their own book without renaming them', t => {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE book_sections(book_id INTEGER,section_id TEXT,PRIMARY KEY(book_id,section_id))');
  initializeReadingSupplements(db);
  db.exec(`INSERT INTO book_sections VALUES(1,'1'),(1,'2'),(1,'3'),(2,'1'),(2,'2');
    INSERT INTO book_reading_supplements VALUES(1,'1'),(1,'2');`);
  assert.deepEqual(uncountedReadingSections(db,1),['1','2']);
  assert.deepEqual(uncountedReadingSections(db,2),[]);
  const actual = db.prepare(`SELECT section_id FROM book_sections WHERE book_id=?
    AND NOT ${supplementalSectionSql('book_sections.section_id','book_sections.book_id')}`);
  assert.deepEqual(actual.all(1).map(row => row.section_id),['3']);
  assert.deepEqual(actual.all(2).map(row => row.section_id),['1','2']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM book_sections WHERE book_id=1').get().n,3);
  db.prepare("DELETE FROM book_sections WHERE book_id=1 AND section_id='2'").run();
  assert.deepEqual(uncountedReadingSections(db,1),['1']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM book_reading_supplements').get().n,1);
});

test('read-only copies and original maps cannot block completion of all actual sections', () => {
  const rows = ['1', '2', '3', 'reference-2', 'original-maps', 'opening-prologue'];
  const canonical = rows.filter(id => !isSupplementalSection(id));
  assert.equal(hasFullBookCoverage({total_sections:3}, new Set(['1','2','3']), canonical), true);
  assert.equal(hasFullBookCoverage({total_sections:3}, new Set(['1','2']), canonical), false);
});

test('the map picker is optional for completion while all printed K sectors remain required', () => {
  const printed = [
    ...Array.from({length:289}, (_, i) => String(i + 1)),
    ...Array.from({length:81}, (_, i) => `K${i + 1}`),
  ];
  const canonical = [...printed, 'K-map'].filter(id => !isSupplementalSection(id));
  assert.equal(canonical.length, 370);
  assert.equal(hasFullBookCoverage({total_sections:370}, new Set(printed), canonical), true);
  const missingSector = new Set(printed.filter(id => id !== 'K81'));
  missingSector.add('K-map');
  assert.equal(hasFullBookCoverage({total_sections:370}, missingSector, canonical), false);
});
