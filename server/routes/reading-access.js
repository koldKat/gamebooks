'use strict';

const { readingAccess } = require('../db');
const { authenticate, send, isRequestImpersonating } = require('../request-helpers');
const { userBadgePush } = require('../sse');
const { setReadingImageCookie } = require('../reading-images');

async function handleReadingAccess(req, res, bookId, purchase = false) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (purchase && isRequestImpersonating(req)) return send(res, 403, { error: 'forbidden' });
  const result = purchase ? readingAccess.unlock(userId, bookId) : readingAccess.getAccess(userId, bookId);
  if (!result) return send(res, 404, { error: 'not_found' });
  if (result.error) return send(res, result.error === 'not_found' ? 404 : 403, result);
  if (!purchase) setReadingImageCookie(req, res);
  send(res, 200, result);
  if (purchase && result.cost > 0 && !result.alreadyUnlocked) userBadgePush(userId);
}

module.exports = { handleReadingAccess };
