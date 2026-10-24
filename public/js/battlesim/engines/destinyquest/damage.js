import { destinyStat, destinyStrike, addDestinyStatEffect, healDestinyHero } from './effects.js';

const living = fight => fight.opponents.map((opponent, index) => opponent.health > 0 ? index : -1).filter(index => index >= 0);
function target(fight, index) {
  if (!Number.isInteger(index) || !fight.opponents[index] || fight.opponents[index].health <= 0) throw new RangeError('Choose a living opponent');
  return index;
}
export function destinyDie(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
  return value;
}

// Each separately rolled damage group stays separate. A shared cleave roll
// has several targets; aftershock has two independently editable rolls.
export function prepareDestinyDamage(fight, name, spec, options, roll) {
  if (spec.weaken && options.attribute !== undefined && !['brawn', 'magic'].includes(options.attribute)) throw new RangeError('Choose brawn or magic');
  const chosen = options.target ?? fight.target;
  let targets;
  if (spec.hit === 'all' || spec.hit === 'dragon') targets = living(fight);
  else if (spec.hit === 'below') targets = living(fight).filter(index => index >= target(fight, chosen));
  else if (['two', 'adjacent'].includes(spec.hit)) {
    targets = options.targets;
    if (!Array.isArray(targets) || targets.length !== 2 || targets[0] === targets[1]) throw new RangeError('Choose two opponents');
    targets.forEach(index => target(fight, index));
    if (spec.hit === 'adjacent' && Math.abs(targets[0] - targets[1]) !== 1) throw new RangeError('Choose adjacent opponents');
  } else targets = [target(fight, chosen)];
  if (spec.hit === 'dragon') target(fight, chosen);
  const group = (count, affected) => ({ dice: Array.from({ length: count }, () => destinyDie(roll)), targets: [...affected], bonuses: {} });
  const countBonus = fight.turn.torrentFor === name ? 1 : 0;
  const groups = spec.shared ? [group(spec.dice + countBonus, targets)] : targets.map((index, order) => {
    let count = spec.dice;
    if (spec.hit === 'dragon' && index !== chosen) count = 1;
    if (spec.hit === 'below') count = Math.max(1, 3 - order);
    if (spec.speedDifference) count += Math.max(0, destinyStat(fight, 'hero', 'speed') - destinyStat(fight, index, 'speed'));
    return group(count, [index]);
  });
  const pending = { type: 'damage', name, spec: { ...spec }, options: structuredClone(options), groups, returnPhase: fight.phase };
  if (options.deferDamage && !spec.unmodified) {
    fight.turn.pendingAbility = pending;
    fight.phase = 'ability-rolled';
  } else applyDestinyDamage(fight, pending);
}

export function applyDestinyDamage(fight, pending) {
  const { name, spec, options, groups } = pending;
  const bonus = spec.unmodified ? 0 : fight.effects.filter(effect => effect.kind === 'damage-per-die' &&
    effect.from <= fight.round && effect.until >= fight.round).reduce((sum, effect) => sum + effect.amount, 0);
  for (const group of groups) {
    const damage = group.dice.reduce((sum, face, index) => sum + face + bonus + (group.bonuses[index] || 0), 0);
    for (const index of group.targets) {
      const lost = destinyStrike(fight, index, damage, name);
      if (spec.passive && fight.opponents[index].health === 0) fight.turn.pendingPassiveDeath = true;
      if (spec.category === 'co' && lost) fight.turn.combatAbilityDamage = true;
      if (spec.drain && lost) healDestinyHero(fight, 2);
      if (spec.recoil && lost) fight.hero.health = Math.max(0, fight.hero.health - 1);
      if (spec.armourLoss) addDestinyStatEffect(fight, index, 'armour', -spec.armourLoss, null, name);
      if (spec.weaken) {
        const attribute = options.attribute ?? fight.opponents[index].damageStat;
        if (!['brawn', 'magic'].includes(attribute)) throw new RangeError('Choose brawn or magic');
        addDestinyStatEffect(fight, index, attribute, -1, null, name);
      }
      if (spec.slowTargets) addDestinyStatEffect(fight, index, 'speed', -1, 1, name, 1);
      if (spec.ongoing) fight.effects.push({ kind: 'ongoing-damage', target: index, amount: spec.ongoing,
        from: fight.round, until: Number.MAX_SAFE_INTEGER, source: name });
      if (spec.delayed) fight.effects.push({ kind: 'delayed-dice', target: index,
        from: fight.round + 1, until: fight.round + 1, source: name });
    }
  }
  if (spec.slowHero) addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, name, 1);
}
