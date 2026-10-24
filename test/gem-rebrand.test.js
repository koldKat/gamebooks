'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { retireExchangeUpgrade } = require('../server/db/gem-rebrand');
function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,bonus_coins INTEGER,bonus_diamond_exchange_purchased INTEGER);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,payload TEXT,created_at INTEGER);
    CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE diamond_exchanges(user_id INTEGER,request_id TEXT,diamonds INTEGER,rate INTEGER,gold_coins INTEGER,direction TEXT,created_at INTEGER);
    INSERT INTO users VALUES(1,100,3),(17,50,2);
    INSERT INTO notifications VALUES(1,1,'level_up','{"level":10}',10),(2,17,'level_up','{"level":3}',10);
    INSERT INTO diamond_exchanges VALUES(1,'sale-one',2,13,26,'sell',20),(17,'sale-two',1,4,4,'sell',20),
      (1,'buy-one',1,20,20,'buy',21);`);
  return db;
}
test('upgrade retirement refunds escalating costs, audits historical levels and applies each settlement once without rewriting trades',t=>{
  const db=fixture(t),before=db.prepare('SELECT * FROM diamond_exchanges').all();
  const result=retireExchangeUpgrade(db);
  assert.deepEqual(result,[{userId:1,purchases:3,goldRefunded:6,saleCorrection:6,netGold:0},
    {userId:17,purchases:2,goldRefunded:3,saleCorrection:1,netGold:2}]);
  assert.deepEqual(db.prepare('SELECT * FROM diamond_exchanges').all(),before);
  assert.equal(db.prepare('SELECT bonus_coins FROM users WHERE id=17').get().bonus_coins,52);
  assert.equal(db.prepare('SELECT SUM(bonus_diamond_exchange_purchased) n FROM users').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM currency_sale_adjustments').get().n,2);
  assert.equal(db.prepare('SELECT SUM(amount) n FROM coin_events').get().n,2);
  assert.deepEqual(retireExchangeUpgrade(db),[]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,4);
});
test('unverifiable history aborts the entire retirement before any refund or debit',t=>{
  const db=fixture(t);db.exec("DELETE FROM notifications WHERE user_id=17");
  assert.throws(()=>retireExchangeUpgrade(db),/Cannot verify/);
  assert.equal(db.prepare('SELECT bonus_diamond_exchange_purchased n FROM users WHERE id=1').get().n,3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,0);
});
test('a ledger write failure rolls back every refund, adjustment and migration marker',t=>{
  const db=fixture(t);db.exec("CREATE TRIGGER fail BEFORE INSERT ON coin_events WHEN NEW.user_id=17 BEGIN SELECT RAISE(ABORT,'blocked'); END");
  assert.throws(()=>retireExchangeUpgrade(db),/blocked/);
  assert.equal(db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins,100);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,0);
});
