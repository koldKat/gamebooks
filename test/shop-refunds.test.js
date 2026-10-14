'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER,
    coins_spent INTEGER, bonus_coins INTEGER, xp_boost_pct INTEGER DEFAULT 0,
    bonus_undos INTEGER DEFAULT 0, bonus_fast_travels INTEGER DEFAULT 0,
    bonus_heartbeat_xp INTEGER DEFAULT 0, bonus_gc_chance_purchased INTEGER DEFAULT 0,
    bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE notifications (user_id INTEGER, type TEXT, payload TEXT);
    INSERT INTO users (id, xp, coins_spent, bonus_coins, bonus_gc_mint_purchased)
      VALUES (17, 505297, 920, 400, 20);`);
  const context = vm.createContext({ db,
    _shopItemsCache: new Map([
      ['gc_mint', { cost: 0, col: 'bonus_gc_mint_purchased', delta: 1 }],
      ['heartbeat_xp', { cost: 0, col: 'bonus_heartbeat_xp', delta: 1 }],
    ]),
    _insertNotif: db.prepare('INSERT INTO notifications VALUES (?, ?, ?)'),
  });
  const xp = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  const level = xp.match(/function computeLevel\(xp\) \{[\s\S]*?\n\}/)[0];
  vm.runInContext(level + '\n' + xp.slice(xp.indexOf('function coinMintPct('), xp.indexOf('function toRoman(')), context);
  const admin = fs.readFileSync(require.resolve('../server/db/admin'), 'utf8');
  vm.runInContext(admin.slice(admin.indexOf('const _purchaseShopItemTx ='), admin.indexOf('// One-time back-fill: grant')), context);
  return { db, context, row: () => db.prepare('SELECT * FROM users WHERE id = 17').get(),
    balance: () => context.coinBalance(db.prepare('SELECT * FROM users WHERE id = 17').get()),
    refund: all => context.adminRefundShopItem(17, 'gc_mint', all),
    buy: () => context.purchaseShopItem(17, 'gc_mint'),
  };
}

test('repeated Coin Mint refunds and repurchases cannot duplicate coins', t => {
  const f = fixture(t), original = f.row();
  assert.equal(f.balance(), 11);
  for (let i = 0; i < 30; i++) {
    const refund = f.refund(false);
    assert.equal(refund.refundedCost, 20);
    assert.equal(refund.netCoins, 19);
    const notification = JSON.parse(f.db.prepare('SELECT payload FROM notifications ORDER BY rowid DESC LIMIT 1').get().payload);
    assert.equal(notification.amount, 19);
    assert.equal(f.buy().ok, true);
    assert.deepEqual(f.row(), original);
    assert.equal(f.balance(), 11);
  }
});

test('refunding all mint purchases and buying them back restores the exact balance', t => {
  const f = fixture(t), original = f.row(), before = f.balance();
  const refund = f.refund(true);
  assert.equal(refund.refundedCost, 210);
  assert.equal(refund.netCoins, f.balance() - before);
  assert.ok(refund.netCoins < refund.refundedCost);
  for (let i = 0; i < 20; i++) assert.equal(f.buy().ok, true);
  assert.deepEqual(f.row(), original);
  assert.equal(f.balance(), before);
});

test('a refund that reduces the balance does not announce a coin gain', t => {
  const f = fixture(t);
  f.db.exec('UPDATE users SET xp = 10000000, coins_spent = 1, bonus_gc_mint_purchased = 1');
  assert.ok(f.refund(false).netCoins < 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, 0);
});

test('notification failures roll back the entire refund', t => {
  const f = fixture(t), original = f.row();
  f.context._insertNotif = { run() { throw new Error('notification failed'); } };
  assert.throws(() => f.refund(false), /notification failed/);
  assert.deepEqual(f.row(), original);
});

test('other shop refunds retain their full net refund', t => {
  const f = fixture(t);
  f.db.exec('UPDATE users SET bonus_heartbeat_xp = 5');
  const refund = f.context.adminRefundShopItem(17, 'heartbeat_xp', true);
  assert.equal(refund.refundedCost, 15);
  assert.equal(refund.netCoins, 15);
  assert.equal(f.row().bonus_heartbeat_xp, 0);
});
