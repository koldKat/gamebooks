'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { createBookSources } = require('../server/db/book-sources');

test('admin lists all books as soon as they are created and anthology children share the parent URL', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE admin_settings (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, has_live_reading INTEGER, parent_book_id INTEGER, is_container INTEGER DEFAULT 0);
      CREATE TABLE book_anthology_memberships (book_id INTEGER, anthology_id INTEGER);
      INSERT INTO books (id, name, has_live_reading, parent_book_id)
      VALUES (10, 'Anthology', 0, NULL), (11, 'First story', 1, 10),
        (12, 'Restricted story', 1, 10), (20, 'Standalone', 1, NULL), (21, 'No reader', 0, NULL),
        (829, 'Пътят на Пъдпъдъка', 1, NULL);
      INSERT INTO books VALUES (30, 'Another anthology', 0, NULL, 1);
      UPDATE books SET is_container = 1 WHERE id = 10;
      INSERT INTO book_anthology_memberships VALUES (11, 30);`);
    const sources = createBookSources(db);
    const childOnly = { url: 'https://example.org/story', kind: 'play' };
    db.prepare('INSERT INTO book_sources VALUES (11, ?, ?)').run(childOnly.url, childOnly.kind);
    assert.equal(sources.get(11), undefined);
    assert.deepEqual(sources.save(11, childOnly), { error: 'anthology_source_required', sourceBookId: 10 });
    assert.deepEqual(sources.save(20, { url: 'javascript:alert(1)', kind: 'play' }), { error: 'invalid_source' });

    const parent = { url: 'https://example.org/anthology', kind: 'buy' };
    assert.deepEqual(sources.save(10, parent), parent);
    assert.deepEqual(sources.save(10, childOnly, { onlyNew: true }), { error: 'source_exists' });
    assert.deepEqual(sources.get(11), parent);
    assert.deepEqual(sources.get(12), parent);
    const insert = db.prepare('INSERT INTO books (id, name, has_live_reading, parent_book_id) VALUES (?, ?, ?, ?)');
    insert.run(22, 'New book', 0, null);
    insert.run(13, 'New anthology child', 0, 10);
    const listed = new Map(sources.list(new Set([12, 21])).map(row => [row.id, row]));
    assert.equal(listed.size, 9);
    assert.equal(listed.get(12).sourceBookId, 10);
    assert.equal(listed.get(12).url, parent.url);
    assert.equal(listed.get(20).url, null);
    assert.equal(listed.get(13).url, parent.url);
    assert.equal(listed.get(21).url, null);
    assert.deepEqual(listed.get(22), { id: 22, name: 'New book', url: null, kind: null, sourceBookId: 22, sourceBookName: 'New book',
      hasLiveReading: false, restrictedReadingBadge: false });
    for (const [id, imported, restricted] of [
      [10, true, false], [11, true, false], [12, true, true], [13, false, false],
      [20, true, false], [21, false, false], [30, true, false],
    ]) {
      assert.equal(listed.get(id).hasLiveReading, imported, `reader availability for #${id}`);
      assert.equal(listed.get(id).restrictedReadingBadge, restricted, `reader badge for #${id}`);
    }
    assert.equal(sources.list(new Set([11, 12])).find(row => row.id === 10).restrictedReadingBadge, true);
    assert.deepEqual(sources.save(22, childOnly), childOnly);
    assert.deepEqual(sources.get(22), childOnly);

    assert.deepEqual(sources.save(10, { url: '' }), { url: null, kind: null });
    assert.equal(sources.get(11), undefined);
    assert.equal(sources.get(829).kind, 'buy');
    sources.save(829, { url: '' });
    assert.equal(createBookSources(db).get(829), undefined);
  } finally {
    db.close();
  }
});
