'use strict';

// Diamonds count recorded XP events, regardless of their XP amount. Heartbeats
// are excluded. Keep earned progress when a book (and its XP log) is deleted.
function initializeDiamondBalances(db) {
  db.transaction(() => {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_diamonds'").get()) return;
    db.exec(`
      CREATE TABLE user_diamonds (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        qualifying_events INTEGER NOT NULL DEFAULT 0 CHECK (qualifying_events >= 0)
      );
      INSERT INTO user_diamonds (user_id, qualifying_events)
        SELECT user_id, COUNT(*) FROM xp_events
        WHERE event != 'idle_heartbeat' GROUP BY user_id;
      CREATE TRIGGER count_diamond_xp_event AFTER INSERT ON xp_events
        WHEN NEW.event != 'idle_heartbeat'
        BEGIN
          INSERT INTO user_diamonds (user_id, qualifying_events) VALUES (NEW.user_id, 1)
          ON CONFLICT(user_id) DO UPDATE SET qualifying_events = qualifying_events + 1;
        END;
    `);
  })();
}

module.exports = { initializeDiamondBalances };
