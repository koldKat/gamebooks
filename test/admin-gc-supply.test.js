'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER DEFAULT 0);
    CREATE TABLE books (id INTEGER PRIMARY KEY, parent_book_id INTEGER,
      is_container INTEGER DEFAULT 0, authors TEXT, pdf_path TEXT, epub_path TEXT);
    CREATE TABLE series (id INTEGER PRIMARY KEY);
    CREATE TABLE xp_events (event TEXT);
    CREATE TABLE coin_events (event TEXT, amount INTEGER);
    CREATE TABLE admin_settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO books (id, pdf_path, epub_path) VALUES (1, 'existing.pdf', 'existing.epub');
    INSERT INTO books (id, is_container, epub_path) VALUES (2, 1, 'anthology.epub');
    INSERT INTO books (id, parent_book_id) VALUES (3, 2);
    INSERT INTO admin_settings VALUES ('admin_gc_gifted', '1');
  `);
  const source = fs.readFileSync(require.resolve('../server/db/misc'), 'utf8');
  const context = vm.createContext({ db });
  vm.runInContext(source.slice(source.indexOf('function getAdminGcSupply('), source.indexOf('function adminGiftGc(')), context);
  const appBirthAt = Math.floor(Date.now() / 1000);
  return { db, supply: () => JSON.parse(JSON.stringify(context.getAdminGcSupply(appBirthAt))) };
}

test('existing EPUBs count retroactively, including anthologies and alongside PDFs', t => {
  const f = fixture(t);
  assert.deepEqual(f.supply(), { earned: 5, gifted: 1, available: 4 });
  assert.deepEqual(f.supply(), { earned: 5, gifted: 1, available: 4 });
  assert.equal(f.db.prepare("SELECT value FROM admin_settings WHERE key='admin_gc_gifted'").get().value, '1');
});

test('adding, replacing and removing an EPUB changes only its attachment contribution', t => {
  const f = fixture(t);
  f.db.prepare('UPDATE books SET epub_path = ? WHERE id = 3').run('child.epub');
  assert.deepEqual(f.supply(), { earned: 6, gifted: 1, available: 5 });
  f.db.prepare('UPDATE books SET epub_path = ? WHERE id = 3').run('replacement.epub');
  assert.deepEqual(f.supply(), { earned: 6, gifted: 1, available: 5 });
  f.db.prepare('UPDATE books SET epub_path = NULL WHERE id = 3').run();
  assert.deepEqual(f.supply(), { earned: 5, gifted: 1, available: 4 });
  f.db.prepare('UPDATE books SET epub_path = NULL WHERE id = 1').run();
  assert.deepEqual(f.supply(), { earned: 4, gifted: 1, available: 3 });
});

test('other contributions and gifted-coin accounting remain intact', t => {
  const f = fixture(t);
  f.db.exec(`
    INSERT INTO users VALUES (1, 3000);
    INSERT INTO series VALUES (1);
    UPDATE books SET authors = 'Author' WHERE id IN (1, 2);
    INSERT INTO xp_events VALUES ('visit_all');
    INSERT INTO coin_events VALUES ('visit_all_series', 3), ('visit_all_anthology', 2), ('unrelated', 100);
  `);
  assert.deepEqual(f.supply(), { earned: 16, gifted: 1, available: 15 });
  f.db.exec("UPDATE admin_settings SET value = '99' WHERE key = 'admin_gc_gifted'");
  assert.deepEqual(f.supply(), { earned: 16, gifted: 99, available: 0 });
});
