'use strict';

const fields = {
  xp_boost: 'xp_boost_pct', heartbeat_xp: 'bonus_heartbeat_xp',
  gc_chance: 'bonus_gc_chance_purchased', gc_mint: 'bonus_gc_mint_purchased',
  diamond_dig: 'bonus_diamond_dig_purchased', diamond_exchange: 'bonus_diamond_exchange_purchased',
  undo: 'bonus_undos', fast_travel: 'bonus_fast_travels',
};
const statNames = ['upgradeXpBoosts', 'upgradeHeartbeatXp', 'upgradeGcChance', 'upgradeGcMint',
  'upgradeDiamondDig', 'upgradeDiamondExchange', 'upgradeUndos', 'upgradeFastTravels'];

function purchaseCounts(row, computeLevel) {
  return Object.fromEntries(Object.entries(fields).map(([id, column]) => [id,
    Math.max(0, (row[column] || 0) - (id === 'xp_boost' ? computeLevel(row.xp || 0) : 0))]));
}

function getShopPurchaseTotals(db, computeLevel) {
  const totals = Object.fromEntries(statNames.map(name => [name, 0]));
  for (const row of db.prepare(`SELECT xp, ${Object.values(fields).join(',')} FROM users`).iterate()) {
    Object.values(purchaseCounts(row, computeLevel)).forEach((count, i) => { totals[statNames[i]] += count; });
  }
  return { ...totals, totalUpgrades: Object.values(totals).reduce((sum, count) => sum + count, 0) };
}

function getShopRefundRows(row, definitions, computeLevel) {
  const counts = purchaseCounts(row, computeLevel);
  return Object.keys(fields).filter(id => counts[id] > 0).map(id => {
    const def = definitions.find(item => item.id === id);
    if (!def) throw Error('Missing shop definition: ' + id);
    const count = counts[id], escalating = id !== 'undo' && id !== 'fast_travel';
    const step = escalating ? 1 : def.step_cost;
    return { id, count, refundOne: step ? step * count : def.cost,
      refundAll: step ? step * count * (count + 1) / 2 : count * def.cost };
  });
}

module.exports = { getShopPurchaseTotals, getShopRefundRows };
