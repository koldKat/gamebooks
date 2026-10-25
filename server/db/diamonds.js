'use strict';

const hasDiamondAccess = userId => Number.isSafeInteger(Number(userId)) && Number(userId) > 0;

// An event adds 1,000 units plus one per free/purchased bonus (0.1%).
// A diamond costs 1,000,000 units. Integer carry keeps upgrades prospective.
function initializeDiamondBalances(db) {
  db.transaction(() => {
    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name));
    for (const column of ['bonus_diamond_dig_purchased', 'bonus_diamond_exchange_purchased']) {
      if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    }
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_diamonds'").get()) {
      db.exec(`
        CREATE TABLE user_diamonds (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          qualifying_events INTEGER NOT NULL DEFAULT 0 CHECK (qualifying_events >= 0)
        );
        INSERT INTO user_diamonds (user_id, qualifying_events)
          SELECT user_id, COUNT(*) FROM xp_events
          WHERE event != 'idle_heartbeat' GROUP BY user_id;
      `);
    }
    const columns = new Set(db.prepare('PRAGMA table_info(user_diamonds)').all().map(row => row.name));
    if (!columns.has('diamonds_earned')) {
      // Preserve existing diamonds and the unboosted remainder exactly.
      db.exec(`
        ALTER TABLE user_diamonds ADD COLUMN diamonds_earned INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE user_diamonds ADD COLUMN dig_progress INTEGER NOT NULL DEFAULT 0;
        UPDATE user_diamonds SET diamonds_earned = qualifying_events / 1000,
          dig_progress = (qualifying_events % 1000) * 1000;
        DROP TRIGGER IF EXISTS count_diamond_xp_event;
      `);
    }
    if (!columns.has('diamonds_spent')) db.exec('ALTER TABLE user_diamonds ADD COLUMN diamonds_spent INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('diamonds_bought')) db.exec('ALTER TABLE user_diamonds ADD COLUMN diamonds_bought INTEGER NOT NULL DEFAULT 0');
    db.exec(`CREATE TABLE IF NOT EXISTS diamond_exchanges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      diamonds INTEGER NOT NULL CHECK (diamonds > 0),
      rate INTEGER NOT NULL CHECK (rate > 0),
      gold_coins INTEGER NOT NULL CHECK (gold_coins > 0),
      direction TEXT NOT NULL DEFAULT 'sell' CHECK (direction IN ('sell','buy')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, request_id)
    )`);
    if (!db.prepare('PRAGMA table_info(diamond_exchanges)').all().some(column => column.name === 'direction')) {
      db.exec("ALTER TABLE diamond_exchanges ADD COLUMN direction TEXT NOT NULL DEFAULT 'sell'");
    }
    db.exec(`CREATE TABLE IF NOT EXISTS diamond_market (
      id INTEGER PRIMARY KEY CHECK(id=1), diamonds INTEGER NOT NULL CHECK(diamonds>=0));
      INSERT OR IGNORE INTO diamond_market(id,diamonds)
        SELECT 1,MAX(0,COALESCE(SUM(CASE WHEN direction='sell' THEN diamonds ELSE -diamonds END),0))
        FROM diamond_exchanges;`);
    if (!db.prepare('PRAGMA table_info(diamond_market)').all().some(column => column.name === 'dig_events')) {
      db.exec(`ALTER TABLE diamond_market ADD COLUMN dig_events INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE diamond_market ADD COLUMN diamonds_mined INTEGER NOT NULL DEFAULT 0;
        UPDATE diamond_market SET dig_events=(SELECT COUNT(*) FROM xp_events WHERE event!='idle_heartbeat');
        UPDATE diamond_market SET diamonds=diamonds+dig_events/10000,diamonds_mined=dig_events/10000;`);
    }
    db.exec(`CREATE TRIGGER IF NOT EXISTS count_market_diamond_xp_event AFTER INSERT ON xp_events
      WHEN NEW.event!='idle_heartbeat' BEGIN
        UPDATE diamond_market SET diamonds=diamonds+(dig_events+1)/10000-dig_events/10000,
          diamonds_mined=diamonds_mined+(dig_events+1)/10000-dig_events/10000,
          dig_events=dig_events+1 WHERE id=1;
      END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS count_diamond_xp_event AFTER INSERT ON xp_events
        WHEN NEW.event != 'idle_heartbeat'
        BEGIN
          INSERT INTO user_diamonds (user_id) VALUES (NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
          UPDATE user_diamonds SET qualifying_events = qualifying_events + 1,
            diamonds_earned = diamonds_earned + (dig_progress + rate.units) / 1000000,
            dig_progress = (dig_progress + rate.units) % 1000000
          FROM (SELECT 1000 + level + MIN(purchased, level) AS units FROM (
            SELECT CAST((sqrt(1 + 8 * MAX(xp, 0) / 1000.0) - 1) / 2 AS INTEGER) AS level,
              bonus_diamond_dig_purchased AS purchased FROM users WHERE id = NEW.user_id
          )) AS rate WHERE user_id = NEW.user_id;
        END;
    `);
  }).immediate();
}

function diamondInfoForUser(userId, row, level) {
  if (!hasDiamondAccess(userId)) return {};
  const jobLevel = Math.floor((-1 + Math.sqrt(1 + 8 * (row?.job_xp || 0) / 1000)) / 2);
  const dig = Math.min(row?.bonus_diamond_dig_purchased || 0, jobLevel);
  return {
    diamondsEarned: row?.diamonds_earned || 0,
    diamondsBalance: (row?.diamonds_earned || 0) + (row?.diamonds_bought || 0) - (row?.diamonds_spent || 0),
    diamondsExchanged: row?.diamonds_spent || 0,
    diamondsBought: row?.diamonds_bought || 0,
    diamondDigPurchased: row?.bonus_diamond_dig_purchased || 0,
    diamondExchangePurchased: row?.bonus_diamond_exchange_purchased || 0,
    diamondDigPct: (jobLevel + dig) * 0.1,
    diamondEventsPerDiamond: 1000000 / (1000 + jobLevel + dig),
    diamondExchangeRate: level,
    diamondBuyRate: level,
    diamondPurchaseStock: row?.diamond_purchase_stock || 0,
  };
}

module.exports = { initializeDiamondBalances, hasDiamondAccess, diamondInfoForUser };
