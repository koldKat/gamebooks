'use strict';

function initializeHeartbeatCoins(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_heartbeat_coins (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    heartbeat_count INTEGER NOT NULL DEFAULT 0 CHECK(heartbeat_count>=0),
    last_minute INTEGER NOT NULL DEFAULT -1
  )`);
}

function advanceHeartbeatCoins(db, userId, minute) {
  return db.transaction(() => {
    const row = db.prepare(`INSERT INTO user_heartbeat_coins(user_id,heartbeat_count,last_minute) VALUES(?,1,?)
      ON CONFLICT(user_id) DO UPDATE SET heartbeat_count=heartbeat_count+1,last_minute=excluded.last_minute
      WHERE excluded.last_minute>last_minute RETURNING heartbeat_count`).get(userId, minute);
    if (!row) return false;
    if (row.heartbeat_count % 10000 === 0) {
      db.prepare("INSERT INTO coin_events(user_id,event,ref,amount) VALUES(?,'heartbeat_conversion',?,1)")
        .run(userId, String(row.heartbeat_count / 10000));
      db.prepare('UPDATE users SET bonus_coins=bonus_coins+1 WHERE id=?').run(userId);
    }
    return true;
  }).immediate();
}

module.exports = { initializeHeartbeatCoins, advanceHeartbeatCoins };
