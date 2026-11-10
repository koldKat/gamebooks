'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeAdminCrystalGold } = require('../server/db/admin-crystal-gold');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER,diamonds_spent INTEGER,diamonds_bought INTEGER);
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER,rubies_spent INTEGER,rubies_bought INTEGER);
    CREATE TABLE diamond_market(id INTEGER PRIMARY KEY,diamonds INTEGER,diamonds_mined INTEGER);
    CREATE TABLE ruby_market(id INTEGER PRIMARY KEY,rubies INTEGER,rubies_generated INTEGER);
    INSERT INTO user_diamonds VALUES(1,17,12,8);
    INSERT INTO user_rubies VALUES(1,11,9,5);
    INSERT INTO diamond_market VALUES(1,99,4);
    INSERT INTO ruby_market VALUES(1,88,3);`);
  initializeAdminCrystalGold(db);
  return { db, total: () => db.prepare('SELECT generated FROM admin_crystal_gold WHERE id=1').get().generated };
}

test('backfills both player wallets and app generation once, excluding bought and traded stock', t => {
  const f = fixture(t);
  assert.equal(f.total(), 35);
  assert.equal(initializeAdminCrystalGold(f.db), 35);
  assert.equal(f.total(), 35);
});

test('each generated crystal counts once, across insert, update and all four sources', t => {
  const f = fixture(t);
  f.db.exec(`INSERT INTO user_diamonds VALUES(2,2,0,0);
    INSERT INTO user_rubies VALUES(2,3,0,0);
    UPDATE user_diamonds SET diamonds_earned=diamonds_earned+1 WHERE user_id=1;
    UPDATE user_rubies SET rubies_earned=rubies_earned+2 WHERE user_id=1;
    UPDATE diamond_market SET diamonds_mined=diamonds_mined+3 WHERE id=1;
    UPDATE ruby_market SET rubies_generated=rubies_generated+4 WHERE id=1;`);
  assert.equal(f.total(), 50);
});

test('trades, repeated values and stock changes never mint extra pool gold', t => {
  const f = fixture(t);
  f.db.exec(`UPDATE user_diamonds SET diamonds_spent=15,diamonds_bought=19,diamonds_earned=diamonds_earned;
    UPDATE user_rubies SET rubies_spent=15,rubies_bought=19;
    UPDATE diamond_market SET diamonds=200;
    UPDATE ruby_market SET rubies=200;`);
  assert.equal(f.total(), 35);
});

test('corrections reverse generation, account deletion retains lifetime credit and rollbacks are atomic', t => {
  const f = fixture(t);
  f.db.exec('UPDATE user_diamonds SET diamonds_earned=diamonds_earned-2');
  assert.equal(f.total(), 33);
  f.db.exec('DELETE FROM user_diamonds');
  assert.equal(f.total(), 33);
  initializeAdminCrystalGold(f.db);
  assert.equal(f.total(), 33);
  assert.throws(() => f.db.transaction(() => {
    f.db.exec('UPDATE ruby_market SET rubies_generated=rubies_generated+10');
    throw Error('abort');
  })(), /abort/);
  assert.equal(f.total(), 33);
});
