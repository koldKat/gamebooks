'use strict';

// Mine alternating shared-market gems from the combined current player levels.
function initializePlayerLevelMarketGems(db) {
  const level = row => `CAST((-1 + SQRT(1 + 8.0 * MAX(0, COALESCE(${row}.xp, 0)) / 1000)) / 2 AS INTEGER)`;
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS player_level_market_mining (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      total_levels INTEGER NOT NULL DEFAULT 0 CHECK(total_levels >= 0),
      rubies_mined INTEGER NOT NULL DEFAULT 0 CHECK(rubies_mined >= 0),
      diamonds_mined INTEGER NOT NULL DEFAULT 0 CHECK(diamonds_mined >= 0)
    );
    INSERT OR IGNORE INTO player_level_market_mining (id) VALUES (1);
    CREATE TRIGGER IF NOT EXISTS mine_player_level_market_gems
      AFTER UPDATE OF total_levels ON player_level_market_mining BEGIN
        UPDATE diamond_market SET
          diamonds = diamonds + MAX(0, (NEW.total_levels + 50) / 100 - NEW.rubies_mined),
          diamonds_mined = diamonds_mined + MAX(0, (NEW.total_levels + 50) / 100 - NEW.rubies_mined)
          WHERE id = 1;
        UPDATE ruby_market SET
          rubies = rubies + MAX(0, NEW.total_levels / 100 - NEW.diamonds_mined),
          rubies_generated = rubies_generated + MAX(0, NEW.total_levels / 100 - NEW.diamonds_mined)
          WHERE id = 1;
        UPDATE player_level_market_mining SET
          rubies_mined = MAX(rubies_mined, (NEW.total_levels + 50) / 100),
          diamonds_mined = MAX(diamonds_mined, NEW.total_levels / 100) WHERE id = 1;
      END;
    UPDATE player_level_market_mining SET total_levels =
      (SELECT COALESCE(SUM(${level('users')}), 0) FROM users) WHERE id = 1;
    CREATE TRIGGER IF NOT EXISTS track_player_level_market_update AFTER UPDATE OF xp ON users
      WHEN ${level('NEW')} != ${level('OLD')} BEGIN
        UPDATE player_level_market_mining SET total_levels = total_levels + ${level('NEW')} - ${level('OLD')} WHERE id = 1;
      END;
    CREATE TRIGGER IF NOT EXISTS track_player_level_market_insert AFTER INSERT ON users
      WHEN ${level('NEW')} > 0 BEGIN
        UPDATE player_level_market_mining SET total_levels = total_levels + ${level('NEW')} WHERE id = 1;
      END;
    CREATE TRIGGER IF NOT EXISTS track_player_level_market_delete AFTER DELETE ON users
      WHEN ${level('OLD')} > 0 BEGIN
        UPDATE player_level_market_mining SET total_levels = total_levels - ${level('OLD')} WHERE id = 1;
      END;`);
  }).immediate();
}

module.exports = { initializePlayerLevelMarketGems };
