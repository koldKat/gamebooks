'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {initializeSharedRunGems,awardSharedRun} = require('../server/db/shared-run-gems');
const {runInImpersonationContext} = require('../server/impersonation-context');
const {initializeAdminCrystalGold} = require('../server/db/admin-crystal-gold');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(()=>db.close()); db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER DEFAULT 0,bonus_coins INTEGER DEFAULT 0);
    INSERT INTO users(id) VALUES(1),(2);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT,ref TEXT,created_at INTEGER DEFAULT(unixepoch()),UNIQUE(user_id,event,ref));
    CREATE TABLE user_diamonds(user_id INTEGER PRIMARY KEY,diamonds_earned INTEGER DEFAULT 0 CHECK(diamonds_earned>=0));
    CREATE TABLE user_rubies(user_id INTEGER PRIMARY KEY,rubies_earned INTEGER DEFAULT 0 CHECK(rubies_earned>=0));
    CREATE TABLE diamond_market(diamonds_mined INTEGER);
    CREATE TABLE ruby_market(rubies_generated INTEGER);
    CREATE TABLE books(id INTEGER PRIMARY KEY,series_id INTEGER,parent_book_id INTEGER);
    CREATE TABLE user_books(user_id INTEGER,book_id INTEGER,state_data TEXT);
    CREATE TABLE series_runs(user_id INTEGER,series_id INTEGER,started_at INTEGER,is_public INTEGER);`);
  initializeAdminCrystalGold(db);
  return {db,share:(ref,event='share_run')=>db.prepare('INSERT OR IGNORE INTO xp_events(user_id,event,ref) VALUES(1,?,?)').run(event,String(ref)),
    wallet:()=>({rubies:db.prepare('SELECT diamonds_earned n FROM user_diamonds WHERE user_id=1').get()?.n||0,
      diamonds:db.prepare('SELECT rubies_earned n FROM user_rubies WHERE user_id=1').get()?.n||0})};
}

test('shares alternate at 50/100, survive cleanup, and do not replace other rewards',t=>{
  const f=fixture(t); initializeSharedRunGems(f.db);
  for(let n=1;n<=200;n++) {
    f.share('1:'+n);
    assert.deepEqual(f.wallet(),{rubies:Math.floor((n+50)/100),diamonds:Math.floor(n/100)});
  }
  f.share('1:200'); f.share('unused','win_run'); f.share('unused2','battlesim_loss');
  f.db.exec('DELETE FROM xp_events'); initializeSharedRunGems(f.db); f.share('1:200');
  assert.equal(f.db.prepare('SELECT runs FROM shared_run_gem_totals').get().runs,200);
  assert.deepEqual(f.wallet(),{rubies:2,diamonds:2});
  assert.equal(f.db.prepare('SELECT generated FROM admin_crystal_gold').get().generated,4);
  assert.deepEqual(f.db.prepare('SELECT milestone,currency FROM shared_run_gem_rewards ORDER BY milestone').all(),[
    {milestone:50,currency:'rubies'},{milestone:100,currency:'diamonds'},
    {milestone:150,currency:'rubies'},{milestone:200,currency:'diamonds'}]);
});

test('retroactive shares combine historical and saved public runs once, including series',t=>{
  const f=fixture(t);
  for(let n=1;n<=98;n++)f.share('1:'+(1700000000000+n));
  f.db.exec(`INSERT INTO books VALUES(1,NULL,NULL),(2,5,NULL),(3,5,NULL);
    INSERT INTO series_runs VALUES(1,5,123,1),(1,5,124,0);`);
  const insert=f.db.prepare('INSERT INTO user_books VALUES(?,?,?)');
  insert.run(1,1,JSON.stringify({playthroughs:[{startedAt:1700000000098,isPublic:true},{startedAt:1700000000099,isPublic:true},{startedAt:1700000000100,isPublic:false}]}));
  for(const id of [2,3])insert.run(1,id,JSON.stringify({playthroughs:[{startedAt:123000,isPublic:true}]}));
  initializeSharedRunGems(f.db);
  assert.equal(f.db.prepare('SELECT runs FROM shared_run_gem_totals').get().runs,100);
  assert.deepEqual(f.wallet(),{rubies:1,diamonds:1});
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM shared_run_gem_rewards').get().n,2);
  initializeSharedRunGems(f.db); assert.deepEqual(f.wallet(),{rubies:1,diamonds:1});
  assert.deepEqual(f.db.prepare('SELECT xp,bonus_coins FROM users WHERE id=1').get(),{xp:0,bonus_coins:0});
});

test('direct series sharing deduplicates its propagated XP and blocks impersonation',t=>{
  const f=fixture(t);initializeSharedRunGems(f.db);
  for(let n=1;n<50;n++)f.share('1:'+n);
  assert.deepEqual(runInImpersonationContext(true,()=>awardSharedRun(f.db,1,'series:5:123000')),{diamondDelta:0,rubyDelta:0});
  assert.deepEqual(awardSharedRun(f.db,1,'series:5:123000'),{diamondDelta:1,rubyDelta:0});
  f.share('series:5:123000');
  assert.equal(f.db.prepare('SELECT runs FROM shared_run_gem_totals').get().runs,50);
  assert.deepEqual(f.wallet(),{rubies:1,diamonds:0});
});

test('failed historical award rolls back the counter, crystals and admin gold together',t=>{
  const f=fixture(t);
  for(let n=1;n<=100;n++)f.share('1:'+n);
  f.db.exec(`CREATE TRIGGER reject_shared_reward BEFORE UPDATE OF rubies_earned ON user_rubies
    WHEN NEW.rubies_earned>OLD.rubies_earned BEGIN SELECT RAISE(ABORT,'test rollback'); END;`);
  assert.throws(()=>initializeSharedRunGems(f.db),/test rollback/);
  assert.deepEqual(f.wallet(),{rubies:0,diamonds:0});
  assert.equal(f.db.prepare('SELECT generated FROM admin_crystal_gold').get().generated,0);
  f.db.exec('DROP TRIGGER reject_shared_reward');
  initializeSharedRunGems(f.db);
  assert.deepEqual(f.wallet(),{rubies:1,diamonds:1});
});

test('legacy index and timestamp references count as one run and correct only excess share awards',t=>{
  const f=fixture(t);initializeSharedRunGems(f.db);
  f.db.exec('INSERT INTO user_diamonds(user_id,diamonds_earned) VALUES(1,17); INSERT INTO user_rubies(user_id,rubies_earned) VALUES(1,18);');
  const playthroughs=[];
  for(let i=0;i<50;i++) {
    const startedAt=1700000000000+i;
    playthroughs.push({startedAt,isPublic:true});
    awardSharedRun(f.db,1,`1:${i}`);
    awardSharedRun(f.db,1,`1:${startedAt}`);
  }
  assert.deepEqual(f.wallet(),{rubies:18,diamonds:19});
  f.db.prepare('INSERT INTO books VALUES(1,NULL,NULL)').run();
  f.db.prepare('INSERT INTO user_books VALUES(1,1,?)').run(JSON.stringify({playthroughs}));
  f.db.exec("DELETE FROM shared_run_gem_migrations WHERE name='canonical-shares-v2'");
  const pool=f.db.prepare('SELECT generated FROM admin_crystal_gold').get().generated;
  initializeSharedRunGems(f.db);
  assert.equal(f.db.prepare('SELECT runs FROM shared_run_gem_totals').get().runs,50);
  assert.deepEqual(f.wallet(),{rubies:18,diamonds:18});
  assert.equal(f.db.prepare('SELECT generated FROM admin_crystal_gold').get().generated,pool-1);
  assert.deepEqual(f.db.prepare('SELECT milestone,currency FROM shared_run_gem_rewards').all(),[{milestone:50,currency:'rubies'}]);
  f.share('1:1700000000000');initializeSharedRunGems(f.db);
  assert.equal(f.db.prepare('SELECT runs FROM shared_run_gem_totals').get().runs,50);
});
