'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { initializeNsfw, getNsfwCatalog, markNsfwFeedEntries } = require('../server/db/nsfw');

test('collapsed feed headings are NSFW only when every grouped item is NSFW', () => {
  const tag = flagged => flagged ? '<span class="feed-nsfw-tag">NSFW</span>' : '';
  const renderEntry = e => ({ html: `${e.type}:${e.bookId || ''}${tag(e.isNsfw)}`, extraClass: 'feed-entry--created' });
  const context = vm.createContext({
    _hooks: {}, escapeHtml: String, publicName: String, t: String, nsfwTag: tag,
    renderEntry, _makeEntryHtml: e => `<div>${renderEntry(e).html}</div>`,
  });
  vm.runInContext(readFileSync('public/js/feed/groups.js', 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function'), context);
  for (const type of ['book_created', 'run_started']) {
    for (const adultCount of [0, 1, 6]) {
      const items = Array.from({ length: 6 }, (_, i) => ({
        type, username: 'reader', bookId: i + 1, isNsfw: i < adultCount,
      }));
      const html = context.createDayRenderer()(items, 'today');
      const heading = html.slice(0, html.indexOf('</button>'));
      assert.equal(heading.includes('feed-nsfw-tag'), adultCount === 6, `${type}: ${adultCount}/6`);
      assert.equal((html.match(/feed-nsfw-tag/g) || []).length, adultCount + (adultCount === 6 ? 1 : 0));
    }
  }
  for (const type of ['series_created', 'book_created']) {
    const container = { type, username: 'reader', bookId: 10, seriesId: 20, isContainer: type === 'book_created' };
    const children = [true, false].map((isNsfw, i) => ({
      type: 'book_created', username: 'reader', bookId: i + 1,
      seriesId: type === 'series_created' ? 20 : null,
      parentBookId: type === 'book_created' ? 10 : null, isNsfw,
    }));
    for (const entries of [children, [container, ...children]]) {
      const html = context.createDayRenderer()(entries, 'today');
      assert.ok(!html.slice(0, html.indexOf('</button>')).includes('feed-nsfw-tag'));
      assert.equal((html.match(/feed-nsfw-tag/g) || []).length, 1);
    }
  }
});

test('classification migration seeds known titles once and preserves later corrections', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE series(id INTEGER PRIMARY KEY,is_public INTEGER DEFAULT 0);
      CREATE TABLE books(id INTEGER PRIMARY KEY,name);
      INSERT INTO books VALUES(1283,'Night Shift'),(1801,'Different title'),(1,'Ordinary adventure');`);
    initializeNsfw(db);
    assert.equal(db.prepare('PRAGMA table_info(series)').all().find(c => c.name === 'is_nsfw').dflt_value, '0');
    db.exec('INSERT INTO series(id,is_nsfw) VALUES(1,1)');
    assert.deepEqual(db.prepare('SELECT id FROM books WHERE is_nsfw=1').all(),[{id:1283}]);
    db.exec('UPDATE books SET is_nsfw=0 WHERE id=1283');
    initializeNsfw(db);
    assert.equal(db.prepare('SELECT is_nsfw FROM series WHERE id=1').get().is_nsfw, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM books WHERE is_nsfw=1').get().n,0);
  } finally { db.close(); }
});

test('public labels include all-adult collections while preserving mixed series and private metadata', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE series(id INTEGER PRIMARY KEY,is_nsfw,is_public);
      INSERT INTO series VALUES(10,0,1),(20,0,1),(30,0,1),(40,1,1),(50,1,0);
      CREATE TABLE books(id INTEGER PRIMARY KEY,name,is_nsfw,is_public,is_container,parent_book_id,series_id,cover_path);
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
    assert.deepEqual(data.seriesIds.sort((a,b)=>a-b),[10,30,40]);
    assert.ok(!data.coverUrls.includes('/covers/private.jpg'));
    assert.ok(data.coverUrls.includes('/covers/anthology.jpg'));
    assert.ok(!data.coverUrls.includes('/covers/mixed-anthology.jpg'));
  } finally { db.close(); }
});

test('feed flags cover every activity reference, collections, private titles and announcement links', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE series(id INTEGER PRIMARY KEY,is_nsfw,is_public);
      INSERT INTO series VALUES(10,0,1),(20,1,1),(30,1,0);
      CREATE TABLE books(id INTEGER PRIMARY KEY,is_nsfw,is_public,is_container,parent_book_id,series_id,cover_path);
      CREATE TABLE book_anthology_memberships(book_id,anthology_id);
      INSERT INTO books VALUES
        (1,1,1,0,NULL,10,'adult.jpg'),(2,0,1,0,NULL,NULL,'safe.jpg'),
        (3,1,0,0,NULL,NULL,'private.jpg'),(4,0,1,1,NULL,NULL,'anthology.jpg'),
        (5,1,1,0,4,NULL,'child.jpg');`);
    const types = ['book_created','book_added','run_started','run_completed','book_rated',
      'all_discovered','all_visited','first_win','first_loss','first_battle_death','party_formed'];
    const entries = types.map(type => ({type,bookId:1}));
    entries.push({type:'series_created',seriesId:10},{type:'series_rated',seriesId:20},
      {type:'won_all_anthology',bookId:4},{type:'run_started',bookId:2,parentBookId:4},
      {type:'book_added',bookId:3},{type:'series_added',seriesId:30},
      {type:'announcement',body:'[Adult](/book/1)'},
      {type:'announcement',body:'[Series](/series/20)'},
      {type:'book_added',bookId:2},{type:'user_joined'});
    markNsfwFeedEntries(db,entries);
    assert.ok(entries.slice(0,-2).every(entry=>entry.isNsfw===true));
    assert.ok(entries.slice(-2).every(entry=>!entry.isNsfw));
    db.exec('UPDATE books SET is_nsfw=0; UPDATE series SET is_nsfw=0;');
    markNsfwFeedEntries(db,entries);
    assert.ok(entries.every(entry=>!entry.isNsfw),'clearing classifications removes stale flags');
  } finally {db.close();}
});

function client(saved = null, signedIn = true) {
  const storage = new Map(saved === null ? [] : [['hide-nsfw-books',saved]]);
  if (signedIn) storage.set('gamebook_auth_token','test-account');
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

test('cover visibility defaults on and filtering does not mutate book data', async () => {
  const {context:c,storage,events,checkbox} = client();
  assert.equal(c.hideNsfwBooks(),true);
  assert.equal(c.isHiddenNsfwCover('/covers/unknown.jpg'),true,'no first-load artwork leak');
  assert.equal(c.hasNsfwLabel({id:22}),false,'wait for labels before matching an NSFW search');
  await c.loadNsfwCatalog();
  assert.equal(c.isHiddenNsfwBook(22),true);
  assert.equal(c.isHiddenNsfwBook({isSeries:true,entityId:7}),true);
  assert.equal(c.hasNsfwLabel({id:22}),true);
  assert.equal(c.hasNsfwLabel({id:23}),false);
  assert.equal(c.hasNsfwLabel({isSeries:true,entityId:7}),true);
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
  assert.equal(client('0',false).context.hideNsfwBooks(),true,'guests start hidden even after an account opted out');
});

test('switching NSFW visibility reuses cached catalog data without network requests', async () => {
  const {context:c} = client();
  await c.loadNsfwCatalog();
  let requests=0,redraws=0,builds=0;
  Object.assign(c,{
    coversState:{},naturalCompare:(a,b)=>String(a).localeCompare(String(b)),
    _buildSeriesCoverEntries:(_series,books)=>{builds++;return books.map(b=>({id:b.id}));},_refreshCoversDisplay:()=>redraws++,
    _resetLandingCoverQueue(){},publicFetch:()=>{requests++;throw Error('Unnecessary network request');},
  });
  const source=readFileSync('public/js/covers/data.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
  vm.runInContext(source,c);
  vm.runInContext(`_applyCatalogVisibility([{id:22,coverUrl:'/covers/adult.jpg'},{id:23,coverUrl:'/covers/safe.jpg'}],
    [{id:22,name:'Adult'},{id:23,name:'Safe'}],[])`,c);
  const originalBooks=c.coversState._allBooks;
  builds=0;
  assert.equal(c.refreshNsfwCatalogDisplay(),true);
  assert.deepEqual(Array.from(c.coversState._allSeriesCovers,b=>b.id),[23]);
  c.applyNsfwPreference('0');c.refreshNsfwCatalogDisplay();
  assert.deepEqual(Array.from(c.coversState._allSeriesCovers,b=>b.id),[22,23]);
  c.applyNsfwPreference('1');c.refreshNsfwCatalogDisplay();
  assert.deepEqual(Array.from(c.coversState._allSeriesCovers,b=>b.id),[23]);
  assert.strictEqual(c.coversState._allBooks,originalBooks,'the book catalog is never rebuilt or filtered');
  assert.equal(requests,0);assert.equal(redraws,3);assert.equal(builds,0);
});

test('cover preferences do not filter or alter the feed', async () => {
  const {context:c} = client();
  await c.loadNsfwCatalog();
  Object.assign(c,{escapeHtml:String,t:String,createDayRenderer:()=>items=>items.map(e=>e.bookId).join(','),formatAnnBody:String});
  const source=readFileSync('public/js/feed/render.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
  vm.runInContext(source,c);
  const entries=[{bookId:22,bookIsPublic:true,coverUrl:'/covers/adult.jpg',completedAt:1700000000000},
    {bookId:23,bookIsPublic:true,coverUrl:'/covers/safe.jpg',completedAt:1700000000000}];
  const result=c.renderFeedContents(entries,null,'');
  assert.deepEqual(Array.from(result.dayCoverLists[0]),['/covers/adult.jpg','/covers/safe.jpg']);
  assert.match(result.html,/22,23/,'activity text is retained');
  c.applyNsfwPreference('0');
  assert.equal(c.renderFeedContents(entries,null,'').html,result.html);
});

test('classification endpoint allows only admins and Lorekeepers and validates before writing', async () => {
  let admin=false, moderator=false, local=false, writes=0, pushes=0, body={isNsfw:true};
  const dependencies={
    '../db': {isUserAdmin:()=>admin,isUserModerator:()=>moderator},
    '../db/connection': {db:{prepare:()=>({get:()=>({is_nsfw:0}),run:()=>{writes++;return{changes:1};}})}},
    '../db/nsfw': {getNsfwCatalog(){}},
    '../request-helpers': {authenticate:async()=>1,requireLocalhost:()=>local,readBody:async()=>body,send:(res,status,data)=>({status,data})},
    '../sse': {publicCatalogPush:()=>pushes++,feedPush(){}},
  };
  const c=vm.createContext({module:{exports:{}},require:name=>dependencies[name]});
  vm.runInContext(readFileSync('server/routes/nsfw.js','utf8'),c);
  const update=c.module.exports.handleSetBookNsfw;
  const updateSeries=c.module.exports.handleSetSeriesNsfw;
  assert.equal((await updateSeries({method:'PATCH'},{},9)).status,403);
  assert.equal((await update({method:'PATCH'},{},22)).status,403);
  assert.equal((await update({method:'GET'},{},22)).status,403);
  assert.equal(writes,0);
  admin=true;body={isNsfw:'false'};
  assert.equal((await update({method:'PATCH'},{},22)).status,400);
  assert.equal(writes,0);
  body={isNsfw:false};
  assert.equal((await updateSeries({method:'GET'},{},9)).status,200);
  assert.equal((await update({method:'PATCH'},{},22)).status,200);
  assert.equal(writes,1);assert.equal(pushes,1);
  admin=false;moderator=true;
  assert.equal((await update({method:'GET'},{},22)).status,200);
  assert.equal((await update({method:'PATCH'},{},22)).status,200);
  assert.equal(writes,2);assert.equal(pushes,2);
  const adminUpdate=c.module.exports.handleAdminSetBookNsfw;
  assert.equal(await adminUpdate({method:'PATCH'},{},22),undefined);
  assert.equal(writes,2);
  local=true;
  assert.equal((await adminUpdate({method:'PATCH'},{},22)).status,200);
  assert.equal(writes,3);assert.equal(pushes,3);
  assert.equal((await updateSeries({method:'PATCH'},{},9)).status,200);
  assert.equal(writes,4);assert.equal(pushes,4);
});
