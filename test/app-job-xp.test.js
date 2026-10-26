'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { getJobTitle } = require('../server/db/job-xp');

test('app job progression mirrors app XP thresholds and includes players without job records', t => {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,xp INTEGER,xp_from_boost INTEGER DEFAULT 0,
    xp_boost_pct INTEGER DEFAULT 0,bonus_heartbeat_xp INTEGER DEFAULT 0, bonus_diamond_dig_purchased INTEGER DEFAULT 0);
    CREATE TABLE diamond_market(id INTEGER PRIMARY KEY,dig_events INTEGER);
    INSERT INTO diamond_market VALUES(1,9999);
    CREATE TABLE user_job_xp(user_id INTEGER PRIMARY KEY,xp INTEGER);
    INSERT INTO users(id,xp) VALUES(1,3000),(2,3000),(3,3000);
    INSERT INTO user_job_xp VALUES(1,1000),(2,2000);`);
  const source = fs.readFileSync('server/db/admin.js','utf8');
  let queries = 0;
  const context = vm.createContext({ db: { prepare(sql) { queries++; return db.prepare(sql); } }, getJobTitle, getTitleForLevel: n => 'Level '+n });
  vm.runInContext(source.slice(source.indexOf('function appJobProgression('),source.indexOf('function adminGetUsers(')),context);
  const before = db.prepare('SELECT total_changes() n').get().n;
  const summary = context.getAppXpSummary();
  assert.equal(queries,1); assert.equal(summary.users,3);
  assert.equal(summary.xp,9000); assert.equal(summary.level,2);
  assert.equal(summary.jobXp,3000); assert.equal(summary.jobLevel,1);
  assert.equal(summary.jobRubyMiningEvents,9999);
  assert.equal(summary.jobRubyMiningInterval,10000);
  assert.equal(summary.jobAverageEventsPerRuby,1000000/(1000+2/3));
  assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
  db.prepare('UPDATE users SET bonus_diamond_dig_purchased=99 WHERE id=1').run();
  assert.equal(context.getAppXpSummary().jobAverageEventsPerRuby,1000000/1001);
  assert.equal(summary.jobTitle,'Digger'); assert.equal(summary.jobLevelXp,3000); assert.equal(summary.jobNextLevelXp,9000);
  for (const users of [1,3,89]) for (const level of [0,1,2,8,20]) {
    const threshold = users*1000*level*(level+1)/2;
    assert.equal(context.appJobProgression(threshold,users).jobLevel,level);
    if (threshold) assert.equal(context.appJobProgression(threshold-1,users).jobLevel,level-1);
  }
  db.exec('DELETE FROM users; DELETE FROM user_job_xp');
  const empty = context.getAppXpSummary(); assert.equal(empty.jobLevel,0); assert.equal(empty.jobXp,0);
  assert.equal(empty.jobNextLevelXp,1);
});

test('app SSE sends only aggregate refreshes to the restricted non-admin viewer', () => {
  const source = fs.readFileSync('server/sse.js','utf8'); let onReward;
  const context = vm.createContext({ db: { setAppXpHook(fn) { onReward=fn; }, getAdminUsername:()=> 'admin',
    getUserByUsername:()=>({id:1}),getUserById:()=>({username:'Private player'}) }, writeEvent:(res,data)=>res.push(data) });
  vm.runInContext(source.slice(source.indexOf('const _appXpClients'),source.indexOf('function userBadgeRegister')),context);
  const admin=[], viewer=[]; context.appXpRegister(admin); context.appXpRegister(viewer,{summaryOnly:true});
  onReward({userId:2,xpDelta:5});
  assert.match(admin[0],/Private player/);assert.ok(!viewer[0].includes('Private player'));
  assert.match(viewer[0],/summaryChanged/);
  onReward({userId:1,xpDelta:5});assert.match(admin[1],/summaryChanged/);
  onReward({userId:2,jobXpDelta:1});assert.match(admin[2],/summaryChanged/);
  onReward({userId:2,jobXpDelta:0});assert.match(admin[3],/summaryChanged/);
  context.appXpUnregister(viewer);onReward({userId:2,xpDelta:1});assert.equal(viewer.length,4);
});

test('the app stream uses the existing narrow app XP permission and redacts non-admin events', async () => {
  const source=fs.readFileSync('server/routes/books.js','utf8');
  for (const userId of [1,17,99]) {
    let status, registered;
    const context=vm.createContext({ URL,tokenFromReq:()=> 'token',db:{getSession:()=>({user_id:userId}),
      canSeeAppXp:id=>id===1||id===17,isUserAdmin:id=>id===1},send:(res,code)=>{status=code;},
      appXpRegister:(res,options)=>{registered=options;},maintainStream(){},SSE_PING_MS:1 });
    vm.runInContext(source.slice(source.indexOf('async function handleGetAppXpStream('),source.indexOf('async function handleCreateBook(')),context);
    await context.handleGetAppXpStream({url:'/api/app-xp/stream'}, {writeHead:code=>{status=code;},write(){}});
    assert.equal(status,userId===99?403:200);
    if(userId!==99)assert.equal(registered.summaryOnly,userId===17);
  }
});
