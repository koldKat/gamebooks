'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const {initializeHeartbeatCoins,advanceHeartbeatCoins}=require('../server/db/heartbeat-coins');
function fixture(t){const db=new Database(':memory:');t.after(()=>db.close());db.pragma('foreign_keys=ON');db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,bonus_coins INTEGER DEFAULT 0);CREATE TABLE coin_events(user_id INTEGER,event TEXT,ref TEXT,amount INTEGER,UNIQUE(user_id,event,ref));INSERT INTO users(id) VALUES(1),(2);`);initializeHeartbeatCoins(db);return db;}
test('new heartbeat wallets start empty, count once per minute and roll bronze/silver/gold exactly',t=>{
 const db=fixture(t);assert.equal(db.prepare('SELECT COUNT(*) n FROM user_heartbeat_coins').get().n,0);
 assert(advanceHeartbeatCoins(db,1,1));assert.equal(advanceHeartbeatCoins(db,1,1),false);assert.equal(advanceHeartbeatCoins(db,1,0),false);
 for(let minute=2;minute<=100;minute++)advanceHeartbeatCoins(db,1,minute);
 assert.equal(db.prepare('SELECT heartbeat_count n FROM user_heartbeat_coins WHERE user_id=1').get().n,100);
 db.exec('UPDATE user_heartbeat_coins SET heartbeat_count=9999');assert(advanceHeartbeatCoins(db,1,101));
 assert.equal(db.prepare('SELECT heartbeat_count%100 bronze,(heartbeat_count/100)%100 silver FROM user_heartbeat_coins').get().bronze,0);
 assert.equal(db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins,1);
 assert.equal(advanceHeartbeatCoins(db,1,101),false);initializeHeartbeatCoins(db);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM coin_events').get().n,1);
 assert.equal(db.prepare('SELECT bonus_coins FROM users WHERE id=2').get().bonus_coins,0);
 advanceHeartbeatCoins(db,1,102);assert.equal(db.prepare('SELECT heartbeat_count%100 bronze FROM user_heartbeat_coins').get().bronze,1);
});
test('failed gold conversion rolls back the heartbeat and all currency changes',t=>{
 const db=fixture(t);db.exec('INSERT INTO user_heartbeat_coins VALUES(1,9999,1)');db.exec("CREATE TRIGGER fail_coin BEFORE INSERT ON coin_events BEGIN SELECT RAISE(ABORT,'test failure');END");
 assert.throws(()=>advanceHeartbeatCoins(db,1,2),/test failure/);assert.equal(db.prepare('SELECT heartbeat_count n FROM user_heartbeat_coins').get().n,9999);assert.equal(db.prepare('SELECT bonus_coins FROM users WHERE id=1').get().bonus_coins,0);
});
test('heartbeat coins still accrue at the XP level cap, deduplicate tabs and reject impersonation',t=>{
 const db=fixture(t),fs=require('fs'),vm=require('vm');let impersonating=false;
 for(const column of ['xp','bonus_heartbeat_xp','heartbeat_carry','pending_bonus_gc','bonus_gc_chance_purchased'])db.exec('ALTER TABLE users ADD COLUMN '+column+' INTEGER DEFAULT 0');
 db.exec('UPDATE users SET xp=55000');const code=fs.readFileSync(require.resolve('../server/db/xp'),'utf8');
 const context=vm.createContext({db,advanceHeartbeatCoins,getXpAmount:()=>1,isImpersonatingContext:()=>impersonating,_liveUserCount:()=>1,computeLevel:()=>10,xpForLevel:()=>66000,_rollBonusGc(){},awardXp:()=>false,Date:{now:()=>60000000}});
 vm.runInContext(code.slice(code.indexOf('function awardIdleHeartbeatXp('),code.indexOf('function getUserXpInfo(')),context);
 assert.equal(context.awardIdleHeartbeatXp(1).heartbeatCoinsAwarded,true);assert.equal(context.awardIdleHeartbeatXp(1).heartbeatCoinsAwarded,false);
 impersonating=true;assert.equal(context.awardIdleHeartbeatXp(2).heartbeatCoinsAwarded,false);assert.equal(db.prepare('SELECT COUNT(*) n FROM user_heartbeat_coins WHERE user_id=2').get().n,0);
});
