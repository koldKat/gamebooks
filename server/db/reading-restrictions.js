'use strict';

function normalizeAuthor(name) {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

const restrictedAuthors = new Set([
  'Вилиан Стефанов',
  'Робърт Блонд',
  'Елена Павлова',
  'Алън Шарп',
  'Алан Шарп',
  'Allen Sharp',
  'Върджил Дриймънд',
].map(normalizeAuthor));

function createReadingRestrictions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS book_reading_restrictions (
      book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS restricted_book_readers (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.function('has_restricted_reading_author', { deterministic: true }, authors =>
    Number(typeof authors === 'string' && authors.split(/[,;]/).some(name => restrictedAuthors.has(normalizeAuthor(name)))));
  const allowedReader = db.prepare('SELECT 1 FROM restricted_book_readers WHERE user_id = ?');
  const restrictedBook = db.prepare(`
    SELECT 1 FROM book_reading_restrictions WHERE book_id = ?
    UNION ALL
    SELECT 1 FROM books WHERE id = ? AND has_restricted_reading_author(authors)
    LIMIT 1
  `);
  const restrictedBooks = db.prepare(`
    SELECT book_id FROM book_reading_restrictions
    UNION
    SELECT id FROM books WHERE has_live_reading = 1 AND has_restricted_reading_author(authors)
  `).pluck();

  function isAllowedReader(userId) {
    return userId != null && !!allowedReader.get(userId);
  }

  function canRead(userId, bookId) {
    return isAllowedReader(userId) || !restrictedBook.get(bookId, bookId);
  }

  function deniedBookIds(userId) {
    return new Set(isAllowedReader(userId) ? [] : restrictedBooks.all());
  }

  function badgeBookIds(userId) {
    return new Set(isAllowedReader(userId) ? restrictedBooks.all() : []);
  }

  return { canRead, deniedBookIds, badgeBookIds };
}

module.exports = { createReadingRestrictions };
