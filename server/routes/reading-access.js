'use strict';

const { bookSources, readingAccess } = require('../db');
const { authenticate, send, readBody, isRequestImpersonating, isLocalhostReal } = require('../request-helpers');
const { userBadgePush } = require('../sse');
const { setReadingImageCookie } = require('../reading-images');

function handleAdminBookSources(req, res) {
  if (!isLocalhostReal(req)) return send(res, 403, { error: 'Forbidden' });
  send(res, 200, bookSources.list(readingAccess.deniedBookIds(null)));
}

async function handleAdminSetBookSource(req, res, bookId) {
  if (!isLocalhostReal(req)) return send(res, 403, { error: 'Forbidden' });
  const result = bookSources.save(bookId, await readBody(req), { onlyNew: req.headers['if-none-match'] === '*' });
  const status = { not_found: 404, source_exists: 412 }[result.error] ?? (result.error ? 400 : 200);
  send(res, status, result);
}

async function handleReadingAccess(req, res, bookId, purchase = false) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  if (purchase && isRequestImpersonating(req)) return send(res, 403, { error: 'forbidden' });
  const body = purchase ? await readBody(req) : null;
  if (purchase && (!Number.isSafeInteger(body?.expectedCost) || body.expectedCost < 0)) return send(res, 400, { error: 'invalid_cost' });
  const result = purchase ? readingAccess.unlock(userId, bookId, body.expectedCost) : readingAccess.getAccess(userId, bookId);
  if (!result) return send(res, 404, { error: 'not_found' });
  if (result.error) return send(res, result.error === 'not_found' ? 404 : 403, result);
  if (!purchase) {
    setReadingImageCookie(req, res);
    const source = bookSources.get(bookId);
    if (source) {
      result.sourceLink = source.url;
      result.sourceKind = source.kind;
    }
  }
  send(res, 200, result);
  if (purchase && result.cost > 0 && !result.alreadyUnlocked) userBadgePush(userId);
}

async function handleReadingMatter(req, res, bookId) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = readingAccess.getReadingMatter(userId, bookId);
  if (!result) return send(res, 404, { error: 'not_found' });
  setReadingImageCookie(req, res);
  send(res, 200, result);
}

module.exports = { handleAdminBookSources, handleAdminSetBookSource, handleReadingAccess, handleReadingMatter };
