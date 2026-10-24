'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const diamonds = require('../server/db/diamonds');

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0,coins_spent INTEGER DEFAULT 2,
    bonus_coins INTEGER DEFAULT 7,bonus_gc_mint_purchased INTEGER DEFAULT 0);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    INSERT INTO users(id,xp) VALUES(1,55000),(17,6000),(2,55000);`);
  diamonds.initializeDiamondBalances(db);
  db.exec(`UPDATE users SET bonus_diamond_exchange_purchased=3 WHERE id=1;
    INSERT INTO user_diamonds(user_id,qualifying_events,diamonds_earned,dig_progress) VALUES(1,5000,5,123456),(17,1000,1,0);`);
  let impersonating = false;
  const isImpersonatingContext = () => impersonating;
  const xpContext = vm.createContext({db,isImpersonatingContext,_appXpHook:null,
    _insertNotif:db.prepare('INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)')});
  const xp = fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  vm.runInContext(xp.slice(xp.indexOf('function computeLevel('),xp.indexOf('function toRoman(')) +
    xp.slice(xp.indexOf('const _awardCoinsTx'),xp.indexOf('// Roll bonus GC')),xpContext);
  const context = vm.createContext({module:{exports:{}},require(name) {
    if(name==='./connection')return{db};
    if(name==='./xp')return{computeLevel:xpContext.computeLevel,awardCoins:xpContext.awardCoins,coinBalance:xpContext.coinBalance};
    if(name==='./diamonds')return diamonds;
    if(name==='../impersonation-context')return{isImpersonatingContext};
    throw Error(name);
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/diamond-exchange'),'utf8'),context);
  return{db,exchange:context.module.exports.exchangeDiamonds,impersonate:on=>{impersonating=on;},
    wallet:id=>db.prepare('SELECT * FROM user_diamonds WHERE user_id=?').get(id),
    gold:()=>xpContext.coinBalance(db.prepare('SELECT * FROM users WHERE id=1').get())};
}

test('exchange atomically spends selected diamonds at the current rate and adds exact gold through the coin ledger', t=>{
  const f=fixture(t),before=f.wallet(1),gold=f.gold();
  const r=f.exchange(1,2,'exchange-request-0001',10);
  assert.equal(r.ok,true);assert.equal(r.goldReceived,20);
  assert.equal(f.wallet(1).diamonds_spent,2);assert.equal(f.gold(),gold+20);
  assert.equal(f.wallet(1).diamonds_earned,before.diamonds_earned);
  assert.equal(f.wallet(1).dig_progress,before.dig_progress);
  assert.equal(f.db.prepare('SELECT SUM(diamonds) n FROM diamond_exchanges').get().n,2);
  assert.equal(f.db.prepare('SELECT SUM(amount) n FROM coin_events').get().n,20);
  const info=diamonds.diamondInfoForUser(1,{...f.wallet(1)},10);
  assert.equal(info.diamondsBalance,3);assert.equal(info.diamondsExchanged,2);
  f.db.prepare("INSERT INTO xp_events VALUES(1,'visit_node','new')").run();
  assert.equal(f.wallet(1).diamonds_spent,2,'future digging never resets exchanged totals');
  assert.equal(f.wallet(1).dig_progress,before.dig_progress+1010);
});

test('retries credit gold once and retain the original rate even after a level change',t=>{
  const f=fixture(t),gold=f.gold();
  f.exchange(1,2,'exchange-request-0001',10);
  f.db.exec('UPDATE users SET xp=66000 WHERE id=1');
  assert.equal(f.exchange(1,2,'exchange-request-0001',10).repeated,true);
  assert.equal(f.gold(),gold+20+11,'normal level-based mint balance changes independently of exchanged gold');
  assert.equal(f.wallet(1).diamonds_spent,2);
  assert.equal(f.exchange(1,1,'exchange-request-0001',14).error,'invalid_request');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM diamond_exchanges').get().n,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);
});

test('invalid amounts, insufficient balance and stale quotes cannot spend either currency',t=>{
  const f=fixture(t),before=f.wallet(1),gold=f.gold();
  for(const amount of [0,-1,1.5,NaN,Infinity,'1',Number.MAX_SAFE_INTEGER+1])assert.equal(f.exchange(1,amount,'exchange-request-0001',10).error,'invalid_amount');
  assert.equal(f.exchange(1,6,'exchange-request-0002',10).error,'insufficient_diamonds');
  assert.equal(f.exchange(1,1,'exchange-request-0003',12).error,'rate_changed');
  assert.equal(f.exchange(1,1,'short',10).error,'invalid_request');
  assert.equal(f.exchange(2,1,'exchange-request-0001',10).error,'insufficient_diamonds');
  assert.equal(f.exchange(0,1,'exchange-request-0001',10).error,'unavailable');
  f.impersonate(true);assert.equal(f.exchange(1,1,'exchange-request-0001',10).error,'unavailable');
  assert.deepEqual(f.wallet(1),before);assert.equal(f.gold(),gold);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM diamond_exchanges').get().n,0);
});

test('notification failure rolls back diamond spending, exchange history, gold and coin history together',t=>{
  const f=fixture(t),before=f.wallet(1),gold=f.gold();
  f.db.exec("CREATE TRIGGER reject_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'failed notice'); END");
  assert.throws(()=>f.exchange(1,2,'exchange-request-0001',10),/failed notice/);
  assert.deepEqual(f.wallet(1),before);assert.equal(f.gold(),gold);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM diamond_exchanges').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,0);
  f.db.exec('DROP TRIGGER reject_notice');
  assert.equal(f.exchange(1,2,'exchange-request-0001',10).ok,true);
});

test('buying and selling use the level, debits gold once, preserves digging and allows selling purchased diamonds',t=>{
  const f=fixture(t),before=f.wallet(1),gold=f.gold();
  f.db.exec('UPDATE diamond_market SET diamonds=5');
  const r=f.exchange(1,2,'buy-request-000001',10,'buy');
  assert.equal(r.ok,true);assert.equal(r.goldSpent,20);assert.equal(f.gold(),gold-20);
  assert.equal(f.wallet(1).diamonds_bought,2);assert.equal(f.wallet(1).dig_progress,before.dig_progress);
  assert.equal(f.wallet(1).diamonds_earned,before.diamonds_earned);
  assert.equal(f.exchange(1,2,'buy-request-000001',10,'buy').repeated,true);
  assert.equal(f.gold(),gold-20);
  assert.equal(f.exchange(1,2,'buy-request-000001',10,'sell').error,'invalid_request');
  assert.equal(diamonds.diamondInfoForUser(1,f.wallet(1),10).diamondsBalance,7);
  assert.equal(f.exchange(1,2,'sell-request-00001',10,'sell').goldReceived,20);
  assert.equal(f.gold(),gold,'buying and selling at the same level cannot generate profit');
  assert.equal(f.exchange(1,2,'buy-request-000002',10,'buy').ok,true);
  f.db.exec('UPDATE users SET coins_spent=10000 WHERE id=1');
  assert.equal(f.exchange(1,2,'buy-request-000003',10,'buy').error,'insufficient_coins');
});

test('buy history failure rolls back gold spending and purchased diamonds, and no free level-zero purchases exist',t=>{
  const f=fixture(t),before=f.wallet(1),gold=f.gold();
  f.db.exec('UPDATE diamond_market SET diamonds=5');
  f.db.exec("CREATE TRIGGER reject_exchange BEFORE INSERT ON diamond_exchanges BEGIN SELECT RAISE(ABORT,'failed ledger'); END");
  assert.throws(()=>f.exchange(1,1,'buy-request-000001',10,'buy'),/failed ledger/);
  assert.deepEqual(f.wallet(1),before);assert.equal(f.gold(),gold);
  f.db.exec('DROP TRIGGER reject_exchange; UPDATE users SET xp=0 WHERE id=1');
  assert.equal(f.exchange(1,1,'buy-request-000001',1,'buy').error,'rate_changed');
});

test('one shared diamond pool is filled by sales and cannot oversell or duplicate stock on retries',t=>{
 const f=fixture(t),stock=()=>f.db.prepare('SELECT diamonds FROM diamond_market WHERE id=1').get().diamonds;
 f.db.exec('UPDATE users SET bonus_coins=100 WHERE id=17');
 const before=f.wallet(1),gold=f.gold();
 assert.equal(f.exchange(1,1,'empty-pool-buy-0001',10,'buy').error,'insufficient_stock');
 assert.deepEqual(f.wallet(1),before);assert.equal(f.gold(),gold);
 assert(f.exchange(1,2,'pool-sell-00000001',10,'sell').ok);assert.equal(stock(),2);
 assert(f.exchange(1,2,'pool-sell-00000001',10,'sell').repeated);assert.equal(stock(),2);
 assert(f.exchange(17,1,'pool-buy-other-001',3,'buy').ok);assert.equal(stock(),1);
 assert.equal(f.exchange(1,2,'oversell-pool-0001',10,'buy').error,'insufficient_stock');assert.equal(stock(),1);
 assert(f.exchange(1,1,'pool-buy-last-0001',10,'buy').ok);assert.equal(stock(),0);
 assert(f.exchange(1,1,'pool-buy-last-0001',10,'buy').repeated);assert.equal(stock(),0);
 assert.equal(f.exchange(17,1,'pool-empty-again01',3,'buy').error,'insufficient_stock');
});
