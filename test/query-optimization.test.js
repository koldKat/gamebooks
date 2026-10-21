'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');
const { installQueryIndexes } = require('../server/db/query-indexes');
const { addGameplayStats } = require('../server/db/gameplay-stats');

const plain = value => JSON.parse(JSON.stringify(value));
function functions(file, start, end, globals) {
  const source = fs.readFileSync(require.resolve('../server/db/' + file), 'utf8');
  return vm.runInNewContext(source.slice(source.indexOf(start), source.indexOf(end)) + '\n' + start.match(/function (\w+)/)[1], globals);
}
function moduleWithDb(file, db, dependencies = {}) {
  const context = { module: { exports: {} }, require(name) {
    if (name === './connection') return { db, _naturalCompareByName: (a, b) => a.name.localeCompare(b.name) };
    if (name in dependencies) return dependencies[name];
    throw Error('Unexpected dependency ' + name);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server/db/' + file), 'utf8'), context);
  return context.module.exports;
}

test('catalog aggregates do not multiply children or sections by the number of readers', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, name, cover_path, created_at, published_at, authors,
    is_container, total_sections, max_section_number, description, has_battle_sim, has_live_reading,
    isbn, issn, asin, pages, pdf_path, epub_path, series_id, series_number, parent_book_id, is_public);
    CREATE TABLE series (id INTEGER PRIMARY KEY, name, description, is_open_world, created_at, published_at, is_public);
    CREATE TABLE user_books (user_id, book_id, rating);
    CREATE TABLE user_series (user_id, series_id);
    INSERT INTO series VALUES (1,'Public',NULL,0,10,NULL,1),(2,'Private',NULL,0,10,NULL,0);
    INSERT INTO books (id,name,is_container,total_sections,is_public,series_id) VALUES
      (10,'Anthology',1,999,1,1),(20,'Standalone',0,50,1,1),(30,'Empty',1,999,1,NULL),
      (40,'Private series book',0,60,1,2),(50,'Private book',0,80,0,1);
    INSERT INTO books (id,name,is_container,total_sections,parent_book_id,is_public,pdf_path,has_live_reading) VALUES
      (11,'First',0,100,10,1,'private.pdf',1),(12,'Second',0,100,10,1,NULL,0),
      (13,'Hidden',0,500,10,0,'hidden.pdf',0);
    INSERT INTO user_books VALUES (1,10,4),(2,10,5),(3,10,NULL),(1,20,2);
    INSERT INTO user_series VALUES (1,1),(2,1),(3,1);`);
  const api = moduleWithDb('feed', db, { './xp': {}, './content': {}, './books': {} });
  const books = plain(api.getAllPublicBooks());
  const anthology = books.find(b => b.id === 10);
  assert.equal(anthology.totalSections, 200, 'equal-sized children must both count');
  assert.equal(anthology.libraryCount, 3);
  assert.deepEqual(anthology.childIds, [11, 12]);
  assert.deepEqual(anthology.childNames, ['First', 'Second']);
  assert.equal(anthology.hasPdf, false);
  assert.equal(anthology.pdfPath, null);
  assert.equal(anthology.hasLiveReading, true);
  assert.equal(api.getAllPublicBooks(true).find(b => b.id === 10).hasPdf, true);
  assert.equal(books.find(b => b.id === 30).totalSections, 0);
  assert.equal(books.find(b => b.id === 40).seriesId, null);
  assert.equal(books.some(b => b.id === 50 || b.id === 13), false);
  const series = plain(api.getAllPublicSeries());
  assert.equal(series.length, 1);
  assert.equal(series[0].book_count, 2);
  assert.equal(series[0].total_sections, 250);
  assert.equal(series[0].library_count, 3);
});

test('author ratings keep exact author matching, per-vote weighting and public-book privacy in one query', t => {
  const raw = new Database(':memory:');
  t.after(() => raw.close());
  raw.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, authors, is_public);
    CREATE TABLE user_books (book_id, rating REAL);
    INSERT INTO books VALUES (1,'Ann, Bob, Ann',1),(2,'Ann',1),(3,'Joann',1),(4,'Ann',0),(5,'Nobody',1);
    INSERT INTO user_books VALUES (1,5),(1,4),(2,1),(3,3),(4,5),(5,NULL);`);
  let queries = 0;
  const get = functions('books', 'function _getAuthorRatings(', 'const _RUN_EVENTS', {
    db: { prepare(sql) { queries++; return raw.prepare(sql); } },
  });
  assert.deepEqual(plain(get('Ann, Bob, Nobody, Missing')), [
    { name: 'Ann', avgRating: 10 / 3, voteCount: 3 },
    { name: 'Bob', avgRating: 4.5, voteCount: 2 },
    { name: 'Nobody', avgRating: null, voteCount: 0 },
    { name: 'Missing', avgRating: null, voteCount: 0 },
  ]);
  assert.equal(queries, 1);
});

test('feedback batches messages and attachments with stable order, ownership and attachment kinds', t => {
  const raw = new Database(':memory:');
  t.after(() => raw.close());
  raw.exec(`CREATE TABLE feedback (id INTEGER PRIMARY KEY, user_id, created_at, deleted_by_user DEFAULT 0, deleted_by_admin DEFAULT 0);
    CREATE TABLE feedback_messages (id INTEGER PRIMARY KEY, thread_id, created_at, sender, body);
    CREATE TABLE attachments (id INTEGER PRIMARY KEY, filename, original_name, mime_type, size, kind, linked_id, created_at, uploaded_by);
    INSERT INTO feedback (id,user_id,created_at) VALUES (1,7,1),(2,8,2),(3,7,3);
    INSERT INTO feedback_messages VALUES (10,1,2,'user','Earlier'),(11,1,2,'admin','Later'),(20,2,3,'user','Other account');
    INSERT INTO attachments VALUES (1,'a','','',1,'feedback_message',10,1,7),
      (2,'b','','',1,'feedback_message',10,1,7),(3,'forum','','',1,'forum_post',10,1,7),
      (4,'other','','',1,'feedback_message',20,1,8);`);
  let queries = 0;
  const db = { exec: sql => raw.exec(sql), transaction: fn => raw.transaction(fn), prepare(sql) {
    const stmt = raw.prepare(sql);
    return new Proxy(stmt, { get(target, key) {
      if (['all', 'get'].includes(key)) return (...args) => { queries++; return target[key](...args); };
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
  } };
  const api = moduleWithDb('feedback', db);
  queries = 0;
  const threads = plain(api.getThreadsForUser(7));
  assert.equal(queries, 3);
  assert.deepEqual(threads.map(t => t.id), [3, 1]);
  assert.deepEqual(threads[0].messages, []);
  assert.deepEqual(threads[1].messages.map(m => m.id), [10, 11]);
  assert.deepEqual(threads[1].messages[0].attachments.map(a => a.id), [1, 2]);
  assert.equal('linked_id' in threads[1].messages[0].attachments[0], false);
  queries = 0;
  assert.deepEqual(plain(api.getThreadsForUser(99)), []);
  assert.equal(queries, 1);
  raw.transaction(() => { for (let id = 100; id < 1600; id++) raw.prepare('INSERT INTO feedback_messages VALUES (?,1,4,?,?)').run(id, 'user', 'Bulk'); })();
  queries = 0;
  assert.equal(api.getThreadsForUser(7).find(t => t.id === 1).messages.length, 1502);
  assert.equal(queries, 3, 'no variable limit or per-message query growth');
});

test('gameplay extras match SQLite counters and portals, including container states and padding runs', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE user_books (state_data TEXT)');
  const states = [
    { playthroughs: [{ startedAt: null, undosUsed: '12.9', fastTravelsUsed: true }, { undosUsed: -2.9, fastTravelsUsed: '3e2' }],
      graph: { 1: { portals: [1, 2] }, 2: { portals: { a: 1 } }, 3: { portals: null }, 4: { portals: 3 }, 5: { portals: [] } } },
    { playthroughs: [{ undosUsed: 'invalid', fastTravelsUsed: false }] }, {}, null,
  ];
  const totals = { undosTotal: 0, fastTravelsTotal: 0, owPortals: 0 };
  for (const state of states) { addGameplayStats(totals, state); db.prepare('INSERT INTO user_books VALUES (?)').run(JSON.stringify(state)); }
  const counters = db.prepare(`SELECT COALESCE(SUM(CAST(json_extract(pt.value,'$.undosUsed') AS INTEGER)),0) undosTotal,
    COALESCE(SUM(CAST(json_extract(pt.value,'$.fastTravelsUsed') AS INTEGER)),0) fastTravelsTotal
    FROM user_books,json_each(json_extract(state_data,'$.playthroughs')) pt`).get();
  const portals = db.prepare(`SELECT COUNT(*) n FROM user_books,json_each(json_extract(state_data,'$.graph')) node,
    json_each(json_extract(node.value,'$.portals')) portal WHERE json_extract(node.value,'$.portals') IS NOT NULL`).get().n;
  assert.deepEqual(totals, { ...counters, owPortals: portals });
});

test('forum attachment queries stay constant for large threads and separate thread/post attachments', t => {
  const raw = new Database(':memory:');
  t.after(() => raw.close());
  raw.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username, avatar_path, xp, public_profile);
    CREATE TABLE forum_categories (id INTEGER PRIMARY KEY, slug, name);
    CREATE TABLE forum_threads (id INTEGER PRIMARY KEY, title, body, user_id, created_at, edited_at,
      reply_count, is_locked, is_pinned, category_id);
    CREATE TABLE forum_posts (id INTEGER PRIMARY KEY, body, created_at, edited_at, is_deleted, user_id, thread_id);
    CREATE TABLE attachments (id INTEGER PRIMARY KEY, filename, original_name, mime_type, size, kind, linked_id, created_at, uploaded_by);
    INSERT INTO forum_threads (id,title) VALUES (1,'Thread');
    INSERT INTO attachments VALUES (1,'thread','','',1,'forum_thread',1,1,7),
      (2,'post','','',1,'forum_post',1,1,7),(3,'feedback','','',1,'feedback_message',1,1,7);`);
  const insert = raw.prepare('INSERT INTO forum_posts VALUES (?, ?, ?, NULL, 0, 7, 1)');
  raw.transaction(() => { for (let id = 1; id <= 1500; id++) insert.run(id, 'Reply', id); })();
  let queries = 0;
  const db = { exec: sql => raw.exec(sql), transaction: fn => raw.transaction(fn), prepare(sql) {
    const statement = raw.prepare(sql);
    return new Proxy(statement, { get(target, key) {
      if (['all', 'get'].includes(key)) return (...args) => { queries++; return target[key](...args); };
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
  } };
  const feedback = moduleWithDb('feedback', db);
  const forum = moduleWithDb('forum', db, { './xp': {}, './feedback': feedback });
  queries = 0;
  const result = plain(forum.forumGetThread(1));
  assert.equal(queries, 4);
  assert.equal(result.posts.length, 1500);
  assert.deepEqual(result.thread.attachments.map(a => a.id), [1]);
  assert.deepEqual(result.posts[0].attachments.map(a => a.id), [2]);
  assert.deepEqual(result.posts[1499].attachments, []);
  assert.equal(forum.forumGetThread(99), null);
});

test('bulk XP summaries match individual calculations without one query pair per user', t => {
  const raw = new Database(':memory:');
  t.after(() => raw.close());
  const fields = 'xp coins_spent xp_boost_pct bonus_undos bonus_fast_travels bonus_heartbeat_xp bonus_coins admin_gifted_coins xp_from_boost bonus_gc_chance_purchased bonus_gc_mint_purchased pending_bonus_gc bonus_diamond_dig_purchased bonus_diamond_exchange_purchased'.split(' ');
  raw.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, ${fields.map(f => f + ' INTEGER DEFAULT 0').join(',')});
    CREATE TABLE coin_events (user_id, event, amount);
    CREATE TABLE user_diamonds (user_id INTEGER PRIMARY KEY, diamonds_earned INTEGER);
    INSERT INTO user_diamonds VALUES (1,36),(2,6);
    INSERT INTO users (id,xp,coins_spent,bonus_coins,bonus_gc_mint_purchased) VALUES (1,6000,2,3,2),(2,0,0,0,0);
    INSERT INTO coin_events VALUES (1,'bonus_gc_claim',7),(1,'bonus_gc_claim',4),(1,'other',99),(2,'bonus_gc_claim',2);`);
  let queries = 0;
  const source = fs.readFileSync(require.resolve('../server/db/xp'), 'utf8');
  const api = vm.runInNewContext(source.slice(source.indexOf('const TITLES ='), source.indexOf('const _insertNotif =')) +
    source.slice(source.indexOf('function getUserXpInfo('), source.indexOf('function getBookCreator(')) +
    '\n({getUserXpInfo,getAllUsersXpInfo})', { db: { prepare(sql) { queries++; return raw.prepare(sql); } }, diamondInfoForUser: require('../server/db/diamonds').diamondInfoForUser });
  const expected = [plain(api.getUserXpInfo(1)), plain(api.getUserXpInfo(2))];
  assert.equal(expected[0].diamondsBalance, 36);
  for (const key of Object.keys(expected[0])) if (key.startsWith('diamond')) delete expected[0][key]; // Private preview is absent from admin lists.
  queries = 0;
  const results = api.getAllUsersXpInfo();
  assert.equal(queries, 2);
  assert.deepEqual([plain(results.get(1)), plain(results.get(2))], expected);
  assert.equal(results.get(1).bonusGcClaimed, 11);
  assert.equal(results.get(1).level, 3);
  assert.equal(results.get(1).coinsBalance, 7);
  assert.equal(results.has(99), false);
});

test('admin book summaries use two queries at scale and preserve first reader and deleted-run outcomes', t => {
  const raw = new Database(':memory:');
  t.after(() => raw.close());
  raw.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, name, total_sections, created_at, updated_at, is_container);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username);
    CREATE TABLE user_books (id INTEGER PRIMARY KEY, user_id, book_id, state_data);
    INSERT INTO users VALUES (1,'First reader'),(2,'Second reader');
    INSERT INTO books VALUES (1,'First',100,1,1,0),(2,'Empty',100,2,2,0),(3,'Container',100,3,3,1);
    INSERT INTO user_books VALUES (1,1,1,'{"playthroughs":[{"result":"success"},{"result":"battle"}]}'),
      (2,2,1,'{"playthroughs":[{"result":"death"}]}'),(3,1,2,'broken JSON');`);
  const insert = raw.prepare('INSERT INTO books VALUES (?, ?, 100, ?, 1, 0)');
  raw.transaction(() => { for (let id = 4; id <= 1500; id++) insert.run(id, 'Book ' + id, id); })();
  let queries = 0;
  const get = functions('admin', 'function adminGetBooks(', 'function adminDeleteBook(', {
    db: { prepare(sql) { queries++; return raw.prepare(sql); } },
  });
  const books = plain(get());
  assert.equal(queries, 2);
  assert.equal(books.length, 1499);
  assert.equal(books[0].owner, 'First reader');
  assert.equal(books[0].readers, 2);
  assert.equal(books[0].wins, 1);
  assert.equal(books[0].deaths, 1);
  assert.equal(books[0].battles, 1);
  assert.equal(books[1].wins, 0);
  assert.equal(books[2].owner, '-');
  raw.exec('DELETE FROM user_books WHERE id=2');
  assert.equal(get()[0].deaths, 0);
});

test('query indexes are repeatable and remove notification and thread sorts', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE notifications (id INTEGER PRIMARY KEY, user_id, created_at);
    CREATE TABLE feedback_messages (id INTEGER PRIMARY KEY, thread_id, created_at);
    CREATE TABLE forum_posts (id INTEGER PRIMARY KEY, thread_id, created_at);
    CREATE TABLE forum_threads (id INTEGER PRIMARY KEY, category_id, is_pinned, last_post_at);
    INSERT INTO notifications VALUES (1,7,1),(2,8,3),(3,7,2);`);
  const before = db.prepare('SELECT * FROM notifications').all();
  installQueryIndexes(db);
  installQueryIndexes(db);
  assert.deepEqual(db.prepare('SELECT * FROM notifications').all(), before);
  for (const sql of [
    'SELECT * FROM notifications WHERE user_id=7 ORDER BY created_at DESC LIMIT 25',
    'SELECT * FROM feedback_messages WHERE thread_id=1 ORDER BY created_at',
    'SELECT * FROM forum_posts WHERE thread_id=1 ORDER BY created_at',
    'SELECT * FROM forum_threads WHERE category_id=1 ORDER BY is_pinned DESC,last_post_at DESC',
  ]) {
    const plan = db.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(r => r.detail).join('\n');
    assert.match(plan, /USING (COVERING )?INDEX/);
    assert.doesNotMatch(plan, /TEMP B-TREE|SCAN /);
  }
});
