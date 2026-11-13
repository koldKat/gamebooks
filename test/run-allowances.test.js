'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), Database = require('better-sqlite3');
const {reconcileRunAllowancePurchases} = require('../server/db/run-allowance-refunds');
const read = path => fs.readFileSync(path, 'utf8');
const xpForLevel = level => level * (level + 1) * 500;
const computeLevel = xp => Math.floor((Math.sqrt(1 + 8 * Math.max(0, xp) / 1000) - 1) / 2);
const declaration = (source, name) => source.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'))[0];

test('desktop, mobile, shop and server agree at every level, including both final caps', () => {
  const desktop = vm.createContext({currentUserLevel:0, bonusUndos:0, bonusFastTravels:0});
  vm.runInContext(read('public/js/play/limits.js').replace(/^import .*;$/gm, '').replace(/^export /gm, ''), desktop);
  const mobile = vm.createContext({currentUserLevel:0, bonusUndos:0, bonusFastTravels:0});
  vm.runInContext(read('public/mobile/js/reader.js').split('\n').filter(line => /^function _max(?:Undos|FastTravels)/.test(line)).join('\n'), mobile);
  const shop = vm.createContext({});
  vm.runInContext(declaration(read('public/js/progression/shop.js'), '_undoFastTravelCap') + '\n'
    + declaration(read('public/js/progression/shop.js'), '_undoFtBase') + '\n'
    + declaration(read('server/db/admin.js'), 'undoFastTravelCap'), shop);
  const feed = vm.createContext({});
  const feedSource = read('server/db/feed.js');
  const start = feedSource.indexOf('    const abilitiesNow'), end = feedSource.indexOf('    const tmplRow', start);
  vm.runInContext('function gains(lv){' + feedSource.slice(start, end) + 'return gainedAbility;}', feed);
  for (let level = 0; level <= 150; level++) {
    const base = level < 40 ? 3 : Math.min(10, Math.floor(level / 10));
    const cap = Math.min(10, Math.floor(level / 10));
    assert.equal(shop._undoFtBase(level), base);
    assert.equal(shop._undoFastTravelCap(level), cap);
    assert.equal(shop.undoFastTravelCap(level), cap);
    assert.equal(feed.gains(level), level >= 40 && level <= 100 && level % 10 === 0);
    for (const context of [desktop, mobile]) {
      context.currentUserLevel = level; context.bonusUndos = context.bonusFastTravels = cap;
    }
    assert.equal(desktop.maxUndos(), base + cap); assert.equal(desktop.maxFastTravels(), base + cap);
    assert.equal(mobile._maxUndos(), base + cap); assert.equal(mobile._maxFastTravels(), base + cap);
  }
  assert.equal(shop._undoFastTravelCap(9), 0); assert.equal(shop._undoFastTravelCap(10), 1);
  assert.equal(desktop.maxUndos(), 20); assert.equal(mobile._maxFastTravels(), 20);
});

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER,coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0,bonus_undos INTEGER DEFAULT 0,bonus_fast_travels INTEGER DEFAULT 0,
    xp_boost_pct INTEGER DEFAULT 0,bonus_heartbeat_xp INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0,
    bonus_diamond_dig_purchased INTEGER DEFAULT 0,bonus_diamond_exchange_purchased INTEGER DEFAULT 0);
    CREATE TABLE shop_items(id TEXT,col TEXT,cost INTEGER,step_cost INTEGER);
    INSERT INTO shop_items VALUES('undo','bonus_undos',3,3),('fast_travel','bonus_fast_travels',5,5);`);
  return db;
}
test('refunds remove only excess purchases, credit exact escalating prices, and never repeat', t => {
  const db = fixture(t);
  db.prepare('INSERT INTO users(id,xp,coins_spent,bonus_undos,bonus_fast_travels)VALUES(?,?,?,?,?)')
    .run(1, xpForLevel(76), 18950, 8, 8);
  db.prepare('INSERT INTO users(id,xp,coins_spent,bonus_undos,bonus_fast_travels)VALUES(?,?,?,?,?)')
    .run(2, xpForLevel(39), 4520, 4, 4);
  db.prepare('INSERT INTO users(id,xp,coins_spent,bonus_undos)VALUES(?,?,3,1)').run(3, xpForLevel(5));
  db.prepare('INSERT INTO users(id,xp,coins_spent,bonus_undos,bonus_fast_travels)VALUES(?,?,1000,10,10)').run(4, xpForLevel(120));
  const unchanged = db.prepare('SELECT *FROM users WHERE id=4').get();
  const refunds = reconcileRunAllowancePurchases(db, computeLevel);
  assert.equal(refunds.filter(row => row.userId === 1).reduce((sum,row) => sum + row.goldCoins, 0), 64);
  assert.equal(refunds.filter(row => row.userId === 2).reduce((sum,row) => sum + row.goldCoins, 0), 32);
  assert.equal(db.prepare('SELECT coins_spent FROM users WHERE id=3').get().coins_spent, 0);
  assert.equal(db.prepare('SELECT bonus_undos FROM users WHERE id=1').get().bonus_undos, 7);
  assert.equal(db.prepare('SELECT bonus_fast_travels FROM users WHERE id=2').get().bonus_fast_travels, 3);
  assert.deepEqual(db.prepare('SELECT *FROM users WHERE id=4').get(), unchanged);
  const after = db.prepare('SELECT *FROM users ORDER BY id').all();
  assert.deepEqual(reconcileRunAllowancePurchases(db, computeLevel), []);
  assert.deepEqual(db.prepare('SELECT *FROM users ORDER BY id').all(), after);
});
test('a refund remains exact if earlier accounting adjustments left less recorded spending', t => {
  const db = fixture(t);
  db.exec('INSERT INTO users(id,xp,coins_spent,bonus_undos)VALUES(1,0,1,1)');
  reconcileRunAllowancePurchases(db, computeLevel);
  const row = db.prepare('SELECT *FROM users').get();
  assert.equal(row.coins_spent, 0); assert.equal(row.bonus_coins, 2); assert.equal(row.bonus_undos, 0);
});
test('server purchases reject the cap without charging, including level 0 and levels above 100', t => {
  const db = fixture(t), source = read('server/db/admin.js');
  const context = vm.createContext({db, computeLevel, coinBalance:row => 10000 - row.coins_spent,
    _shopItemsCache:new Map([['undo',{cost:3,stepCost:3,col:'bonus_undos',delta:1}],
      ['fast_travel',{cost:5,stepCost:5,col:'bonus_fast_travels',delta:1}]]), _insertNotif:{run() {}}});
  vm.runInContext(declaration(source, 'undoFastTravelCap') + '\n'
    + source.slice(source.indexOf('const _purchaseShopItemTx ='), source.indexOf('const _adminRefundShopItemTx =')), context);
  for (const level of [0, 9, 10, 19, 20, 89, 90, 99, 100, 101, 150]) {
    const cap = Math.min(10, Math.floor(level / 10));
    db.prepare('INSERT OR REPLACE INTO users(id,xp,bonus_undos,bonus_fast_travels)VALUES(1,?,?,?)').run(xpForLevel(level), cap, cap);
    for (const item of ['undo','fast_travel']) {
      const before = db.prepare('SELECT *FROM users').get();
      assert.equal(context.purchaseShopItem(1,item).error, 'cap_reached');
      assert.deepEqual(db.prepare('SELECT *FROM users').get(), before);
    }
    if (cap) {
      db.prepare('UPDATE users SET bonus_undos=?').run(cap - 1);
      assert.equal(context.purchaseShopItem(1,'undo').ok, true);
      assert.equal(db.prepare('SELECT coins_spent FROM users').get().coins_spent, cap * 3);
    }
  }
});
