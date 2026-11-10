'use strict';

// Credit the admin pool for crystal generation, independently of trades and stock.
function initializeAdminCrystalGold(db) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS admin_crystal_gold (
      id INTEGER PRIMARY KEY CHECK(id=1),
      generated INTEGER NOT NULL CHECK(generated>=0));
      INSERT OR IGNORE INTO admin_crystal_gold(id,generated)
        SELECT 1,
          COALESCE((SELECT SUM(diamonds_earned) FROM user_diamonds),0)
          +COALESCE((SELECT SUM(rubies_earned) FROM user_rubies),0)
          +COALESCE((SELECT SUM(diamonds_mined) FROM diamond_market),0)
          +COALESCE((SELECT SUM(rubies_generated) FROM ruby_market),0);`);
    for (const [table, column] of [
      ['user_diamonds', 'diamonds_earned'], ['user_rubies', 'rubies_earned'],
      ['diamond_market', 'diamonds_mined'], ['ruby_market', 'rubies_generated'],
    ]) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS admin_crystal_gold_${table}_insert
        AFTER INSERT ON ${table} WHEN NEW.${column}!=0 BEGIN
          UPDATE admin_crystal_gold SET generated=generated+NEW.${column} WHERE id=1;
        END;
        CREATE TRIGGER IF NOT EXISTS admin_crystal_gold_${table}_update
        AFTER UPDATE OF ${column} ON ${table} WHEN NEW.${column}!=OLD.${column} BEGIN
          UPDATE admin_crystal_gold SET generated=generated+NEW.${column}-OLD.${column} WHERE id=1;
        END;`);
    }
    return db.prepare('SELECT generated FROM admin_crystal_gold WHERE id=1').get().generated;
  }).immediate();
}

module.exports = { initializeAdminCrystalGold };
