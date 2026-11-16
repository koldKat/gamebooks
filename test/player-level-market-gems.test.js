'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializePlayerLevelMarketGems } = require('../server/db/player-level-market-gems');
const { initializeAdminCrystalGold } = require('../server/db/admin-crystal-gold');
const xp = level => 500 * level * (level + 1);

function fixture(t, levels = [24, 25]) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, xp INTEGER);
    CREATE TABLE user_diamonds(diamonds_earned INTEGER);
    CREATE TABLE user_rubies(rubies_earned INTEGER);
    CREATE TABLE diamond_market(id INTEGER PRIMARY KEY, diamonds INTEGER, diamonds_mined INTEGER);
    CREATE TABLE ruby_market(id INTEGER PRIMARY KEY, rubies INTEGER, rubies_generated INTEGER);
    INSERT INTO diamond_market VALUES(1,10,0);
    INSERT INTO ruby_market VALUES(1,20,0);`);
  levels.forEach((level, i) => db.prepare('INSERT INTO users VALUES(?,?)').run(i + 1, xp(level)));
  initializeAdminCrystalGold(db);
  initializePlayerLevelMarketGems(db);
  const totals = () => ({
    ...db.prepare('SELECT total_levels, rubies_mined, diamonds_mined FROM player_level_market_mining').get(),
    rubyStock: db.prepare('SELECT diamonds FROM diamond_market').get().diamonds,
    diamondStock: db.prepare('SELECT rubies FROM ruby_market').get().rubies,
    gold: db.prepare('SELECT generated FROM admin_crystal_gold').get().generated,
  });
  return { db, totals };
}

test('alternates at combined 50/100/150/200 levels, including multi-level jumps', t => {
  const { db, totals } = fixture(t);
  assert.equal(totals().gold, 0);
  for (const [level, rubies, diamonds] of [[26,1,0],[76,1,1],[126,2,1],[176,2,2],[326,4,3]]) {
    db.prepare('UPDATE users SET xp=? WHERE id=2').run(xp(level));
    assert.deepEqual(totals(), { total_levels:24+level, rubies_mined:rubies, diamonds_mined:diamonds,
      rubyStock:10+rubies, diamondStock:20+diamonds, gold:rubies+diamonds });
  }
});

test('backfills once and retains credit across resets, deletion and regaining levels', t => {
  const { db, totals } = fixture(t, [100, 75]);
  const original = totals();
  assert.equal(original.rubies_mined, 2);
  assert.equal(original.diamonds_mined, 1);
  initializePlayerLevelMarketGems(db);
  assert.deepEqual(totals(), original);
  db.exec('DELETE FROM users WHERE id=2; UPDATE users SET xp=0 WHERE id=1');
  assert.equal(totals().gold, 3);
  db.prepare('UPDATE users SET xp=? WHERE id=1').run(xp(175));
  assert.deepEqual(totals(), original);
  db.prepare('INSERT INTO users VALUES(2,?)').run(xp(25));
  assert.equal(totals().gold, 4);
  assert.equal(totals().diamonds_mined, 2);
});

test('same-level XP, trades and rolled-back changes cannot create rewards', t => {
  const { db, totals } = fixture(t);
  const before = totals();
  db.prepare('UPDATE users SET xp=xp+1 WHERE id=1').run();
  assert.deepEqual(totals(), before);
  assert.throws(() => db.transaction(() => {
    db.prepare('UPDATE users SET xp=? WHERE id=2').run(xp(200));
    throw Error('abort');
  })(), /abort/);
  assert.deepEqual(totals(), before);
  db.exec('UPDATE diamond_market SET diamonds=0; UPDATE ruby_market SET rubies=0');
  initializePlayerLevelMarketGems(db);
  assert.equal(totals().gold, 0);
  assert.equal(totals().rubyStock, 0);
  assert.equal(totals().diamondStock, 0);
});
