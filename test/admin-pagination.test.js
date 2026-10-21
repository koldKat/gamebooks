'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { getUserBooks } = require('../server/db/admin-user-books');
function fixture(t) {
  const raw = new Database(':memory:'); t.after(() => raw.close());
  raw.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY,name TEXT,total_sections INTEGER,created_by INTEGER);
    CREATE TABLE user_books(user_id INTEGER,book_id INTEGER,created_at INTEGER,updated_at INTEGER,state_data TEXT,PRIMARY KEY(user_id,book_id));
    CREATE TABLE xp_events(user_id INTEGER,event TEXT);
    INSERT INTO xp_events VALUES(1,'win_run'),(1,'win_run'),(1,'death_run'),(1,'battle_run'),(1,'heartbeat'),(2,'win_run');`);
  raw.transaction(() => {
    for(let id=1;id<=163;id++) {
      raw.prepare('INSERT INTO books VALUES(?,?,?,?)').run(id,`Book ${id}`,id,id%2?1:2);
      const state = { graph: { 1: { choices: [2,3,0,-1] },2:{discovered:true} },playthroughs:[{startedAt:1,lastActionAt:id,result:id%2?'success':'death'},{startedAt:null,result:'battle'}] };
      raw.prepare('INSERT INTO user_books VALUES(?,?,?,?,?)').run(1,id,id,id,id===163?'broken':JSON.stringify(state));
    }
    raw.prepare('INSERT INTO user_books VALUES(2,1,1,1,?)').run(JSON.stringify({playthroughs:[{startedAt:1,result:'battle'}]}));
  })();
  let states=0;
  const db = { prepare(sql) {
    const statement=raw.prepare(sql);
    return { all(...args) { const rows=statement.all(...args); if (/SELECT book_id,state_data/.test(sql)) states+=rows.length; return rows; } };
  } };
  return { raw, get:options=>getUserBooks(db,1,options), states:()=>states };
}
test('large account opens load only 50 saved states, preserve overall ledger totals and never write',t=>{
  const f=fixture(t), before=f.raw.prepare('SELECT total_changes() n').get().n;
  const result=f.get({page:0});
  assert.equal(f.states(),50);assert.equal(result.books.length,50);assert.equal(result.books[0].id,163);
  assert.equal(result.bookCount,163);assert.equal(result.createdCount,82);
  assert.deepEqual(result.totals,{runs:4,wins:2,deaths:1,battles:1});
  assert.deepEqual(result.pagination,{page:0,pageSize:50,total:163});
  assert.equal(result.books[0].mapped,0);assert.equal(result.books[1].mapped,1);assert.equal(result.books[1].discovered,3);
  assert.equal(result.books[1].playthroughs,1);assert.equal(result.books[1].battles,0);
  assert.ok(result.books.every(b=>!Object.hasOwn(b,'state_data')));
  assert.equal(f.raw.prepare('SELECT total_changes() n').get().n,before);
});
test('server pagination, natural name sorting, substring search, empty results and bounds compose',t=>{
  const f=fixture(t);
  let result=f.get({page:1,pageSize:10,sort:'name',dir:'asc'});
  assert.equal(result.books[0].name,'Book 11'); assert.equal(result.books[9].name,'Book 20');
  result=f.get({page:999,pageSize:10,sort:'name',dir:'asc'});
  assert.equal(result.pagination.page,16);assert.deepEqual(result.books.map(b=>b.id),[161,162,163]);
  result=f.get({page:8,query:'BOOK 16',sort:'name',dir:'asc'});
  assert.deepEqual(result.books.map(b=>b.id),[16,160,161,162,163]);assert.equal(result.bookCount,163);assert.equal(result.pagination.page,0);
  result=f.get({query:"%' OR 1=1 --",page:-4,pageSize:99999,sort:'DROP TABLE books'});
  assert.deepEqual(result.books,[]);assert.equal(result.pagination.pageSize,100);assert.equal(result.pagination.total,0);
  assert.equal(f.raw.prepare('SELECT COUNT(*) n FROM books').get().n,163);
});
test('explicit gameplay sorts remain global across pages and agree with legacy complete summaries',t=>{
  const f=fixture(t), all=f.get();
  assert.equal(all.books.length,163);assert.equal(all.books.find(b=>b.id===162).last_run_at,162);
  for(const sort of ['mapped','discovered','playthroughs','wins','deaths','battles','last_run_at']) {
    const expected=[...all.books].sort((a,b)=>a[sort]==null?1:b[sort]==null?-1:b[sort]-a[sort]||a.id-b.id).slice(10,20);
    assert.deepEqual(f.get({page:1,pageSize:10,sort}).books.map(b=>b.id),expected.map(b=>b.id),sort);
  }
});

test('anthology counts include distinct direct and secondary children without a join cross product',t=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const db=new Database(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE users(id,username);CREATE TABLE books(id,name,description,is_public,created_at,created_by,is_container,parent_book_id);
    CREATE TABLE book_anthology_memberships(anthology_id,book_id);
    INSERT INTO users VALUES(1,'Creator');
    INSERT INTO books VALUES(1,'Anthology',NULL,1,1,1,1,NULL),(2,'Empty',NULL,0,1,1,1,NULL),
      (3,'First',NULL,1,1,1,0,1),(4,'Second',NULL,1,1,1,0,1),(5,'Shared',NULL,1,1,1,0,NULL);
    INSERT INTO book_anthology_memberships VALUES(1,3),(1,5);`);
  const source=fs.readFileSync('server/db/admin.js','utf8');
  const get=vm.runInNewContext(source.slice(source.indexOf('function getAllAnthologiesAdmin('),source.indexOf('function adminGetUser('))+'\ngetAllAnthologiesAdmin',{db,_naturalCompareByName:(a,b)=>a.name.localeCompare(b.name)});
  assert.deepEqual(Array.from(get(),row=>[row.name,row.child_count]),[['Anthology',3],['Empty',0]]);
});

test('book metadata editing never reads saved gameplay and retains private anthology fields',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),calls=[];
  const book={id:10,name:'Private',is_public:0,is_container:1,series_id:9,parent_book_id:null,discoverable_sections:77,pdf_path:'book.pdf',epub_path:null};
  const db={prepare(sql){calls.push(sql);return{get:()=>book};}};
  const source=fs.readFileSync('server/db/admin.js','utf8');
  const get=vm.runInNewContext(source.slice(source.indexOf('function adminGetBookStats('),source.indexOf('function adminGetStats('))+'\nadminGetBookStats',{db,_getPdfSize:()=>123,_getEpubSize:()=>0});
  const actual=get(10,{metadataOnly:true});
  assert.equal(calls.length,1);assert.ok(!calls[0].includes('state_data'));
  for(const[key,value]of Object.entries(book))assert.equal(actual[key],value,key);
  assert.equal(actual.pdf_size,123);
});

test('feedback pagination bounds loaded messages and preserves the legacy inbox response and unread data',t=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const db=new Database(':memory:');t.after(()=>db.close());
  db.exec(`CREATE TABLE feedback(id INTEGER PRIMARY KEY,user_id,username,email,message,created_at,deleted_by_admin DEFAULT 0,admin_unread DEFAULT 1);
    CREATE TABLE feedback_messages(id INTEGER PRIMARY KEY,thread_id,sender,body,created_at);
    CREATE TABLE attachments(id,filename,original_name,mime_type,size,kind,linked_id,created_at,uploaded_by);`);
  db.transaction(()=>{for(let id=1;id<=52;id++){
    db.prepare('INSERT INTO feedback(id,user_id,username,created_at) VALUES(?,?,?,?)').run(id,1,'Reader '+id,id);
    db.prepare('INSERT INTO feedback_messages VALUES(?,?,?,?,?)').run(id,id,'user','Message '+id,id);
  }})();
  const context={module:{exports:{}},require(name){if(name==='./connection')return{db};throw Error(name);}};
  vm.runInNewContext(fs.readFileSync('server/db/feedback.js','utf8'),context);
  const get=context.module.exports.getAllThreads;
  const before=db.prepare('SELECT total_changes() n').get().n;
  const first=get({page:0});assert.equal(first.threads.length,20);assert.equal(first.threads[0].id,52);assert.equal(first.unread,52);
  const last=get({page:999});assert.equal(last.pagination.page,2);assert.equal(last.threads.length,12);
  assert.ok(last.threads.every(thread=>thread.messages.length===1));
  const search=get({query:'message 1',page:9});assert.equal(search.pagination.total,11);assert.equal(search.pagination.page,0);
  assert.equal(get({query:"%' OR 1=1 --"}).threads.length,0);
  const legacy=get();assert.equal(legacy.length,52);assert.equal(legacy[51].messages[0].body,'Message 1');
  assert.equal(db.prepare('SELECT total_changes() n').get().n,before);
});
