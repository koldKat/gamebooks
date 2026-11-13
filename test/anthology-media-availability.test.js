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
    isbn TEXT, issn TEXT, asin TEXT, pages INTEGER, pdf_path TEXT,
    series_id INTEGER, series_number TEXT, parent_book_id INTEGER,
    is_public INTEGER DEFAULT 1);
    CREATE TABLE series (id INTEGER PRIMARY KEY,name TEXT,is_public INTEGER);
    CREATE TABLE user_books (book_id INTEGER,user_id INTEGER);
    INSERT INTO books (id,name,is_container) VALUES (1,'Public anthology',1),(2,'Private children only',1);
    INSERT INTO books (id,name,parent_book_id,pdf_path,is_public) VALUES
      (11,'Public PDF',1,'public-child.pdf',1),
      (21,'Private PDF',2,'private-child.pdf',0);
    INSERT INTO books (id,name,pdf_path) VALUES (3,'Direct PDF','direct.pdf');`);
  const context = vm.createContext({ module: { exports: {} }, require: n => n === './connection' ? { db } : {} });
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'), 'utf8'), context);
  const catalog = context.module.exports.getAllPublicBooks;
  const allowed = catalog(true);
  const anthology = allowed.find(b => b.id === 1);
  assert.equal(anthology.hasPdf, true);
  assert.equal(anthology.pdfPath, null);
  assert.equal(allowed.find(b => b.id === 2).hasPdf, false);
  assert.equal(allowed.find(b => b.id === 3).pdfPath, 'direct.pdf');
  assert.doesNotMatch(JSON.stringify(allowed), /public-child|private-child/);
  for (const b of catalog(false)) {
    assert.equal(b.hasPdf, false);
    assert.equal(b.pdfPath, null);
  }
});

test('series list shows anthology reading availability from public children', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE series(id INTEGER PRIMARY KEY,name TEXT,description TEXT,is_public INTEGER,is_open_world INTEGER,created_by INTEGER);
    CREATE TABLE user_series(series_id INTEGER,rating REAL);
    CREATE TABLE books(id INTEGER PRIMARY KEY,name TEXT,total_sections INTEGER,max_section_number INTEGER,
      cover_path TEXT,is_container INTEGER DEFAULT 0,series_number TEXT,isbn TEXT,issn TEXT,pages INTEGER,
      authors TEXT,has_battle_sim INTEGER DEFAULT 0,has_live_reading INTEGER DEFAULT 0,pdf_path TEXT,
      parent_book_id INTEGER,series_id INTEGER,is_public INTEGER DEFAULT 1,book_order INTEGER);
    INSERT INTO series VALUES(50,'Magazine series',NULL,1,0,1);
    INSERT INTO books(id,name,is_container,series_id,series_number) VALUES
      (1,'Public reader',1,50,'1'),(2,'Private reader only',1,50,'2'),(3,'No reader',1,50,'3');
    INSERT INTO books(id,name,parent_book_id,has_live_reading,is_public) VALUES
      (11,'Readable child',1,1,1),(12,'Unreadable child',1,0,1),(21,'Private child',2,1,0);
    INSERT INTO books(id,name,series_id,series_number,has_live_reading) VALUES(4,'Individual reader',50,'4',1);`);
  const context = vm.createContext({ db,
    _naturalCompare: (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }),
    _getAggregateSeriesRating: () => ({ avgRating: null, voteCount: 0 }),
  });
  const source = fs.readFileSync(require.resolve('../server/db/books'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function getPublicSeriesInfo('), source.indexOf('\nfunction normalizeAuthors(')), context);
  for (const hasPdfAccess of [false, true]) {
    const rows = context.getPublicSeriesInfo(50, hasPdfAccess).books;
    assert.equal(rows.find(b => b.id === 1).hasLiveReading, true);
    assert.equal(rows.find(b => b.id === 2).hasLiveReading, false);
    assert.equal(rows.find(b => b.id === 3).hasLiveReading, false);
    assert.equal(rows.find(b => b.id === 4).hasLiveReading, true);
    assert.deepEqual(Array.from(rows.find(b => b.id === 1).children, b => b.hasLiveReading), [true, false]);
    assert.equal(rows.find(b => b.id === 2).children.length, 0);
  }
});
