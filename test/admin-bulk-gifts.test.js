'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { createBulkGcGifts } = require('../server/db/bulk-gifts');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,xp INTEGER,bonus_coins INTEGER DEFAULT 0,
    admin_gifted_coins INTEGER DEFAULT 0,coins_spent INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE admin_settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    INSERT INTO users(id,username,xp) VALUES(1,'admin',55000),(2,'player',1000),(3,'new',0);`);
  const source = fs.readFileSync('server/db/misc.js', 'utf8');
  const gift = vm.runInNewContext(source.slice(source.indexOf('function adminGiftGc('), source.indexOf('function getAppBirthTimestamp(')) + '\nadminGiftGc;', {
    db, _insertNotif: db.prepare('INSERT INTO notifications VALUES(?,?,?)'),
    coinBalance: row => Math.floor(row.xp / 1000) + row.bonus_coins - row.coins_spent,
  });
  const getSupply = () => ({ available: 1000 - Number(db.prepare("SELECT value FROM admin_settings WHERE key='admin_gc_gifted'").get()?.value || 0) });
  const bulk = createBulkGcGifts({ db, getSupply, gift, computeLevel: xp => Math.floor((Math.sqrt(1 + 8 * xp / 1000) - 1) / 2) });
  const input = () => ({ coinsPerLevel: 3, message: 'Enjoy your adventures!', requestId: 'test-request-123456', previewHash: bulk.preview(3, 0).previewHash });
  return { db, bulk, input, supply: getSupply };
}

test('bulk gift uses each level, includes admin, skips zero awards, debits once and notifies with message', t => {
  const { db, bulk, input, supply } = fixture(t);
  const before = db.prepare('SELECT total_changes() n').get().n;
  const request = input(), preview = bulk.preview(3, 0);
  assert.equal(preview.total, 33); assert.equal(preview.recipients, 2); assert.equal(preview.zeroLevelUsers, 1);
  assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
  const result = bulk.send(request, 0);
  assert.equal(result.total, 33); assert.equal(supply().available, 967);
  assert.deepEqual(db.prepare('SELECT bonus_coins,admin_gifted_coins FROM users ORDER BY id').all(), [
    { bonus_coins: 30, admin_gifted_coins: 30 }, { bonus_coins: 3, admin_gifted_coins: 3 }, { bonus_coins: 0, admin_gifted_coins: 0 },
  ]);
  const notices = db.prepare('SELECT * FROM notifications ORDER BY user_id').all();
  assert.equal(notices.length, 2);
  assert.deepEqual(JSON.parse(notices[0].payload), { amount: 30, balance: 85, message: request.message });
  assert.equal(notices[0].type, 'gc_gift');
  assert.equal(bulk.send(request, 0).repeated, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 2);
  assert.equal(supply().available, 967);
  assert.equal(bulk.send({ ...request, message: 'Changed' }, 0).error, 'request_conflict');
});

test('insufficient pool, changed preview, invalid rate and empty recipients cannot debit or award', t => {
  const { db, bulk, input } = fixture(t);
  const request = input();
  db.exec("INSERT INTO admin_settings VALUES('admin_gc_gifted','999')");
  assert.equal(bulk.send(request, 0).error, 'insufficient_supply');
  db.exec("DELETE FROM admin_settings; UPDATE users SET xp=3000 WHERE id=2");
  assert.equal(bulk.send(request, 0).error, 'preview_changed');
  for (const rate of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, '3']) assert.equal(bulk.preview(rate, 0).error, 'invalid_rate');
  db.exec('UPDATE users SET xp=0');
  assert.equal(bulk.send(input(), 0).error, 'no_recipients');
  assert.equal(db.prepare('SELECT SUM(bonus_coins) n FROM users').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_settings').get().n, 0);
});

test('a failed notification rolls back the whole population gift and its pool debit', t => {
  const { db, bulk, input, supply } = fixture(t);
  db.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications WHEN NEW.user_id=2 BEGIN SELECT RAISE(ABORT,'notice failed'); END");
  assert.throws(() => bulk.send(input(), 0), /notice failed/);
  assert.equal(db.prepare('SELECT SUM(bonus_coins) n FROM users').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_settings').get().n, 0);
  assert.equal(supply().available, 1000);
});
