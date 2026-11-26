'use strict';

// Serve public content classifications and let admins and Lorekeepers maintain book labels.
const database = require('../db');
const { db } = require('../db/connection');
const { getNsfwCatalog } = require('../db/nsfw');
const { authenticate, requireLocalhost, send, readBody } = require('../request-helpers');
const { publicCatalogPush, feedPush, userBadgePush } = require('../sse');

function handleNsfwCatalog(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return send(res, 200, getNsfwCatalog(db));
}

async function handleSetBookNsfw(req, res, bookId) {
  return handleSetNsfw(req, res, 'book', bookId);
}

async function handleSetSeriesNsfw(req, res, seriesId) {
  return handleSetNsfw(req, res, 'series', seriesId);
}

async function handleSetNsfw(req, res, entity, id) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (!database.isUserAdmin(userId) && !database.isUserModerator(userId)) {
    return send(res, 403, { error: 'Admin or Lorekeeper access required' });
  }
  return saveNsfw(req, res, entity, id);
}

async function handleAdminSetBookNsfw(req, res, bookId) {
  if (!requireLocalhost(req, res)) return;
  return saveNsfw(req, res, 'book', bookId);
}

async function saveNsfw(req, res, entity, id) {
  const table = entity === 'series' ? 'series' : 'books';
  if (req.method === 'GET') {
    const book = db.prepare(`SELECT is_nsfw FROM ${table} WHERE id = ?`).get(id);
    return book ? send(res, 200, { isNsfw: !!book.is_nsfw }) : send(res, 404, { error: 'Not found' });
  }
  const { isNsfw } = await readBody(req);
  if (typeof isNsfw !== 'boolean') return send(res, 400, { error: 'isNsfw must be a boolean' });
  const result = db.prepare(`UPDATE ${table} SET is_nsfw = ? WHERE id = ?`).run(isNsfw ? 1 : 0, id);
  if (!result.changes) return send(res, 404, { error: 'Not found' });
  const owners = entity === 'series'
    ? db.prepare('SELECT user_id FROM user_series WHERE series_id = ?').all(id)
    : db.prepare('SELECT user_id FROM user_books WHERE book_id = ?').all(id);
  for (const { user_id: userId } of owners) userBadgePush(userId, { type: 'library_changed' });
  publicCatalogPush({ type: 'public_catalog_changed', entity, id, action: 'update' });
  feedPush({ type: 'feed_changed', entity, id, action: 'update' });
  return send(res, 200, { ok: true, isNsfw });
}

module.exports = { handleNsfwCatalog, handleSetBookNsfw, handleSetSeriesNsfw, handleAdminSetBookNsfw };
