'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { installSeriesNotebooks, getNotebook, setNotebook } = require('../server/db/series-notebooks');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE series (id INTEGER PRIMARY KEY, is_open_world INTEGER);
    CREATE TABLE books (id INTEGER PRIMARY KEY, series_id INTEGER, parent_book_id INTEGER);
    CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, notebook TEXT, state_data TEXT,
      PRIMARY KEY(user_id,book_id));
    INSERT INTO users VALUES (7),(8);
    INSERT INTO series VALUES (1,1),(2,0),(3,1);
    INSERT INTO books VALUES (10,1,NULL),(20,1,NULL),(30,1,NULL),(40,2,NULL),(50,NULL,NULL),(60,3,NULL),(11,NULL,10);
    INSERT INTO user_books VALUES
      (7,10,'First old notebook','{"playthroughs":[{"sim674":{"fight":{"hp":3}}}]}'),
      (7,20,'Second old notebook','{"playthroughs":[{"path":[1,4]}]}'),
      (7,30,'First old notebook','{}'),(7,40,'Ordinary series','{}'),(7,50,'Standalone','{}'),
      (7,60,'Other open world','{}'),(8,10,'Other user','{}'),(7,11,'Child notes','{}');`);
  return db;
}

test('installing shared notebooks preserves all existing users, notes, runs and simulator data', t => {
  const db = fixture(t);
  const before = db.prepare('SELECT * FROM user_books ORDER BY user_id,book_id').all();
  installSeriesNotebooks(db);
  installSeriesNotebooks(db);
  assert.deepEqual(db.prepare('SELECT * FROM user_books ORDER BY user_id,book_id').all(), before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM series_notebooks').get().n, 0);
  const changes = db.prepare('SELECT total_changes() n').get().n;
  const combined = getNotebook(db, 7, 20);
  assert.equal(combined, 'Second old notebook\n\nFirst old notebook\n\nChild notes');
  assert.equal(db.prepare('SELECT total_changes() n').get().n, changes, 'reading legacy notes never changes player data');
});

test('notes travel bidirectionally through three books and anthology children, including clearing', t => {
  const db = fixture(t); installSeriesNotebooks(db);
  const states = db.prepare('SELECT user_id,book_id,state_data FROM user_books ORDER BY user_id,book_id').all();
  assert.equal(setNotebook(db, 7, 20, 'Started in second book'), true);
  for (const id of [10, 20, 30, 11]) assert.equal(getNotebook(db, 7, id), 'Started in second book');
  setNotebook(db, 7, 10, 'Started in second book\nAdded in first');
  assert.equal(getNotebook(db, 7, 30), 'Started in second book\nAdded in first');
  setNotebook(db, 7, 30, 'Third book edit');
  assert.equal(getNotebook(db, 7, 20), 'Third book edit');
  setNotebook(db, 7, 11, '');
  for (const id of [10, 20, 30, 11]) assert.equal(getNotebook(db, 7, id), '');
  assert.deepEqual(db.prepare('SELECT user_id,book_id,state_data FROM user_books ORDER BY user_id,book_id').all(), states);
  assert.equal(db.prepare('SELECT notebook FROM user_books WHERE user_id=7 AND book_id=10').get().notebook,
    'Started in second book\nAdded in first', 'previous per-book notes remain preserved');
});

test('notebooks remain isolated by account, series and library membership', t => {
  const db = fixture(t); installSeriesNotebooks(db);
  setNotebook(db, 7, 20, 'Shared');
  assert.equal(getNotebook(db, 8, 10), 'Other user');
  assert.equal(getNotebook(db, 7, 60), 'Other open world');
  assert.equal(getNotebook(db, 7, 40), 'Ordinary series');
  assert.equal(getNotebook(db, 7, 50), 'Standalone');
  assert.equal(getNotebook(db, 8, 20), null);
  assert.equal(setNotebook(db, 8, 20, 'Forbidden'), false);
  assert.equal(getNotebook(db, 7, 20), 'Shared');
  db.exec('UPDATE series SET is_open_world=0 WHERE id=1');
  assert.equal(getNotebook(db, 7, 10), 'First old notebook', 'disabling open world retains original local notes');
  db.exec('UPDATE series SET is_open_world=1 WHERE id=1');
  assert.equal(getNotebook(db, 7, 10), 'Shared');
});

test('failed saves roll back shared and local notebook changes together', t => {
  const db = fixture(t); installSeriesNotebooks(db);
  setNotebook(db, 7, 20, 'Before');
  db.exec("CREATE TRIGGER reject_notes BEFORE UPDATE ON user_books BEGIN SELECT RAISE(ABORT,'blocked'); END");
  assert.throws(() => setNotebook(db, 7, 20, 'After'), /blocked/);
  assert.equal(getNotebook(db, 7, 10), 'Before');
  assert.equal(db.prepare('SELECT notebook FROM user_books WHERE user_id=7 AND book_id=20').get().notebook, 'Before');
});

test('book exports include the shared notebook, explicit clears and preserved run data', t => {
  const db = fixture(t); installSeriesNotebooks(db);
  for (const column of ['name TEXT', 'total_sections INTEGER', 'discoverable_sections INTEGER',
    'isbn TEXT', 'issn TEXT', 'asin TEXT', 'pages INTEGER', 'authors TEXT', 'description TEXT',
    'created_at INTEGER', 'cover_path TEXT', 'is_public INTEGER']) db.exec('ALTER TABLE books ADD COLUMN ' + column);
  db.exec('ALTER TABLE series ADD COLUMN name TEXT; ALTER TABLE user_books ADD COLUMN rating INTEGER');
  const fs = require('node:fs'), vm = require('node:vm');
  const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/db/misc'), 'utf8'), {
    module, exports:module.exports,
    require: name => {
      if (name === './connection') return {db, _naturalCompareByName:(a,b)=>a.id-b.id};
      if (name === './xp') return {};
      throw Error('Unexpected dependency ' + name);
    },
  });
  const {getBookForExport, getAllBooksForExport} = module.exports;
  const before = JSON.stringify(getBookForExport(7,10).state);
  setNotebook(db,7,20,'Shared export');
  for (const id of [10,20,30,11]) assert.equal(getBookForExport(7,id).notebook,'Shared export');
  assert.equal(JSON.stringify(getBookForExport(7,10).state),before);
  assert.equal(getBookForExport(8,10).notebook,'Other user');
  assert.equal(getBookForExport(8,20),null);
  assert.equal(getBookForExport(7,40).notebook,'Ordinary series');
  setNotebook(db,7,20,'');
  for (const row of getAllBooksForExport(7).filter(row=>[10,20,30,11].includes(row.id))) assert.equal(row.notebook,'');
});
