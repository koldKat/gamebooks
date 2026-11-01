'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeDiamondBalances } = require('../server/db/diamonds');
const { initializeLuckyCoinDiamonds } = require('../server/db/lucky-coin-diamonds');
const { initializeRubies } = require('../server/db/rubies');

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close()); db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0,coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0,pending_bonus_gc INTEGER DEFAULT 0);
    CREATE TABLE xp_events(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,event TEXT,ref TEXT,
      UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,event TEXT,ref TEXT,amount INTEGER,
      UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    INSERT INTO users(id) VALUES(1),(2);`);
  initializeDiamondBalances(db);
  initializeRubies(db);
  const insert = db.prepare('INSERT OR IGNORE INTO coin_events VALUES(?,?,?,?)');
  const add = (user, ref, amount, event = 'bonus_gc_claim') => insert.run(user,event,ref,amount);
  const wallet = (user = 1) => db.prepare('SELECT * FROM user_diamonds WHERE user_id=?').get(user);
  return { db, add, wallet };
}

test('historical claims award alternating milestones once, preserving mining, balances and shared stock', t => {
  const f = fixture(t);
  f.db.exec(`INSERT INTO user_diamonds(user_id,qualifying_events,diamonds_earned,dig_progress,diamonds_spent,diamonds_bought)
    VALUES(1,9999,12,734567,7,3)`);
  f.add(1,'old',299); f.add(2,'old',100); f.add(1,'mint',900,'coin_mint_bonus');
  f.add(1,'heartbeat',100,'heartbeat_conversion');
  const before = f.wallet(), market = f.db.prepare('SELECT * FROM diamond_market').get();
  initializeLuckyCoinDiamonds(f.db);
  assert.deepEqual(f.wallet(), {...before,diamonds_earned:15,lucky_coins_claimed:299,lucky_diamonds_earned:3});
  assert.equal(f.wallet(2).diamonds_earned,1,'a player without mining history also receives past rewards');
  assert.equal(f.db.prepare('SELECT rubies_earned FROM user_rubies WHERE user_id=1').get().rubies_earned,2);
  initializeLuckyCoinDiamonds(f.db);
  assert.equal(f.wallet().diamonds_earned,15,'restart never repeats historical credits');
  f.add(1,'next',1);
  assert.equal(f.wallet().diamonds_earned,15,'the 300th claim gives a diamond instead of another ruby');
  assert.equal(f.db.prepare('SELECT rubies_earned FROM user_rubies WHERE user_id=1').get().rubies_earned,3);
  assert.equal(f.wallet().dig_progress,before.dig_progress);
  assert.deepEqual(f.db.prepare('SELECT * FROM diamond_market').get(),market);
});

test('claims accumulate per player, skip duplicates and unrelated coins, and survive ledger cleanup', t => {
  const f = fixture(t); initializeLuckyCoinDiamonds(f.db);
  f.add(1,'a',99); f.add(2,'a',99);
  assert.equal(f.wallet().diamonds_earned,1);
  f.add(1,'b',1); f.add(1,'b',1);
  assert.equal(f.wallet().diamonds_earned,1); assert.equal(f.wallet(2).diamonds_earned,1);
  f.add(1,'c',250);
  f.add(1,'other',1000,'level_up_coin'); f.add(1,'none',0); f.add(1,'negative',-100);
  assert.equal(f.wallet().lucky_coins_claimed,350); assert.equal(f.wallet().diamonds_earned,4);
  f.db.exec('DELETE FROM coin_events'); initializeLuckyCoinDiamonds(f.db);
  assert.equal(f.wallet().diamonds_earned,4);
  f.add(1,'d',50); assert.equal(f.wallet().diamonds_earned,4);
  f.db.exec('DELETE FROM users WHERE id=1'); assert.equal(f.wallet(),undefined);
});

function claims(f) {
  const events=[]; let impersonating=false, clock=10000;
  const context=vm.createContext({db:f.db,isImpersonatingContext:()=>impersonating,
    Date:class extends Date { static now(){return ++clock;} },
    _appXpHook:event=>events.push({...event}),coinBalance:row=>row.bonus_coins,
    _insertNotif:f.db.prepare('INSERT INTO notifications VALUES(?,?,?)')});
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  vm.runInContext(source.slice(source.indexOf('const _awardCoinsTx'),source.indexOf('const _awardXpTx')),context);
  return {claim:()=>context.claimBonusGc(1),events,impersonate:()=>{impersonating=true;}};
}

test('actual claims grant the threshold diamond and report its admin floatie only after success',t=>{
  const f=fixture(t);initializeLuckyCoinDiamonds(f.db);f.add(1,'old',99);
  const h=claims(f);f.db.exec('UPDATE users SET pending_bonus_gc=1 WHERE id=1');
  assert.equal(h.claim().ok,true);assert.equal(f.wallet().diamonds_earned,1);
  assert.equal(f.db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins,1);
  assert.deepEqual(h.events.filter(e=>e.rubyDelta),[{userId:1,diamondDelta:0,rubyDelta:1}]);
  assert.equal(h.claim().error,'nothing_to_claim');assert.equal(f.wallet().diamonds_earned,1);
  h.impersonate();f.db.exec('UPDATE users SET pending_bonus_gc=1 WHERE id=1');
  assert.equal(h.claim().error,'impersonating');assert.equal(f.wallet().lucky_coins_claimed,100);
});

test('failed claims roll back the pending flag, coins, diamond reward and claim event together',t=>{
  const f=fixture(t);initializeLuckyCoinDiamonds(f.db);f.add(1,'old',99);const before=f.wallet();
  const h=claims(f);f.db.exec(`UPDATE users SET pending_bonus_gc=1 WHERE id=1;
    CREATE TRIGGER reject_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'failed notification');END;`);
  assert.throws(h.claim,/failed notification/);assert.deepEqual(f.wallet(),before);
  assert.equal(f.db.prepare('SELECT pending_bonus_gc FROM users WHERE id=1').get().pending_bonus_gc,1);
  assert.equal(f.db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,1);
  assert.equal(f.db.prepare('SELECT rubies_earned FROM user_rubies WHERE user_id=1').get().rubies_earned,0);
  assert.equal(h.events.length,0);assert.equal(f.db.inTransaction,false);
});

test('50 and 150 give only rubies, 100 and 200 give only diamonds, with claim floaties', t => {
  const f=fixture(t);initializeLuckyCoinDiamonds(f.db);f.add(1,'old',49);
  const h=claims(f);
  for(let count=50;count<=200;count++) {
    f.db.exec('UPDATE users SET pending_bonus_gc=1 WHERE id=1');
    assert.equal(h.claim().ok,true);
    assert.equal(f.wallet().diamonds_earned,Math.floor((count+50)/100));
    assert.equal(f.db.prepare('SELECT rubies_earned FROM user_rubies WHERE user_id=1').get().rubies_earned,Math.floor(count/100));
  }
  assert.deepEqual(h.events.filter(e=>e.diamondDelta||e.rubyDelta),[
    {userId:1,diamondDelta:1,rubyDelta:0},{userId:1,diamondDelta:0,rubyDelta:1},
    {userId:1,diamondDelta:1,rubyDelta:0},{userId:1,diamondDelta:0,rubyDelta:1},
  ]);
});

test('existing 100-coin ruby rewards are reconciled without clawbacks or repeat credits', t => {
  const f=fixture(t);
  f.db.exec(`ALTER TABLE user_diamonds ADD COLUMN lucky_coins_claimed INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE user_diamonds ADD COLUMN lucky_diamonds_earned INTEGER NOT NULL DEFAULT 0;
    INSERT INTO user_diamonds(user_id,lucky_coins_claimed,lucky_diamonds_earned,diamonds_earned,diamonds_spent,dig_progress)
      VALUES(1,885,8,51,51,123456),(2,192,1,6,0,654321);
    INSERT INTO user_rubies(user_id,rubies_earned,rubies_spent,rubies_collectibles) VALUES(1,13,13,2);`);
  const market=f.db.prepare('SELECT * FROM diamond_market').get();
  const rubyMarket=f.db.prepare('SELECT * FROM ruby_market').get();
  initializeLuckyCoinDiamonds(f.db);
  assert.equal(f.wallet().diamonds_earned,52);assert.equal(f.wallet().diamonds_spent,51);
  assert.equal(f.wallet().lucky_diamonds_earned,9);assert.equal(f.wallet().dig_progress,123456);
  assert.equal(f.wallet(2).diamonds_earned,7);assert.equal(f.wallet(2).dig_progress,654321);
  const diamonds=f.db.prepare('SELECT * FROM user_rubies ORDER BY user_id').all();
  assert.equal(diamonds[0].rubies_earned,21);assert.equal(diamonds[0].rubies_spent,13);
  assert.equal(diamonds[0].rubies_collectibles,2);assert.equal(diamonds[0].rubies_lucky_coins,8);
  assert.equal(diamonds[1].rubies_earned,1);
  initializeLuckyCoinDiamonds(f.db);
  assert.equal(f.wallet().diamonds_earned,52);
  assert.deepEqual(f.db.prepare('SELECT * FROM user_rubies ORDER BY user_id').all(),diamonds);
  assert.deepEqual(f.db.prepare('SELECT * FROM diamond_market').get(),market);
  assert.deepEqual(f.db.prepare('SELECT * FROM ruby_market').get(),rubyMarket);
});
