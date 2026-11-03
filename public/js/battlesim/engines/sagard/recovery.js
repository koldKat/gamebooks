// Calculate recovery from manually held Sagard items using the current book's rules.
export function validateSagardRecoveryRules(rules) {
  if (rules.healingAmounts == null) return;
  const amounts = rules.healingAmounts;
  if (typeof amounts !== 'object' || Array.isArray(amounts)) throw new RangeError('Invalid recovery rules');
  for (const [item, amount] of Object.entries(amounts)) {
    if (!['fang', 'moss', 'spiritLuck'].includes(item)
        || (amount !== 'full' && (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000))) {
      throw new RangeError('Invalid recovery amount');
    }
  }
}

export function sagardHealedHp(fight, item) {
  validateSagardRecoveryRules(fight.rules);
  const amount = fight.rules.healingAmounts?.[item] ?? 'full';
  return amount === 'full' ? fight.hero.maxHp : Math.min(fight.hero.maxHp, fight.hero.hp + amount);
}
