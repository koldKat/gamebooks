'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeDiamondBalances, isDiamondPreviewUser } = require('../server/db/diamonds');
const { getShopPurchaseTotals, getShopRefundRows } = require('../server/db/shop-purchases');

function fixture({ xp = 1890993, purchased = 24, balance = 25 } = {}) {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, xp INTEGER, coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0, xp_boost_pct INTEGER DEFAULT 0, bonus_undos INTEGER DEFAULT 0,
    bonus_fast_travels INTEGER DEFAULT 0, bonus_heartbeat_xp INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0, bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id INTEGER, type TEXT, payload TEXT);
    CREATE TABLE xp_events (user_id INTEGER, event TEXT, ref TEXT, UNIQUE(user_id,event,ref));`);
  initializeDiamondBalances(db);
  const context = vm.createContext({ db, isDiamondPreviewUser, _insertNotif: db.prepare('INSERT INTO notifications (user_id,type,payload) VALUES (?,?,?)') });
  const xpSource = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(xpSource.slice(xpSource.indexOf('function computeLevel('), xpSource.indexOf('function toRoman(')), context);
  const admin = fs.readFileSync(require.resolve('../server/db/admin'), 'utf8');
  vm.runInContext(admin.slice(admin.indexOf('function undoFastTravelCap('), admin.indexOf('function adminRefundShopItem(')), context);
  db.prepare('INSERT INTO users (id,xp,bonus_gc_mint_purchased,coins_spent) VALUES (1,?,?,?)')
    .run(xp, purchased, context.coinsFromXp(xp, purchased) - balance);
  return { db, refund: vm.runInContext('_adminRefundShopItemTx', context), purchase: (item, id = 1) => context.purchaseShopItem(id, item), balance: () => context.coinBalance(db.prepare('SELECT * FROM users WHERE id=1').get()), notifications: () => db.prepare('SELECT * FROM notifications').all(),
    totals: () => getShopPurchaseTotals(db, context.computeLevel),
    quotes: () => getShopRefundRows(db.prepare('SELECT * FROM users WHERE id=1').get(), context.getShopItems(), context.computeLevel),
    setCost: (...args) => context.setShopItemCost(...args) };
}

test('all eight purchase totals exclude free bonuses and refund quotes match actual latest/all refunds', t => {
  const f=fixture();t.after(()=>f.db.close());
  f.db.exec(`UPDATE users SET xp=55000,xp_boost_pct=13,bonus_heartbeat_xp=2,
    bonus_gc_chance_purchased=4,bonus_gc_mint_purchased=3,bonus_diamond_dig_purchased=2,
    bonus_diamond_exchange_purchased=2,bonus_undos=2,bonus_fast_travels=3 WHERE id=1`);
  f.setCost('undo',7,7);f.setCost('fast_travel',11,11);
  assert.equal(f.totals().totalUpgrades,21);assert.equal(f.totals().upgradeXpBoosts,3);
  assert.equal(f.totals().upgradeDiamondDig,2);assert.equal(f.totals().upgradeDiamondExchange,2);
  const quotes=f.quotes();assert.equal(quotes.length,8);
  assert.equal(quotes.find(row=>row.id==='undo').refundOne,14);
  assert.equal(quotes.find(row=>row.id==='fast_travel').refundAll,66);
  for(const quote of quotes)for(const all of [false,true]){
    f.db.exec('SAVEPOINT check_refund');
    try{const result=f.refund(1,quote.id,all);assert.equal(result.refundedCost,all?quote.refundAll:quote.refundOne,quote.id);
      assert.equal(f.totals().totalUpgrades,21-(all?quote.count:1));
    }finally{f.db.exec('ROLLBACK TO check_refund; RELEASE check_refund');}
  }
  assert.equal(f.totals().totalUpgrades,21);
});

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

test('diamond upgrades cost 1 through level, cap independently and never change existing diamond progress', t => {
  const f = fixture({ xp: 55000, purchased: 0, balance: 55 }); t.after(() => f.db.close());
  f.db.exec('INSERT INTO user_diamonds(user_id,qualifying_events,diamonds_earned,dig_progress) VALUES(1,36963,36,963000)');
  const before = f.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  for (let n = 1; n <= 10; n++) {
    assert.equal(f.purchase('diamond_dig').ok, true);
    assert.equal(f.db.prepare('SELECT coins_spent n FROM users WHERE id=1').get().n, n * (n + 1) / 2);
  }
  assert.equal(f.balance(), 0);
  assert.equal(f.purchase('diamond_dig').error, 'cap_reached');
  assert.equal(f.purchase('diamond_exchange').error, 'insufficient_coins');
  f.db.exec('UPDATE users SET bonus_coins=55 WHERE id=1');
  for (let n = 1; n <= 10; n++) assert.equal(f.purchase('diamond_exchange').ok, true);
  assert.equal(f.db.prepare('SELECT bonus_diamond_exchange_purchased n FROM users WHERE id=1').get().n, 10);
  assert.equal(f.balance(), 0);
  assert.equal(f.purchase('diamond_exchange').error, 'cap_reached');
  assert.deepEqual(f.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get(), before);
  assert.equal(f.notifications().length, 0, 'buying upgrades cannot mint retrospective gold or diamonds');
});

test('diamond upgrade purchases reject level zero and non-preview users and refund escalating costs correctly', t => {
  const f = fixture({ xp: 1000, purchased: 0, balance: 1 }); t.after(() => f.db.close());
  f.db.exec('INSERT INTO users(id,xp,bonus_coins) VALUES(2,55000,100),(17,55000,100)');
  for (const item of ['diamond_dig', 'diamond_exchange']) assert.equal(f.purchase(item, 2).error, 'invalid_item');
  assert.equal(f.purchase('diamond_dig', 17).ok, true);
  f.db.exec('UPDATE users SET xp=0 WHERE id=1');
  assert.equal(f.purchase('diamond_dig').error, 'cap_reached');
  assert.equal(f.purchase('diamond_exchange').error, 'cap_reached');
  f.db.exec('UPDATE users SET xp=55000,coins_spent=0 WHERE id=1');
  for (let n=0;n<3;n++) assert.equal(f.purchase('diamond_exchange').ok, true);
  assert.equal(f.refund(1,'diamond_exchange',false).refundedCost, 3);
  assert.equal(f.refund(1,'diamond_exchange',true).refundedCost, 3);
  assert.equal(f.db.prepare('SELECT bonus_diamond_exchange_purchased n FROM users WHERE id=1').get().n, 0);
  assert.equal(f.db.prepare('SELECT coins_spent n FROM users WHERE id=1').get().n, 0);
});

test('a failed diamond purchase rolls back the cost and upgrade together', t => {
  const f = fixture({ xp: 55000, purchased: 0, balance: 55 }); t.after(() => f.db.close());
  const before = f.db.prepare('SELECT * FROM users WHERE id=1').get();
  f.db.exec("CREATE TRIGGER reject_dig BEFORE UPDATE OF bonus_diamond_dig_purchased ON users BEGIN SELECT RAISE(ABORT, 'failed upgrade'); END");
  assert.throws(() => f.purchase('diamond_dig'), /failed upgrade/);
  assert.deepEqual(f.db.prepare('SELECT * FROM users WHERE id=1').get(), before);
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
