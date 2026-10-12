'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('catalog aggregates public anthology media availability without exposing child file paths', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE books (
    id INTEGER PRIMARY KEY, name TEXT, cover_path TEXT, created_at INTEGER, published_at INTEGER,
    authors TEXT, is_container INTEGER DEFAULT 0, total_sections INTEGER DEFAULT 0, max_section_number INTEGER,
    description TEXT, has_battle_sim INTEGER DEFAULT 0, has_live_reading INTEGER DEFAULT 0,
    isbn TEXT, issn TEXT, asin TEXT, pages INTEGER, pdf_path TEXT, epub_path TEXT,
    series_id INTEGER, series_number TEXT, parent_book_id INTEGER, is_demo INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 1);
    CREATE TABLE series (id INTEGER PRIMARY KEY,name TEXT,is_public INTEGER);
    CREATE TABLE user_books (book_id INTEGER,user_id INTEGER);
    INSERT INTO books (id,name,is_container) VALUES (1,'Public anthology',1),(2,'Private children only',1);
    INSERT INTO books (id,name,parent_book_id,pdf_path,epub_path,is_public,is_demo) VALUES
      (11,'Public PDF',1,'public-child.pdf',NULL,1,0),
      (12,'Public EPUB',1,NULL,'public-child.epub',1,0),
      (21,'Private PDF',2,'private-child.pdf',NULL,0,0),
      (22,'Demo EPUB',2,NULL,'demo-child.epub',1,1);
    INSERT INTO books (id,name,pdf_path) VALUES (3,'Direct PDF','direct.pdf');`);
  const context = vm.createContext({ module: { exports: {} }, require: n => n === './connection' ? { db } : {} });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  const catalog = context.module.exports.getAllPublicBooks;
  const allowed = catalog(true);
  const anthology = allowed.find(b => b.id === 1);
  assert.equal(anthology.hasPdf, true);
  assert.equal(anthology.hasEpub, true);
  assert.equal(anthology.pdfPath, null);
  assert.equal(anthology.epubPath, null);
  assert.equal(allowed.find(b => b.id === 2).hasPdf, false);
  assert.equal(allowed.find(b => b.id === 2).hasEpub, false);
  assert.equal(allowed.find(b => b.id === 3).pdfPath, 'direct.pdf');
  assert.doesNotMatch(JSON.stringify(allowed), /public-child|private-child|demo-child/);
  for (const b of catalog(false)) {
    assert.equal(b.hasPdf, false);
    assert.equal(b.hasEpub, false);
    assert.equal(b.pdfPath, null);
    assert.equal(b.epubPath, null);
  }
});
