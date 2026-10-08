'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture({ xp = 1890993, purchased = 24, balance = 25 } = {}) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER, coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0, xp_boost_pct INTEGER DEFAULT 0, bonus_undos INTEGER DEFAULT 0,
    bonus_fast_travels INTEGER DEFAULT 0, bonus_heartbeat_xp INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0, bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, payload TEXT);`);
  const context = vm.createContext({ db, _insertNotif: db.prepare('INSERT INTO notifications (user_id,type,payload) VALUES (?,?,?)') });
  const xpSource = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(xpSource.slice(xpSource.indexOf('function computeLevel('), xpSource.indexOf('function toRoman(')), context);
  const admin = fs.readFileSync(require.resolve('../server/db/admin'), 'utf8');
  vm.runInContext(admin.slice(admin.indexOf('function undoFastTravelCap('), admin.indexOf('function adminRefundShopItem(')), context);
  db.prepare('INSERT INTO users (id,xp,bonus_gc_mint_purchased,coins_spent) VALUES (1,?,?,?)')
    .run(xp, purchased, context.coinsFromXp(xp, purchased) - balance);
  return { db, purchase: item => context.purchaseShopItem(1, item), balance: () => context.coinBalance(db.prepare('SELECT * FROM users').get()), notifications: () => db.prepare('SELECT * FROM notifications').all() };
}

test('Coin Mint purchase explains the two coins minted from existing XP without awarding them twice', t => {
  const f = fixture(); t.after(() => f.db.close());
  const result = f.purchase('gc_mint');
  assert.equal(result.newBalance, 2);
  assert.equal(f.balance(), 2);
  assert.equal(f.db.prepare('SELECT bonus_coins FROM users').get().bonus_coins, 0);
  assert.equal(f.notifications().length, 1);
  assert.deepEqual(JSON.parse(f.notifications()[0].payload), { amount: 2, balance: 2, reason: 'coin_mint_bonus' });
});

test('a mint purchase with no whole extra coins creates no bonus notification', t => {
  const f = fixture({ xp: 1000, purchased: 0, balance: 1 }); t.after(() => f.db.close());
  assert.equal(f.purchase('gc_mint').newBalance, 0);
  assert.equal(f.notifications().length, 0);
});

test('rejected and unrelated purchases create no mint bonus notification', t => {
  for (const opts of [{ balance: 0 }, { purchased: 60 }]) {
    const f = fixture(opts); t.after(() => f.db.close());
    const before = f.db.prepare('SELECT * FROM users').get();
    assert.ok(f.purchase('gc_mint').error);
    assert.deepEqual(f.db.prepare('SELECT * FROM users').get(), before);
    assert.equal(f.notifications().length, 0);
  }
  const f = fixture(); t.after(() => f.db.close());
  assert.equal(f.purchase('undo').newBalance, 22);
  assert.equal(f.notifications().length, 0);
});

test('purchase and its bonus notification are atomic', t => {
  const f = fixture(); t.after(() => f.db.close());
  const before = f.db.prepare('SELECT * FROM users').get();
  f.db.exec("CREATE TRIGGER reject_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'notification failed'); END;");
  assert.throws(() => f.purchase('gc_mint'), /notification failed/);
  assert.deepEqual(f.db.prepare('SELECT * FROM users').get(), before);
});

test('notification names the Coin Mint bonus and handles singular and plural coins', () => {
  const strings = vm.createContext({});
  vm.runInContext(fs.readFileSync('public/js/i18n/en/community.js', 'utf8').replace('export default', 'globalThis.table ='), strings);
  for (const amount of [1, 2]) {
    const elements = new Map(['notif-dropdown', 'notif-list', 'notif-empty'].map(id => [id, { style: {}, innerHTML: '' }]));
    const context = vm.createContext({ document: { getElementById: id => elements.get(id) }, window: { innerWidth: 1000 },
      escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
      t: (key, params = {}) => strings.table[key].replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`) });
    vm.runInContext(fs.readFileSync('public/js/community/notif.js', 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, ''), context);
    context._openNotifDropdown({ getBoundingClientRect: () => ({ bottom: 0, right: 800 }) }, {
      unseen: 0, items: [{ type: 'coin_gain', payload: { amount, reason: 'coin_mint_bonus' }, createdAt: Date.now(), seen: true }],
    });
    const html = elements.get('notif-list').innerHTML;
    assert.match(html, /Coin Mint bonus/);
    assert.ok(html.includes(`<strong>${amount} Gold Coin${amount === 1 ? '' : 's'}</strong>`));
    assert.doesNotMatch(html, /<br>|minted extra coins/);
  }
});
