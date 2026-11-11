'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const vm = require('node:vm');
const {initializeSimBattleGems} = require('../server/db/sim-battle-gems');
const {initializeGemNotifications} = require('../server/db/gem-notifications');
const {initializeAdminCrystalGold} = require('../server/db/admin-crystal-gold');
const {runInImpersonationContext,isImpersonatingContext} = require('../server/impersonation-context');

function fixture(t) {
  const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER,bonus_coins INTEGER,coins_spent INTEGER);
    INSERT INTO users VALUES(1,123456,20,10),(2,1234,5,2);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id,type,payload);
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER DEFAULT 0,
      diamonds_bought INTEGER DEFAULT 0,diamonds_spent INTEGER DEFAULT 0);
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER DEFAULT 0,
      rubies_bought INTEGER DEFAULT 0,rubies_spent INTEGER DEFAULT 0);
    CREATE TABLE diamond_market(diamonds_mined INTEGER);
    CREATE TABLE ruby_market(rubies_generated INTEGER);`);
  initializeGemNotifications(db);initializeAdminCrystalGold(db);
  const add=db.prepare('INSERT OR IGNORE INTO xp_events VALUES(?,?,?)');
  return {db,event:(ref,event='battlesim_win',id=1)=>add.run(id,event,String(ref)),
    count:()=>db.prepare('SELECT battles FROM sim_battle_gem_totals WHERE user_id=1').get()?.battles||0,
    wallet:id=>({ruby:db.prepare('SELECT diamonds_earned n FROM user_diamonds WHERE user_id=?').get(id)?.n||0,
      diamond:db.prepare('SELECT rubies_earned n FROM user_rubies WHERE user_id=?').get(id)?.n||0}),
    pool:()=>db.prepare('SELECT generated FROM admin_crystal_gold').get().generated};
}

test('simulator wins and losses alternate ruby50/diamond100 across simulator families',t=>{
  const f=fixture(t);initializeSimBattleGems(f.db);
  for(let n=1;n<=250;n++) {
    f.event(`sim${n%3}:${n}`,n%2?'battlesim_win':'battlesim_loss');
    assert.deepEqual(f.wallet(1),{ruby:Math.floor((n+50)/100),diamond:Math.floor(n/100)},'battle '+n);
    assert.equal(f.pool(),Math.floor(n/50));
  }
  f.event('sim1:1','battlesim_loss');
  for(const event of ['win_run','death_run','battle_run','run_depth','battlesim_paused','battlesim_fled','battlesim_cancelled'])f.event(event,event);
  assert.equal(f.count(),250);assert.deepEqual(f.wallet(2),{ruby:0,diamond:0});
  assert.equal(f.db.prepare('SELECT COUNT(*)n FROM notifications').get().n,5);
  assert.deepEqual(f.db.prepare('SELECT * FROM users WHERE id=1').get(),{id:1,xp:123456,bonus_coins:20,coins_spent:10});
});

test('historical battles backfill once, deduplicate changed outcomes and credit admin pool',t=>{
  const f=fixture(t);
  f.db.exec('INSERT INTO user_diamonds VALUES(1,5,2,3);INSERT INTO user_rubies VALUES(1,7,4,1)');
  for(let n=1;n<=250;n++)f.event('sim1:'+n);
  f.event('sim1:1','battlesim_loss');
  for(let n=1;n<=100;n++)f.event('sim2:'+n,'battlesim_loss',2);
  assert.equal(f.pool(),12);
  assert.deepEqual(initializeSimBattleGems(f.db),{battlesRecorded:350,rubiesAdded:4,diamondsAdded:3});
  assert.deepEqual(f.wallet(1),{ruby:8,diamond:9});assert.deepEqual(f.wallet(2),{ruby:1,diamond:1});assert.equal(f.pool(),19);
  assert.deepEqual(initializeSimBattleGems(f.db),{battlesRecorded:0,rubiesAdded:0,diamondsAdded:0});assert.equal(f.pool(),19);
  assert.deepEqual(f.db.prepare('SELECT diamonds_bought,diamonds_spent FROM user_diamonds WHERE user_id=1').get(),{diamonds_bought:2,diamonds_spent:3});
});

test('battle credit survives XP cleanup and cannot be reclaimed by changing an outcome',t=>{
  const f=fixture(t);initializeSimBattleGems(f.db);
  for(let n=1;n<=50;n++)f.event('sim9999:'+n);
  f.db.exec('DELETE FROM xp_events');initializeSimBattleGems(f.db);
  f.event('sim9999:1','battlesim_loss');assert.equal(f.count(),50);assert.equal(f.pool(),1);
  for(let n=51;n<=100;n++)f.event('sim9999:'+n,'battlesim_loss');
  assert.equal(f.count(),100);assert.deepEqual(f.wallet(1),{ruby:1,diamond:1});
});

test('saved history predating XP reconciles once, rewards missed milestones and survives deletion', t => {
  const f=fixture(t);initializeSimBattleGems(f.db);
  for(let n=1;n<=49;n++)f.event('sim8:'+n);
  f.db.exec(`DELETE FROM sim_battle_gem_migrations WHERE name='saved-history-v2';
    CREATE TABLE user_books(user_id INTEGER,state_data TEXT);`);
  const history=Array.from({length:60},(_,i)=>({ts:i+1,outcome:i<49?'win':'loss'}));
  const raw=JSON.stringify({playthroughs:[{startedAt:1,sim8:{history:history.concat([{ts:61,outcome:'cancelled'},{outcome:'win'}])}}]});
  f.db.prepare('INSERT INTO user_books VALUES(1,?)').run(raw);
  f.db.prepare('INSERT INTO user_books VALUES(1,?)').run(raw); // duplicated history, same owner
  assert.deepEqual(initializeSimBattleGems(f.db),{battlesRecorded:11,rubiesAdded:1,diamondsAdded:0});
  assert.equal(f.count(),60);assert.deepEqual(f.wallet(1),{ruby:1,diamond:0});assert.equal(f.pool(),1);
  assert.deepEqual(f.db.prepare('SELECT outcome,COUNT(*) n FROM sim_battle_gem_battles GROUP BY outcome ORDER BY outcome').all(),
    [{outcome:'loss',n:11},{outcome:'win',n:49}]);
  f.db.exec('DELETE FROM user_books; DELETE FROM xp_events');
  assert.deepEqual(initializeSimBattleGems(f.db),{battlesRecorded:0,rubiesAdded:0,diamondsAdded:0});
  f.event('sim8:1','battlesim_loss');assert.equal(f.count(),60);assert.equal(f.pool(),1);
  assert.equal(f.db.prepare("SELECT outcome FROM sim_battle_gem_battles WHERE ref='sim8:1'").get().outcome,'win');
});

test('failed reward rolls back battle credit, wallet, notification and pool together',t=>{
  const f=fixture(t);initializeSimBattleGems(f.db);
  for(let n=1;n<50;n++)f.event('sim1:'+n);
  f.db.exec("CREATE TRIGGER block_reward BEFORE UPDATE OF diamonds_earned ON user_diamonds WHEN NEW.diamonds_earned>OLD.diamonds_earned BEGIN SELECT RAISE(ABORT,'blocked');END");
  assert.throws(()=>f.event('sim1:50'),/blocked/);assert.equal(f.count(),49);assert.equal(f.pool(),0);
  assert.deepEqual(f.wallet(1),{ruby:0,diamond:0});
  assert.equal(f.db.prepare("SELECT COUNT(*)n FROM xp_events WHERE ref='sim1:50'").get().n,0);
  f.db.exec('DROP TRIGGER block_reward');f.event('sim1:50');assert.equal(f.count(),50);assert.equal(f.pool(),1);
});

test('central XP impersonation guard prevents permanent simulator credit and gems',t=>{
  const f=fixture(t);initializeSimBattleGems(f.db);
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  const context=vm.createContext({isImpersonatingContext,_xpFeedHook:null,_appXpHook:null,
    getXpAmount:()=>10,seasonalXpMultiplier:()=>1,_awardXpTx:(id,event,ref)=>Boolean(f.event(ref,event,id).changes)});
  vm.runInContext(source.slice(source.indexOf('function awardXp('),source.indexOf('function awardIdleHeartbeatXp(')),context);
  assert.equal(runInImpersonationContext(true,()=>context.awardXp(1,'battlesim_win','sim1:1')),false);
  assert.equal(f.count(),0);assert.equal(f.pool(),0);
  assert.equal(context.awardXp(1,'battlesim_win','sim1:1'),true);assert.equal(f.count(),1);
});
