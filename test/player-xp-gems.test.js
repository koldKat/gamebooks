'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializePlayerXpGems } = require('../server/db/player-xp-gems');
const { initializeAdminCrystalGold } = require('../server/db/admin-crystal-gold');
const { initializeGemNotifications } = require('../server/db/gem-notifications');

test('player XP milestones backfill, skip rubies at millions, and never pay a threshold twice', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER);
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER,diamonds_bought INTEGER DEFAULT 0,diamonds_spent INTEGER DEFAULT 0);
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER,rubies_bought INTEGER DEFAULT 0,rubies_spent INTEGER DEFAULT 0);
    CREATE TABLE diamond_market(diamonds_mined INTEGER);
    CREATE TABLE ruby_market(rubies_generated INTEGER);
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    INSERT INTO users VALUES(1,99999),(2,1000000),(3,0);
    INSERT INTO user_diamonds VALUES(2,5,4,2);`);
  initializeGemNotifications(db);
  initializeAdminCrystalGold(db);
  initializePlayerXpGems(db);
  const balance = id => db.prepare(`SELECT
    COALESCE((SELECT diamonds_earned FROM user_diamonds WHERE user_id=@id),0) AS rubies,
    COALESCE((SELECT rubies_earned FROM user_rubies WHERE user_id=@id),0) AS diamonds`).get({ id });
  const gold = () => db.prepare('SELECT generated FROM admin_crystal_gold').get().generated;
  const setXp = db.prepare('UPDATE users SET xp=? WHERE id=?');
  assert.deepEqual(balance(1), { rubies: 0, diamonds: 0 });
  assert.deepEqual(balance(2), { rubies: 14, diamonds: 1 });
  assert.equal(gold(), 15);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 2);
  initializePlayerXpGems(db);
  assert.equal(gold(), 15);

  setXp.run(100000, 1);
  assert.deepEqual(balance(1), { rubies: 1, diamonds: 0 });
  setXp.run(1100000, 1);
  assert.deepEqual(balance(1), { rubies: 10, diamonds: 1 });
  setXp.run(0, 1);
  setXp.run(1100000, 1);
  assert.deepEqual(balance(1), { rubies: 10, diamonds: 1 });
  setXp.run(2000000, 1);
  assert.deepEqual(balance(1), { rubies: 18, diamonds: 2 });
  assert.equal(gold(), 35);
  assert.deepEqual(db.prepare('SELECT milestone,currency FROM player_xp_gem_rewards WHERE user_id=1 AND milestone BETWEEN 900000 AND 1100000 ORDER BY milestone').all(),
    [{ milestone: 900000, currency: 'rubies' }, { milestone: 1000000, currency: 'diamonds' }, { milestone: 1100000, currency: 'rubies' }]);
  db.exec('INSERT INTO users VALUES(4,100000)');
  assert.deepEqual(balance(4), { rubies: 1, diamonds: 0 });
  assert.equal(gold(), 36);
  assert.deepEqual(db.prepare('SELECT diamonds_bought,diamonds_spent FROM user_diamonds WHERE user_id=2').get(),
    { diamonds_bought: 4, diamonds_spent: 2 });
});
