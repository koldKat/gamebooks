'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeDiamondBalances, diamondInfoForUser } = require('../server/db/diamonds');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE xp_events (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event TEXT, ref TEXT, UNIQUE(user_id, event, ref));
    INSERT INTO users(id) VALUES (1), (2);`);
  const insert = db.prepare('INSERT OR IGNORE INTO xp_events VALUES (?, ?, ?)');
  const add = (id, event, n, prefix = '') => db.transaction(() => {
    for (let i = 0; i < n; i++) insert.run(id, event, prefix + i);
  })();
  const count = id => db.prepare('SELECT qualifying_events AS n FROM user_diamonds WHERE user_id = ?').get(id)?.n || 0;
  return { db, add, count };
}

test('diamond history backfill excludes heartbeats and repeats without double counting', t => {
  const h = fixture(t);
  h.add(1, 'visit_node', 999); h.add(1, 'idle_heartbeat', 1500);
  h.add(2, 'visit_node', 2001);
  initializeDiamondBalances(h.db);
  assert.equal(h.count(1), 999);
  assert.equal(Math.floor(h.count(2) / 1000), 2);
  initializeDiamondBalances(h.db);
  assert.equal(h.count(1), 999);
  assert.equal(h.count(2), 2001);
  h.add(1, 'add_note', 1);
  assert.equal(Math.floor(h.count(1) / 1000), 1, 'the 1000th event earns the first diamond');
  h.add(1, 'add_note', 1);
  h.add(1, 'idle_heartbeat', 1000, 'new-');
  assert.equal(h.count(1), 1000, 'ignored duplicates and heartbeats never count');
  h.add(1, 'level_up', 1);
  assert.equal(h.count(1), 1001, 'only heartbeat events are excluded, matching the event ranking');
});

test('diamond progress is atomic, works for new players and survives book-log cleanup', t => {
  const h = fixture(t);
  initializeDiamondBalances(h.db);
  h.db.prepare('INSERT INTO users(id) VALUES (3)').run();
  assert.throws(() => h.db.transaction(() => {
    h.add(3, 'visit_node', 1000);
    throw Error('failed save');
  })(), /failed save/);
  assert.equal(h.count(3), 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM xp_events').get().n, 0);
  h.add(3, 'visit_node', 1000);
  assert.equal(h.count(3), 1000);
  h.db.exec('DELETE FROM xp_events WHERE user_id = 3');
  initializeDiamondBalances(h.db);
  assert.equal(h.count(3), 1000, 'earned currency is not revoked when books are removed');
  h.db.exec('DELETE FROM users WHERE id = 3');
  assert.equal(h.count(3), 0, 'account deletion removes its balance');
});

test('reward snapshots expose diamonds only for koldKat and sashii and use a primary-key lookup', t => {
  const h = fixture(t);
  for (const column of ['coins_spent', 'xp_boost_pct', 'bonus_undos', 'bonus_fast_travels',
    'bonus_heartbeat_xp', 'bonus_coins', 'admin_gifted_coins', 'xp_from_boost',
    'bonus_gc_chance_purchased', 'bonus_gc_mint_purchased', 'pending_bonus_gc']) {
    h.db.exec(`ALTER TABLE users ADD COLUMN ${column} INTEGER DEFAULT 0`);
  }
  h.db.exec('CREATE TABLE coin_events (user_id INTEGER, event TEXT, amount INTEGER)');
  h.db.prepare('INSERT INTO users(id) VALUES (17)').run();
  h.add(1, 'visit_node', 36963); h.add(2, 'visit_node', 6040); h.add(17, 'visit_node', 1402);
  initializeDiamondBalances(h.db);
  const queries = [];
  const context = vm.createContext({
    db: { prepare(sql) { queries.push(sql); return h.db.prepare(sql); } },
    userXpInfoFromRow: () => ({ coinsBalance: 7, level: 0 }), diamondInfoForUser,
  });
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function getUserXpInfo('), source.indexOf('// Admin lists use')), context);
  assert.equal(context.getUserXpInfo(1).diamondsBalance, 36);
  assert.equal(context.getUserXpInfo(17).diamondsBalance, 1);
  assert.equal(context.getUserXpInfo('17').diamondsBalance, 1);
  assert.equal(context.getUserXpInfo(2).coinsBalance, 7);
  assert.equal('diamondsBalance' in context.getUserXpInfo(2), false);
  const plan = h.db.prepare('EXPLAIN QUERY PLAN ' + queries[0]).all(1);
  assert.ok(plan.some(row => /user_diamonds USING INTEGER PRIMARY KEY/.test(row.detail)));
  assert.ok(!plan.some(row => /xp_events/.test(row.detail)), 'refreshing a profile never scans XP events');
});

test('digging bonuses apply only to future events and carry exact fractional progress across level changes', t => {
  const h = fixture(t);
  h.add(1, 'visit_node', 1500);
  h.db.exec('UPDATE users SET xp=55000 WHERE id=1'); // Level 10.
  initializeDiamondBalances(h.db);
  const wallet = () => h.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  assert.equal(wallet().diamonds_earned, 1);
  assert.equal(wallet().dig_progress, 500000, 'historical events receive no retroactive level bonus');
  h.add(1, 'add_note', 1, 'base-');
  assert.equal(wallet().dig_progress, 501010, 'level 10 adds 1% to a future event');
  h.db.exec('UPDATE users SET bonus_diamond_dig_purchased=10 WHERE id=1');
  assert.equal(wallet().dig_progress, 501010, 'purchases do not recalculate any past progress');
  h.add(1, 'add_note', 1, 'bought-');
  assert.equal(wallet().dig_progress, 502030, 'ten purchases add another 1%');
  h.db.exec('UPDATE users SET xp=66000 WHERE id=1');
  h.add(1, 'add_note', 1, 'level11-');
  assert.equal(wallet().dig_progress, 503051);
  h.db.exec('UPDATE users SET xp=3000 WHERE id=1');
  h.add(1, 'add_note', 1, 'level2-');
  assert.equal(wallet().dig_progress, 504055, 'purchased contribution cannot exceed the current level');
  const before = wallet();
  h.add(1, 'idle_heartbeat', 2000);
  h.add(1, 'add_note', 1, 'level2-');
  initializeDiamondBalances(h.db);
  assert.deepEqual(wallet(), before, 'heartbeats, duplicates and another startup preserve progress exactly');
});

test('legacy counters migrate without losing earned diamonds, deleted history or near-complete progress', t => {
  const h = fixture(t);
  h.db.exec(`CREATE TABLE user_diamonds (user_id INTEGER PRIMARY KEY, qualifying_events INTEGER DEFAULT 0);
    INSERT INTO user_diamonds VALUES (1,1999);
    UPDATE users SET xp=55000 WHERE id=1;`);
  initializeDiamondBalances(h.db);
  const wallet = () => h.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  assert.equal(wallet().diamonds_earned, 1);
  assert.equal(wallet().dig_progress, 999000);
  h.db.exec('UPDATE users SET bonus_diamond_dig_purchased=10 WHERE id=1');
  h.add(1, 'add_note', 1);
  assert.equal(wallet().diamonds_earned, 2);
  assert.equal(wallet().dig_progress, 20, 'overshoot carries into the next diamond');
  assert.equal(wallet().qualifying_events, 2000);
  const before = wallet();
  initializeDiamondBalances(h.db);
  assert.deepEqual(wallet(), before);
});

test('exchange rate gets a free GC per level and caps its purchased bonus at that level', () => {
  assert.equal(diamondInfoForUser(1, {}, 0).diamondExchangeRate, 0);
  assert.equal(diamondInfoForUser(1, {}, 1).diamondExchangeRate, 1);
  assert.equal(diamondInfoForUser(17, {}, 10).diamondExchangeRate, 10);
  assert.equal(diamondInfoForUser(17, { bonus_diamond_exchange_purchased: 10 }, 10).diamondExchangeRate, 20);
  assert.equal(diamondInfoForUser(17, { bonus_diamond_exchange_purchased: 99 }, 10).diamondExchangeRate, 20);
  assert.deepEqual(diamondInfoForUser(2, { diamonds_earned: 99 }, 10), {});
});
