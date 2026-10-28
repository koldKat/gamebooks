'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { adminNotificationSql, initializeNotificationPolicy } = require('../server/db/notification-policy');
const { initializeGemNotifications } = require('../server/db/gem-notifications');

test('admin-only policy hides historical noise and suppresses new notices without blocking rewards', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    CREATE TABLE user_diamonds(user_id INTEGER,diamonds_earned INTEGER,diamonds_bought INTEGER DEFAULT 0,diamonds_spent INTEGER DEFAULT 0);
    CREATE TABLE user_rubies(user_id INTEGER,rubies_earned INTEGER,rubies_bought INTEGER DEFAULT 0,rubies_spent INTEGER DEFAULT 0);`);
  const insert = db.prepare('INSERT INTO notifications VALUES(1,?,?)');
  insert.run('level_up', '{}');
  initializeGemNotifications(db);
  initializeNotificationPolicy(db);
  initializeNotificationPolicy(db);
  for (const [type, payload] of [
    ['level_up', {}], ['diamond_gain', {}], ['ruby_gain', {}],
    ['coin_gain', {reason:'xp_milestone'}], ['coin_gain', {reason:'bonus_gc_claim'}],
    ['coin_gain', {reason:'coin_mint_bonus'}], ['coin_gain', {}], ['future_reward', {}],
  ]) assert.equal(insert.run(type, JSON.stringify(payload)).changes, 0);
  for (const [type, payload] of [
    ['gc_gift', {amount:10,message:'Enjoy!'}], ['role_assigned', {role:'squire'}],
    ['gem_rate_adjustment', {refund:20}], ['coin_gain', {reason:'shop_refund',amount:10}],
  ]) assert.equal(insert.run(type, JSON.stringify(payload)).changes, 1);
  db.transaction(() => {
    db.exec(`INSERT INTO user_diamonds(user_id,diamonds_earned) VALUES(1,1);
      UPDATE user_diamonds SET diamonds_earned=2;
      INSERT INTO user_rubies(user_id,rubies_earned) VALUES(1,1);
      UPDATE user_rubies SET rubies_earned=2;`);
  })();
  assert.equal(db.prepare('SELECT diamonds_earned n FROM user_diamonds').get().n, 2);
  assert.equal(db.prepare('SELECT rubies_earned n FROM user_rubies').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 5);
  const visible = db.prepare(`SELECT type FROM notifications WHERE ${adminNotificationSql('type','payload')}`).all();
  assert.deepEqual(visible.map(n => n.type), ['gc_gift','role_assigned','gem_rate_adjustment','coin_gain']);
});
