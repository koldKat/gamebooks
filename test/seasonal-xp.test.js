'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { seasonalXpMultiplier } = require('../server/seasonal-events');

test('Diwali doubles normal and simulator wins only within its moving Sofia dates', () => {
  for (const event of ['win_run','first_win','first_win_ow','battlesim_win']) {
    assert.equal(seasonalXpMultiplier(event,new Date('2026-11-04T21:59:59Z')),1);
    assert.equal(seasonalXpMultiplier(event,new Date('2026-11-04T22:00:00Z')),2);
    assert.equal(seasonalXpMultiplier(event,new Date('2026-11-11T21:59:59Z')),2);
    assert.equal(seasonalXpMultiplier(event,new Date('2026-11-11T22:00:00Z')),1);
    assert.equal(seasonalXpMultiplier(event,new Date('2027-10-29T12:00:00Z')),2);
    assert.equal(seasonalXpMultiplier(event,new Date('2027-11-08T12:00:00Z')),1);
  }
  for (const event of ['death_run','battle_run','battlesim_loss','run_depth','clean_run','discovery']) {
    assert.equal(seasonalXpMultiplier(event,new Date('2026-11-08T12:00:00Z')),1);
  }
  for (const event of ['win_run','battlesim_win','death_run','battlesim_loss']) {
    assert.equal(seasonalXpMultiplier(event,new Date('2027-10-31T12:00:00Z')),2);
  }
});

test('Halloween loss bonuses use inclusive Sofia dates and exclude unrelated rewards', () => {
  for (const year of [2026, 2027, 2028]) {
    for (const event of ['death_run','battle_run','first_loss','first_battle_death','first_loss_ow','first_battle_death_ow','battlesim_loss']) {
      const offset = year === 2026 ? '+02:00' : '+03:00';
      assert.equal(seasonalXpMultiplier(event, new Date(`${year}-10-27T23:59:59${offset}`)), 1);
      assert.equal(seasonalXpMultiplier(event, new Date(`${year}-10-28T00:00:00${offset}`)), 2);
      assert.equal(seasonalXpMultiplier(event, new Date(`${year}-11-03T21:59:59Z`)), 2);
      assert.equal(seasonalXpMultiplier(event, new Date(`${year}-11-03T22:00:00Z`)), 1);
    }
  }
  for (const event of ['win_run','first_win','battlesim_win','discover_node','run_depth','idle_heartbeat']) {
    assert.equal(seasonalXpMultiplier(event, new Date('2026-10-31T12:00:00Z')), 1);
  }
});

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0,xp_boost_pct INTEGER DEFAULT 0,
    xp_boost_carry REAL DEFAULT 0,xp_from_boost INTEGER DEFAULT 0,coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0,pending_bonus_gc INTEGER DEFAULT 0,bonus_gc_generated INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0,
    bonus_heartbeat_xp INTEGER DEFAULT 0,heartbeat_carry REAL DEFAULT 0,heartbeat_minutes_banked INTEGER DEFAULT 0);
    INSERT INTO users(id) VALUES(1);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,template_id INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    CREATE TABLE level_up_templates(id INTEGER,active INTEGER);`);
  let date = new Date('2026-10-31T12:00:00Z'), impersonating = false;
  const context = vm.createContext({db, Math, _appXpHook:null, _xpFeedHook:null,
    _insertNotif:db.prepare('INSERT INTO notifications VALUES(?,?,?)'),
    isImpersonatingContext:()=>impersonating,
    seasonalXpMultiplier:event=>seasonalXpMultiplier(event,date),
    getXpAmount:event=>({death_run:15,battle_run:15,battlesim_loss:5,win_run:20,battlesim_win:10,first_win:100}[event] ?? 0),
    getTitleForLevel:()=>'',advanceHeartbeatCoins:()=>false});
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function computeLevel('),source.indexOf('function toRoman('))
    + '\n_liveUserCount=()=>1000;',context);
  vm.runInContext(source.slice(source.indexOf('const _awardCoinsTx'),source.indexOf('function awardIdleHeartbeatXp(')),context);
  vm.runInContext(source.slice(source.indexOf('function awardIdleHeartbeatXp('),source.indexOf('function getUserXpInfo(')),context);
  return {db,context,award:(event,ref,amount)=>context.awardXp(1,event,ref,amount),
    xp:()=>db.prepare('SELECT xp FROM users WHERE id=1').get().xp,
    date:value=>{date=new Date(value);},impersonate:()=>{impersonating=true;}};
}

test('real XP transaction doubles losses, preserves boosts and never re-awards an existing ref', t => {
  const f=fixture(t);
  assert.equal(f.award('death_run','run:1'),true);assert.equal(f.xp(),30);
  assert.equal(f.award('battle_run','run:2'),true);assert.equal(f.xp(),60);
  assert.equal(f.award('battlesim_loss','fight:1'),true);assert.equal(f.xp(),70);
  assert.equal(f.award('death_run','run:1'),false);assert.equal(f.xp(),70);
  f.award('win_run','run:3');assert.equal(f.xp(),90);
  f.db.prepare('UPDATE users SET xp_boost_pct=1000 WHERE id=1').run();
  f.award('death_run','run:4');assert.equal(f.xp(),150);
  f.award('first_loss','book:1',75);assert.equal(f.xp(),450,'open-world override doubles before normal boost');
  f.date('2026-11-04T12:00:00Z');
  f.award('death_run','run:5');assert.equal(f.xp(),480,'normal amount after event');
  assert.equal(f.award('death_run','run:1'),false);assert.equal(f.xp(),480);
});

test('Christmas doubles wins, new runs, full-book milestones and heartbeats only', t => {
  const f=fixture(t);f.date('2026-12-25T12:00:00Z');
  for(const event of ['win_run','battlesim_win','first_win','first_win_ow','run_depth','discover_all','visit_all','discover_all_series','visit_all_series','discover_all_anthology','visit_all_anthology','won_all_series','won_all_anthology','idle_heartbeat']) {
    const before=f.xp();assert.equal(f.award(event,event,10),true);assert.equal(f.xp()-before,20,event);
    assert.equal(f.award(event,event,10),false);
  }
  for(const event of ['death_run','visit_node','discover_node','add_note','rate_book']) {
    const before=f.xp();f.award(event,event,10);assert.equal(f.xp()-before,10,event);
  }
});

test('New Year doubles every XP event and amount override without duplicating awards',t=>{
  const f=fixture(t);f.date('2026-12-31T12:00:00Z');
  for(const event of ['win_run','battlesim_loss','idle_heartbeat','discover_node','add_note','rate_book','upload_cover','future_xp_event']) {
    const before=f.xp();f.award(event,event,7);assert.equal(f.xp()-before,14,event);assert.equal(f.award(event,event,7),false);
  }
  assert.equal(seasonalXpMultiplier('future_xp_event',new Date('2027-01-04T21:59:59Z')),2);
  assert.equal(seasonalXpMultiplier('future_xp_event',new Date('2027-01-04T22:00:00Z')),1);
});

test('capped heartbeat banking receives the winter bonus and keeps the cap',t=>{
  const f=fixture(t);f.date('2026-12-25T12:00:00Z');
  vm.runInContext('_liveUserCount=()=>0;getXpAmount=()=>1;',f.context);
  f.db.prepare('UPDATE users SET xp=990 WHERE id=1').run();
  assert.equal(f.context.awardIdleHeartbeatXp(1).awarded,true);assert.equal(f.xp(),992);
  f.db.prepare('UPDATE users SET xp=998 WHERE id=1').run();f.context.awardIdleHeartbeatXp(1);assert.equal(f.xp(),999);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM xp_events').get().n,0);
  f.impersonate();assert.equal(f.context.awardIdleHeartbeatXp(1).awarded,false);assert.equal(f.xp(),999);
});

test('real Diwali win rewards preserve deduplication, first-win overrides and normal boosts', t => {
  const f=fixture(t);f.date('2026-11-08T12:00:00Z');
  assert.equal(f.award('win_run','run:1'),true);assert.equal(f.xp(),40);
  assert.equal(f.award('battlesim_win','fight:1'),true);assert.equal(f.xp(),60);
  assert.equal(f.award('battlesim_win','fight:1'),false);assert.equal(f.xp(),60);
  f.award('death_run','run:2');assert.equal(f.xp(),75,'loss has no Diwali bonus');
  f.db.prepare('UPDATE users SET xp_boost_pct=1000 WHERE id=1').run();
  f.award('first_win','book:1',150);assert.equal(f.xp(),675,'first-win override doubles before ordinary boost');
  f.date('2026-11-12T12:00:00Z');f.award('win_run','run:3');assert.equal(f.xp(),715,'ordinary boost remains after event ends');
});

test('seasonal XP remains mandatory while retaining the level cap and impersonation guard', t => {
  const f=fixture(t);
  // The reward path never reads cosmetic/user preferences.
  f.db.prepare('UPDATE users SET xp=995 WHERE id=1').run();
  vm.runInContext('_liveUserCount=()=>0;',f.context);
  f.award('death_run','capped');assert.equal(f.xp(),999);
  f.impersonate();assert.equal(f.award('battle_run','impersonated'),false);assert.equal(f.xp(),999);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM xp_events').get().n,1);
});
