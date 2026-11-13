'use strict';

// Reconcile purchases once after the undo/fast-travel level schedule changes.
function reconcileRunAllowancePurchases(db, computeLevel) {
  return db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS run_allowance_migrations (
      name TEXT PRIMARY KEY, created_at INTEGER NOT NULL DEFAULT(unixepoch()));
      CREATE TABLE IF NOT EXISTS run_allowance_refunds (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item TEXT NOT NULL CHECK(item IN ('undo','fast_travel')),
        level INTEGER NOT NULL, purchased_before INTEGER NOT NULL, purchased_after INTEGER NOT NULL,
        gold_coins INTEGER NOT NULL CHECK(gold_coins>=0),
        created_at INTEGER NOT NULL DEFAULT(unixepoch()), PRIMARY KEY(user_id,item));`);
    const name = 'purchases-levels-10-through-100-v1';
    if (db.prepare('SELECT 1 FROM run_allowance_migrations WHERE name=?').get(name)) return [];
    const definitions = db.prepare("SELECT id,col,cost,step_cost FROM shop_items WHERE id IN ('undo','fast_travel')").all();
    if (definitions.length !== 2) throw Error('Missing undo/fast-travel shop prices');
    const refunds = [];
    for (const user of db.prepare('SELECT id,xp,bonus_undos,bonus_fast_travels FROM users').all()) {
      const level = computeLevel(user.xp), cap = Math.min(10, Math.max(0, Math.floor(level / 10)));
      for (const definition of definitions) {
        if (!['bonus_undos','bonus_fast_travels'].includes(definition.col)) throw Error('Unexpected shop column');
        const current = user[definition.col] || 0;
        if (current <= cap) continue;
        const refund = definition.step_cost != null
          ? definition.step_cost * (current * (current + 1) - cap * (cap + 1)) / 2
          : definition.cost * (current - cap);
        if (!Number.isSafeInteger(refund) || refund < 0) throw Error('Invalid refund');
        const row = db.prepare('SELECT coins_spent FROM users WHERE id=?').get(user.id);
        const spentReduction = Math.min(row.coins_spent, refund);
        db.prepare(`UPDATE users SET ${definition.col}=?,coins_spent=coins_spent-?,bonus_coins=bonus_coins+? WHERE id=?`)
          .run(cap, spentReduction, refund - spentReduction, user.id);
        db.prepare('INSERT INTO run_allowance_refunds(user_id,item,level,purchased_before,purchased_after,gold_coins) VALUES(?,?,?,?,?,?)')
          .run(user.id, definition.id, level, current, cap, refund);
        refunds.push({userId:user.id,item:definition.id,level,purchasedBefore:current,purchasedAfter:cap,goldCoins:refund});
      }
    }
    db.prepare('INSERT INTO run_allowance_migrations(name) VALUES(?)').run(name);
    return refunds;
  }).immediate();
}

module.exports = {reconcileRunAllowancePurchases};
