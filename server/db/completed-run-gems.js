'use strict';

// Award alternating gems for permanent, distinct completed book runs.
function initializeCompletedRunGems(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS completed_run_gem_runs (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ref TEXT NOT NULL,
        PRIMARY KEY(user_id,ref));
      CREATE TABLE IF NOT EXISTS completed_run_gem_totals (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        runs INTEGER NOT NULL DEFAULT 0 CHECK(runs>=0));
      CREATE TABLE IF NOT EXISTS completed_run_gem_migrations(name TEXT PRIMARY KEY);`);
    let result = { goldRemoved: 0, rubiesAdded: 0, diamondsAdded: 0 };
    if (!db.prepare("SELECT 1 FROM completed_run_gem_migrations WHERE name='alternating-v1'").get()) {
      const lastNotification = db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM notifications').get().n;
      db.exec(`INSERT OR IGNORE INTO completed_run_gem_runs(user_id,ref)
          SELECT x.user_id,x.ref FROM xp_events x JOIN users u ON u.id=x.user_id
          WHERE x.event IN ('win_run','death_run','battle_run');
        INSERT INTO completed_run_gem_totals(user_id,runs)
          SELECT user_id,COUNT(*) FROM completed_run_gem_runs GROUP BY user_id;
        INSERT INTO user_diamonds(user_id,diamonds_earned)
          SELECT user_id,(runs+50)/100 FROM completed_run_gem_totals WHERE runs>=50
          ON CONFLICT(user_id) DO UPDATE SET diamonds_earned=diamonds_earned+excluded.diamonds_earned;
        INSERT INTO user_rubies(user_id,rubies_earned)
          SELECT user_id,runs/100 FROM completed_run_gem_totals WHERE runs>=100
          ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+excluded.rubies_earned;`);
      const totals = db.prepare(`SELECT COALESCE(SUM((runs+50)/100),0) AS rubiesAdded,
        COALESCE(SUM(runs/100),0) AS diamondsAdded FROM completed_run_gem_totals`).get();
      result = { ...result, ...totals };
      const awards = db.prepare(`SELECT c.user_id,SUM(c.amount) AS amount FROM coin_events c
        JOIN users u ON u.id=c.user_id WHERE c.event='runs_milestone' GROUP BY c.user_id`).all();
      for (const { user_id, amount } of awards) {
        db.prepare('UPDATE users SET bonus_coins=bonus_coins-? WHERE id=?').run(amount,user_id);
        db.prepare("INSERT INTO coin_events(user_id,event,ref,amount) VALUES(?,'runs_milestone_reversal','alternating-v1',?)")
          .run(user_id,-amount);
        result.goldRemoved += amount;
      }
      // Wallet triggers may create ordinary gem notices. This historical
      // conversion is explicitly silent; preserve all earlier notifications.
      db.prepare("DELETE FROM notifications WHERE rowid>? AND type IN ('diamond_gain','ruby_gain')").run(lastNotification);
      db.prepare("INSERT INTO completed_run_gem_migrations VALUES('alternating-v1')").run();
    }
    // Legacy wallet names are reversed: user_diamonds holds displayed rubies.
    db.exec(`CREATE TRIGGER IF NOT EXISTS reward_completed_run_gems AFTER INSERT ON completed_run_gem_runs BEGIN
        INSERT INTO completed_run_gem_totals(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_rubies(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_diamonds SET diamonds_earned=diamonds_earned+
          (SELECT (runs+51)/100-(runs+50)/100 FROM completed_run_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE user_rubies SET rubies_earned=rubies_earned+
          (SELECT (runs+1)/100-runs/100 FROM completed_run_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE completed_run_gem_totals SET runs=runs+1 WHERE user_id=NEW.user_id;
      END;
      CREATE TRIGGER IF NOT EXISTS track_completed_run_gems AFTER INSERT ON xp_events
        WHEN NEW.event IN ('win_run','death_run','battle_run') BEGIN
          INSERT OR IGNORE INTO completed_run_gem_runs(user_id,ref) VALUES(NEW.user_id,NEW.ref);
        END;`);
    return result;
  }).immediate();
}

module.exports = { initializeCompletedRunGems };
