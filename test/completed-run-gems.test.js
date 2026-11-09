'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeCompletedRunGems } = require('../server/db/completed-run-gems');
const { initializeGemNotifications } = require('../server/db/gem-notifications');

function fixture(t) {
  const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,bonus_coins INTEGER,coins_spent INTEGER,xp INTEGER);
    INSERT INTO users VALUES(1,20,10,123456),(2,0,0,1234);
    CREATE TABLE xp_events(user_id,event,ref,UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(id INTEGER PRIMARY KEY,user_id,event,ref,amount);
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id,type,payload);
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER DEFAULT 0,
      diamonds_bought INTEGER DEFAULT 0,diamonds_spent INTEGER DEFAULT 0);
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER DEFAULT 0,
      rubies_bought INTEGER DEFAULT 0,rubies_spent INTEGER DEFAULT 0);`);
  initializeGemNotifications(db);
  const event=db.prepare('INSERT OR IGNORE INTO xp_events VALUES(?,?,?)');
  const wallet=id=>({ruby:db.prepare('SELECT diamonds_earned n FROM user_diamonds WHERE user_id=?').get(id)?.n||0,
    diamond:db.prepare('SELECT rubies_earned n FROM user_rubies WHERE user_id=?').get(id)?.n||0});
  return {db,wallet,event:(ref,type='win_run',user=1)=>event.run(user,type,String(ref)),
    count:()=>db.prepare('SELECT runs FROM completed_run_gem_totals WHERE user_id=1').get()?.runs||0};
}

test('completed runs alternate ruby50/diamond100 and count each run once across outcomes',t=>{
  const f=fixture(t);initializeCompletedRunGems(f.db);
  for(let n=1;n<=200;n++){
    f.event('book:'+n,['win_run','death_run','battle_run'][n%3]);
    assert.deepEqual(f.wallet(1),{ruby:Math.floor((n+50)/100),diamond:Math.floor(n/100)},'run '+n);
  }
  f.event('book:200','win_run');f.event('book:200','death_run');
  f.event('sim:1','battlesim_win');f.event('new:1','run_depth');
  assert.equal(f.count(),200);assert.deepEqual(f.wallet(1),{ruby:2,diamond:2});
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,0);
});

test('retroactive conversion is silent, subtracts only old run gold, and never repeats',t=>{
  const f=fixture(t);
  f.db.exec(`INSERT INTO user_diamonds(user_id,diamonds_earned,diamonds_spent) VALUES(1,5,2);
    INSERT INTO user_rubies(user_id,rubies_earned,rubies_bought) VALUES(1,7,3);
    INSERT INTO coin_events VALUES(1,1,'runs_milestone','100',1),(2,1,'runs_milestone','200',1),
      (3,1,'level_up_coin','20',1),(4,2,'runs_milestone','100',1);`);
  for(let n=1;n<=250;n++)f.event('book:'+n);
  f.event('book:1','death_run');
  for(let n=1;n<=100;n++)f.event('other:'+n,'battle_run',2);
  const notifications=f.db.prepare('SELECT * FROM notifications').all();
  assert.deepEqual(initializeCompletedRunGems(f.db),{goldRemoved:3,rubiesAdded:4,diamondsAdded:3});
  assert.deepEqual(f.wallet(1),{ruby:8,diamond:9});assert.deepEqual(f.wallet(2),{ruby:1,diamond:1});
  assert.deepEqual(f.db.prepare('SELECT * FROM users ORDER BY id').all(),[
    {id:1,bonus_coins:18,coins_spent:10,xp:123456},{id:2,bonus_coins:-1,coins_spent:0,xp:1234}]);
  assert.deepEqual(f.db.prepare('SELECT * FROM notifications').all(),notifications);
  assert.equal(f.db.prepare("SELECT SUM(amount) n FROM coin_events WHERE event='runs_milestone_reversal'").get().n,-3);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM coin_events WHERE event='runs_milestone'").get().n,3);
  assert.equal(f.db.prepare('SELECT diamonds_spent n FROM user_diamonds WHERE user_id=1').get().n,2);
  assert.equal(f.db.prepare('SELECT rubies_bought n FROM user_rubies WHERE user_id=1').get().n,3);
  assert.deepEqual(initializeCompletedRunGems(f.db),{goldRemoved:0,rubiesAdded:0,diamondsAdded:0});
  assert.deepEqual(f.wallet(1),{ruby:8,diamond:9});assert.equal(f.count(),250);
});

test('permanent run milestones survive XP log cleanup and restarting',t=>{
  const f=fixture(t);initializeCompletedRunGems(f.db);
  for(let n=1;n<=50;n++)f.event('book:'+n);
  f.db.exec('DELETE FROM xp_events');initializeCompletedRunGems(f.db);
  f.event('book:1','death_run');assert.equal(f.count(),50);
  for(let n=51;n<=100;n++)f.event('book:'+n);
  assert.equal(f.count(),100);assert.deepEqual(f.wallet(1),{ruby:1,diamond:1});
});

test('a failed gold reversal rolls back gem backfill, ledgers and migration atomically',t=>{
  const f=fixture(t);for(let n=1;n<=100;n++)f.event('book:'+n);
  f.db.exec(`INSERT INTO coin_events VALUES(1,1,'runs_milestone','100',1);
    CREATE TRIGGER fail_reversal BEFORE UPDATE OF bonus_coins ON users BEGIN SELECT RAISE(ABORT,'blocked'); END;`);
  assert.throws(()=>initializeCompletedRunGems(f.db),/blocked/);
  assert.deepEqual(f.wallet(1),{ruby:0,diamond:0});
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM coin_events WHERE event='runs_milestone_reversal'").get().n,0);
  f.db.exec('DROP TRIGGER fail_reversal');initializeCompletedRunGems(f.db);
  assert.deepEqual(f.wallet(1),{ruby:1,diamond:1});
  assert.equal(f.db.prepare('SELECT bonus_coins n FROM users WHERE id=1').get().n,19);
});
