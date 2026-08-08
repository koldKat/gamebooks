'use strict';

// Shop route handler: XP-boost/undo/fast-travel/heartbeat-XP purchases.

const db = require('../db');
const { authenticate, send, readBody } = require('../request-helpers');

async function handleShopPurchase(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { item } = await readBody(req);
  const result = db.purchaseShopItem(userId, item);
  if (result.error === 'invalid_item')        return send(res, 400, { error: 'Invalid item' });
  if (result.error === 'insufficient_coins')  return send(res, 402, { error: 'Not enough gold coins' });
  if (result.error === 'cap_reached') {
    const labels = {
      xp_boost: `XP boost cap reached (${result.cap}% at level ${result.level})`,
      undo: `Undo cap reached (${result.cap} at level ${result.level})`,
      fast_travel: `Fast travel cap reached (${result.cap} at level ${result.level})`,
      heartbeat_xp: `Heartbeat XP cap reached (${result.cap} at level ${result.level})`,
      gc_chance: `Lucky coin chance cap reached (${result.cap} at level ${result.level})`,
    };
    return send(res, 403, { error: (labels[result.item] || 'Cap reached') + '. Level up to increase the cap.' });
  }
  if (result.error === 'not_found')           return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true, newBalance: result.newBalance, ...db.getUserXpInfo(userId) });
}

async function handleClaimBonusGc(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.claimBonusGc(userId);
  if (result.error === 'nothing_to_claim') return send(res, 404, { error: 'Nothing to claim' });
  if (result.error === 'impersonating')    return send(res, 403, { error: 'Not available' });
  send(res, 200, { ok: true, ...db.getUserXpInfo(userId) });
}

module.exports = { handleShopPurchase, handleClaimBonusGc };
