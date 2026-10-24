'use strict';

// Stable storage/API identifiers preserve wallets, request IDs and history:
// diamond_* now displays as rubies; ruby_* now displays as diamonds.
function auditExchangeSales(db) {
  const levelAt = db.prepare(`SELECT json_extract(payload,'$.level') AS level FROM notifications
    WHERE user_id=? AND type='level_up' AND created_at<=?
    ORDER BY created_at DESC,id DESC LIMIT 1`);
  return db.prepare("SELECT * FROM diamond_exchanges WHERE direction='sell' ORDER BY user_id,created_at,request_id").all().map(sale => {
    const level = levelAt.get(sale.user_id, sale.created_at)?.level;
    // Refuse to guess if the historical quote cannot be verified.
    if (!Number.isSafeInteger(level) || level < 1 || level > sale.rate || sale.rate > level * 2 || sale.gold_coins !== sale.diamonds * sale.rate)
      throw Error(`Cannot verify historical gem sale ${sale.user_id}/${sale.request_id}`);
    return { ...sale, level, correction: sale.gold_coins - sale.diamonds * level };
  });
}
function retireExchangeUpgrade(db) {
  return db.transaction(() => {
    db.exec('CREATE TABLE IF NOT EXISTS currency_migrations(name TEXT PRIMARY KEY)');
    if (db.prepare('SELECT 1 FROM currency_migrations WHERE name=?').get('ruby-level-rate-v1')) return [];
    const sales = auditExchangeSales(db); // verify the entire audit before changing any account
    db.exec(`CREATE TABLE currency_sale_adjustments(
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL, original_rate INTEGER NOT NULL, level INTEGER NOT NULL,
      gold_deducted INTEGER NOT NULL, PRIMARY KEY(user_id,request_id))`);
    for (const sale of sales) db.prepare('INSERT INTO currency_sale_adjustments VALUES(?,?,?,?,?)')
      .run(sale.user_id, sale.request_id, sale.rate, sale.level, sale.correction);
    const results = [];
    const users = db.prepare(`SELECT id,bonus_diamond_exchange_purchased AS count FROM users
      WHERE bonus_diamond_exchange_purchased>0 OR id IN(SELECT user_id FROM diamond_exchanges WHERE direction='sell')`).all();
    for (const user of users) {
      const refund = user.count * (user.count + 1) / 2;
      const correction = sales.filter(sale => sale.user_id === user.id).reduce((sum, sale) => sum + sale.correction, 0);
      if (!Number.isSafeInteger(refund) || !Number.isSafeInteger(correction)) throw Error('Invalid currency settlement');
      for (const [event, amount] of [['shop_refund', refund], ['gem_sale_adjustment', -correction]]) {
        if (!amount) continue;
        db.prepare('INSERT INTO coin_events(user_id,event,ref,amount) VALUES(?,?,?,?)')
          .run(user.id, event, 'retired-diamond-exchange-v1', amount);
      }
      const amount = refund - correction;
      db.prepare('UPDATE users SET bonus_coins=bonus_coins+?,bonus_diamond_exchange_purchased=0 WHERE id=?').run(amount, user.id);
      db.prepare('INSERT INTO notifications(user_id,type,payload) VALUES(?,?,?)')
        .run(user.id, 'gem_rate_adjustment', JSON.stringify({ amount, refund, correction }));
      results.push({ userId: user.id, purchases: user.count, goldRefunded: refund, saleCorrection: correction, netGold: amount });
    }
    db.prepare('INSERT INTO currency_migrations(name) VALUES(?)').run('ruby-level-rate-v1');
    return results;
  }).immediate();
}
module.exports = { retireExchangeUpgrade, auditExchangeSales };
