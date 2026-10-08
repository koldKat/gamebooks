'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function library() {
  const raw = new Database(':memory:');
  const columns = 'id name total_sections discoverable_sections isbn issn asin cover_path pdf_path epub_path created_at created_by is_public pages authors description is_demo series_id series_number is_container parent_book_id book_order has_battle_sim has_live_reading'.split(' ');
  raw.exec(`CREATE TABLE books (${columns.map(name => name + (name === 'id' ? ' INTEGER PRIMARY KEY' : '')).join(',')});
    CREATE TABLE series (id INTEGER, name TEXT);
    CREATE TABLE user_books (user_id INTEGER, book_id INTEGER, state_data TEXT, created_at INTEGER, updated_at INTEGER, rating REAL, party_id INTEGER, bg_hidden INTEGER, bg_pos_y INTEGER);
    CREATE TABLE xp_events (user_id INTEGER, event TEXT, ref TEXT);
    CREATE TABLE book_reading_entries (book_id INTEGER PRIMARY KEY, section_id TEXT, counts_as_section INTEGER DEFAULT 1);
    CREATE TABLE book_anthology_memberships (book_id INTEGER, anthology_id INTEGER, book_order INTEGER);`);
  let queries = 0;
  const db = { prepare(sql) { queries++; return raw.prepare(sql); } };
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    if (name === './connection') return { db, _getPdfSize: () => null, _getEpubSize: () => null };
    if (name === './xp') return {
      _visitedSet: (pts, excluded = []) => new Set(pts.flatMap(pt => pt.path || []).map(String).filter(sec => !excluded.includes(sec))),
      _mappedSet: (graph, excluded = []) => new Set(Object.keys(graph).filter(sec => !excluded.includes(sec))),
    };
    throw Error(name);
  } });
  const source = fs.readFileSync(require.resolve('../server/db/books'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('function getStashes(')) + '\nmodule.exports = { getBooks };', context);
  return { raw, getBooks: userId => { queries = 0; return JSON.parse(JSON.stringify(context.module.exports.getBooks(userId))); }, queries: () => queries };
}

test('batched summaries preserve progress, global ratings, anthology order and account isolation', () => {
  const h = library();
  try {
    h.raw.exec(`INSERT INTO books (id,name,total_sections,has_live_reading) VALUES (1,'First',10,1),(11,'Eleventh',2,0);
      INSERT INTO user_books (user_id,book_id,state_data,created_at,updated_at,rating) VALUES
      (7,1,'{"playthroughs":[{"path":[1,"1"],"startedAt":100}],"graph":{"2":{}}}',1,5,4),
      (7,11,'{"graph":{"1":{},"2":{}}}',2,6,NULL),(8,1,'{}',1,0,2);
      INSERT INTO xp_events VALUES (7,'visit_node','1:1'),(7,'visit_node','1:2'),(7,'visit_node','1:3'),
      (7,'visit_node','11:1'),(7,'visit_node','11:2'),(7,'visit_node','11:3'),
      (8,'visit_node','1:4'),(7,'discover_node','1:4');
      INSERT INTO book_anthology_memberships VALUES (1,20,3);`);
    const books = h.getBooks(7);
    assert.equal(books[0].visited, 3, 'deleted-run visit history is retained');
    assert.equal(books[0].last_run_at, 100);
    assert.equal(books[0].userRating, 4);
    assert.equal(books[0].avgRating, 3, 'ratings include other owners');
    assert.equal(books[0].voteCount, 2);
    assert.equal(books[0].hasLiveReading, true);
    assert.deepEqual(books[0].extra_anthology_ids, [20]);
    assert.deepEqual(books[0].extra_anthology_orders, { 20: 3 });
    assert.equal(books[1].visited, 2, 'already-complete graph keeps its original count');
    assert.equal(books[1].avgRating, null);
    assert.equal(books[1].voteCount, 0);
    assert.equal(h.getBooks(8)[0].visited, 1, 'visit history belongs to the requested account');
  } finally { h.raw.close(); }
});

test('large libraries use a constant number of queries and tolerate malformed saved state', () => {
  const h = library();
  try {
    const book = h.raw.prepare('INSERT INTO books (id,name,total_sections) VALUES (?, ?, 400)');
    const owned = h.raw.prepare("INSERT INTO user_books (user_id,book_id,state_data) VALUES (1,?,?)");
    h.raw.transaction(() => { for (let id = 1; id <= 1500; id++) { book.run(id, 'Book ' + id); owned.run(id, id === 1 ? 'broken JSON' : '{}'); } })();
    const books = h.getBooks(1);
    assert.equal(books.length, 1500);
    assert.equal(books[0].visited, 0);
    assert.equal(h.queries(), 4);
    assert.deepEqual(h.getBooks(99), []);
  } finally { h.raw.close(); }
});

test('opening entries are excluded from live and permanent library counts without extra queries', () => {
  const h = library();
  try {
    h.raw.exec(`INSERT INTO books (id,name,total_sections) VALUES (534,'Fire*Wolf',183);
      INSERT INTO book_reading_entries VALUES (534,'prologue',0);
      INSERT INTO user_books (user_id,book_id,state_data) VALUES
        (7,534,'{"playthroughs":[{"path":["prologue",20]}],"graph":{"prologue":{},"20":{}}}');
      INSERT INTO xp_events VALUES (7,'visit_node','534:prologue'),(7,'visit_node','534:20');`);
    assert.equal(h.getBooks(7)[0].visited, 1);
    assert.equal(h.queries(), 4);
    h.raw.exec("UPDATE user_books SET state_data = '{}'");
    assert.equal(h.getBooks(7)[0].visited, 1);
  } finally { h.raw.close(); }
});
