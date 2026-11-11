'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createReadingAccess } = require('../server/db/reading-access');

function fixture({ tester = false } = {}) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER, bonus_coins INTEGER, coins_spent INTEGER, bonus_gc_mint_purchased INTEGER NOT NULL DEFAULT 0, is_admin INTEGER NOT NULL DEFAULT 0, is_moderator INTEGER NOT NULL DEFAULT 0, username TEXT);
    CREATE TABLE admin_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, total_sections INTEGER, has_live_reading INTEGER, is_public INTEGER DEFAULT 1, created_by INTEGER, cover_path TEXT, description TEXT, authors TEXT);
    CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, state_data TEXT);
    CREATE TABLE book_frontmatter (book_id INTEGER PRIMARY KEY, intro_text TEXT, rules_text TEXT);
    INSERT INTO users (id, xp, bonus_coins, coins_spent) VALUES (1, 5000, 0, 0), (2, 0, 0, 0);
    UPDATE users SET is_admin = 1 WHERE id = 1;
    INSERT INTO books (id, name, total_sections, has_live_reading) VALUES
      (263, 'Trial', 400, 1), (202, 'Other', 400, 1), (999, 'Free', 99, 1);
    INSERT INTO book_frontmatter VALUES (263, 'Intro <script>', 'Rules');
    INSERT INTO user_books VALUES (1, 202, '{"playthroughs":[{"path":[1,2]}]}'),
      (2, 202, 'broken json');`);
  db.prepare('UPDATE users SET username=? WHERE id=2').run(tester ? 'sashii' : 'player2');
  return { db, access: createReadingAccess(db) };
}

test('admin pays real coins before 482 users, while ordinary players and short books stay free', () => {
  const { db, access } = fixture();
  assert.equal(access.threshold(),482);
  assert.equal(access.getAccess(1,202).purchased,true,'existing admin run is grandfathered');
  assert.equal(access.getAccess(1,263).cost,4);
  assert.equal(access.getAccess(1,263).locked,true);
  assert.equal(access.getAccess(2,263).locked,false);
  assert.equal(access.getAccess(2,263).cost,0);
  assert.equal(access.unlock(2,263,0).error,'purchasing_disabled');
  assert.equal(access.getAccess(1,999).locked,false);
  assert.equal(access.unlock(1,263,4).newBalance,1);
  assert.equal(access.unlock(1,263,4).alreadyUnlocked,true);
  assert.equal(db.prepare('SELECT coins_spent FROM users WHERE id=1').get().coins_spent,4);
  assert.equal(createReadingAccess(db).getAccess(1,263).locked,false);
  db.close();
});

test('activation occurs exactly at threshold and freezes historical run ownership once', () => {
  const { db, access } = fixture();
  db.prepare('INSERT INTO user_books VALUES (2,263,?)').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  db.exec("INSERT INTO books (id,name,total_sections,has_live_reading,is_public) VALUES (1000,'New book',199,1,1)");
  access.setThreshold(3);
  assert.equal(access.getAccess(2,1000).locked,false);
  db.prepare('INSERT INTO user_books VALUES (1,1000,?)').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  db.exec('INSERT INTO users (id,xp,bonus_coins,coins_spent) VALUES (3,0,0,0)');
  access.syncActivation();
  assert.equal(access.getAccess(2,263).purchased,true);
  assert.equal(access.getAccess(2,1000).locked,true);
  assert.equal(access.getAccess(1,1000).purchased,false,'admin runs created after early charging are not grandfathered again');
  db.prepare('INSERT INTO user_books VALUES (3,1000,?)').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  assert.equal(createReadingAccess(db).getAccess(3,1000).purchased,false,'new runs never bypass payment');
  assert.equal(access.unlock(3,1000,1).error,'insufficient_coins');
  assert.equal(access.getAccess(3,1000).purchased,false);
  db.exec('UPDATE users SET bonus_coins=2 WHERE id=3');
  assert.equal(access.unlock(3,1000,2).error,'cost_changed');
  assert.equal(access.unlock(3,1000,1).newBalance,1);
  db.exec('DELETE FROM user_books WHERE user_id=3');
  assert.equal(access.getAccess(3,1000).purchased,true,'deleting a book/run retains permanent reading ownership');
  for(const bad of [-1,1.5,NaN,Infinity])assert.throws(()=>access.setThreshold(bad));
  db.close();
});

test('the default policy starts charging at registered user 482, not 481',()=>{
  const {db,access}=fixture();
  const insert=db.prepare('INSERT INTO users (id,xp,bonus_coins,coins_spent) VALUES (?,0,0,0)');
  db.transaction(()=>{for(let id=3;id<=481;id++)insert.run(id);})();
  db.prepare('INSERT INTO user_books VALUES (2,263,?)').run(JSON.stringify({preSeriesRuns:[{path:[1,2]}]}));
  assert.equal(access.getAccess(2,999).locked,false);
  assert.equal(access.getAccess(481,263).locked,false);
  insert.run(482);access.syncActivation();
  assert.equal(access.getAccess(482,263).locked,true);
  assert.equal(access.getAccess(2,263).purchased,true,'pre-series reading runs are also grandfathered');
  assert.equal(access.getAccess(2,999).locked,false);
  db.close();
});

test('floor pricing handles 99, 100, 199 and 200 sections without zero-cost prompts',()=>{
  const {db,access}=fixture();access.setThreshold(0);
  for(const [sections,cost]of [[99,0],[100,1],[199,1],[200,2]]){
    db.prepare('UPDATE books SET total_sections=? WHERE id=263').run(sections);
    const result=access.getAccess(2,263);
    assert.equal(result.cost,cost);assert.equal(result.locked,cost>0);
    assert.equal(result.purchasingEnabled,cost>0);
  }
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
  const paid = createReadingAccess(db);
  assert.throws(() => paid.unlock(1, 263, 4), /failed/);
  assert.equal(paid.getAccess(1, 263).purchased, false);
  db.close();
});

test('book-defined reading entries default to one and never modify saved runs', () => {
  const { db, access } = fixture();
  const before = db.prepare('SELECT * FROM user_books').all();
  assert.equal(access.getAccess(1, 202).startSection, 1);
  db.prepare('INSERT INTO book_reading_entries (book_id, section_id, counts_as_section) VALUES (?, ?, 0)').run(202, 'prologue');
  assert.equal(access.getAccess(1, 202).startSection, 'prologue');
  assert.equal(access.getAccess(1, 202, false).startSection, 'prologue');
  assert.equal(createReadingAccess(db).getAccess(1, 202).startSection, 'prologue');
  assert.deepEqual(db.prepare('SELECT * FROM user_books').all(), before);
  for (const invalid of ['', ' ', '0', '-1']) {
    assert.throws(() => db.prepare('INSERT INTO book_reading_entries (book_id, section_id) VALUES (?, ?)').run(999, invalid), /CHECK/);
  }
  db.exec('DELETE FROM user_books WHERE book_id = 202; DELETE FROM reading_unlocks WHERE book_id = 202; DELETE FROM books WHERE id = 202');
  assert.equal(db.prepare('SELECT count(*) n FROM book_reading_entries').get().n, 0);
  db.close();
});

test('an uncounted auxiliary section can keep an independent normal reading start', () => {
  const { db, access } = fixture();
  const before = db.prepare('SELECT * FROM user_books').all();
  db.prepare(`INSERT INTO book_reading_entries (book_id, section_id, counts_as_section, start_section_id)
    VALUES (?, ?, 0, ?)`).run(202, '680', '1');
  for (const service of [access, createReadingAccess(db)]) {
    assert.equal(service.getAccess(1, 202).startSection, 1);
    assert.equal(service.getAccess(1, 202, false).startSection, 1);
  }
  assert.deepEqual(db.prepare('SELECT section_id, counts_as_section FROM book_reading_entries WHERE book_id=202').get(),
    { section_id: '680', counts_as_section: 0 });
  assert.deepEqual(db.prepare('SELECT * FROM user_books').all(), before);
  for (const invalid of ['', ' ', '0', '-1']) {
    assert.throws(() => db.prepare('UPDATE book_reading_entries SET start_section_id=? WHERE book_id=202').run(invalid), /CHECK/);
  }
  db.close();
});

test('legacy entry migration retains its start, count policy and saved state', () => {
  const { db } = fixture();
  db.exec(`DROP TABLE book_reading_entries;
    CREATE TABLE book_reading_entries (book_id INTEGER PRIMARY KEY, section_id TEXT NOT NULL, counts_as_section INTEGER NOT NULL DEFAULT 1);
    INSERT INTO book_reading_entries VALUES (202, 'prologue', 0);`);
  const before = db.prepare('SELECT * FROM user_books').all();
  const access = createReadingAccess(db);
  assert.equal(access.getAccess(1, 202).startSection, 'prologue');
  assert.deepEqual(db.prepare('SELECT * FROM book_reading_entries').all(),
    [{ book_id: 202, section_id: 'prologue', counts_as_section: 0, start_section_id: null }]);
  assert.deepEqual(db.prepare('SELECT * FROM user_books').all(), before);
  db.close();
});

test('Sashii pays before threshold and keeps existing reading runs',()=>{
  const {db,access}=fixture({tester:true});
  assert.equal(access.getAccess(2,263).locked,true);
  assert.equal(access.getAccess(2,263).cost,4);
  db.exec('UPDATE users SET bonus_coins=10 WHERE id=2');
  assert.equal(access.unlock(2,263,4).newBalance,6);
  assert.equal(access.unlock(2,263,4).alreadyUnlocked,true);
  assert.equal(db.prepare('SELECT coins_spent FROM users WHERE id=2').get().coins_spent,4);
  assert.equal(access.getAccess(2,999).locked,false);
  db.close();
});

test('Lorekeepers use real coin purchases before threshold and keep permanent unlocks',()=>{
  const {db,access}=fixture();
  db.exec('UPDATE users SET is_moderator=1, bonus_coins=10 WHERE id=2');
  assert.equal(access.getAccess(2,263).locked,true);
  assert.equal(access.getAccess(2,263).cost,4);
  assert.equal(access.getAccess(2,999).locked,false);
  db.prepare('INSERT INTO user_books VALUES (2,263,?)').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  assert.equal(access.getAccess(2,263).purchased,false,'new runs cannot bypass payment');
  assert.equal(access.unlock(2,263,4).newBalance,6);
  assert.equal(access.unlock(2,263,4).alreadyUnlocked,true);
  assert.equal(db.prepare('SELECT coins_spent FROM users WHERE id=2').get().coins_spent,4);
  db.exec('DELETE FROM user_books WHERE user_id=2; UPDATE users SET is_moderator=0 WHERE id=2');
  assert.equal(access.getAccess(2,263).purchased,true);
  assert.equal(access.getAccess(2,202).locked,false,'test eligibility follows the current role');
  db.close();
});

test('updated free-run triggers preserve older unlocks while excluding Lorekeeper runs',()=>{
  const {db,access}=fixture();
  db.prepare('INSERT INTO user_books VALUES (2,202,?)').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  assert.equal(access.getAccess(2,202).purchased,true);
  for(const suffix of ['insert','update']){
    const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get('reading_free_run_'+suffix).sql;
    db.exec('DROP TRIGGER reading_free_run_'+suffix);
    db.exec(sql.replace(' AND is_moderator = 0',''));
  }
  db.exec('UPDATE users SET is_moderator=1 WHERE id=2');
  const updated=createReadingAccess(db);
  assert.equal(updated.getAccess(2,202).purchased,true,'existing free-period ownership remains');
  db.prepare('INSERT INTO user_books VALUES (2,263,?)').run(JSON.stringify({playthroughs:[{path:[]}]}));
  db.prepare('UPDATE user_books SET state_data=? WHERE user_id=2 AND book_id=263').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  assert.equal(updated.getAccess(2,263).purchased,false,'old trigger definitions were upgraded');
  assert.equal(updated.getAccess(2,263).locked,true);
  db.close();
});

test('a run started during free reading retains its permanent unlock after the run is removed',()=>{
  const {db,access}=fixture();
  const before=db.prepare('SELECT coins_spent FROM users WHERE id=2').get();
  db.prepare('INSERT INTO user_books VALUES (2,263,?)').run(JSON.stringify({playthroughs:[{path:[]}]}));
  assert.equal(access.getAccess(2,263).purchased,false);
  db.prepare('UPDATE user_books SET state_data=? WHERE user_id=2 AND book_id=263').run(JSON.stringify({playthroughs:[{path:[1]}]}));
  assert.equal(access.getAccess(2,263).purchased,true);
  db.exec('DELETE FROM user_books WHERE user_id=2 AND book_id=263');
  access.setThreshold(2);
  assert.equal(access.getAccess(2,263).locked,false);
  assert.deepEqual(db.prepare('SELECT coins_spent FROM users WHERE id=2').get(),before);
  db.close();
});
