// Serializable, round-scoped effects shared by combat and ability actions.
export const hasDestinyAbility = (fight, name) => (fight.abilities?.[name] || 0) > 0;

export function destinyStat(fight, target, attribute) {
  const actor = target === 'hero' ? fight.hero : fight.opponents[target];
  let value = actor[attribute];
  if (fight.status !== 'active') return value;
  for (const effect of fight.effects) {
    if (effect.kind !== 'stat' || effect.target !== target || effect.attribute !== attribute ||
        fight.round < effect.from || fight.round > effect.until) continue;
    if (effect.set !== undefined) value = effect.set;
    else value += effect.amount;
  }
  if (target === 'hero' && attribute === 'speed' && hasDestinyAbility(fight, 'blood-frenzy') &&
      fight.effects.some(effect => effect.kind === 'bleed' && fight.opponents[effect.target]?.health > 0)) value++;
  return Math.max(0, value);
}

export function addDestinyStatEffect(fight, target, attribute, amount, duration, source, delay = 0) {
  const from = fight.round + delay;
  fight.effects.push({ kind: 'stat', target, attribute, amount, from,
    until: duration === null ? Number.MAX_SAFE_INTEGER : from + duration - 1, source });
}

export function healDestinyHero(fight, amount) {
  if (fight.hero.health <= 0) return 0;
  const restored = Math.min(amount, fight.hero.maxHealth - fight.hero.health);
  fight.hero.health += restored;
  return restored;
}

export function destinyDamageScore(fight) {
  const hero = fight.turn.winner === 'hero';
  const target = hero ? 'hero' : fight.target;
  const attacker = hero ? fight.hero : fight.opponents[target];
  const power = hero ? fight.turn.damageUsesBrawn ? destinyStat(fight, target, 'brawn') : Math.max(destinyStat(fight, target, 'brawn'), destinyStat(fight, target, 'magic'))
    : destinyStat(fight, target, attacker.damageStat);
  const perDie = (fight.turn.damagePerDie || 0) + (hero ?
    fight.effects.filter(effect => ['score-per-die', 'damage-per-die'].includes(effect.kind) && effect.from <= fight.round && effect.until >= fight.round)
      .reduce((total, effect) => total + effect.amount, 0) : 0);
  const dice = fight.turn.damageDice.reduce((total, face, index) => total + face + perDie +
    (fight.turn.damageDieBonuses?.[index] || 0) +
    (hero && face === 6 && hasDestinyAbility(fight, 'mangle') ? 2 : 0), 0);
  const bonus = fight.effects.filter(effect => effect.kind === 'score-flat' && effect.hero === hero &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((total, effect) => total + effect.amount, 0);
  return dice + power + bonus + (fight.turn.damageScoreBonus || 0);
}

export function destinyOnHeroHit(fight, target, damage, kind = 'score') {
  if (damage <= 0 || !['score', 'dice', 'first-strike'].includes(kind)) return;
  for (const [ability, amount, delay] of [['bleed', 1, 0], ['disease', 2, 1]]) {
    if (!hasDestinyAbility(fight, ability) || fight.effects.some(effect => effect.kind === ability && effect.target === target)) continue;
    fight.effects.push({ kind: ability, target, amount, from: fight.round + delay, until: Number.MAX_SAFE_INTEGER });
  }
  if (kind === 'score' && fight.turn.damageDice?.includes(6) && hasDestinyAbility(fight, 'ice-edge')) {
    addDestinyStatEffect(fight, target, 'speed', -1, 1, 'ice-edge', 1);
  }
}

export function destinyStrike(fight, target, amount, source, kind = 'dice') {
  const opponent = fight.opponents[target];
  if (!opponent || opponent.health <= 0) throw new RangeError('Choose a living opponent');
  const lost = Math.min(opponent.health, amount);
  opponent.health -= lost;
  destinyOnHeroHit(fight, target, lost, kind);
  fight.turn.lastHeroDamage ??= {};
  fight.turn.lastHeroDamage[target] = (fight.turn.lastHeroDamage[target] || 0) + lost;
  if (opponent.health === 0) {
    fight.turn.deaths.push(target);
    if (kind === 'passive') fight.turn.pendingPassiveDeath = true;
  }
  fight.history.push({ type: 'ability-damage', round: fight.round, target, damage: lost, source });
  return lost;
}

export function rollDestinyDamageDice(fight, count, roll, unmodified = false) {
  const bonus = unmodified ? 0 : fight.effects.filter(effect => effect.kind === 'damage-per-die' &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((total, effect) => total + effect.amount, 0);
  let total = 0;
  for (let i = 0; i < count; i++) {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    total += value + bonus;
  }
  return total;
}

export function destinyPassiveEffects(fight, roll) {
  const result = [];
  for (const name of ['barbs', 'decay', 'thorns']) {
    if (!hasDestinyAbility(fight, name)) continue;
    fight.opponents.forEach((opponent, target) => {
      if (opponent.health > 0) result.push({ target, amount: 1, ignoreArmour: true, source: name });
    });
  }
  if (fight.powerTotemActive) fight.opponents.forEach((opponent, target) => {
    if (opponent.health > 0) result.push({ target, amount: 1, ignoreArmour: true, source: 'power-totem' });
  });
  for (const effect of fight.effects) {
    if (!['bleed', 'disease', 'ongoing-damage', 'delayed-dice'].includes(effect.kind) ||
        fight.round < effect.from || fight.round > effect.until || fight.opponents[effect.target]?.health <= 0) continue;
    let amount = effect.amount;
    if (effect.kind === 'bleed') amount += fight.bleedBonus || 0;
    if (effect.kind === 'delayed-dice') {
      amount = rollDestinyDamageDice(fight, 1, roll);
    }
    result.push({ target: effect.target, amount, ignoreArmour: true, source: effect.source || effect.kind });
  }
  return result;
}

export function destinyPassiveProtection(fight, amount) {
  if (fight.effects.some(effect => effect.kind === 'freeze' && fight.round >= effect.from && fight.round <= effect.until)) return 0;
  return amount;
}
