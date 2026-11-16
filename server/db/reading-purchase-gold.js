'use strict';

// Retain admin-pool receipts from paid reading unlocks, including past purchases.
function initializeReadingPurchaseGold(db) {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS admin_reading_gold (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      received INTEGER NOT NULL CHECK(received >= 0)
    );
    INSERT OR IGNORE INTO admin_reading_gold (id, received)
      SELECT 1, COALESCE(SUM(cost_gc), 0) FROM reading_unlocks;
    CREATE TRIGGER IF NOT EXISTS reading_purchase_admin_gold
      AFTER INSERT ON reading_unlocks WHEN NEW.cost_gc > 0
      BEGIN
        UPDATE admin_reading_gold SET received = received + NEW.cost_gc WHERE id = 1;
      END;`);
  }).immediate();
}

module.exports = { initializeReadingPurchaseGold };
