'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createReadingAccess } = require('../server/db/reading-access');

function fixture(policy) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER, bonus_coins INTEGER, coins_spent INTEGER);
    CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, total_sections INTEGER, has_live_reading INTEGER,
      is_demo INTEGER DEFAULT 0, is_public INTEGER DEFAULT 1, created_by INTEGER);
    CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, state_data TEXT);
    CREATE TABLE book_frontmatter (book_id INTEGER PRIMARY KEY, intro_text TEXT, rules_text TEXT);
    INSERT INTO users VALUES (1, 5000, 0, 0), (2, 0, 0, 0);
    INSERT INTO books (id, name, total_sections, has_live_reading) VALUES
      (263, 'Trial', 400, 1), (202, 'Other', 400, 1), (999, 'Free', 99, 1);
    INSERT INTO book_frontmatter VALUES (263, 'Intro <script>', 'Rules');
    INSERT INTO user_books VALUES (1, 202, '{"playthroughs":[{"path":[1,2]}]}'),
      (2, 202, 'broken json');`);
  return { db, access: createReadingAccess(db, policy) };
}

test('trial gates only 263 at zero cost and preserves historical purchases once', () => {
  const { db, access } = fixture();
  assert.equal(access.getAccess(1, 202).purchased, true);
  assert.equal(access.getAccess(2, 202).purchased, false);
  assert.equal(access.getAccess(2, 202).locked, false);
  assert.equal(access.getAccess(1, 263).locked, true);
  assert.equal(access.getAccess(1, 263).cost, 0);
  assert.equal(access.getAccess(1, 263).introText, 'Intro <script>');
  assert.equal(access.getAccess(1, 263, false).introText, '', 'section checks do not load long frontmatter');
  assert.deepEqual(access.unlock(1, 202), { ok: true, alreadyUnlocked: true, cost: 0 });
  assert.equal(access.unlock(2, 202).error, 'purchasing_disabled');
  db.prepare('INSERT INTO user_books VALUES (?, ?, ?)').run(2, 263, '{"playthroughs":[{"path":[1]}]}');
  const again = createReadingAccess(db);
  assert.equal(again.getAccess(2, 263).purchased, false, 'later runs never bypass gate');
  const before = db.prepare('SELECT * FROM users WHERE id = 2').get();
  assert.equal(access.unlock(2, 263).ok, true);
  assert.equal(access.unlock(2, 263).alreadyUnlocked, true);
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id = 2').get(), before);
  assert.equal(again.getAccess(2, 263).locked, false, 'unlock persists across service recreation');
  db.close();
});

test('disabled policy leaves reading alone; paid policy prices and deducts atomically', () => {
  const { db, access } = fixture({ testBookId: null, paidEnabled: false });
  assert.equal(access.getAccess(2, 263).locked, false);
  assert.equal(access.unlock(2, 263).error, 'purchasing_disabled');
  const paid = createReadingAccess(db, { testBookId: null, paidEnabled: true });
  assert.equal(paid.getAccess(2, 999).locked, false);
  assert.equal(paid.getAccess(1, 263).cost, 4);
  assert.equal(paid.unlock(2, 263).error, 'insufficient_coins');
  assert.equal(paid.getAccess(2, 263).purchased, false);
  assert.equal(paid.unlock(1, 263).newBalance, 1);
  assert.equal(paid.unlock(1, 263).alreadyUnlocked, true);
  assert.equal(db.prepare('SELECT coins_spent FROM users WHERE id = 1').get().coins_spent, 4);
  db.close();
});

test('private and unavailable books cannot be previewed or unlocked by another player', () => {
  const { db, access } = fixture();
  db.exec('UPDATE books SET is_public = 0, created_by = 1 WHERE id = 263');
  assert.equal(access.getAccess(2, 263), null);
  assert.equal(access.unlock(2, 263).error, 'not_found');
  assert.ok(access.getAccess(1, 263));
  db.exec('INSERT INTO user_books VALUES (2, 263, NULL)');
  assert.ok(access.getAccess(2, 263));
  db.exec('UPDATE books SET has_live_reading = 0 WHERE id = 263');
  assert.equal(access.getAccess(1, 263), null);
  assert.equal(access.getAccess(1, 123456), null);
  db.close();
});

test('failed coin update rolls back unlock; initial-node historical runs are retained', () => {
  const { db } = fixture();
  db.exec(`INSERT INTO user_books VALUES (1, 263, '{"playthroughs":[{"path":[1]}]}');
    DELETE FROM reading_access_migrations;`);
  const access = createReadingAccess(db);
  assert.equal(access.getAccess(1, 263).purchased, true);
  db.exec(`DELETE FROM reading_unlocks WHERE book_id = 263;
    CREATE TRIGGER reject_charge BEFORE UPDATE OF coins_spent ON users BEGIN SELECT RAISE(ABORT, 'failed'); END;`);
  const paid = createReadingAccess(db, { testBookId: null, paidEnabled: true });
  assert.throws(() => paid.unlock(1, 263), /failed/);
  assert.equal(paid.getAccess(1, 263).purchased, false);
  db.close();
});
