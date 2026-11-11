'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

test('node color and shape each award matching XP once per player/book/node, including resets and stale saves', t => {
  const db = new Database(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0,xp_boost_pct INTEGER DEFAULT 0,
    xp_boost_carry REAL DEFAULT 0,xp_from_boost INTEGER DEFAULT 0,coins_spent INTEGER DEFAULT 0,
    bonus_coins INTEGER DEFAULT 0,pending_bonus_gc INTEGER DEFAULT 0,bonus_gc_generated INTEGER DEFAULT 0,
    bonus_gc_chance_purchased INTEGER DEFAULT 0,bonus_gc_mint_purchased INTEGER DEFAULT 0);
    INSERT INTO users(id) VALUES(1),(2);
    CREATE TABLE books(id INTEGER PRIMARY KEY,total_sections INTEGER,discoverable_sections INTEGER,series_id INTEGER,parent_book_id INTEGER);
    INSERT INTO books(id,total_sections) VALUES(10,0),(11,0);
    CREATE TABLE book_reading_entries(book_id INTEGER,section_id TEXT,counts_as_section INTEGER);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,template_id INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(user_id INTEGER,type TEXT,payload TEXT);
    CREATE TABLE level_up_templates(id INTEGER,active INTEGER);`);
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  const defaults=vm.runInNewContext(source.slice(source.indexOf('const _xpDefaults ='),source.indexOf('db.transaction(() => {'))+'\n_xpDefaults;');
  assert.equal(defaults.set_color,2);assert.equal(defaults.set_shape,defaults.set_color);
  const context=vm.createContext({db, Math, _appXpHook:null, _xpFeedHook:null,
    _insertNotif:db.prepare('INSERT INTO notifications VALUES(?,?,?)'),
    isImpersonatingContext:()=>false, seasonalXpMultiplier:()=>1, recordSeasonParticipation:()=>{},
    getTitleForLevel:()=>'', getXpAmount:event=>defaults[event]??0,
    uncountedReadingSections:()=>[], _discoveredSet:()=>new Set(), _visitedSet:()=>new Set(), _mappedSet:()=>new Set()});
  vm.runInContext(source.slice(source.indexOf('function computeLevel('),source.indexOf('function toRoman('))+'\n_liveUserCount=()=>1000;',context);
  vm.runInContext(source.slice(source.indexOf('const _awardCoinsTx'),source.indexOf('function awardIdleHeartbeatXp(')),context);
  vm.runInContext(source.slice(source.indexOf('const CUSTOM_NODE_SHAPES ='),source.indexOf('function migrateXpForUser(')),context);
  let previous={graph:{},playthroughs:[]};
  const save=(graph,user=1,book=10,old=previous)=>{
    const next={graph,playthroughs:[]};context.processStateXp(user,book,old,next,0);previous=structuredClone(next);
  };
  const xp=user=>db.prepare('SELECT xp FROM users WHERE id=?').get(user).xp;
  save({1:{color:'#ff0000',shape:'trapezoid'}});assert.equal(xp(1),4);
  save({1:{color:'#00ff00',shape:'roundedSquare'}});assert.equal(xp(1),4,'edits earn no extra XP');
  save({1:{}});save({1:{color:'#fff',shape:'octagon'}});assert.equal(xp(1),4,'clear/reapply is not another reward');
  save({1:{color:'#fff',shape:'octagon'}},1,10,{graph:{},playthroughs:[]});assert.equal(xp(1),4,'stale-device replay is deduplicated');
  save({2:{color:'#fff',shape:'hexagon'}});assert.equal(xp(1),8,'each node has its own award');
  save({1:{color:'#fff',shape:'triangle'}},1,11,{graph:{},playthroughs:[]});assert.equal(xp(1),12,'different books are independent');
  save({1:{color:'#fff',shape:'triangle'}},2,10,{graph:{},playthroughs:[]});assert.equal(xp(2),4,'different players are independent');
  save({3:{shape:'circle'},4:{shape:'not-a-shape'}});assert.equal(xp(1),12,'default and invalid shapes earn nothing');
  save({3:{shape:'trapezoid'}});assert.equal(xp(1),14,'a later valid custom shape still earns its first award');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE user_id=1 AND event='set_shape' AND ref='10:1'").get().n,1);
});
