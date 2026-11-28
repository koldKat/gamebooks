'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializePlayerXpGems } = require('../server/db/player-xp-gems');
const { initializeAdminCrystalGold } = require('../server/db/admin-crystal-gold');
const { initializeGemNotifications } = require('../server/db/gem-notifications');

function createWalletFixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER);
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER,diamonds_bought INTEGER DEFAULT 0,diamonds_spent INTEGER DEFAULT 0);
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER,rubies_bought INTEGER DEFAULT 0,rubies_spent INTEGER DEFAULT 0);
    CREATE TABLE diamond_market(diamonds_mined INTEGER);
    CREATE TABLE ruby_market(rubies_generated INTEGER);
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    INSERT INTO users VALUES(1,499999),(2,1000000),(3,0);
    INSERT INTO user_diamonds VALUES(2,5,4,2);`);
  initializeGemNotifications(db);
  initializeAdminCrystalGold(db);
  const balance = id => db.prepare(`SELECT
    COALESCE((SELECT diamonds_earned FROM user_diamonds WHERE user_id=@id),0) AS rubies,
    COALESCE((SELECT rubies_earned FROM user_rubies WHERE user_id=@id),0) AS diamonds`).get({ id });
  const gold = () => db.prepare('SELECT generated FROM admin_crystal_gold').get().generated;
  const setXp = db.prepare('UPDATE users SET xp=? WHERE id=?');
  return { db, balance, gold, setXp };
}

test('player XP milestones backfill, alternate gems, and never pay a threshold twice', t => {
  const { db, balance, gold, setXp } = createWalletFixture(t);
  initializePlayerXpGems(db);
  assert.deepEqual(balance(1), { rubies: 0, diamonds: 0 });
  assert.deepEqual(balance(2), { rubies: 6, diamonds: 1 });
  assert.equal(gold(), 7);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 2);
  initializePlayerXpGems(db);
  assert.equal(gold(), 7);

  setXp.run(500000, 1);
  assert.deepEqual(balance(1), { rubies: 1, diamonds: 0 });
  setXp.run(1600000, 1);
  assert.deepEqual(balance(1), { rubies: 2, diamonds: 1 });
  setXp.run(0, 1);
  setXp.run(1600000, 1);
  assert.deepEqual(balance(1), { rubies: 2, diamonds: 1 });
  setXp.run(2000000, 1);
  assert.deepEqual(balance(1), { rubies: 2, diamonds: 2 });
  assert.equal(gold(), 11);
  assert.deepEqual(db.prepare('SELECT milestone,currency FROM player_xp_gem_rewards WHERE user_id=1 ORDER BY milestone').all(),
    [{ milestone: 500000, currency: 'rubies' }, { milestone: 1000000, currency: 'diamonds' },
      { milestone: 1500000, currency: 'rubies' }, { milestone: 2000000, currency: 'diamonds' }]);
  db.exec('INSERT INTO users VALUES(4,100000)');
  assert.deepEqual(balance(4), { rubies: 0, diamonds: 0 });
  setXp.run(500000, 4);
  assert.deepEqual(balance(4), { rubies: 1, diamonds: 0 });
  assert.equal(gold(), 12);
  assert.deepEqual(db.prepare('SELECT diamonds_bought,diamonds_spent FROM user_diamonds WHERE user_id=2').get(),
    { diamonds_bought: 4, diamonds_spent: 2 });
});

test('legacy XP ruby awards are revoked once and valid awards and wallet transactions are preserved', t => {
  const { db, balance, gold, setXp } = createWalletFixture(t);
  db.exec(`CREATE TABLE player_xp_gem_rewards (
    user_id INTEGER NOT NULL, milestone INTEGER NOT NULL CHECK(milestone%100000=0),
    currency TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY(user_id,milestone));
    INSERT INTO player_xp_gem_rewards(user_id,milestone,currency) VALUES
      (2,100000,'rubies'),(2,200000,'rubies'),(2,500000,'rubies'),
      (2,900000,'rubies'),(2,1000000,'diamonds'),(2,1100000,'rubies');
    UPDATE user_diamonds SET diamonds_earned=diamonds_earned+5 WHERE user_id=2;
    INSERT INTO user_rubies(user_id,rubies_earned) VALUES(2,1);
    CREATE TRIGGER reward_player_xp_gems AFTER UPDATE OF xp ON users BEGIN SELECT 1; END;
    CREATE TRIGGER reward_initial_player_xp_gems AFTER INSERT ON users BEGIN SELECT 1; END;`);
  const notices = () => db.prepare('SELECT COUNT(*) n FROM notifications').get().n;
  const before = notices();
  for (let run = 0; run < 2; run++) {
    initializePlayerXpGems(db);
    assert.deepEqual(balance(2), { rubies: 6, diamonds: 1 });
    assert.equal(gold(), 7);
    assert.equal(notices(), before);
  }
  assert.deepEqual(db.prepare('SELECT milestone,currency FROM player_xp_gem_rewards WHERE user_id=2 ORDER BY milestone').all(),
    [{ milestone: 500000, currency: 'rubies' }, { milestone: 1000000, currency: 'diamonds' }]);
  assert.deepEqual(db.prepare('SELECT diamonds_bought,diamonds_spent FROM user_diamonds WHERE user_id=2').get(),
    { diamonds_bought: 4, diamonds_spent: 2 });
  setXp.run(1200000, 2);
  assert.deepEqual(balance(2), { rubies: 6, diamonds: 1 });
  setXp.run(1500000, 2);
  assert.deepEqual(balance(2), { rubies: 7, diamonds: 1 });
});
