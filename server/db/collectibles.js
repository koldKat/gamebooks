'use strict';

// Persist account collections and serialize their item claims.
const items = require('../../public/js/seasonal-events/collectible-items.json');
const { liveSeasons } = require('../season-selection');
const { isImpersonatingContext } = require('../impersonation-context');
const { canTestCompanions } = require('../companion-access');
const events = require('../../public/js/seasonal-events/calendar.json');
const { availableSeasonWindows, seasonalDay } = require('../../public/js/seasonal-events/schedule');

function collectibleOccurrence(seasonId, timestamp) {
  const event = events.find(event => event.id === seasonId);
  if (!event) return null;
  const day = seasonalDay(new Date(timestamp)), year = new Date(day).getUTCFullYear();
  const today = new Date(day).toISOString().slice(0, 10);
  const window = [year - 1, year, year + 1]
    .flatMap(year => availableSeasonWindows(events, event, year))
    .filter(window => window.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
  return window ? `${seasonId}:${window.center}` : null;
}

function initializeCollectibles(db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS user_collectibles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    claimed_at INTEGER,
    claims INTEGER NOT NULL DEFAULT 0 CHECK(claims>=0),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=0),
    PRIMARY KEY(user_id,item_id));`);
    if (!db.pragma('table_info(user_collectibles)').some(column => column.name === 'quantity')) {
      db.exec('ALTER TABLE user_collectibles ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=0)');
    }
    const existing = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_collectible_occurrences'").get();
    db.exec(`CREATE TABLE IF NOT EXISTS user_collectible_occurrences (
      user_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      occurrence TEXT NOT NULL,
      collected_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,item_id,occurrence),
      FOREIGN KEY(user_id,item_id) REFERENCES user_collectibles(user_id,item_id) ON DELETE CASCADE);`);
    if (!existing) {
      const insert = db.prepare('INSERT INTO user_collectible_occurrences(user_id,item_id,occurrence,collected_at) VALUES(?,?,?,?)');
      for (const row of db.prepare('SELECT user_id,item_id,seen_at FROM user_collectibles').all()) {
        const occurrence = collectibleOccurrence(items[row.item_id], row.seen_at) || `legacy:${row.seen_at}`;
        insert.run(row.user_id, row.item_id, occurrence, row.seen_at);
      }
    }
  }).immediate();
}

function nextAnniversary(timestamp) {
  const date = new Date(timestamp);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear()+1);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.getTime();
}

function createCollectibles(db, { now = Date.now } = {}) {
  const list = db.prepare('SELECT item_id,seen_at,quantity FROM user_collectibles WHERE user_id=? AND quantity>0 ORDER BY seen_at,item_id');
  const account = db.prepare('SELECT * FROM users WHERE id=?');
  const seen = db.prepare('INSERT OR IGNORE INTO user_collectibles(user_id,item_id,seen_at,quantity) VALUES(?,?,?,0)');
  const acquired = db.prepare('INSERT OR IGNORE INTO user_collectible_occurrences(user_id,item_id,occurrence,collected_at) VALUES(?,?,?,?)');
  const occurrenceSeen = db.prepare('SELECT 1 FROM user_collectible_occurrences WHERE user_id=? AND item_id=? AND occurrence=?');
  const increment = db.prepare('UPDATE user_collectibles SET quantity=quantity+1,seen_at=? WHERE user_id=? AND item_id=?');
  const item = db.prepare('SELECT claimed_at,quantity FROM user_collectibles WHERE user_id=? AND item_id=?');
  const claim = db.prepare('UPDATE user_collectibles SET claimed_at=?,claims=claims+1 WHERE user_id=? AND item_id=?');
  const award = db.prepare(`INSERT INTO user_rubies(user_id,rubies_earned,rubies_collectibles) VALUES(?,1,1)
    ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+1,rubies_collectibles=rubies_collectibles+1`);
  const discover = db.transaction((userId, itemId) => {
    if (isImpersonatingContext()) return false;
    if (!Object.hasOwn(items,itemId)) return false;
    const user = account.get(userId);
    if (!user) return false;
    const timestamp = now();
    const season = liveSeasons(new Date(timestamp))[0]?.id;
    if (user.is_admin !== 1 && items[itemId] !== season) return false;
    const occurrence = collectibleOccurrence(items[itemId], timestamp);
    if (!occurrence) return false;
    seen.run(userId,itemId,timestamp);
    if (acquired.run(userId,itemId,occurrence,timestamp).changes !== 1) return false;
    increment.run(timestamp,userId,itemId);
    return true;
  });
  const redeem = db.transaction((userId,itemId) => {
    if (isImpersonatingContext() || !Object.hasOwn(items,itemId)) return false;
    const row=item.get(userId,itemId), timestamp=now();
    if (!row || row.quantity < 1 || (row.claimed_at !== null && timestamp < nextAnniversary(row.claimed_at))) return false;
    claim.run(timestamp,userId,itemId);
    award.run(userId);
    return true;
  });
  return {
    list: userId=>list.all(userId).map(row=>row.item_id),
    collectedAt: userId=>Object.fromEntries(list.all(userId).map(row=>[row.item_id,row.seen_at])),
    quantities: userId=>Object.fromEntries(list.all(userId).map(row=>[row.item_id,row.quantity])),
    isAdmin: userId=>account.get(userId)?.is_admin === 1,
    canTestCompanions: userId=>canTestCompanions(account.get(userId)),
    collectedForOccurrence: (userId,itemId)=>Object.hasOwn(items,itemId)
      && !!occurrenceSeen.get(userId,itemId,collectibleOccurrence(items[itemId],now())),
    discover: (userId,itemId)=>discover.immediate(userId,itemId),
    claim: (userId,itemId)=>redeem.immediate(userId,itemId),
  };
}

module.exports = { initializeCollectibles, createCollectibles, nextAnniversary };
