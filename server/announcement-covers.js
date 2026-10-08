'use strict';

// Attach public cover metadata to announcement links in one query per feed response.
const { db } = require('./db/connection');

function addAnnouncementCovers(entries, pinned) {
  const announcements = entries.filter(entry => entry.type === 'announcement');
  if (pinned) announcements.push(pinned);
  const targets = new Map();
  const announcementTargets = new Map();
  for (const announcement of announcements) {
    const linked = new Set();
    announcementTargets.set(announcement, linked);
    for (const match of (announcement.body || '').matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+|\/book\/\d+)\)/g)) {
      let url;
      try { url = new URL(match[1], 'https://pathmap.net'); } catch { continue; }
      if (url.origin !== 'https://pathmap.net') continue;
      const book = url.pathname.match(/^\/book\/(\d+)$/);
      if (book) { targets.set(match[1], Number(book[1])); linked.add(match[1]); }
    }
  }
  if (!targets.size) return { entries, pinned };
  const rows = db.prepare(`SELECT b.id, COALESCE(NULLIF(b.cover_path, ''), NULLIF(p.cover_path, '')) AS cover_path
    FROM books b LEFT JOIN books p ON p.id = b.parent_book_id AND p.is_public = 1 AND p.is_demo = 0
    WHERE b.id IN (SELECT value FROM json_each(?)) AND b.is_public = 1 AND b.is_demo = 0`).all(JSON.stringify([...new Set(targets.values())]));
  const covers = new Map(rows.filter(row => row.cover_path).map(row => [row.id, `/covers/${row.cover_path}`]));
  for (const announcement of announcements) {
    announcement.bookCovers = Object.fromEntries([...announcementTargets.get(announcement)].filter(target => covers.has(targets.get(target))).map(target => [target, covers.get(targets.get(target))]));
  }
  return { entries, pinned };
}

module.exports = { addAnnouncementCovers };
