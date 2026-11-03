// Resolve database-defined Sagard missile effects without acquiring items or advancing the story.
const number = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError('Invalid missile rule');
  return value;
};

export function validateSagardProjectiles(definitions) {
  if (!Array.isArray(definitions) || definitions.length > 20) throw new RangeError('Invalid missile catalog');
  const ids = new Set();
  for (const rule of definitions) {
    if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(rule.id) || ids.has(rule.id) || !rule.label
        || !['poison', 'knockout', 'fixed'].includes(rule.kind) || !Array.isArray(rule.phases)
        || rule.phases.some(phase => !['prelude', 'round'].includes(phase))) throw new RangeError('Invalid missile rule');
    ids.add(rule.id); number(rule.maxHeld, 1, 1000000); number(rule.shotsPerRound, 1, 100);
    if (rule.kind === 'poison') number(rule.defeatsLevelAtMost, 0, 6);
    if (['poison', 'fixed'].includes(rule.kind)) number(rule.damage, 0, 1000000);
    if (rule.hitDice != null && (!Array.isArray(rule.hitDice) || !rule.hitDice.length
        || new Set(rule.hitDice).size !== rule.hitDice.length || rule.hitDice.some(die => !Number.isInteger(die) || die < 1 || die > 4))) {
      throw new RangeError('Invalid missile dice');
    }
    if (rule.requiresOil != null && typeof rule.requiresOil !== 'boolean') throw new RangeError('Invalid missile condition');
    if (rule.firstRoundOnly != null && typeof rule.firstRoundOnly !== 'boolean') throw new RangeError('Invalid missile round restriction');
  }
  return definitions;
}

export function sagardProjectileRule(fight, item) {
  const base = fight.rules.projectiles?.find(rule => rule.id === item);
  if (!base) throw new RangeError('Unknown missile');
  const rule = {...base, ...fight.encounter.projectileOverrides?.[item], id: base.id};
  validateSagardProjectiles([rule]);
  return rule;
}

export function sagardProjectileEffect(rule, defender, die) {
  const roll = rule.hitDice ? number(die, 1, 4) : null;
  const success = !defender.immortal && (!rule.hitDice || rule.hitDice.includes(roll));
  const knockout = success && (rule.kind === 'knockout'
    || (rule.kind === 'poison' && Number.isInteger(defender.level) && defender.level <= rule.defeatsLevelAtMost));
  return {die: roll, success, knockout, damage: success ? (knockout ? defender.hp : Math.min(defender.hp, rule.damage)) : 0};
}
