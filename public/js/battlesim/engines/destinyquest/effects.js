// Serializable, round-scoped effects shared by combat and ability actions.
import { onDestinyOpponentSpeedRoll } from './roll-events.js';
export const hasDestinyAbility = (fight, name) => !fight.encounter?.disableHeroAbilities && (fight.abilities?.[name] || 0) -
  (fight.equipment?.transport?.stability === 0 && fight.equipment.transport.abilities?.includes(name) ? 1 : 0) > 0;

export function isDestinyOpponentActive(fight, target) {
  const opponent = fight.opponents[target];
  return Boolean(opponent && (opponent.role === 'indestructible' || opponent.health > (fight.encounter?.surrenderAt?.[target] ?? 0)) &&
    !fight.encounter?.inactiveTargets?.includes(target));
}

export function isDestinyOpponentDead(fight, target) {
  return fight.opponents[target]?.health === 0 && fight.encounter?.surrenderAt?.[target] === undefined;
}

export const destinyAttackerTarget = fight => fight.encounter?.attackProxy?.[fight.target] ?? fight.target;

export function destinyDamageAllowed(fight, target, kind = 'score') {
  if (!isDestinyOpponentActive(fight, target)) return false;
  if (fight.opponents[target].role === 'indestructible') return false;
  if (fight.encounter?.damageShieldWhileAlive?.some(rule => rule.target === target &&
      rule.protectors.some(index => isDestinyOpponentActive(fight, index)))) return false;
  return kind !== 'passive' || !fight.encounter?.passiveImmuneTargets?.includes(target);
}

export function destinyStat(fight, target, attribute) {
  const actor = target === 'hero' ? fight.hero : fight.opponents[target];
  let value = actor[attribute];
  if (value === null) throw new RangeError('This component has no such combat attribute');
  if (fight.status !== 'active') return value;
  for (const effect of fight.effects) {
    if (effect.kind !== 'stat' || effect.target !== target || effect.attribute !== attribute ||
        fight.round < effect.from || fight.round > effect.until) continue;
    if (attribute === 'armour' && fight.encounter?.armourReductionImmune?.includes(target) &&
        effect.source !== 'encounter-health' && (effect.amount < 0 || effect.set !== undefined && effect.set < value)) continue;
    if (target === 'hero' && attribute === 'armour' && hasDestinyAbility(fight, 'ice-mantle') &&
        (effect.amount < 0 || effect.set !== undefined && effect.set < value)) continue;
    if (effect.set !== undefined) value = effect.set;
    else value += effect.amount;
  }
  for (const effect of fight.encounter?.statWhileAlive || []) {
    if (effect.target === target && effect.attribute === attribute && isDestinyOpponentActive(fight, effect.alive)) value += effect.amount;
  }
  if (target === 'hero' && attribute === 'speed' && hasDestinyAbility(fight, 'blood-frenzy') &&
      fight.effects.some(effect => effect.kind === 'bleed' && isDestinyOpponentActive(fight, effect.target))) value++;
  if (target === 'hero' && attribute === 'speed' && fight.chronicTriggered) value--;
  return Math.max(0, value);
}

export function addDestinyStatEffect(fight, target, attribute, amount, duration, source, delay = 0) {
  const from = fight.round + delay;
  fight.effects.push({ kind: 'stat', target, attribute, amount, from,
    until: duration === null ? Number.MAX_SAFE_INTEGER : from + duration - 1, source });
}

export function healDestinyHero(fight, amount) {
  observeDestinyHealth(fight);
  if (fight.hero.health <= 0) return 0;
  const restored = Math.min(amount, fight.hero.maxHealth - fight.hero.health);
  fight.hero.health += restored;
  return restored;
}

export function observeDestinyHealth(fight) {
  if (fight.hero.health < 10 && fight.character?.penalties.includes('chronic-convulsions')) fight.chronicTriggered = true;
  for (const rule of fight.encounter?.healthThresholdStats || []) {
    const opponent = fight.opponents[rule.target];
    if (rule.triggered || !opponent || opponent.health > rule.health) continue;
    rule.triggered = true;
    for (const [attribute, amount] of Object.entries(rule.changes || {})) addDestinyStatEffect(fight, rule.target, attribute, amount, null, 'encounter-health');
    if (rule.activateTargets) fight.encounter.inactiveTargets = (fight.encounter.inactiveTargets || []).filter(target => !rule.activateTargets.includes(target));
  }
}

export function destinyDamageScore(fight) {
  const hero = fight.turn.winner === 'hero';
  const target = hero ? 'hero' : destinyAttackerTarget(fight);
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
  const encounter = hero ? 0 : -(fight.encounter?.scoreReductionByTarget?.[target] || 0) +
    (fight.encounter?.mirrorBonusTarget === target ? fight.opponents.filter((opponent, index) => index !== target && isDestinyOpponentActive(fight, index)).length : 0);
  const conditional = hero ? (fight.encounter?.heroScoreWhenDefeated || []).filter(rule => (rule.targets || [rule.target]).every(index => !isDestinyOpponentActive(fight, index)))
    .reduce((total, rule) => total + rule.amount, 0) : 0;
  return dice + power + bonus + (fight.turn.damageScoreBonus || 0) + encounter + (hero ? fight.encounter?.heroScoreBonus || 0 : 0) + conditional;
}

export function destinyOnHeroHit(fight, target, damage, kind = 'score') {
  if (damage <= 0 || !['score', 'dice', 'first-strike'].includes(kind)) return;
  if (fight.encounter?.passiveImmuneTargets?.includes(target)) return;
  for (const [ability, amount, delay] of [['bleed', 1, 0], ['disease', 2, 1], ['venom', 2, 0]]) {
    if (fight.encounter?.passiveImmunityByTarget?.[target]?.includes(ability)) continue;
    if (!hasDestinyAbility(fight, ability) || fight.effects.some(effect => effect.kind === ability && effect.target === target)) continue;
    fight.effects.push({ kind: ability, target, amount, from: fight.round + delay, until: Number.MAX_SAFE_INTEGER });
  }
  if (kind === 'score' && fight.turn.damageDice?.includes(6) && hasDestinyAbility(fight, 'ice-edge')) {
    addDestinyStatEffect(fight, target, 'speed', -1, 1, 'ice-edge', 1);
  }
}

export function reflectDestinyDamage(fight, target, damage, kind) {
  if (!damage || !['score', 'dice', 'first-strike'].includes(kind)) return;
  for (const rule of fight.encounter?.reflectDamage || []) {
    if (rule.target !== undefined && rule.target !== target) continue;
    if (rule.requiresAlive?.some(index => !isDestinyOpponentActive(fight, index))) continue;
    const amount = rule.divisor ? Math.ceil(damage / rule.divisor) : rule.amount;
    fight.hero.health = Math.max(0, fight.hero.health - amount);
    fight.history.push({ type: 'reflected-damage', round: fight.round, target, damage: amount });
    observeDestinyHealth(fight);
  }
}

export function destinyStrike(fight, target, amount, source, kind = 'dice') {
  const opponent = fight.opponents[target];
  if (!isDestinyOpponentActive(fight, target)) throw new RangeError('Choose a living opponent');
  if (!destinyDamageAllowed(fight, target, kind)) return 0;
  const lost = Math.min(opponent.health, amount);
  reflectDestinyDamage(fight, target, lost, kind);
  opponent.health -= lost;
  observeDestinyHealth(fight);
  destinyOnHeroHit(fight, target, lost, kind);
  fight.turn.lastHeroDamage ??= {};
  fight.turn.lastHeroDamage[target] = (fight.turn.lastHeroDamage[target] || 0) + lost;
  if (isDestinyOpponentDead(fight, target)) {
    recordDestinyDefeat(fight, target);
    fight.turn.deaths.push(target);
    if (kind === 'passive') fight.turn.pendingPassiveDeath = true;
  }
  fight.history.push({ type: 'ability-damage', round: fight.round, target, damage: lost, source });
  return lost;
}

export function destinyRollOpponentDice(fight, count, roll, kind) {
  const draw = () => {
    const value = roll();
    if (!Number.isInteger(value) || value < 1 || value > 6) throw new RangeError('A die must roll 1-6');
    return value;
  };
  const values = Array.from({ length: count }, draw);
  if (kind === 'speed') onDestinyOpponentSpeedRoll(fight, values);
  destinyOnOpponentRoll(fight, values, kind);
  if (fight.encounter?.rerollOnesByTarget?.includes(destinyAttackerTarget(fight)) && isDestinyOpponentActive(fight, destinyAttackerTarget(fight))) {
    const rerolled = [];
    values.forEach((value, index) => { if (value === 1) { values[index] = draw(); rerolled.push(values[index]); } });
    if (rerolled.length) destinyOnOpponentRoll(fight, rerolled, kind);
    if (rerolled.length && kind === 'speed') onDestinyOpponentSpeedRoll(fight, values);
  }
  const punch = fight.encounter?.damageSixExtraDice?.[destinyAttackerTarget(fight)];
  if (kind === 'damage' && punch && values.includes(6) && !fight.turn.damageSixTriggered) {
    fight.turn.damageSixTriggered = true;
    const extra = Array.from({ length: punch }, draw);
    destinyOnOpponentRoll(fight, extra, kind);
    values.push(...extra);
    addDestinyStatEffect(fight, 'hero', 'speed', -1, 1, 'tusk-punch', 1);
  }
  return values;
}

export function recordDestinyDefeat(fight, target) {
  if (!isDestinyOpponentDead(fight, target)) return;
  fight.defeated ??= [];
  if (fight.defeated.includes(target)) return;
  fight.defeated.push(target);
  if (hasDestinyAbility(fight, 'malefic-runes')) addDestinyStatEffect(fight, 'hero', 'magic', 1, null, 'malefic-runes');
  const explosion = fight.encounter?.deathDamageByTarget?.[target] || 0;
  if (explosion) { fight.hero.health = Math.max(0, fight.hero.health - explosion); observeDestinyHealth(fight); }
  for (const effect of fight.encounter?.onDeathStatChanges || []) {
    if (effect.dead !== target || !isDestinyOpponentActive(fight, effect.target)) continue;
    for (const [attribute, amount] of Object.entries(effect.changes)) addDestinyStatEffect(fight, effect.target, attribute, amount, null, 'encounter-death');
  }
  for (const effect of fight.encounter?.onDeathSetStats || []) {
    if (effect.dead === target && isDestinyOpponentActive(fight, effect.target)) fight.opponents[effect.target][effect.attribute] = effect.value;
  }
  for (const effect of fight.encounter?.onDeathDamageEffects || []) {
    if (effect.dead === target && isDestinyOpponentActive(fight, effect.target)) fight.effects.push({ kind: 'ongoing-damage', target: effect.target,
      amount: effect.amount, from: fight.round + (effect.delay || 0), until: Number.MAX_SAFE_INTEGER, source: 'encounter-death' });
  }
}

export function destinyOnOpponentRoll(fight, values, kind) {
  const target = destinyAttackerTarget(fight);
  if (!isDestinyOpponentActive(fight, target)) return;
  const sweet = fight.sweetSpot ? values.filter(value => value === fight.sweetSpot).length * 2 : 0;
  const exploit = kind === 'speed' && hasDestinyAbility(fight, 'exploit') ? values.filter(value => value === 1).length : 0;
  if (sweet + exploit) {
    fight.history.push({ type: 'passive-roll', kind, dice: [...values], target, sweet, exploit });
    destinyStrike(fight, target, sweet + exploit, 'opponent-dice', 'passive');
  }
}

export function destinyDieLocked(fight, owner, kind, index) {
  if (kind === 'speed') return owner === 'hero' ? (fight.turn.lockedHeroDice || []).includes(index) : Boolean(fight.turn.lockedOpponentDice);
  return owner === 'hero' && (fight.turn.lockedDamageDice || []).includes(index);
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
  if (fight.character?.penalties.includes('weeping-wounds')) result.push({ target: 'hero', amount: 1, ignoreArmour: true, source: 'weeping-wounds' });
  if (fight.encounter?.roundDamagePerLivingOpponent && (!fight.encounter.roundDamageResource ||
      fight.encounter.resources?.[fight.encounter.roundDamageResource] > 0)) result.push({ target: 'hero',
    amount: fight.encounter.roundDamagePerLivingOpponent * fight.opponents.filter((opponent, target) => isDestinyOpponentActive(fight, target)).length,
    ignoreArmour: true, source: 'encounter' });
  if (fight.encounter?.outnumbered) {
    const count = fight.opponents.filter((opponent, target) => isDestinyOpponentActive(fight, target)).length;
    if (count > 1) result.push({ target: 'hero', amount: count, ignoreArmour: true, source: 'outnumbered' });
  }
  for (const [name, amount] of Object.entries(fight.encounter?.heroStatuses || {})) result.push({ target: 'hero', amount, ignoreArmour: true, source: name });
  if (fight.encounter?.growingStatus) result.push({ target: 'hero', amount: fight.encounter.growingStatus.increment *
    (fight.round - fight.encounter.growingStatus.from + 1), ignoreArmour: true, source: fight.encounter.growingStatus.name });
  if (fight.encounter?.damageWithoutAttackAbility && !fight.turn.playedSpeedAbility && !fight.turn.used.co) result.push({ target: 'hero',
    amount: fight.encounter.damageWithoutAttackAbility, ignoreArmour: true, source: 'tide-of-darkness' });
  for (const effect of fight.encounter?.endEffects || []) {
    if (effect.requiresAlive?.some(target => !isDestinyOpponentActive(fight, target))) continue;
    const amount = effect.actorAttribute ? destinyStat(fight, effect.actor, effect.actorAttribute) : effect.healthDivisor ?
      Math.floor(fight.opponents[effect.actor].health / effect.healthDivisor) : effect.amount;
    result.push({ ...effect, amount, ignoreArmour: true, source: 'encounter' });
  }
  for (const name of ['barbs', 'decay', 'thorns']) {
    if (!hasDestinyAbility(fight, name)) continue;
    fight.opponents.forEach((opponent, target) => {
      if (isDestinyOpponentActive(fight, target) && !fight.encounter?.passiveImmunityByTarget?.[target]?.includes(name)) result.push({ target, amount: 1, ignoreArmour: true, source: name });
    });
  }
  if (fight.crystalArmour) fight.opponents.forEach((opponent, target) => {
    if (isDestinyOpponentActive(fight, target)) result.push({ target, amount: 1, ignoreArmour: true, source: 'crystal-armour' });
  });
  if (fight.powerTotemActive) fight.opponents.forEach((opponent, target) => {
    if (isDestinyOpponentActive(fight, target)) result.push({ target, amount: 1, ignoreArmour: true, source: 'power-totem' });
  });
  for (const effect of fight.effects) {
    if (fight.encounter?.passiveImmunityByTarget?.[effect.target]?.includes(effect.status || effect.kind)) continue;
    if (!['bleed', 'disease', 'venom', 'ongoing-damage', 'delayed-dice'].includes(effect.kind) ||
        fight.round < effect.from || fight.round > effect.until || !isDestinyOpponentActive(fight, effect.target)) continue;
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
