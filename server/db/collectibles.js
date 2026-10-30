'use strict';

// Persist account collections and serialize their item claims.
const items = require('../../public/js/seasonal-events/collectible-items.json');
const calendar = require('../../public/js/seasonal-events/calendar.json');
const { activeSeasons } = require('../../public/js/seasonal-events/schedule');
const { isImpersonatingContext } = require('../impersonation-context');

function initializeCollectibles(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_collectibles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    claimed_at INTEGER,
    claims INTEGER NOT NULL DEFAULT 0 CHECK(claims>=0),
    PRIMARY KEY(user_id,item_id));`);
}

function nextAnniversary(timestamp) {
  const date = new Date(timestamp);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear()+1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.getTime();
}

function createCollectibles(db, { now = Date.now } = {}) {
  const list = db.prepare('SELECT item_id FROM user_collectibles WHERE user_id=? ORDER BY seen_at,item_id');
  const account = db.prepare('SELECT is_admin FROM users WHERE id=?');
  const seen = db.prepare('INSERT OR IGNORE INTO user_collectibles(user_id,item_id,seen_at) VALUES(?,?,?)');
  const item = db.prepare('SELECT claimed_at FROM user_collectibles WHERE user_id=? AND item_id=?');
  const claim = db.prepare('UPDATE user_collectibles SET claimed_at=?,claims=claims+1 WHERE user_id=? AND item_id=?');
  const award = db.prepare(`INSERT INTO user_rubies(user_id,rubies_earned,rubies_collectibles) VALUES(?,1,1)
    ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+1,rubies_collectibles=rubies_collectibles+1`);
  function discover(userId, itemId) {
    if (isImpersonatingContext()) return false;
    if (!Object.hasOwn(items,itemId)) return false;
    const user = account.get(userId);
    if (!user) return false;
    const season = activeSeasons(calendar,new Date(now()))[0]?.id;
    if (user.is_admin !== 1 && items[itemId] !== season) return false;
    return seen.run(userId,itemId,now()).changes === 1;
  }
  const redeem = db.transaction((userId,itemId) => {
    if (isImpersonatingContext() || !Object.hasOwn(items,itemId)) return false;
    const row=item.get(userId,itemId), timestamp=now();
    if (!row || (row.claimed_at !== null && timestamp < nextAnniversary(row.claimed_at))) return false;
    claim.run(timestamp,userId,itemId);
    award.run(userId);
    return true;
  });
  return {
    list: userId=>list.all(userId).map(row=>row.item_id),
    discover,
    claim: (userId,itemId)=>redeem.immediate(userId,itemId),
  };
}

module.exports = { initializeCollectibles, createCollectibles, nextAnniversary };
