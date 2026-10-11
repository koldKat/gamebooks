'use strict';

function installReadingOwnershipGuards(db) {
  db.transaction(() => {
    for (const table of ['book_sections', 'book_frontmatter', 'book_reading_entries']) {
      for (const operation of ['INSERT', 'UPDATE OF book_id']) {
        const suffix = operation.startsWith('UPDATE') ? 'update' : 'insert';
        db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_child_owner_${suffix}
          BEFORE ${operation} ON ${table}
          WHEN EXISTS (SELECT 1 FROM books WHERE id = NEW.book_id AND is_container = 1)
          BEGIN SELECT RAISE(ABORT, 'Reading content belongs to a child book, not an anthology container'); END`);
      }
    }
    for (const operation of ['INSERT', 'UPDATE OF has_live_reading, is_container']) {
      const suffix = operation.startsWith('UPDATE') ? 'update' : 'insert';
      db.exec(`CREATE TRIGGER IF NOT EXISTS books_reading_child_${suffix}
        BEFORE ${operation} ON books
        WHEN NEW.is_container = 1 AND (
          COALESCE(NEW.has_live_reading, 0) != 0
          OR EXISTS (SELECT 1 FROM book_sections WHERE book_id = NEW.id)
          OR EXISTS (SELECT 1 FROM book_frontmatter WHERE book_id = NEW.id)
          OR EXISTS (SELECT 1 FROM book_reading_entries WHERE book_id = NEW.id))
        BEGIN SELECT RAISE(ABORT, 'Move reading content to child books before making an anthology container'); END`);
    }
  })();
}

module.exports = { installReadingOwnershipGuards };
