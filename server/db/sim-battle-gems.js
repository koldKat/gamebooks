'use strict';

// Award alternating gems for permanent, distinct completed simulator battles.
function initializeSimBattleGems(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS sim_battle_gem_battles (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ref TEXT NOT NULL,
        PRIMARY KEY(user_id,ref));
      CREATE TABLE IF NOT EXISTS sim_battle_gem_totals (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        battles INTEGER NOT NULL DEFAULT 0 CHECK(battles>=0));
      CREATE TABLE IF NOT EXISTS sim_battle_gem_migrations(name TEXT PRIMARY KEY);`);
    let result = { battlesRecorded: 0, rubiesAdded: 0, diamondsAdded: 0 };
    if (!db.prepare("SELECT 1 FROM sim_battle_gem_migrations WHERE name='alternating-v1'").get()) {
      db.exec(`INSERT OR IGNORE INTO sim_battle_gem_battles(user_id,ref)
          SELECT x.user_id,x.ref FROM xp_events x JOIN users u ON u.id=x.user_id
          WHERE x.event IN ('battlesim_win','battlesim_loss') AND x.ref IS NOT NULL AND x.ref!='';
        INSERT INTO sim_battle_gem_totals(user_id,battles)
          SELECT user_id,COUNT(*) FROM sim_battle_gem_battles GROUP BY user_id;
        INSERT INTO user_diamonds(user_id,diamonds_earned)
          SELECT user_id,(battles+50)/100 FROM sim_battle_gem_totals WHERE battles>=50
          ON CONFLICT(user_id) DO UPDATE SET diamonds_earned=diamonds_earned+excluded.diamonds_earned;
        INSERT INTO user_rubies(user_id,rubies_earned)
          SELECT user_id,battles/100 FROM sim_battle_gem_totals WHERE battles>=100
          ON CONFLICT(user_id) DO UPDATE SET rubies_earned=rubies_earned+excluded.rubies_earned;`);
      result = db.prepare(`SELECT COALESCE(SUM(battles),0) AS battlesRecorded,
        COALESCE(SUM((battles+50)/100),0) AS rubiesAdded,
        COALESCE(SUM(battles/100),0) AS diamondsAdded FROM sim_battle_gem_totals`).get();
      db.prepare("INSERT INTO sim_battle_gem_migrations VALUES('alternating-v1')").run();
    }
    // Legacy wallet names are reversed: user_diamonds holds displayed rubies.
    // Existing wallet triggers handle notifications and admin-pool gold.
    db.exec(`CREATE TRIGGER IF NOT EXISTS reward_sim_battle_gems AFTER INSERT ON sim_battle_gem_battles BEGIN
        INSERT INTO sim_battle_gem_totals(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_diamonds(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        INSERT INTO user_rubies(user_id) VALUES(NEW.user_id) ON CONFLICT(user_id) DO NOTHING;
        UPDATE user_diamonds SET diamonds_earned=diamonds_earned+
          (SELECT (battles+51)/100-(battles+50)/100 FROM sim_battle_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE user_rubies SET rubies_earned=rubies_earned+
          (SELECT (battles+1)/100-battles/100 FROM sim_battle_gem_totals WHERE user_id=NEW.user_id)
          WHERE user_id=NEW.user_id;
        UPDATE sim_battle_gem_totals SET battles=battles+1 WHERE user_id=NEW.user_id;
      END;
      CREATE TRIGGER IF NOT EXISTS track_sim_battle_gems AFTER INSERT ON xp_events
        WHEN NEW.event IN ('battlesim_win','battlesim_loss') AND NEW.ref IS NOT NULL AND NEW.ref!='' BEGIN
          INSERT OR IGNORE INTO sim_battle_gem_battles(user_id,ref) VALUES(NEW.user_id,NEW.ref);
        END;`);
    return result;
  }).immediate();
}

module.exports = { initializeSimBattleGems };
