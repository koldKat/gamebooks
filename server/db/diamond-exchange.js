'use strict';

const { db } = require('./connection');
const { computeLevel, awardCoins, coinBalance } = require('./xp');
const { hasDiamondAccess } = require('./diamonds');
const { isImpersonatingContext } = require('../impersonation-context');

const exchange = db.transaction((userId, amount, requestId, expectedRate, direction) => {
  const previous = db.prepare('SELECT diamonds,rate,gold_coins,direction FROM diamond_exchanges WHERE user_id=? AND request_id=?').get(userId, requestId);
  if (previous) {
    if (previous.diamonds !== amount || previous.direction !== direction) return { error: 'invalid_request' };
    return { ok: true, direction, exchanged: amount, goldReceived: direction === 'sell' ? previous.gold_coins : 0,
      goldSpent: direction === 'buy' ? previous.gold_coins : 0, exchangeRate: previous.rate, repeated: true };
  }
  const user = db.prepare('SELECT xp,bonus_diamond_exchange_purchased,bonus_coins,coins_spent,bonus_gc_mint_purchased FROM users WHERE id=?').get(userId);
  if (!user) return { error: 'not_found' };
  const level = computeLevel(user.xp);
  const rate = level;
  if (rate < 1 || expectedRate !== rate) return { error: 'rate_changed' };
  const gold = amount * rate;
  if (!Number.isSafeInteger(gold)) return { error: 'invalid_amount' };
  if (direction === 'buy') {
    if (coinBalance(user) < gold) return { error: 'insufficient_coins' };
    if (!db.prepare('UPDATE diamond_market SET diamonds=diamonds-? WHERE id=1 AND diamonds>=?').run(amount, amount).changes)
      return { error: 'insufficient_stock' };
    db.prepare('UPDATE users SET coins_spent=coins_spent+? WHERE id=?').run(gold, userId);
    db.prepare(`INSERT INTO user_diamonds(user_id,diamonds_bought) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET diamonds_bought=diamonds_bought+excluded.diamonds_bought`).run(userId, amount);
  } else {
    const spent = db.prepare(`UPDATE user_diamonds SET diamonds_spent=diamonds_spent+?
      WHERE user_id=? AND diamonds_earned+diamonds_bought-diamonds_spent>=?`).run(amount, userId, amount);
    if (!spent.changes) return { error: 'insufficient_diamonds' };
    db.prepare('UPDATE diamond_market SET diamonds=diamonds+? WHERE id=1').run(amount);
  }
  db.prepare('INSERT INTO diamond_exchanges(user_id,request_id,diamonds,rate,gold_coins,direction) VALUES(?,?,?,?,?,?)')
    .run(userId, requestId, amount, rate, gold, direction);
  if (direction === 'sell' && !awardCoins(userId, 'diamond_exchange', requestId, gold)) throw Error('Diamond exchange coin award failed');
  return { ok: true, direction, exchanged: amount, goldReceived: direction === 'sell' ? gold : 0,
    goldSpent: direction === 'buy' ? gold : 0, exchangeRate: rate };
});

function exchangeDiamonds(userId, amount, requestId, expectedRate, direction = 'sell') {
  if (!hasDiamondAccess(userId) || isImpersonatingContext()) return { error: 'unavailable' };
  if (!Number.isSafeInteger(amount) || amount < 1) return { error: 'invalid_amount' };
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) return { error: 'invalid_request' };
  if (!Number.isSafeInteger(expectedRate) || expectedRate < 1) return { error: 'invalid_request' };
  if (direction !== 'sell' && direction !== 'buy') return { error: 'invalid_request' };
  return exchange.immediate(userId, amount, requestId, expectedRate, direction);
}

module.exports = { exchangeDiamonds };
