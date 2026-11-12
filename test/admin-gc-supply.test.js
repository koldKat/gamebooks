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
      is_container INTEGER DEFAULT 0, authors TEXT, pdf_path TEXT);
    CREATE TABLE series (id INTEGER PRIMARY KEY);
    CREATE TABLE xp_events (event TEXT);
    CREATE TABLE coin_events (event TEXT, amount INTEGER);
    CREATE TABLE admin_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE admin_crystal_gold (id INTEGER PRIMARY KEY, generated INTEGER);
    INSERT INTO admin_crystal_gold VALUES (1,0);
    INSERT INTO books (id, pdf_path) VALUES (1, 'existing.pdf');
    INSERT INTO books (id, is_container) VALUES (2, 1);
    INSERT INTO books (id, parent_book_id) VALUES (3, 2);
    INSERT INTO admin_settings VALUES ('admin_gc_gifted', '1');
  `);
  const source = fs.readFileSync(require.resolve('../server/db/misc'), 'utf8');
  const context = vm.createContext({ db });
  vm.runInContext(source.slice(source.indexOf('function getAdminGcSupply('), source.indexOf('function adminGiftGc(')), context);
  const appBirthAt = Math.floor(Date.now() / 1000);
  return { db, supply: () => JSON.parse(JSON.stringify(context.getAdminGcSupply(appBirthAt))) };
}

test('PDF attachments contribute alongside books and anthologies', t => {
  const f = fixture(t);
  assert.deepEqual(f.supply(), { earned: 3, gifted: 1, available: 2 });
  assert.deepEqual(f.supply(), { earned: 3, gifted: 1, available: 2 });
  assert.equal(f.db.prepare("SELECT value FROM admin_settings WHERE key='admin_gc_gifted'").get().value, '1');
});

test('adding, replacing and removing a PDF changes only its attachment contribution', t => {
  const f = fixture(t);
  f.db.prepare('UPDATE books SET pdf_path = ? WHERE id = 3').run('child.pdf');
  assert.deepEqual(f.supply(), { earned: 4, gifted: 1, available: 3 });
  f.db.prepare('UPDATE books SET pdf_path = ? WHERE id = 3').run('replacement.pdf');
  assert.deepEqual(f.supply(), { earned: 4, gifted: 1, available: 3 });
  f.db.prepare('UPDATE books SET pdf_path = NULL WHERE id = 3').run();
  assert.deepEqual(f.supply(), { earned: 3, gifted: 1, available: 2 });
  f.db.prepare('UPDATE books SET pdf_path = NULL WHERE id = 1').run();
  assert.deepEqual(f.supply(), { earned: 2, gifted: 1, available: 1 });
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
  assert.deepEqual(f.supply(), { earned: 8, gifted: 1, available: 7 });
  f.db.exec("UPDATE admin_settings SET value = '99' WHERE key = 'admin_gc_gifted'");
  assert.deepEqual(f.supply(), { earned: 8, gifted: 99, available: 0 });
});

test('generated crystals contribute to the pool without changing gifted gold', t => {
  const f = fixture(t);
  f.db.exec('UPDATE admin_crystal_gold SET generated=27 WHERE id=1');
  assert.deepEqual(f.supply(), { earned: 30, gifted: 1, available: 29 });
});
