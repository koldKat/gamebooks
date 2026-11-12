'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeDiamondBalances } = require('../server/db/diamonds');
const { initializeJobXp } = require('../server/db/job-xp');
const { initializeRubies } = require('../server/db/rubies');
const { initializeGemNotifications } = require('../server/db/gem-notifications');
const { initializeJobLevelRubies } = require('../server/db/job-level-rubies');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0);
    CREATE TABLE xp_events(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event TEXT,ref TEXT,UNIQUE(user_id,event,ref));
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,payload TEXT);
    INSERT INTO users(id) VALUES(1),(2),(3);`);
  initializeDiamondBalances(db);
  initializeJobXp(db);
  initializeRubies(db);
  initializeGemNotifications(db);
  const wallet = id => db.prepare('SELECT * FROM user_diamonds WHERE user_id=?').get(id);
  const levels = id => db.prepare('SELECT level FROM job_level_ruby_rewards WHERE user_id=? ORDER BY level').all(id).map(r => r.level);
  return { db, wallet, levels, init: () => initializeJobLevelRubies(db) };
}

test('retroactive rubies cover attained levels without promotion history and preserve other balances', t => {
  const h = fixture(t), { db } = h;
  db.exec(`UPDATE user_job_xp SET xp=999 WHERE user_id=1;
    UPDATE user_job_xp SET xp=6000 WHERE user_id=2;
    INSERT INTO job_level_events(user_id,level) VALUES(3,2);
    INSERT INTO user_diamonds(user_id,diamonds_earned,diamonds_bought,diamonds_spent,qualifying_events,dig_progress)
      VALUES(2,12,5,7,4321,456789);
    INSERT INTO user_rubies(user_id,rubies_earned) VALUES(2,8);`);
  const beforeWallet = h.wallet(2);
  const beforeJobs = db.prepare('SELECT * FROM user_job_xp ORDER BY user_id').all();
  const beforeEvents = db.prepare('SELECT * FROM job_level_events ORDER BY user_id,level').all();
  const beforeMarket = db.prepare('SELECT * FROM diamond_market').all();
  assert.equal(h.init().awarded,5);
  assert.deepEqual(h.levels(1),[]);
  assert.deepEqual(h.levels(2),[1,2,3]);
  assert.deepEqual(h.levels(3),[1,2],'retained historical levels also qualify');
  assert.deepEqual(h.wallet(2),{ ...beforeWallet, diamonds_earned:15 });
  assert.equal(db.prepare('SELECT rubies_earned FROM user_rubies WHERE user_id=2').get().rubies_earned,8,'displayed diamonds stay unchanged');
  assert.deepEqual(db.prepare('SELECT * FROM user_job_xp ORDER BY user_id').all(),beforeJobs);
  assert.deepEqual(db.prepare('SELECT * FROM job_level_events ORDER BY user_id,level').all(),beforeEvents);
  assert.deepEqual(db.prepare('SELECT * FROM diamond_market').all(),beforeMarket);
  const notifications = db.prepare('SELECT * FROM notifications').all();
  assert.equal(h.init().awarded,0);
  assert.equal(h.wallet(2).diamonds_earned,15);
  assert.deepEqual(db.prepare('SELECT * FROM notifications').all(),notifications,'restart never repeats rewards or notices');
});

test('new promotions award exactly once, including multi-level jumps, with ruby notices and atomic rollback', t => {
  const h = fixture(t), { db } = h;
  h.init();
  db.exec('UPDATE user_job_xp SET xp=999 WHERE user_id=1');
  assert.deepEqual(h.levels(1),[]);
  db.exec('UPDATE user_job_xp SET xp=1000 WHERE user_id=1');
  assert.equal(h.wallet(1).diamonds_earned,1);
  assert.deepEqual(h.levels(1),[1]);
  db.exec('UPDATE user_job_xp SET xp=6000 WHERE user_id=1');
  assert.equal(h.wallet(1).diamonds_earned,3);
  assert.deepEqual(h.levels(1),[1,2,3]);
  const notices = db.prepare("SELECT payload FROM notifications WHERE user_id=1 AND type='diamond_gain'").all();
  assert.equal(notices.reduce((sum,r) => sum+JSON.parse(r.payload).amount,0),3,'legacy diamond_gain is the displayed ruby notification');
  assert.throws(() => db.transaction(() => {
    db.exec('UPDATE user_job_xp SET xp=10000 WHERE user_id=1');
    throw Error('rollback');
  })(),/rollback/);
  assert.equal(h.wallet(1).diamonds_earned,3);
  assert.deepEqual(h.levels(1),[1,2,3]);
  db.exec('UPDATE user_job_xp SET xp=0 WHERE user_id=1; UPDATE user_job_xp SET xp=6000 WHERE user_id=1');
  assert.equal(h.wallet(1).diamonds_earned,3,'reaching a previously awarded level cannot be farmed');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM xp_events').get().n,0,'rewarding a job promotion creates no XP events');
  db.exec('DELETE FROM users WHERE id=1');
  assert.deepEqual(h.levels(1),[]);
});

test('real event threshold and newly inserted attained progress use the same reward path', t => {
  const h = fixture(t), { db } = h;
  for (let id=4;id<=20;id++) db.prepare('INSERT INTO users(id) VALUES(?)').run(id);
  h.init();
  db.exec('UPDATE user_job_xp SET xp=999 WHERE user_id=1');
  db.prepare('INSERT INTO xp_events VALUES(?,?,?)').run(1,'visit_node','one');
  assert.equal(h.wallet(1).diamonds_earned,1);
  assert.deepEqual(h.levels(1),[1]);
  db.prepare('INSERT OR IGNORE INTO xp_events VALUES(?,?,?)').run(1,'visit_node','one');
  db.prepare('INSERT INTO xp_events VALUES(?,?,?)').run(1,'idle_heartbeat','one');
  assert.equal(h.wallet(1).diamonds_earned,1);
  db.exec('DELETE FROM user_job_xp WHERE user_id=2; INSERT INTO user_job_xp(user_id,xp) VALUES(2,3000)');
  assert.deepEqual(h.levels(2),[1,2]);
  assert.equal(h.wallet(2).diamonds_earned,2);
});

test('normal XP awards report the promotion ruby through the existing live reward hook', t => {
  const h = fixture(t), { db } = h;
  for (let id=4;id<=20;id++) db.prepare('INSERT INTO users(id) VALUES(?)').run(id);
  h.init();
  db.exec('UPDATE user_job_xp SET xp=999 WHERE user_id=1');
  const gems=[], feed=[], insert=db.prepare('INSERT OR IGNORE INTO xp_events VALUES(?,?,?)');
  const source=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
  const context=vm.createContext({db,
    computeLevel:xp=>Math.floor((Math.sqrt(1+8*xp/1000)-1)/2),
    isImpersonatingContext:()=>false, getXpAmount:()=>0, seasonalContributionEligible:require('../server/db/seasonal-contributions').seasonalContributionEligible,seasonalXpMultiplier:()=>1,
    _xpFeedHook:event=>feed.push(event), _appXpHook:event=>gems.push(event),
    _awardXpTx:(user,event,ref)=>insert.run(user,event,ref).changes>0 });
  vm.runInContext(source.slice(source.indexOf('function awardXp('),source.indexOf('function awardIdleHeartbeatXp(')),context);
  assert.equal(context.awardXp(1,'visit_node','promotion'),true);
  assert.equal(gems.filter(e=>e.diamondDelta===1).length,1);
  assert.equal(feed.filter(e=>e.action==='job_level_up').length,1);
  assert.equal(context.awardXp(1,'visit_node','promotion'),false);
  assert.equal(gems.filter(e=>e.diamondDelta===1).length,1);
});
