'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Database=require('better-sqlite3');

test('player list and detail count only unexpired player logins, preserving all sessions',t=>{
  const db=new Database(':memory:');t.after(()=>db.close());
  const source=fs.readFileSync('server/db/admin.js','utf8');
  const detail=source.slice(source.indexOf('function adminGetUser('),source.indexOf('function adminGetUserBooks('));
  const list=source.slice(source.indexOf('function adminGetUsers('),source.indexOf('function updateUserGeo('));
  const columns=[...new Set([...(detail+list).matchAll(/u\.([a-z_]+)/g)].map(match=>match[1]))];
  db.exec(`CREATE TABLE users(${columns.map(name=>`${name} ${name==='id'?'INTEGER PRIMARY KEY':'TEXT'}`).join(',')});
    CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires_at INTEGER,is_impersonation INTEGER);
    CREATE TABLE books(id INTEGER,name TEXT,parent_book_id INTEGER);
    CREATE TABLE user_books(user_id INTEGER,book_id INTEGER,updated_at INTEGER,state_data TEXT);
    CREATE TABLE user_heartbeat_coins(user_id INTEGER,heartbeat_count INTEGER);
    CREATE TABLE user_diamonds(user_id INTEGER,diamonds_earned INTEGER,diamonds_bought INTEGER,diamonds_spent INTEGER);
    CREATE TABLE user_rubies(user_id INTEGER,rubies_earned INTEGER,rubies_bought INTEGER,rubies_spent INTEGER);
    CREATE TABLE xp_events(user_id INTEGER,event TEXT);
    CREATE TABLE ruby_rewards(user_id INTEGER,book_id INTEGER,kind TEXT,created_at INTEGER);
    CREATE TABLE notifications(id INTEGER,user_id INTEGER,type TEXT,payload TEXT,created_at INTEGER);
    CREATE TABLE ruby_exchanges(user_id INTEGER,rubies INTEGER,rate INTEGER,gold_coins INTEGER,direction TEXT,created_at INTEGER);
    CREATE TABLE diamond_exchanges(user_id INTEGER,diamonds INTEGER,rate INTEGER,gold_coins INTEGER,direction TEXT,created_at INTEGER);
    INSERT INTO users(id,username)VALUES(1,'Player'),(2,'Impersonated'),(3,'NoSessions');`);
  const now=Math.floor(Date.now()/1000),insert=db.prepare('INSERT INTO sessions VALUES(?,?,?,?)');
  for(const [token,user,expires,imp]of [['valid',1,now+3600,0],['device-two',1,now+3600,0],
    ['old',1,now-1,0],['admin-preview',1,now+3600,1],['other-preview',2,now+3600,1],['other-old',2,now-1,0]])insert.run(token,user,expires,imp);
  const scope={db,getUserXpInfo:()=>({}),rubyInfoForUser:()=>({}),getShopRefundRows:()=>[],getShopItems:()=>[],computeLevel:()=>0,
    getAllUsersXpInfo:()=>new Map([1,2,3].map(id=>[id,{bonusGcClaimed:0}]))};
  const get=vm.runInNewContext(detail+'\nadminGetUser',scope),all=vm.runInNewContext(list+'\nadminGetUsers',scope);
  const before=db.prepare('SELECT * FROM sessions ORDER BY token').all();
  assert.equal(get(1).session_count,2);assert.equal(get(2).session_count,0);assert.equal(get(3).session_count,0);
  assert.deepEqual(Array.from(all(),u=>[u.id,u.session_count]).sort(),[[1,2],[2,0],[3,0]]);
  assert.deepEqual(db.prepare('SELECT * FROM sessions ORDER BY token').all(),before);
  const clearSource=source.slice(source.indexOf('function adminClearUserSessions('),source.indexOf('function adminGetBooks('));
  const clear=vm.runInNewContext(clearSource+'\nadminClearUserSessions',{db});
  assert.equal(clear(1),2,'clear response reports only visible player sessions');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=1').get().n,0,'clear still revokes every token for security');
  assert.equal(clear(2),0,'impersonation tokens are not exposed by the clear response');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=2').get().n,0);
});
