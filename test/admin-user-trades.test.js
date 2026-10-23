'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('account trade histories stay private, newest first, bounded and read-only', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const source = fs.readFileSync('server/db/admin.js', 'utf8');
  const fn = source.slice(source.indexOf('function adminGetUser('), source.indexOf('function adminGetUserBooks('));
  const columns = [...new Set([...fn.matchAll(/u\.([a-z_]+)/g)].map(match => match[1]))];
  db.exec(`CREATE TABLE users (${columns.map(name => `${name} ${name === 'id' ? 'INTEGER PRIMARY KEY' : 'TEXT'}`).join(',')});
    CREATE TABLE sessions (user_id INTEGER, token TEXT);
    CREATE TABLE books (id INTEGER, name TEXT);
    CREATE TABLE ruby_rewards (user_id INTEGER, book_id INTEGER, kind TEXT, created_at INTEGER);
    CREATE TABLE ruby_exchanges (user_id INTEGER, rubies INTEGER, rate INTEGER, gold_coins INTEGER, direction TEXT, created_at INTEGER);
    CREATE TABLE diamond_exchanges (user_id INTEGER, diamonds INTEGER, rate INTEGER, gold_coins INTEGER, direction TEXT, created_at INTEGER);
    INSERT INTO users(id,username) VALUES(1,'one'),(2,'two'),(3,'empty');`);
  for (const [table, amount] of [['ruby_exchanges', 'rubies'], ['diamond_exchanges', 'diamonds']]) {
    const insert = db.prepare(`INSERT INTO ${table}(user_id,${amount},rate,gold_coins,direction,created_at) VALUES(?,?,2,?,'sell',100)`);
    for (let n = 1; n <= 23; n++) insert.run(1, n, n * 2);
    insert.run(2, 999, 1998);
  }
  const get = vm.runInNewContext(fn + '\nadminGetUser;', { db,
    getUserXpInfo: () => ({}), rubyInfoForUser: () => ({}),
    getShopRefundRows: () => [], getShopItems: () => [], computeLevel: () => 0 });
  const before = db.prepare('SELECT total_changes() n').get().n;
  const user = get(1);
  for (const [key, amount] of [['rubyTrades', 'rubies'], ['diamondTrades', 'diamonds']]) {
    assert.equal(user[key].length, 20);
    assert.deepEqual(Array.from(user[key], row => row[amount]), Array.from({ length: 20 }, (_, i) => 23 - i));
    assert.equal(get(2)[key][0][amount], 999);
    assert.equal(get(3)[key].length, 0);
  }
  assert.equal(get(99), null);
  assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
});
