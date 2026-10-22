'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeGemNotifications } = require('../server/db/gem-notifications');
const { initializeDiamondBalances } = require('../server/db/diamonds');
const { initializeLuckyCoinDiamonds } = require('../server/db/lucky-coin-diamonds');
const { initializeRubies } = require('../server/db/rubies');

function fixture(t) {
  const db = new Database(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0);
    INSERT INTO users(id) VALUES(1),(2);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);`);
  initializeDiamondBalances(db);initializeLuckyCoinDiamonds(db);initializeRubies(db);
  initializeGemNotifications(db);initializeGemNotifications(db);
  const notices=()=>db.prepare('SELECT user_id,type,payload FROM notifications ORDER BY rowid').all()
    .map(n=>({...n,payload:JSON.parse(n.payload)}));
  return {db,notices};
}

test('diamond mining and Lucky Coin awards notify once at the actual earning threshold',t=>{
  const {db,notices}=fixture(t);
  const insert=db.prepare("INSERT OR IGNORE INTO xp_events VALUES(1,'visit_node',?)");
  db.transaction(()=>{for(let i=0;i<999;i++)insert.run(String(i));})();assert.equal(notices().length,0);
  insert.run('999');insert.run('999');
  assert.deepEqual(notices(),[{user_id:1,type:'diamond_gain',payload:{amount:1,balance:1}}]);
  db.exec("INSERT INTO xp_events VALUES(1,'idle_heartbeat','one'); INSERT INTO coin_events VALUES(1,'bonus_gc_claim','claim',250)");
  assert.deepEqual(notices().at(-1),{user_id:1,type:'diamond_gain',payload:{amount:2,balance:3}});
  db.exec("INSERT OR IGNORE INTO coin_events VALUES(1,'bonus_gc_claim','claim',250)");
  assert.equal(notices().length,2);
  db.exec("INSERT INTO coin_events VALUES(2,'bonus_gc_claim','first',100)");
  assert.deepEqual(notices().at(-1),{user_id:2,type:'diamond_gain',payload:{amount:1,balance:1}});
});

test('ruby insert, later completions and multiple-credit backfills notify without trade or restart duplicates',t=>{
  const {db,notices}=fixture(t);
  db.exec("INSERT INTO ruby_rewards(user_id,book_id,kind) VALUES(1,10,'book'),(1,11,'book')");
  assert.deepEqual(notices().map(n=>n.payload),[{amount:1,balance:1},{amount:1,balance:2}]);
  db.exec("INSERT OR IGNORE INTO ruby_rewards(user_id,book_id,kind) VALUES(1,10,'book')");
  db.exec('UPDATE user_rubies SET rubies_spent=1,rubies_bought=2 WHERE user_id=1');
  db.exec('UPDATE user_rubies SET rubies_earned=rubies_earned WHERE user_id=1');
  initializeGemNotifications(db);assert.equal(notices().length,2);
  db.exec('UPDATE user_rubies SET rubies_earned=rubies_earned+3 WHERE user_id=1');
  assert.deepEqual(notices().at(-1),{user_id:1,type:'ruby_gain',payload:{amount:3,balance:6}});
  db.exec('INSERT INTO user_diamonds(user_id,diamonds_bought) VALUES(2,5); UPDATE user_diamonds SET diamonds_spent=2 WHERE user_id=2');
  assert.equal(notices().length,3);
});

test('notification failure rolls back the award, completion ledger and shared market together',t=>{
  const {db,notices}=fixture(t);
  db.exec("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'notice failed'); END");
  assert.throws(()=>db.exec("INSERT INTO ruby_rewards(user_id,book_id,kind) VALUES(1,10,'book')"),/notice failed/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ruby_rewards').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_rubies').get().n,0);
  assert.equal(db.prepare('SELECT completions FROM ruby_market').get().completions,0);
  assert.throws(()=>db.exec('INSERT INTO user_diamonds(user_id,diamonds_earned) VALUES(1,1)'),/notice failed/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_diamonds').get().n,0);assert.equal(notices().length,0);
});
