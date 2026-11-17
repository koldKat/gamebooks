'use strict';

// Hold spare companions in escrow and transfer ownership and gold atomically.
const items = require('../../public/js/seasonal-events/collectible-items.json');
const { isImpersonatingContext } = require('../impersonation-context');
const { canTestCompanions } = require('../companion-access');

function initializeCompanionMarket(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS companion_listings (
    id INTEGER PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','sold','cancelled')),
    created_at INTEGER NOT NULL,
    buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    price INTEGER,
    closed_at INTEGER,
    UNIQUE(seller_id,request_id));
    CREATE INDEX IF NOT EXISTS companion_listings_open ON companion_listings(status,item_id,id);`);
}

function createCompanionMarket(db, { computeLevel, coinBalance, awardCoins, now = Date.now }) {
  const user = db.prepare('SELECT * FROM users WHERE id=?');
  const authorized = id => canTestCompanions(user.get(id)) && !isImpersonatingContext();
  const quantities = db.prepare('SELECT item_id,quantity FROM user_collectibles WHERE user_id=? AND quantity>0');
  const listing = db.prepare('SELECT * FROM companion_listings WHERE id=?');
  const fail = error => ({ error });
  function snapshot(userId) {
    if (!authorized(userId)) return fail('unavailable');
    const account = user.get(userId), price = computeLevel(account.xp);
    return {
      price, coinsBalance: coinBalance(account),
      sellable: quantities.all(userId).filter(row => row.quantity > 1)
        .map(row => ({ itemId: row.item_id, quantity: row.quantity - 1 })),
      buying: db.prepare(`SELECT item_id AS itemId,MIN(id) AS listingId,COUNT(*) AS quantity
        FROM companion_listings l WHERE status='open' AND seller_id!=?
        AND NOT EXISTS(SELECT 1 FROM user_collectibles c
          WHERE c.user_id=? AND c.item_id=l.item_id AND c.quantity>0)
        GROUP BY item_id ORDER BY MIN(id)`).all(userId, userId),
      listings: db.prepare(`SELECT id,item_id AS itemId,created_at AS listedAt
        FROM companion_listings WHERE seller_id=? AND status='open' ORDER BY id DESC`).all(userId),
    };
  }
  const sell = db.transaction((userId, itemId, requestId) => {
    if (!authorized(userId)) return fail('unavailable');
    if (!Object.hasOwn(items, itemId) || typeof requestId !== 'string'
      || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) return fail('invalid_request');
    const previous = db.prepare('SELECT id,item_id FROM companion_listings WHERE seller_id=? AND request_id=?').get(userId, requestId);
    if (previous) return previous.item_id === itemId ? { ok: true, listingId: previous.id, repeated: true } : fail('invalid_request');
    if (!db.prepare('UPDATE user_collectibles SET quantity=quantity-1 WHERE user_id=? AND item_id=? AND quantity>1')
      .run(userId, itemId).changes) return fail('last_copy');
    const result = db.prepare('INSERT INTO companion_listings(seller_id,item_id,request_id,created_at) VALUES(?,?,?,?)')
      .run(userId, itemId, requestId, now());
    return { ok: true, listingId: Number(result.lastInsertRowid) };
  });
  const cancel = db.transaction((userId, id) => {
    if (!authorized(userId)) return fail('unavailable');
    const row = listing.get(id);
    if (!row || row.seller_id !== userId) return fail('not_found');
    if (row.status === 'cancelled') return { ok: true, repeated: true };
    if (row.status !== 'open') return fail('unavailable');
    if (!db.prepare('UPDATE user_collectibles SET quantity=quantity+1 WHERE user_id=? AND item_id=?')
      .run(userId, row.item_id).changes) throw Error('Missing escrow owner');
    db.prepare("UPDATE companion_listings SET status='cancelled',closed_at=? WHERE id=?").run(now(), id);
    return { ok: true };
  });
  const buy = db.transaction((userId, id, expectedPrice) => {
    if (!authorized(userId)) return fail('unavailable');
    const account = user.get(userId), price = computeLevel(account.xp);
    if (price < 1) return fail('level_zero');
    const row = listing.get(id);
    if (!row || row.seller_id === userId) return fail('not_found');
    if (row.status === 'sold' && row.buyer_id === userId) return { ok: true, repeated: true, sellerId: row.seller_id, price: row.price };
    if (row.status !== 'open') return fail('unavailable');
    if (!Number.isSafeInteger(expectedPrice) || expectedPrice !== price) return fail('price_changed');
    if (db.prepare('SELECT 1 FROM user_collectibles WHERE user_id=? AND item_id=? AND quantity>0').get(userId, row.item_id)) return fail('already_owned');
    if (coinBalance(account) < price) return fail('insufficient_coins');
    const timestamp = now();
    db.prepare('UPDATE users SET coins_spent=coins_spent+? WHERE id=?').run(price, userId);
    db.prepare(`INSERT INTO user_collectibles(user_id,item_id,seen_at,quantity) VALUES(?,?,?,1)
      ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_collectibles.quantity+1,seen_at=excluded.seen_at`)
      .run(userId, row.item_id, timestamp);
    db.prepare("UPDATE companion_listings SET status='sold',buyer_id=?,price=?,closed_at=? WHERE id=?")
      .run(userId, price, timestamp, id);
    if (!awardCoins(row.seller_id, 'companion_sale', String(id), price)) throw Error('Companion sale payment failed');
    return { ok: true, sellerId: row.seller_id, price };
  });
  return {
    snapshot,
    sell: (...args) => sell.immediate(...args),
    cancel: (userId, id) => Number.isSafeInteger(id) && id > 0 ? cancel.immediate(userId, id) : fail('invalid_request'),
    buy: (userId, id, price) => Number.isSafeInteger(id) && id > 0 ? buy.immediate(userId, id, price) : fail('invalid_request'),
  };
}

module.exports = { initializeCompanionMarket, createCompanionMarket };
