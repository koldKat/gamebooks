'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeDiamondBalances } = require('../server/db/diamonds');
const { initializeJobXp, getJobTitle } = require('../server/db/job-xp');
const computeLevel = xp => Math.floor((Math.sqrt(1+8*xp/1000)-1)/2);

function fixture(t) {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, xp INTEGER DEFAULT 0,
    public_profile INTEGER DEFAULT 0, hide_from_feed INTEGER DEFAULT 0, avatar_path TEXT,
    is_author INTEGER DEFAULT 0, is_contributor INTEGER DEFAULT 0, is_moderator INTEGER DEFAULT 0,
    is_squire INTEGER DEFAULT 0, display_name TEXT);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,UNIQUE(user_id,event,ref));`);
  for (let id=1;id<=20;id++) db.prepare('INSERT INTO users(id,username) VALUES(?,?)').run(id,'User'+id);
  initializeDiamondBalances(db); initializeJobXp(db);
  return db;
}

test('Job promotions use the feed privacy/cutoff rules and invalidate the polling fingerprint', t => {
  const db = fixture(t);
  const feedDb = {prepare(sql) {
    if (sql.includes('FROM job_level_events')) return db.prepare(sql);
    return {all:()=>[],get:()=>({n:0,m:0})};
  }};
  const context = {module:{exports:{}}, require(name) {
    return {'./connection':{db:feedDb},'./xp':{computeLevel,getTitleForLevel:()=> 'Main title'},
      './job-xp':{getJobTitle},'./content':{},'./books':{},'./rating-stats':{}}[name];
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/db/feed'),'utf8'),context);
  const api=context.module.exports, before=api.getFeedVersion();
  db.exec(`UPDATE users SET public_profile=1,is_squire=1,display_name='Reader' WHERE id=1;
    INSERT INTO job_level_events(user_id,level) VALUES(1,2),(2,1),(3,1);
    UPDATE users SET hide_from_feed=1 WHERE id=2;
    UPDATE job_level_events SET created_at=1 WHERE user_id=3;`);
  assert.notEqual(api.getFeedVersion(),before);
  const events=api.getFeed();
  assert.equal(events.length,1);
  assert.equal(events[0].type,'job_level_up'); assert.equal(events[0].level,2);
  assert.equal(events[0].levelTitle,'Sifter'); assert.equal(events[0].userTitle,'Main title');
  assert.equal(events[0].isSquire,true); assert.equal(events[0].displayName,'Reader');
  assert.equal(events[0].userPublicProfile,true);
  db.exec('UPDATE users SET public_profile=0 WHERE id=1');
  assert.equal(api.getFeed()[0].userPublicProfile,false,'profile privacy does not hide otherwise visible activity');
});

test('live feed pushes only real Job Level crossings, including a legitimate main level-up during a heartbeat', t => {
  const db=fixture(t), feed=[], gems=[];
  db.exec('UPDATE user_job_xp SET xp=999 WHERE user_id=1');
  const insert=db.prepare('INSERT OR IGNORE INTO xp_events VALUES(?,?,?)');
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  const context=vm.createContext({db,computeLevel,isImpersonatingContext:()=>false,getXpAmount:()=>0,
    _xpFeedHook:event=>feed.push(event),_appXpHook:event=>gems.push(event),
    _awardXpTx:(user,event,ref)=>insert.run(user,event,ref).changes>0});
  vm.runInContext(source.slice(source.indexOf('function awardXp('),source.indexOf('function awardIdleHeartbeatXp(')),context);
  assert.equal(context.awardXp(1,'visit_node','1'),true);
  assert.equal(feed.length,1); assert.equal(feed[0].action,'job_level_up');
  assert.equal(context.awardXp(1,'visit_node','1'),false);
  context.awardXp(1,'idle_heartbeat','1'); context.awardXp(1,'add_note','1');
  assert.equal(feed.length,1);
  db.exec('UPDATE user_job_xp SET xp=2999 WHERE user_id=1');
  context._awardXpTx=(user,event,ref)=>db.transaction(()=>{
    insert.run(user,event,ref); insert.run(user,'level_up','main-1'); return true;
  })();
  context.awardXp(1,'idle_heartbeat','2');
  assert.equal(feed.length,2); assert.equal(feed[1].action,'job_level_up');
  assert.equal(db.prepare('SELECT xp FROM user_job_xp WHERE user_id=1').get().xp,3000);
});

test('admin Job Level cells show the trade title and independent progress for level zero and higher', () => {
  const source=fs.readFileSync(require.resolve('../admin/js/core.js'),'utf8');
  const context=vm.createContext({document:{createElement:()=>({style:{}})}});
  vm.runInContext(source.slice(source.indexOf('export function mkJobLevelCell'),source.indexOf('const _countryNames')).replaceAll('export ',''),context);
  const cell=context.mkJobLevelCell({jobLevel:2,jobTitle:'Sifter',jobXp:3456,jobLevelCap:9});
  assert.equal(cell.textContent,'Job Lvl 2  Sifter'); assert.match(cell.title,/3,456 \/ 6,000 Job XP; cap: 9/);
  const starter=context.mkJobLevelCell({jobLevel:0,jobTitle:'Laborer',jobXp:0,jobLevelCap:0});
  assert.equal(starter.textContent,'Job Lvl 0  Laborer'); assert.match(starter.title,/0 \/ 1,000/);
});
