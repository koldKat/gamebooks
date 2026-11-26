'use strict';

const sourceKinds = new Set(['play', 'download', 'buy']);
const quailShopUrl = 'https://knigi-igri.bg/shop/%D0%9F%D1%8A%D1%82%D1%8F%D1%82-%D0%BD%D0%B0-%D0%9F%D1%8A%D0%B4%D0%BF%D1%8A%D0%B4%D1%8A%D0%BA%D0%B0-p290058054';

function createBookSources(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS book_sources (
    book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('play', 'download', 'buy'))
  )`);
  db.transaction(() => {
    const seed = db.prepare('INSERT OR IGNORE INTO admin_settings (key, value) VALUES (?, ?)');
    if (seed.run('book_sources_quail_seed_v1', '1').changes) {
      db.prepare(`INSERT OR IGNORE INTO book_sources (book_id, url, kind)
        SELECT id, ?, 'buy' FROM books WHERE id = 829 AND name = ?`).run(quailShopUrl, 'Пътят на Пъдпъдъка');
    }
  })();

  const byId = db.prepare(`SELECT s.url, s.kind FROM books b
    LEFT JOIN books p ON p.id = b.parent_book_id
    JOIN book_sources s ON s.book_id = COALESCE(p.id, b.id)
    WHERE b.id = ?`);
  const all = db.prepare(`SELECT b.id, b.name, s.url, s.kind, b.has_live_reading AS hasLiveReading,
      COALESCE(p.id, b.id) AS sourceBookId, COALESCE(p.name, b.name) AS sourceBookName
    FROM books b
    LEFT JOIN books p ON p.id = b.parent_book_id
    LEFT JOIN book_sources s ON s.book_id = COALESCE(p.id, b.id)
    ORDER BY b.name COLLATE NOCASE, b.id`);
  const readableChildren = db.prepare(`
    SELECT parent.id AS anthologyId, child.id AS childId
    FROM books child JOIN books parent ON parent.id = child.parent_book_id
    WHERE parent.is_container = 1 AND child.has_live_reading = 1
    UNION
    SELECT parent.id, child.id
    FROM book_anthology_memberships m
    JOIN books parent ON parent.id = m.anthology_id
    JOIN books child ON child.id = m.book_id
    WHERE parent.is_container = 1 AND child.has_live_reading = 1
  `);
  const getOwner = db.prepare(`SELECT COALESCE(p.id, b.id) AS id FROM books b
    LEFT JOIN books p ON p.id = b.parent_book_id WHERE b.id = ?`);
  const remove = db.prepare('DELETE FROM book_sources WHERE book_id = ?');
  const add = db.prepare('INSERT OR IGNORE INTO book_sources (book_id, url, kind) VALUES (?, ?, ?)');
  const put = db.prepare(`INSERT INTO book_sources (book_id, url, kind) VALUES (?, ?, ?)
    ON CONFLICT(book_id) DO UPDATE SET url = excluded.url, kind = excluded.kind`);

  function save(bookId, source, { onlyNew = false } = {}) {
    if (typeof source?.url !== 'string') return { error: 'invalid_source' };
    const owner = getOwner.get(bookId);
    if (!owner) return { error: 'not_found' };
    if (owner.id !== bookId) return { error: 'anthology_source_required', sourceBookId: owner.id };
    const value = source.url.trim();
    if (!value) {
      if (onlyNew) return { error: 'invalid_source' };
      remove.run(bookId);
      return { url: null, kind: null };
    }
    if (!sourceKinds.has(source.kind) || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return { error: 'invalid_source' };
    let url;
    try { url = new URL(value); } catch { return { error: 'invalid_source' }; }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return { error: 'invalid_source' };
    if (onlyNew) {
      if (!add.run(bookId, url.href, source.kind).changes) return { error: 'source_exists' };
    } else {
      put.run(bookId, url.href, source.kind);
    }
    return { url: url.href, kind: source.kind };
  }

  function list(restrictedIds) {
    const books = all.all();
    const byBookId = new Map(books.map(book => {
      book.hasLiveReading = Boolean(book.hasLiveReading);
      book.restrictedReadingBadge = book.hasLiveReading && restrictedIds.has(book.id);
      return [book.id, book];
    }));
    for (const { anthologyId, childId } of readableChildren.all()) {
      const anthology = byBookId.get(anthologyId);
      anthology.hasLiveReading = true;
      anthology.restrictedReadingBadge ||= restrictedIds.has(childId);
    }
    return books;
  }

  return { get: bookId => byId.get(bookId), list, save };
}

module.exports = { createBookSources };
