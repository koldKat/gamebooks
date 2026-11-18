'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { initializeAnnouncementHistory, getAnnouncementHistory } = require('../server/db/announcement-history');

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE announcements (id INTEGER PRIMARY KEY, title TEXT, body TEXT,
    is_draft INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, published_at INTEGER)`);
  const insert = db.prepare('INSERT INTO announcements(id,title,body,pinned,published_at) VALUES(?,?,?,?,?)');
  insert.run(1, 'β version now live', 'Old pinned notice', 0, 1);
  insert.run(2, 'Current notice', 'Pinned', 1, 2);
  initializeAnnouncementHistory(db);
  return { db, insert };
}

test('pin history survives unpinning, direct writes, inserts and repeated migration', t => {
  const { db, insert } = fixture(t);
  insert.run(3, 'Release', 'Release body', 0, 3);
  db.prepare('UPDATE announcements SET pinned=1 WHERE id=3').run();
  db.prepare('UPDATE announcements SET pinned=0,was_pinned=0 WHERE id IN (2,3)').run();
  insert.run(4, 'Inserted pinned', 'Notice', 1, 4);
  db.prepare('UPDATE announcements SET pinned=0 WHERE id=4').run();
  initializeAnnouncementHistory(db);
  assert.deepEqual(db.prepare('SELECT was_pinned FROM announcements ORDER BY id').all(),
    [{ was_pinned: 1 }, { was_pinned: 1 }, { was_pinned: 1 }, { was_pinned: 1 }]);
  assert.deepEqual(getAnnouncementHistory(db).items, []);
});

test('history spans all dates, orders by publication, and pages without duplicates', t => {
  const { db, insert } = fixture(t);
  for (let id = 3; id <= 32; id++) insert.run(id, `Release ${id}`, 'Body', 0, Math.floor(id / 2));
  insert.run(40, 'Future draft', 'Secret', 0, 1);
  db.prepare('UPDATE announcements SET is_draft=1 WHERE id=40').run();
  insert.run(41, 'Scheduled', 'Not published yet', 0, Math.floor(Date.now() / 1000) + 1000);
  insert.run(42, 'Unpublished', 'Not public', 0, null);
  const ids = [];
  let before = null;
  do {
    const page = getAnnouncementHistory(db, before);
    assert.ok(page.items.length <= 12);
    assert.ok(page.items.every(item => !Object.hasOwn(item, 'is_draft')));
    ids.push(...page.items.map(item => item.id));
    if (!page.next) break;
    const [time, id] = page.next.split(':').map(Number);
    before = { time, id };
  } while (true);
  assert.deepEqual(ids, Array.from({ length: 30 }, (_, i) => 32 - i));
  assert.equal(new Set(ids).size, ids.length);
});
