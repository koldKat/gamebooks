'use strict';

// Shop route handler: XP-boost/undo/fast-travel/heartbeat-XP purchases.

const db = require('../db');
const { exchangeRubies } = require('../db/ruby-exchange');
const { exchangeDiamonds } = require('../db/diamond-exchange');
const { userBadgePush } = require('../sse');
const { authenticate, send, readBody } = require('../request-helpers');

async function handleShopPurchase(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { item } = await readBody(req);
  let result;
  try {
    result = db.purchaseShopItem(userId, item);
  } catch (error) {
    if (!/^SQLITE_BUSY(?:_|$)/.test(error.code || '')) throw error;
    res.setHeader('Retry-After', '2');
    return send(res, 503, { error: 'The shop is busy. Please try again in a moment.' });
  }
  if (result.error === 'invalid_item')        return send(res, 400, { error: 'Invalid item' });
  if (result.error === 'insufficient_coins')  return send(res, 402, { error: 'Not enough gold coins' });
  if (result.error === 'cap_reached') {
    const labels = {
      xp_boost: `XP boost cap reached (${result.cap}% at level ${result.level})`,
      undo: `Undo cap reached (${result.cap} at level ${result.level})`,
      fast_travel: `Fast travel cap reached (${result.cap} at level ${result.level})`,
      heartbeat_xp: `Heartbeat XP cap reached (${result.cap} at level ${result.level})`,
      gc_chance: `Lucky coin chance cap reached (${result.cap} at level ${result.level})`,
      gc_mint: `Coin Mint cap reached (${result.cap} at level ${result.level})`,
      diamond_dig: `Diamond Digging cap reached (${result.cap} at level ${result.level})`,
      diamond_exchange: `Diamond Exchange Rate cap reached (${result.cap} at level ${result.level})`,
    };
    return send(res, 403, { error: (labels[result.item] || 'Cap reached') + '. Level up to increase the cap.' });
  }
  if (result.error === 'not_found')           return send(res, 404, { error: 'Not found' });
  send(res, 200, { ok: true, newBalance: result.newBalance, ...db.getUserXpInfo(userId) });
  userBadgePush(userId);
}

async function handleClaimBonusGc(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const result = db.claimBonusGc(userId);
  if (result.error === 'nothing_to_claim') return send(res, 404, { error: 'Nothing to claim' });
  if (result.error === 'impersonating')    return send(res, 403, { error: 'Not available' });
  send(res, 200, { ok: true, ...db.getUserXpInfo(userId) });
}

async function handleDiamondExchange(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { amount, requestId, expectedRate, direction } = await readBody(req);
  const result = exchangeDiamonds(userId, amount, requestId, expectedRate, direction);
  if (result.error) {
    const messages = {
      unavailable: 'Not available', invalid_amount: 'Enter a whole number of diamonds.',
      invalid_request: 'Invalid exchange request.', not_found: 'Not found',
      insufficient_diamonds: 'Not enough diamonds. Your balance has been refreshed.',
      insufficient_coins: 'Not enough gold coins. Your balance has been refreshed.',
      insufficient_stock: 'Not enough diamonds available to buy. The available stock has been refreshed.',
      rate_changed: 'Your exchange rate changed. Check the updated amount and try again.',
    };
    return send(res, result.error === 'unavailable' ? 403 : 400, {
      error: messages[result.error],
      ...(['rate_changed','insufficient_diamonds','insufficient_coins','insufficient_stock'].includes(result.error) ? { profile: db.getUserXpInfo(userId) } : {}),
    });
  }
  send(res, 200, { ...result, ...db.getUserXpInfo(userId) });
  userBadgePush(userId);
}

async function handleRubyExchange(req, res) {
  const userId = await authenticate(req, res);
  if (userId === null) return;
  const { amount, requestId, expectedRate, direction } = await readBody(req);
  let result;
  try {
    result = exchangeRubies(userId, amount, requestId, expectedRate, direction);
  } catch (error) {
    if (!/^SQLITE_BUSY(?:_|$)/.test(error.code || '')) throw error;
    res.setHeader('Retry-After', '2');
    return send(res, 503, { error: 'The exchange is busy. Please try again in a moment.' });
  }
  if (result.error) {
    const messages = {
      unavailable: 'Not available', invalid_amount: 'Enter a whole number of rubies.',
      invalid_request: 'Invalid exchange request.', not_found: 'Not found',
      insufficient_rubies: 'Not enough rubies. Your balance has been refreshed.',
      insufficient_coins: 'Not enough gold coins. Your balance has been refreshed.',
      insufficient_stock: 'Not enough rubies available to buy. The available stock has been refreshed.',
      rate_changed: 'Your exchange rate changed. Check the updated amount and try again.',
    };
    return send(res, result.error === 'unavailable' ? 403 : 400, {
      error: messages[result.error],
      ...(['rate_changed','insufficient_rubies','insufficient_coins','insufficient_stock'].includes(result.error) ? { profile: db.getUserXpInfo(userId) } : {}),
    });
  }
  send(res, 200, { ...result, ...db.getUserXpInfo(userId) });
  userBadgePush(userId);
}

module.exports = { handleShopPurchase, handleClaimBonusGc, handleDiamondExchange, handleRubyExchange };
