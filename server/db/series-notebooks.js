'use strict';

// Store one player's notebook across the books of an open-world series.
function installSeriesNotebooks(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS series_notebooks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    notebook TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, series_id)
  )`);
}

function notebookContext(db, userId, bookId) {
  return db.prepare(`SELECT ub.notebook, s.id AS series_id
    FROM user_books ub JOIN books b ON b.id = ub.book_id
    LEFT JOIN books p ON p.id = b.parent_book_id
    LEFT JOIN series s ON s.id = COALESCE(b.series_id, p.series_id) AND s.is_open_world = 1
    WHERE ub.user_id = ? AND ub.book_id = ?`).get(userId, bookId);
}

function getNotebook(db, userId, bookId) {
  const context = notebookContext(db, userId, bookId);
  if (!context) return null;
  if (context.series_id == null) return context.notebook ?? '';
  const shared = db.prepare('SELECT notebook FROM series_notebooks WHERE user_id = ? AND series_id = ?').get(userId, context.series_id);
  if (shared) return shared.notebook;
  // Preserve distinct older notes on first use; no migration overwrites another
  // book's text. A subsequent save establishes the shared notebook, including clears.
  const legacy = db.prepare(`SELECT ub.notebook FROM user_books ub
    JOIN books b ON b.id = ub.book_id LEFT JOIN books p ON p.id = b.parent_book_id
    WHERE ub.user_id = ? AND COALESCE(b.series_id, p.series_id) = ?
      AND ub.notebook IS NOT NULL AND ub.notebook != ''
    ORDER BY CASE WHEN b.id = ? THEN 0 ELSE 1 END, b.id`).all(userId, context.series_id, bookId);
  return [...new Set(legacy.map(row => row.notebook))].join('\n\n');
}

function setNotebook(db, userId, bookId, text) {
  return db.transaction(() => {
    const context = notebookContext(db, userId, bookId);
    if (!context) return false;
    if (context.series_id != null) {
      db.prepare(`INSERT INTO series_notebooks (user_id, series_id, notebook) VALUES (?, ?, ?)
        ON CONFLICT(user_id, series_id) DO UPDATE SET notebook = excluded.notebook`).run(userId, context.series_id, text);
    }
    db.prepare('UPDATE user_books SET notebook = ? WHERE book_id = ? AND user_id = ?').run(text || null, bookId, userId);
    return true;
  })();
}

module.exports = { installSeriesNotebooks, getNotebook, setNotebook };
