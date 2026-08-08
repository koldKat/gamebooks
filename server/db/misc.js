'use strict';

// Small leftover pieces that didn't warrant their own module: notifications
// get/mark, per-user export helpers, GC (gold coin) supply accounting, and app
// birth timestamp. The `notifications` table itself is created here too.

const { db, _naturalCompareByName } = require('./connection');
const { _insertNotif } = require('./xp');

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    type       TEXT    NOT NULL,
    payload    TEXT    NOT NULL DEFAULT '{}',
    seen       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function getNotifications(userId) {
  const items = db.prepare(
    `SELECT id, type, payload, seen, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`
  ).all(userId).map(r => ({
    id: r.id,
    type: r.type,
    payload: JSON.parse(r.payload),
    seen: r.seen === 1,
    createdAt: r.created_at * 1000,
  }));
  return { unseen: items.filter(i => !i.seen).length, items };
}

// Scoped to the same most-recent-25 window getNotifications() returns - an
// unscoped "mark everything seen" would silently mark overflow notifications
// (beyond the visible 25) as seen without the user ever having seen them,
// after which they'd just sit until purgeOldNotifications() deletes them
// unread 30 days later.
function markNotificationsSeen(userId) {
  db.prepare(`
    UPDATE notifications SET seen = 1 WHERE seen = 0 AND id IN (
      SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 25
    )
  `).run(userId);
}

const _exportRow = ({ state_data, notebook, user_rating, series_name, series_open_world, ...b }) => ({
  ...b,
  userRating:   user_rating ?? null,
  notebook:     notebook ?? '',
  seriesName:   series_name ?? null,
  isOpenWorld:  !!series_open_world,
  state: (() => { try { return JSON.parse(state_data); } catch { return {}; } })(),
});

// Was missing discoverable_sections/cover_path/is_public even though the docs (and
// backup.json's stated format) always claimed a full-account export carried them - a
// restored/inspected backup was silently short these fields for every book. pdf_path is
// deliberately excluded - PDF access is a separate, gated feature (admin/author/
// pdf_access only) and most users shouldn't see that a book even has one.
const _exportQuery = `
  SELECT b.id, b.name, b.total_sections, b.discoverable_sections, b.isbn, b.issn, b.asin,
         b.pages, b.authors, b.description, b.created_at, b.cover_path, b.is_public,
         ub.state_data, ub.notebook, ub.rating AS user_rating,
         s.name AS series_name, s.is_open_world AS series_open_world
  FROM user_books ub
  JOIN books b ON b.id = ub.book_id
  LEFT JOIN series s ON s.id = b.series_id`;

function getAllBooksForExport(userId) {
  const rows = db.prepare(`${_exportQuery} WHERE ub.user_id = ? AND b.is_demo = 0`).all(userId);
  return rows.sort(_naturalCompareByName).map(_exportRow);
}

function getBookForExport(userId, bookId) {
  const row = db.prepare(`${_exportQuery} WHERE ub.user_id = ? AND ub.book_id = ? AND b.is_demo = 0`).get(userId, bookId);
  return row ? _exportRow(row) : null;
}

function getAdminGcSupply(appBirthAt) {
  const users       = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const books       = db.prepare("SELECT COUNT(*) AS n FROM books WHERE is_demo=0 AND parent_book_id IS NULL AND is_container=0").get().n;
  const series      = db.prepare('SELECT COUNT(*) AS n FROM series').get().n;
  const anthologies = db.prepare("SELECT COUNT(*) AS n FROM books WHERE is_demo=0 AND is_container=1 AND parent_book_id IS NULL").get().n;
  const visitAlls         = db.prepare("SELECT COUNT(*) AS n FROM xp_events WHERE event='visit_all'").get().n;
  const levelUps          = db.prepare("SELECT COALESCE(SUM(MIN(CAST((-1 + SQRT(1 + 8.0 * xp / 1000)) / 2 AS INTEGER), 100)), 0) AS n FROM users WHERE xp > 0").get().n;
  const authors           = db.prepare("SELECT COUNT(DISTINCT authors) AS n FROM books WHERE is_demo = 0 AND authors IS NOT NULL AND authors != ''").get().n;
  const pdfs              = db.prepare("SELECT COUNT(*) AS n FROM books WHERE is_demo = 0 AND pdf_path IS NOT NULL").get().n;
  const days              = Math.floor((Math.floor(Date.now() / 1000) - appBirthAt) / 86400);
  const groupCompletes    = db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM coin_events WHERE event IN ('visit_all_series', 'visit_all_anthology')").get().n;
  const earned            = users + books + series + anthologies + visitAlls + levelUps + authors + pdfs + days + groupCompletes;
  const gifted      = parseInt(db.prepare("SELECT value FROM admin_settings WHERE key='admin_gc_gifted'").get()?.value || '0');
  return { earned, gifted, available: Math.max(0, earned - gifted) };
}

function adminGiftGc(userId, amount, message) {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  db.prepare('UPDATE users SET bonus_coins = bonus_coins + ?, admin_gifted_coins = admin_gifted_coins + ? WHERE id = ?').run(amount, amount, userId);
  const prev   = parseInt(db.prepare("SELECT value FROM admin_settings WHERE key='admin_gc_gifted'").get()?.value || '0');
  db.prepare("INSERT OR REPLACE INTO admin_settings (key, value) VALUES ('admin_gc_gifted', ?)").run(String(prev + amount));
  const row    = db.prepare('SELECT xp, coins_spent, bonus_coins FROM users WHERE id = ?').get(userId);
  const balance = Math.floor((row?.xp || 0) / 1000) + (row?.bonus_coins || 0) - (row?.coins_spent || 0);
  _insertNotif.run(userId, 'gc_gift', JSON.stringify({ amount, balance, message: message || null }));
  return { ok: true, balance };
}

function getAppBirthTimestamp() {
  const u = db.prepare('SELECT MIN(created_at) AS m FROM users').get()?.m;
  const b = db.prepare('SELECT MIN(created_at) AS m FROM books').get()?.m;
  const vals = [u, b].filter(v => v != null);
  return vals.length ? Math.min(...vals) : Math.floor(Date.now() / 1000);
}

module.exports = {
  getNotifications, markNotificationsSeen,
  getAllBooksForExport, getBookForExport,
  getAdminGcSupply, adminGiftGc,
  getAppBirthTimestamp,
  backupDb: dest => db.backup(dest),
};
