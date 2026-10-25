'use strict';

function migrateJobDigging(db, coinBalance) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS currency_migrations(name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS job_digging_refunds(
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        purchases INTEGER NOT NULL, gold_coins INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT(unixepoch()));`);
    const marker = 'job-digging-v1';
    if (db.prepare('SELECT 1 FROM currency_migrations WHERE name=?').get(marker)) return [];
    const results = [];
    for (const row of db.prepare('SELECT * FROM users WHERE bonus_diamond_dig_purchased>0').all()) {
      const purchases = row.bonus_diamond_dig_purchased;
      const refund = purchases * (purchases + 1) / 2;
      if (!Number.isSafeInteger(purchases) || !Number.isSafeInteger(refund) || row.coins_spent < refund)
        throw Error('Cannot verify old digging purchase costs for user ' + row.id);
      const before = coinBalance(row);
      db.prepare('UPDATE users SET coins_spent=coins_spent-?,bonus_diamond_dig_purchased=0 WHERE id=?').run(refund, row.id);
      const after = coinBalance(db.prepare('SELECT * FROM users WHERE id=?').get(row.id));
      if (after - before !== refund) throw Error('Incorrect digging refund balance');
      db.prepare('INSERT INTO job_digging_refunds(user_id,purchases,gold_coins) VALUES(?,?,?)').run(row.id,purchases,refund);
      db.prepare('INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)').run(row.id,'coin_gain',
        JSON.stringify({ amount: refund, balance: after, reason: 'shop_refund' }));
      results.push({ userId: row.id, purchases, refunded: refund });
    }
    db.prepare("UPDATE shop_items SET step_cost=10 WHERE id='diamond_dig'").run();
    db.prepare('INSERT INTO currency_migrations(name) VALUES(?)').run(marker);
    return results;
  }).immediate();
}

module.exports = { migrateJobDigging };
