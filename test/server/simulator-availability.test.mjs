import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';

test('legacy simulator flag backfill is idempotent and preserves other catalog and player data', () => {
  const source = readFileSync(new URL('../../server/db.js', import.meta.url), 'utf8');
  const sql = source.match(/db\.prepare\(`(UPDATE books SET has_battle_sim = 1\s+WHERE id IN \(465,[\s\S]*?AND has_battle_sim = 0)`\)\.run\(\);/)?.[1];
  assert.ok(sql, 'availability backfill must remain registered');
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE books(id INTEGER PRIMARY KEY, has_battle_sim INTEGER, name TEXT); CREATE TABLE user_books(book_id INTEGER, state_data TEXT)');
    const ids = [465, 468, 734, 739, 740, 869, 871, 877, 881, 882];
    for (const id of [...ids, 9999]) {
      db.prepare('INSERT INTO books VALUES(?,0,?)').run(id, `Book ${id}`);
      db.prepare('INSERT INTO user_books VALUES(?,?)').run(id, '{"fight":"preserved"}');
    }
    const before = db.prepare('SELECT * FROM user_books').all();
    assert.equal(db.prepare(sql).run().changes, 10);
    assert.equal(db.prepare(sql).run().changes, 0);
    assert.deepEqual(db.prepare('SELECT id FROM books WHERE has_battle_sim=1 ORDER BY id').all().map(row => row.id), ids);
    assert.equal(db.prepare('SELECT has_battle_sim FROM books WHERE id=9999').get().has_battle_sim, 0);
    assert.deepEqual(db.prepare('SELECT * FROM user_books').all(), before);
    assert.deepEqual(db.prepare('SELECT name FROM books ORDER BY id').all().map(row => row.name), [...ids, 9999].map(id => `Book ${id}`));
  } finally { db.close(); }
});
