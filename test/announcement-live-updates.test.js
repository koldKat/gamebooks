'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function fixture(t, isDraft=0, pinned=0) {
  const db = new Database(':memory:');
  t.after(()=>db.close());
  db.exec(`CREATE TABLE announcements (id INTEGER PRIMARY KEY, title TEXT, body TEXT,
    is_draft INTEGER, pinned INTEGER, published_at INTEGER, updated_at INTEGER);`);
  db.prepare('INSERT INTO announcements VALUES (1, ?, ?, ?, ?, ?, NULL)')
    .run('Original title','Original body',isDraft,pinned,isDraft?null:1234);
  const schema=fs.readFileSync(require.resolve('../server/db'),'utf8');
  db.exec(schema.match(/CREATE TRIGGER IF NOT EXISTS announcement_edited_at[\s\S]*?END;/)[0]);
  const admin = fs.readFileSync(require.resolve('../server/db/admin'),'utf8');
  const dbContext = vm.createContext({db,Date:{now:()=>1800000}});
  vm.runInContext(admin.slice(admin.indexOf('function updateAnnouncement('),admin.indexOf('function publishAnnouncement(')),dbContext);
  const events=[];
  const context = vm.createContext({module:{exports:{}},require:name=>({
    '../db':{updateAnnouncement:dbContext.updateAnnouncement},
    '../request-helpers':{readBody:async req=>req.body,requireLocalhost:req=>req.local!==false,
      send:(res,status,body)=>Object.assign(res,{status,body})},
    '../sse':{feedPush:event=>events.push(JSON.parse(JSON.stringify(event)))},
  })[name]});
  vm.runInContext(fs.readFileSync(require.resolve('../server/routes/announcements'),'utf8'),context);
  return {db,events,update:async(body={title:'New title',body:'New body'},id=1,local=true)=>{
    const res={}; await context.module.exports.handleAdminUpdateAnnouncement({body,local},res,id); return res;
  }};
}

for (const pinned of [0,1]) test(`editing a published ${pinned?'pinned':'feed'} announcement broadcasts its updated contents`,async t=>{
  const f=fixture(t,0,pinned),result=await f.update();
  assert.equal(result.status,200);
  assert.equal(result.body.title,'New title'); assert.equal(result.body.body,'New body');
  assert.equal(result.body.published_at,1234);
  assert.equal(result.body.updated_at,1800000);
  assert.deepEqual(f.events,[{type:'feed_changed',entity:'announcement',action:'update'}]);
  assert.equal(f.db.prepare('SELECT body FROM announcements WHERE id=1').get().body,'New body');
});

test('draft edits stay private and do not broadcast',async t=>{
  const f=fixture(t,1),result=await f.update();
  assert.equal(result.status,200); assert.equal(result.body.is_draft,1);
  assert.equal(result.body.updated_at,null);
  assert.deepEqual(f.events,[]);
});

test('unchanged saves do not bump a post, and separate edits remain ordered within the same millisecond',async t=>{
  const f=fixture(t);const first=await f.update();
  assert.equal((await f.update()).body.updated_at,first.body.updated_at);
  const second=await f.update({title:'Another edit',body:'A changed body'});
  assert.equal(second.body.updated_at,first.body.updated_at+1);
  assert.equal(second.body.published_at,1234);
});

test('release-tool edits receive an ordering time without changing the original publication day',t=>{
  const f=fixture(t);
  f.db.prepare('UPDATE announcements SET body=? WHERE id=1').run('Release update');
  const first=f.db.prepare('SELECT * FROM announcements WHERE id=1').get();
  assert.equal(first.published_at,1234);assert.ok(first.updated_at>first.published_at*1000);
  f.db.prepare('UPDATE announcements SET body=? WHERE id=1').run('Another release update');
  assert.ok(f.db.prepare('SELECT updated_at FROM announcements WHERE id=1').get().updated_at>first.updated_at);
  const draft=fixture(t,1);draft.db.prepare('UPDATE announcements SET body=? WHERE id=1').run('Private draft');
  assert.equal(draft.db.prepare('SELECT updated_at FROM announcements WHERE id=1').get().updated_at,null);
});

test('rejected or missing edits do not broadcast or change an announcement',async t=>{
  const f=fixture(t);
  assert.equal((await f.update({title:' ',body:'Text'})).status,400);
  assert.equal((await f.update(undefined,99)).status,404);
  assert.equal((await f.update(undefined,1,false)).status,undefined);
  assert.deepEqual(f.events,[]);
  assert.equal(f.db.prepare('SELECT title FROM announcements WHERE id=1').get().title,'Original title');
});
