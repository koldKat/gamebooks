'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeSquireRole, createSquireSetter } = require('../server/db/squires');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,xp INTEGER,is_admin INTEGER,
    is_author INTEGER,is_contributor INTEGER,is_moderator INTEGER,pdf_access INTEGER);
    INSERT INTO users VALUES(1,'Player',1234,0,1,1,0,1);
    CREATE TABLE notifications(user_id INTEGER,payload TEXT);`);
  return db;
}

test('Squire migration defaults off, preserves every existing field and is idempotent',t=>{
  const db=fixture(t),before=db.prepare('SELECT * FROM users').get();
  initializeSquireRole(db);initializeSquireRole(db);
  const after=db.prepare('SELECT * FROM users').get();
  assert.equal(after.is_squire,0);delete after.is_squire;
  assert.deepEqual(after,before);
});

test('assignment changes only Squire, notifies once, revokes independently and validates booleans',t=>{
  const db=fixture(t);initializeSquireRole(db);
  const before=db.prepare('SELECT * FROM users').get();
  const set=createSquireSetter(db,(id,payload)=>db.prepare('INSERT INTO notifications VALUES(?,?)').run(id,JSON.stringify(payload)));
  assert.deepEqual(set(1,true),{found:true,changed:true});
  assert.deepEqual(set(1,true),{found:true,changed:false});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE is_squire=1').get().n,1);
  const assigned=db.prepare('SELECT * FROM users').get();
  assert.deepEqual(assigned,{...before,is_squire:1});
  assert.deepEqual(JSON.parse(db.prepare('SELECT payload FROM notifications').get().payload),{role:'squire',label:'Squire'});
  assert.deepEqual(set(1,false),{found:true,changed:true});
  assert.deepEqual(db.prepare('SELECT * FROM users').get(),before);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM notifications').get().n,1);
  assert.deepEqual(set(999,true),{found:false,changed:false});
  for(const value of [1,0,'true',null,undefined])assert.throws(()=>set(1,value),/boolean/);
});

test('failed assignment notification rolls back the role without changing other account data',t=>{
  const db=fixture(t);initializeSquireRole(db);
  const before=db.prepare('SELECT * FROM users').get();
  const set=createSquireSetter(db,()=>{throw Error('notification failed');});
  assert.throws(()=>set(1,true),/notification failed/);
  assert.deepEqual(db.prepare('SELECT * FROM users').get(),before);
});

test('only the admin interface assigns Squire; strict validation precedes writes and live refreshes',async()=>{
  let allowed=false,body={isSquire:true},status;const writes=[],badges=[],feed=[];
  const context=vm.createContext({module:{exports:{}},__dirname:require('node:path').dirname(require.resolve('../server/routes/admin')),require(name){
    if(name==='path')return require('node:path');
    if(name==='../directory-size')return{createDirectorySizeReader:()=>()=>0};
    if(name==='../backup')return{BACKUP_DIR:'/tmp/backups'};
    if(name==='../db')return{setSquire:(id,flag)=>{writes.push([id,flag]);return id===7;}};
    if(name==='../request-helpers')return{requireLocalhost:()=>allowed,readBody:async()=>body,send:(_res,code)=>{status=code;}};
    if(name==='../sse')return{userBadgePush:id=>badges.push(id),feedPush:payload=>feed.push(payload)};
    return {};
  }});
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/admin'),'utf8'),context);
  const run=id=>context.module.exports.handleAdminSetSquire({}, {}, id);
  await run(7);assert.equal(writes.length,0);
  allowed=true;body={isSquire:'false'};await run(7);assert.equal(status,400);assert.equal(writes.length,0);
  for(const flag of [true,false]){
    body={isSquire:flag};await run(7);assert.equal(status,200);assert.deepEqual(writes.at(-1),[7,flag]);
    assert.equal(badges.at(-1),7);assert.equal(feed.at(-1).entity,'user');
  }
  await run(8);assert.equal(status,404);assert.equal(badges.length,2);assert.equal(feed.length,2);
});

test('public profiles expose Squire separately from privileged roles and keep private profiles hidden',t=>{
  const db=fixture(t);initializeSquireRole(db);
  db.exec(`ALTER TABLE users ADD COLUMN public_profile INTEGER DEFAULT 1;
    ALTER TABLE users ADD COLUMN avatar_path TEXT;
    ALTER TABLE users ADD COLUMN display_name TEXT;
    UPDATE users SET is_squire=1;`);
  const deps={
    './connection':{db:{prepare:sql=>sql.includes('FROM users WHERE username')?db.prepare(sql):{all:()=>[]}}},
    './xp':{getUserXpInfo:()=>({level:1,title:'Title'})},'./content':{},'./books':{},
  };
  const context=vm.createContext({module:{exports:{}},require:name=>deps[name]});
  vm.runInContext(fs.readFileSync(require.resolve('../server/db/feed'),'utf8'),context);
  const profile=context.module.exports.getPublicProfile('Player');
  assert.equal(profile.isSquire,true);assert.equal(profile.isModerator,false);
  assert.equal(profile.isAuthor,true);assert.equal(profile.isContributor,true);
  db.exec('UPDATE users SET public_profile=0');
  assert.equal(context.module.exports.getPublicProfile('Player'),null);
});
