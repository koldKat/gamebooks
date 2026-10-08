'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Database = require('better-sqlite3');

function setup() {
  const raw = new Database(':memory:');
  raw.exec(`CREATE TABLE books (id INTEGER PRIMARY KEY, cover_path TEXT, parent_book_id INTEGER, is_public INTEGER, is_demo INTEGER DEFAULT 0);
    INSERT INTO books VALUES (1,'own.jpg',NULL,1,0),(2,'anthology.jpg',NULL,1,0),
      (3,NULL,2,1,0),(4,'private.jpg',NULL,0,0),(5,NULL,4,1,0),
      (6,'demo.jpg',NULL,1,1),(7,NULL,NULL,1,0);`);
  let queries = 0;
  const context = vm.createContext({ module: { exports: {} }, URL, require: () => ({ db: {
    prepare(sql) { queries++; return raw.prepare(sql); },
  } }) });
  vm.runInContext(fs.readFileSync(require.resolve('../server/announcement-covers'), 'utf8'), context);
  return { raw, add: context.module.exports.addAnnouncementCovers, queries: () => queries };
}

test('regular and pinned announcement links get public covers in a single batched query', () => {
  const h = setup();
  try {
    const entries = [{ type: 'announcement', body: '[One](/book/1) [One again](/book/1) [Child](https://pathmap.net/book/3)' }, { type: 'book_added' }];
    const pinned = { body: '[Anthology](/book/2)' };
    h.add(entries, pinned);
    assert.equal(entries[0].bookCovers['/book/1'], '/covers/own.jpg');
    assert.equal(entries[0].bookCovers['https://pathmap.net/book/3'], '/covers/anthology.jpg');
    assert.equal(pinned.bookCovers['/book/2'], '/covers/anthology.jpg');
    assert.equal(entries[1].bookCovers, undefined);
    assert.equal(h.queries(), 1);
  } finally { h.raw.close(); }
});

test('announcement previews omit private, demo, missing, coverless and external books', () => {
  const h = setup();
  try {
    const entries = [{ type: 'announcement', body: '[Private](/book/4) [Private parent](/book/5) [Demo](/book/6) [No cover](/book/7) [Missing](/book/99) [External](https://example.com/book/1)' }];
    h.add(entries, null);
    assert.equal(Object.keys(entries[0].bookCovers).length, 0);
    assert.equal(h.queries(), 1);
    h.add([{ type: 'announcement', body: '[Series](/series/1) [External](https://example.com/book/1)' }], null);
    assert.equal(h.queries(), 1, 'no cover query without local book links');
  } finally { h.raw.close(); }
});

test('announcement formatting adds the same hover attribute used by regular feed book links', () => {
  const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const context = vm.createContext({ escapeHtml, t: key => key });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/feed/formatting.js'), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, ''), context);
  const html = context.formatAnnBody('[**Book**](/book/1) [Other](https://example.com/book/1)', { '/book/1': '/covers/a"b.jpg' });
  assert.ok(html.includes('<a href="/book/1" data-cover="/covers/a&quot;b.jpg"><strong>Book</strong></a>'));
  assert.ok(html.includes('<a href="https://example.com/book/1" target="_blank" rel="noopener noreferrer">Other</a>'));
  assert.equal(context.formatAnnBody('[No cover](/book/7)'), '<a href="/book/7">No cover</a>');
});
