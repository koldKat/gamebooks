'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeDiamondBalances, diamondInfoForUser } = require('../server/db/diamonds');
const { initializeJobXp } = require('../server/db/job-xp');
const { migrateJobDigging } = require('../server/db/job-digging');
const { getShopRefundRows } = require('../server/db/shop-purchases');

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,xp INTEGER DEFAULT 55000,
    coins_spent INTEGER DEFAULT 0,bonus_coins INTEGER DEFAULT 10000,
    xp_boost_pct INTEGER DEFAULT 0,bonus_undos INTEGER DEFAULT 0,
    bonus_fast_travels INTEGER DEFAULT 0,bonus_heartbeat_xp INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE xp_events(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,event TEXT,ref TEXT,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    CREATE TABLE shop_items(id TEXT PRIMARY KEY,step_cost INTEGER);
    INSERT INTO shop_items VALUES('diamond_dig',NULL);`);
  for (let id = 1; id <= 30; id++) db.prepare('INSERT INTO users(id,username) VALUES(?,?)').run(id, 'Player' + id);
  initializeDiamondBalances(db); initializeJobXp(db);
  const xpSource = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  const context = vm.createContext({ db, hasDiamondAccess: () => true,
    _shopItemsCache: new Map([['diamond_dig',{cost:0,stepCost:10,col:'bonus_diamond_dig_purchased',delta:1}]]),
    _insertNotif: db.prepare('INSERT INTO notifications VALUES(?,?,?)') });
  vm.runInContext(xpSource.match(/function computeLevel\(xp\) \{[\s\S]*?\n\}/)[0] + '\n' +
    xpSource.slice(xpSource.indexOf('function coinMintPct('),xpSource.indexOf('function toRoman(')),context);
  const admin = fs.readFileSync(require.resolve('../server/db/admin'), 'utf8');
  vm.runInContext(admin.slice(admin.indexOf('const _purchaseShopItemTx ='),admin.indexOf('// One-time back-fill: grant')),context);
  const row = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  return { db, context, row, balance: id => context.coinBalance(row(id)),
    migrate: () => migrateJobDigging(db, context.coinBalance),
    buy: () => context.purchaseShopItem(1,'diamond_dig') };
}

test('old digging upgrades refund their exact original costs once without changing gems or progress', t => {
  const h = fixture(t);
  for (const [id,n] of [[1,53],[17,18],[2,2]]) h.db.prepare('UPDATE users SET bonus_diamond_dig_purchased=?,coins_spent=? WHERE id=?').run(n,n*(n+1)/2+100,id);
  h.db.exec('INSERT INTO user_diamonds(user_id,qualifying_events,diamonds_earned,dig_progress) VALUES(1,5500,5,900123)');
  const wallet=h.db.prepare('SELECT * FROM user_diamonds').all(),before=[h.balance(1),h.balance(17),h.balance(2)];
  const refunds=h.migrate(); assert.equal(refunds.reduce((n,r)=>n+r.refunded,0),1605);
  for(const [index,id,amount] of [[0,1,1431],[1,17,171],[2,2,3]]) {
    assert.equal(h.balance(id),before[index]+amount); assert.equal(h.row(id).bonus_diamond_dig_purchased,0);
    assert.equal(h.row(id).coins_spent,100);
  }
  assert.deepEqual(h.db.prepare('SELECT * FROM user_diamonds').all(),wallet);
  assert.deepEqual(h.migrate(),[]);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,3);
  h.db.exec('UPDATE user_job_xp SET xp=1000 WHERE user_id=1'); assert.equal(h.buy().ok,true);
  h.migrate();assert.equal(h.row(1).bonus_diamond_dig_purchased,1,'a later restart preserves new purchases');
});

test('a failed refund audit rolls back every account, notification and migration marker', t => {
  const h=fixture(t);h.db.exec('UPDATE users SET bonus_diamond_dig_purchased=2,coins_spent=10 WHERE id=1; UPDATE users SET bonus_diamond_dig_purchased=2,coins_spent=0 WHERE id=17');
  const before=h.db.prepare('SELECT * FROM users').all();assert.throws(h.migrate,/Cannot verify/);
  assert.deepEqual(h.db.prepare('SELECT * FROM users').all(),before);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,0);
  assert.equal(h.db.prepare("SELECT 1 FROM sqlite_master WHERE name='currency_migrations'").get(),undefined);
});

test('digging purchase prices, limits and admin refund quotes follow Job Level, independent of normal level', t => {
  const h=fixture(t);h.migrate();assert.equal(h.buy().error,'cap_reached');
  h.db.exec('UPDATE user_job_xp SET xp=3000 WHERE user_id=1');const before=h.balance(1);
  assert.equal(h.buy().ok,true);assert.equal(h.balance(1),before-10);
  assert.equal(h.buy().ok,true);assert.equal(h.balance(1),before-30);
  assert.equal(h.buy().error,'cap_reached');
  const quotes=getShopRefundRows(h.row(1),[{id:'diamond_dig',step_cost:10}],h.context.computeLevel);
  assert.deepEqual(quotes,[{id:'diamond_dig',count:2,refundOne:20,refundAll:30}]);
  assert.equal(h.context.adminRefundShopItem(1,'diamond_dig',false).refundedCost,20);
  assert.equal(h.balance(1),before-10);assert.equal(h.buy().ok,true);
  assert.equal(h.context.adminRefundShopItem(1,'diamond_dig',true).refundedCost,30);
  assert.equal(h.balance(1),before);
  h.db.exec('UPDATE users SET xp=0,bonus_coins=0 WHERE id=1');
  assert.equal(h.buy().error,'insufficient_coins');assert.equal(h.row(1).bonus_diamond_dig_purchased,0);
});

test('one atomic event advances Job XP then applies its digging bonus; normal XP and heartbeats do not affect the rate', t => {
  const h=fixture(t);h.migrate();
  h.db.exec('UPDATE user_job_xp SET xp=2999 WHERE user_id=1');
  const event=(name,ref)=>h.db.prepare('INSERT OR IGNORE INTO xp_events VALUES(1,?,?)').run(name,ref);
  event('add_note','first');
  const wallet=()=>h.db.prepare('SELECT * FROM user_diamonds WHERE user_id=1').get();
  assert.equal(wallet().dig_progress,1002,'the event reaching Job Level 2 earns its new base bonus');
  assert.equal(h.buy().ok,true);h.db.exec('UPDATE users SET xp=99999999 WHERE id=1');
  event('add_note','second');assert.equal(wallet().dig_progress,2005,'Job Level 2 plus one purchase adds three units');
  const before=wallet();event('idle_heartbeat','heartbeat');event('add_note','second');assert.deepEqual(wallet(),before);
  const data=diamondInfoForUser(1,{...h.row(1),job_xp:3001},99);
  assert.ok(Math.abs(data.diamondDigPct-0.3)<1e-12);assert.equal(data.diamondEventsPerDiamond,1000000/1003);
  assert.equal(data.diamondExchangeRate,99,'exchange rate still follows normal level');
  assert.throws(()=>h.db.transaction(()=>{event('add_note','failed');throw Error('rollback');})(),/rollback/);assert.deepEqual(wallet(),before);
  initializeDiamondBalances(h.db);initializeJobXp(h.db);assert.deepEqual(wallet(),before,'restart never recalculates progress or awards');
  event('add_note','third');assert.equal(wallet().dig_progress,3008,'restart retains exactly one counting trigger');
});
