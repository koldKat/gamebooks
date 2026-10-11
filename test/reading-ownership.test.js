'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { installReadingOwnershipGuards } = require('../server/db/reading-ownership');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, is_container INTEGER, has_live_reading INTEGER, pdf_path TEXT);
    CREATE TABLE book_sections (book_id INTEGER, section_id TEXT, html TEXT);
    CREATE TABLE book_frontmatter (book_id INTEGER PRIMARY KEY, intro_text TEXT);
    CREATE TABLE book_reading_entries (book_id INTEGER PRIMARY KEY, section_id TEXT);
    INSERT INTO books VALUES (1, 1, 0, 'anthology.pdf'), (2, 0, 0, NULL);`);
  installReadingOwnershipGuards(db);
  return db;
}

for (const table of ['book_sections', 'book_frontmatter', 'book_reading_entries']) {
  test(`${table} rejects anthology inserts and reassignment but allows child imports`, t => {
    const db = fixture(t);
    const insert = table === 'book_sections'
      ? db.prepare(`INSERT INTO ${table} VALUES (?, '1', 'text')`)
      : db.prepare(`INSERT INTO ${table} VALUES (?, 'text')`);
    assert.throws(() => insert.run(1), /child book/);
    insert.run(2);
    assert.throws(() => db.prepare(`UPDATE ${table} SET book_id = 1 WHERE book_id = 2`).run(), /child book/);
    assert.equal(db.prepare(`SELECT book_id FROM ${table}`).get().book_id, 2);
    assert.throws(() => db.exec('UPDATE books SET is_container = 1 WHERE id = 2'), /Move reading content/);
  });
}

test('guards reject container reading flags, including combined conversions and inserts', t => {
  const db = fixture(t);
  assert.throws(() => db.exec('UPDATE books SET has_live_reading = 1 WHERE id = 1'), /Move reading content/);
  assert.throws(() => db.exec('UPDATE books SET is_container = 1, has_live_reading = 1 WHERE id = 2'), /Move reading content/);
  assert.throws(() => db.exec("INSERT INTO books VALUES (3, 1, 1, 'other.pdf')"), /Move reading content/);
  db.exec('UPDATE books SET has_live_reading = 1 WHERE id = 2');
  assert.throws(() => db.exec('UPDATE books SET is_container = 1 WHERE id = 2'), /Move reading content/);
});

test('guards are idempotent and preserve anthology PDFs and non-reading edits', t => {
  const db = fixture(t);
  installReadingOwnershipGuards(db);
  db.exec("UPDATE books SET pdf_path = 'updated.pdf' WHERE id = 1");
  assert.equal(db.prepare('SELECT pdf_path FROM books WHERE id = 1').get().pdf_path, 'updated.pdf');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type = 'trigger'").get().n, 8);
});
