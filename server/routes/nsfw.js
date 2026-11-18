'use strict';

// Serve public content classifications and let gamemasters maintain book labels.
const database = require('../db');
const { db } = require('../db/connection');
const { getNsfwCatalog } = require('../db/nsfw');
const { authenticate, send, readBody } = require('../request-helpers');
const { publicCatalogPush, feedPush } = require('../sse');

function handleNsfwCatalog(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return send(res, 200, getNsfwCatalog(db));
}

async function handleSetBookNsfw(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (!database.isUserAdmin(userId)) return send(res, 403, { error: 'Gamemaster access required' });
  if (req.method === 'GET') {
    const book = db.prepare('SELECT is_nsfw FROM books WHERE id = ?').get(bookId);
    return book ? send(res, 200, { isNsfw: !!book.is_nsfw }) : send(res, 404, { error: 'Not found' });
  }
  const { isNsfw } = await readBody(req);
  if (typeof isNsfw !== 'boolean') return send(res, 400, { error: 'isNsfw must be a boolean' });
  const result = db.prepare('UPDATE books SET is_nsfw = ? WHERE id = ?').run(isNsfw ? 1 : 0, bookId);
  if (!result.changes) return send(res, 404, { error: 'Not found' });
  publicCatalogPush({ type: 'public_catalog_changed', entity: 'book', id: bookId, action: 'update' });
  feedPush({ type: 'feed_changed', entity: 'book', id: bookId, action: 'update' });
  return send(res, 200, { ok: true, isNsfw });
}

module.exports = { handleNsfwCatalog, handleSetBookNsfw };
