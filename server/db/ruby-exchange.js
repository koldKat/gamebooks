'use strict';

const { db } = require('./connection');
const { awardCoins, coinBalance } = require('./xp');
const { hasRubyAccess } = require('./rubies');
const { isImpersonatingContext } = require('../impersonation-context');

const exchange = db.transaction((userId, amount, requestId, expectedRate, direction) => {
  const previous = db.prepare('SELECT rubies,rate,gold_coins,direction FROM ruby_exchanges WHERE user_id=? AND request_id=?').get(userId, requestId);
  if (previous) {
    if (previous.rubies !== amount || previous.direction !== direction) return { error: 'invalid_request' };
    return { ok: true, direction, exchanged: amount, goldReceived: direction === 'sell' ? previous.gold_coins : 0,
      goldSpent: direction === 'buy' ? previous.gold_coins : 0, exchangeRate: previous.rate, repeated: true };
  }
  const user = db.prepare('SELECT xp,bonus_coins,coins_spent,bonus_gc_mint_purchased FROM users WHERE id=?').get(userId);
  if (!user) return { error: 'not_found' };
  const rate = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (rate < 1 || expectedRate !== rate) return { error: 'rate_changed' };
  const gold = amount * rate;
  if (!Number.isSafeInteger(gold)) return { error: 'invalid_amount' };
  if (direction === 'buy') {
    if (coinBalance(user) < gold) return { error: 'insufficient_coins' };
    if (!db.prepare('UPDATE ruby_market SET rubies=rubies-? WHERE id=1 AND rubies>=?').run(amount, amount).changes)
      return { error: 'insufficient_stock' };
    db.prepare('UPDATE users SET coins_spent=coins_spent+? WHERE id=?').run(gold, userId);
    db.prepare(`INSERT INTO user_rubies(user_id,rubies_bought) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET rubies_bought=rubies_bought+excluded.rubies_bought`).run(userId, amount);
  } else {
    const spent = db.prepare(`UPDATE user_rubies SET rubies_spent=rubies_spent+?
      WHERE user_id=? AND rubies_earned+rubies_bought-rubies_spent>=?`).run(amount, userId, amount);
    if (!spent.changes) return { error: 'insufficient_rubies' };
    db.prepare('UPDATE ruby_market SET rubies=rubies+? WHERE id=1').run(amount);
  }
  db.prepare('INSERT INTO ruby_exchanges(user_id,request_id,rubies,rate,gold_coins,direction) VALUES(?,?,?,?,?,?)')
    .run(userId, requestId, amount, rate, gold, direction);
  if (direction === 'sell' && !awardCoins(userId, 'ruby_exchange', requestId, gold)) throw Error('Ruby exchange coin award failed');
  return { ok: true, direction, exchanged: amount, goldReceived: direction === 'sell' ? gold : 0,
    goldSpent: direction === 'buy' ? gold : 0, exchangeRate: rate };
});

function exchangeRubies(userId, amount, requestId, expectedRate, direction = 'sell') {
  if (!hasRubyAccess(db, userId) || isImpersonatingContext()) return { error: 'unavailable' };
  if (!Number.isSafeInteger(amount) || amount < 1) return { error: 'invalid_amount' };
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) return { error: 'invalid_request' };
  if (!Number.isSafeInteger(expectedRate) || expectedRate < 1) return { error: 'invalid_request' };
  if (direction !== 'sell' && direction !== 'buy') return { error: 'invalid_request' };
  return exchange.immediate(userId, amount, requestId, expectedRate, direction);
}

module.exports = { exchangeRubies };
