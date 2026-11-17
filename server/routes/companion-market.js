'use strict';

// Restrict the companion shop and its trades to real admin accounts.
const { authenticate, readBody, send, isRequestImpersonating } = require('../request-helpers');
const { db } = require('../db/connection');
const { computeLevel, coinBalance, awardCoins } = require('../db/xp');
const { createCompanionMarket } = require('../db/companion-market');
const { userBadgePush } = require('../sse');
let market;
async function handleCompanionMarket(req, res, action) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  res.setHeader('Cache-Control', 'no-store');
  if (isRequestImpersonating(req) || db.prepare('SELECT is_admin FROM users WHERE id=?').get(userId)?.is_admin !== 1)
    return send(res, 403, { error: 'Not available' });
  market ||= createCompanionMarket(db, { computeLevel, coinBalance, awardCoins });
  if (!action) return send(res, 200, market.snapshot(userId));
  const body = await readBody(req);
  const result = action === 'sell' ? market.sell(userId, body.itemId, body.requestId)
    : action === 'cancel' ? market.cancel(userId, body.listingId)
      : market.buy(userId, body.listingId, body.expectedPrice);
  if (result.error) return send(res, 409, result);
  send(res, 200, { ...result, ...market.snapshot(userId) });
  if (!result.repeated) {
    const changed = { type: 'badge_state_changed', companions: true };
    userBadgePush(userId, changed);
    if (result.sellerId) userBadgePush(result.sellerId, changed);
  }
}
module.exports = { handleCompanionMarket };
