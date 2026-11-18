'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeNsfw, getNsfwCatalog } = require('../server/db/nsfw');

test('classification migration seeds known titles once and preserves later corrections', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY,name);
      INSERT INTO books VALUES(1283,'Night Shift'),(1801,'Different title'),(1,'Ordinary adventure');`);
    initializeNsfw(db);
    assert.deepEqual(db.prepare('SELECT id FROM books WHERE is_nsfw=1').all(),[{id:1283}]);
    db.exec('UPDATE books SET is_nsfw=0 WHERE id=1283');
    initializeNsfw(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM books WHERE is_nsfw=1').get().n,0);
  } finally { db.close(); }
});

test('public labels include all-adult collections while preserving mixed series and private metadata', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE books(id INTEGER PRIMARY KEY,name,is_nsfw,is_public,is_container,parent_book_id,series_id,cover_path);
      CREATE TABLE book_anthology_memberships(book_id,anthology_id);
      INSERT INTO books VALUES
        (1,'Adult',1,1,0,NULL,10,'adult.jpg'),
        (2,'Private',1,0,0,NULL,10,'private.jpg'),
        (3,'Safe',0,1,0,NULL,20,'safe.jpg'),
        (4,'Mixed adult',1,1,0,NULL,20,'mixed.jpg'),
        (5,'Anthology',0,1,1,NULL,30,'anthology.jpg'),
        (6,'Child',1,1,0,5,NULL,'child.jpg'),
        (7,'Mixed anthology',0,1,1,NULL,NULL,'mixed-anthology.jpg');
      INSERT INTO book_anthology_memberships VALUES(1,5),(1,7),(3,7);`);
    const data = getNsfwCatalog(db);
    assert.deepEqual(data.bookIds.sort((a,b)=>a-b),[1,4,5,6]);
    assert.deepEqual(data.seriesIds.sort((a,b)=>a-b),[10,30]);
    assert.ok(!data.coverUrls.includes('/covers/private.jpg'));
    assert.ok(data.coverUrls.includes('/covers/anthology.jpg'));
    assert.ok(!data.coverUrls.includes('/covers/mixed-anthology.jpg'));
  } finally { db.close(); }
});

function client(saved = null) {
  const storage = new Map(saved === null ? [] : [['hide-nsfw-books',saved]]);
  const events = [];
  const checkbox = { checked:false };
  const context = vm.createContext({
    localStorage: {getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value)},
    document: {getElementById:()=>checkbox,dispatchEvent:e=>events.push(e.type)},
    CustomEvent: class { constructor(type) {this.type=type;} },
    fetch: async () => ({ok:true,json:async()=>({bookIds:[22],seriesIds:[7],coverUrls:['/covers/adult.jpg']})}),
  });
  vm.runInContext(readFileSync('public/js/content/nsfw.js','utf8').replaceAll('export ',''),context);
  return {context,storage,events,checkbox};
}

test('visibility defaults on, filters nested public browsing, and can be disabled without mutating data', async () => {
  const {context:c,storage,events,checkbox} = client();
  assert.equal(c.hideNsfwBooks(),true);
  assert.equal(c.isHiddenNsfwCover('/covers/unknown.jpg'),true,'no first-load artwork leak');
  await c.loadNsfwCatalog();
  assert.equal(c.isHiddenNsfwBook(22),true);
  assert.equal(c.isHiddenNsfwBook({isSeries:true,entityId:7}),true);
  assert.equal(c.isHiddenNsfwCover('/covers/safe.jpg'),false);
  const books=[{id:1,children:[{id:22},{id:23}],childIds:[22,23],childNames:['Adult','Safe']}];
  const visible=c.filterNsfwPublicBooks(books);
  assert.equal(visible[0].children.length,1);
  assert.deepEqual(Array.from(visible[0].childNames),['Safe']);
  assert.equal(books[0].children.length,2,'owned/source caches remain untouched');
  c.applyNsfwPreference('0');
  assert.equal(c.isHiddenNsfwBook(22),false);
  assert.equal(c.isHiddenNsfwCover('/covers/adult.jpg'),false);
  assert.equal(storage.get('hide-nsfw-books'),'0');
  assert.equal(checkbox.checked,false);
  assert.deepEqual(events,['nsfw-preference-changed']);
  c.applyNsfwPreference('1');
  assert.equal(c.isHiddenNsfwBook(22),true);
});

test('an explicitly saved off preference survives reloading', () => {
  assert.equal(client('0').context.hideNsfwBooks(),false);
});

test('switching NSFW visibility reuses cached catalog data without network requests', async () => {
  const {context:c} = client();
  await c.loadNsfwCatalog();
  let requests=0,redraws=0;
  Object.assign(c,{
    coversState:{},naturalCompare:(a,b)=>String(a).localeCompare(String(b)),
    _buildSeriesCoverEntries:()=>[],_refreshCoversDisplay:()=>redraws++,
    _resetLandingCoverQueue(){},publicFetch:()=>{requests++;throw Error('Unnecessary network request');},
  });
  const source=readFileSync('public/js/covers/data.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
  vm.runInContext(source,c);
  vm.runInContext(`_catalogSource={covers:[{id:22,coverUrl:'/covers/adult.jpg'},{id:23,coverUrl:'/covers/safe.jpg'}],
    books:[{id:22,name:'Adult'},{id:23,name:'Safe'}],series:[]}`,c);
  assert.equal(c.refreshNsfwCatalogDisplay(),true);
  assert.deepEqual(Array.from(c.coversState._allBooks,b=>b.id),[23]);
  c.applyNsfwPreference('0');c.refreshNsfwCatalogDisplay();
  assert.deepEqual(Array.from(c.coversState._allBooks,b=>b.id),[22,23]);
  c.applyNsfwPreference('1');c.refreshNsfwCatalogDisplay();
  assert.deepEqual(Array.from(c.coversState._allBooks,b=>b.id),[23]);
  assert.equal(requests,0);assert.equal(redraws,3);
});

test('feed artwork filtering keeps activity while omitting NSFW cover URLs', async () => {
  const {context:c} = client();
  await c.loadNsfwCatalog();
  Object.assign(c,{escapeHtml:String,t:String,createDayRenderer:()=>items=>items.map(e=>e.bookId).join(','),formatAnnBody:String});
  const source=readFileSync('public/js/feed/render.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
  vm.runInContext(source,c);
  const entries=[{bookId:22,bookIsPublic:true,coverUrl:'/covers/adult.jpg',completedAt:1700000000000},
    {bookId:23,bookIsPublic:true,coverUrl:'/covers/safe.jpg',completedAt:1700000000000}];
  const result=c.renderFeedContents(entries,null,'');
  assert.deepEqual(Array.from(result.dayCoverLists[0]),['/covers/safe.jpg']);
  assert.match(result.html,/22,23/,'activity text is retained');
  c.applyNsfwPreference('0');
  assert.deepEqual(Array.from(c.renderFeedContents(entries,null,'').dayCoverLists[0]),['/covers/adult.jpg','/covers/safe.jpg']);
});

test('classification endpoint rejects non-admins and invalid values before writing', async () => {
  let admin=false, writes=0, pushes=0, body={isNsfw:true};
  const dependencies={
    '../db': {isUserAdmin:()=>admin},
    '../db/connection': {db:{prepare:()=>({run:()=>{writes++;return{changes:1};}})}},
    '../db/nsfw': {getNsfwCatalog(){}},
    '../request-helpers': {authenticate:async()=>1,readBody:async()=>body,send:(res,status,data)=>({status,data})},
    '../sse': {publicCatalogPush:()=>pushes++,feedPush(){}},
  };
  const c=vm.createContext({module:{exports:{}},require:name=>dependencies[name]});
  vm.runInContext(readFileSync('server/routes/nsfw.js','utf8'),c);
  const update=c.module.exports.handleSetBookNsfw;
  assert.equal((await update({method:'PATCH'},{},22)).status,403);
  assert.equal(writes,0);
  admin=true;body={isNsfw:'false'};
  assert.equal((await update({method:'PATCH'},{},22)).status,400);
  assert.equal(writes,0);
  body={isNsfw:false};
  assert.equal((await update({method:'PATCH'},{},22)).status,200);
  assert.equal(writes,1);assert.equal(pushes,1);
});
