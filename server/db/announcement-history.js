'use strict';

// Keep pin history permanent and page through published announcement history.
function initializeAnnouncementHistory(db) {
  if (!db.prepare('PRAGMA table_info(announcements)').all().some(c => c.name === 'was_pinned')) {
    db.exec('ALTER TABLE announcements ADD COLUMN was_pinned INTEGER NOT NULL DEFAULT 0');
  }
  db.exec(`
    UPDATE announcements SET was_pinned = 1
      WHERE was_pinned = 0 AND (pinned = 1 OR title = 'β version now live');
    CREATE TRIGGER IF NOT EXISTS announcement_pin_history_insert
    AFTER INSERT ON announcements WHEN NEW.pinned = 1 AND NEW.was_pinned = 0
    BEGIN
      UPDATE announcements SET was_pinned = 1 WHERE id = NEW.id;
    END;
    CREATE TRIGGER IF NOT EXISTS announcement_pin_history_update
    AFTER UPDATE OF pinned, was_pinned ON announcements
    WHEN NEW.was_pinned = 0 AND (NEW.pinned = 1 OR OLD.pinned = 1 OR OLD.was_pinned = 1)
    BEGIN
      UPDATE announcements SET was_pinned = 1 WHERE id = NEW.id;
    END;
  `);
}

function getAnnouncementHistory(db, before = null) {
  const rows = db.prepare(`SELECT id, title, body, published_at FROM announcements
    WHERE is_draft = 0 AND pinned = 0 AND was_pinned = 0
      AND published_at IS NOT NULL AND published_at <= ?
      AND (? IS NULL OR published_at < ? OR (published_at = ? AND id < ?))
    ORDER BY published_at DESC, id DESC LIMIT 13`).all(
    Math.floor(Date.now() / 1000), before?.time ?? null,
    before?.time ?? null, before?.time ?? null, before?.id ?? null
  );
  const items = rows.slice(0, 12);
  const last = items.at(-1);
  return { items, next: rows.length > 12 ? `${last.published_at}:${last.id}` : null };
}

module.exports = { initializeAnnouncementHistory, getAnnouncementHistory };
