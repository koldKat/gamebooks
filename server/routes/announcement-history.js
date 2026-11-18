'use strict';

// Serve published, never-pinned announcements in bounded chronological pages.
const { db } = require('../db/connection');
const { getAnnouncementHistory } = require('../db/announcement-history');
const { addAnnouncementCovers } = require('../announcement-covers');
const { send } = require('../request-helpers');

function handleAnnouncementHistory(req, res) {
  const cursor = new URL(req.url, 'http://localhost').searchParams.get('before');
  let before = null;
  if (cursor !== null) {
    if (!/^\d{1,12}:\d{1,12}$/.test(cursor)) return send(res, 400, { error: 'Invalid cursor' });
    const [time, id] = cursor.split(':').map(Number);
    before = { time, id };
  }
  const page = getAnnouncementHistory(db, before);
  const entries = page.items.map(item => ({ ...item, type: 'announcement' }));
  addAnnouncementCovers(entries, null);
  res.setHeader('Cache-Control', 'no-store');
  send(res, 200, { items: entries, next: page.next });
}

module.exports = { handleAnnouncementHistory };
